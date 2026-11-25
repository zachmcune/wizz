// BOARD INPUT — gestures and HUD intents turned into commands.
//
// This is v2's equivalent of v1's `InputController` + input modes, re-derived against v2's command
// vocabulary rather than ported. The model is the same, because the feel is the same:
//
//   TAP with nothing selected        → select what is under the finger (own unit/building/node)
//   TAP with units selected          → on an enemy: attack. On a node: harvest. On an ally's building:
//                                      garrison if it can hold them. On open ground: move.
//   TAP with a building selected      → set its rally point (one tap, no mode switch)
//   TAP while an order is armed       → confirm that order (move / attack-move / attack)
//   TAP while placing a building      → place it, if the ghost is valid
//   DOUBLE TAP on a unit              → select every unit of that type on screen
//   DRAG                              → pan (touch) or box-select (desktop), per `DragMode`
//   LONG PRESS then drag              → box select, whichever drag mode is active
//   PINCH                             → zoom about the pinch centre, with two-finger pan
//
// The order-arming model is the important holdover. A phone has no right-click, so v2 arms an order
// from the HUD (`Move`, `Attack`, `Attack-move`) and the next board tap confirms it, exactly as v1's
// `attackMove` / `moveInOrder` modes did. The armed state is shown in the HUD and cancelled by
// Escape or a second tap on the same button, so there is never an invisible mode.
//
// EVERY command goes through `issue`, which is the app's single rejection surface: a refused order
// produces a player-visible notice (`humanizeReject`) instead of silently doing nothing.

import { TILE } from '../../core/constants';
import { screenToWorld } from '../../core/projection';
import type { Vec2 } from '../../core/math';
import type { Registry } from '../../data/registry';
import type { MapData } from '../../data/defs';
import type { GameState, EntityId, PlayerId } from '../../sim/types';
import { KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT } from '../../sim/entity-store';
import { BUILD_ZONE_TILES, canBuildNearBase, tileInBuildZone } from '../../sim/build-zone';
import type { SimServices } from '../../sim/context';
import type { Camera } from '../../render/camera';
import { requirementsMetPublic } from '../rules';
import {
  groundPointAt,
  levelAt,
  pickEntityAt,
  pickResourceNodeAt,
  unitsInScreenBox,
  type PickResult,
} from './picking';
import type { CommandPayload } from '../match';
import type { AppState } from '../state';

/** The order the board is currently armed for. `null` means a tap selects and commands normally. */
export type ArmedOrder = 'move' | 'attack' | 'attackMove' | 'harvest' | null;

/** A ghost the HUD/renderer can draw for the building being placed. */
export interface PlacementGhost {
  defId: string;
  /** Tile origin of the footprint. */
  tx: number;
  ty: number;
  /** Centre in world units — what a `build` command takes. */
  x: number;
  y: number;
  footprint: number;
  valid: boolean;
  /** Why it is invalid, in player-facing words; empty when valid. */
  reason: string;
}

export interface BoardInputDeps {
  getState: () => GameState;
  getServices: () => SimServices;
  registry: Registry;
  map: () => MapData;
  me: () => PlayerId;
  /** Playable-rect size, for "select all of this type on screen". */
  viewport: () => { w: number; h: number };
  camera: () => Camera;
  app: AppState;
  issue: (cmd: CommandPayload) => boolean;
  note: (kind: 'info' | 'warn' | 'bad', text: string) => void;
  /** Called when selection or the placement ghost changes, so the HUD can repaint immediately. */
  onChange: () => void;
}

export class BoardInput {
  private d: BoardInputDeps;
  ghost: PlacementGhost | null = null;
  armed: ArmedOrder = null;
  /** Build-zone tiles for the current ghost, for the renderer's placement overlay. */
  zoneTiles: { tx: number; ty: number }[] = [];
  /**
   * What the last tap resolved to, for the proof harness.
   *
   * The browser touch proof found a case where the tap arrived, the selection was correct, and no command
   * was issued — and nothing in the DOM or the state said why, because every branch of `tap()` is
   * silent by design. Recording the decision makes the difference between "the tap never arrived" and
   * "the tap arrived and took the wrong branch" observable from outside, which is the difference between
   * a five-minute diagnosis and an hour.
   */
  lastDecision: { hit: { id: number; kind: number; owner: string } | null; node: number | null; sel: number[]; branch?: string } | null =
    null;
  /** Last pointer position in viewport CSS px, for HUD-triggered ghost placement. */
  private lastPointer: Vec2 = { x: 0, y: 0 };
  private boxEl: HTMLElement | null = null;

  constructor(deps: BoardInputDeps) {
    this.d = deps;
  }

  // ───────────────────────────────────────────────────────────── coordinate helpers

  /**
   * Viewport CSS px → world.
   *
   * The renderer's canvas covers the WHOLE viewport (the sidebar is opaque chrome drawn over it), so
   * the projection's own screen space IS viewport space and no offset is needed here. The HUD insets
   * matter only to FRAMING (`centerInSafeArea`) and to the box-select clamp.
   */
  worldAt(p: Vec2): Vec2 {
    return groundPointAt(this.d.map(), p, this.d.camera().view(), screenToWorld);
  }

  private pickAt(p: Vec2): PickResult | null {
    return pickEntityAt(this.d.getState(), this.d.me(), p, this.d.camera().view(), this.d.registry, this.d.map());
  }

  private nodeAt(p: Vec2): PickResult | null {
    return pickResourceNodeAt(this.d.getState(), this.d.me(), p, this.d.camera().view(), this.d.registry, this.d.map());
  }

  // ───────────────────────────────────────────────────────────── pointer bookkeeping

  notePointer(p: Vec2): void {
    this.lastPointer = p;
    if (this.d.app.placing) this.updateGhost(p);
  }

  /** The placement ghost follows the pointer on desktop hover and on touch drag. */
  updateGhost(p: Vec2): void {
    const defId = this.d.app.placing;
    if (!defId) {
      this.ghost = null;
      return;
    }
    const def = this.d.registry.buildings.get(defId);
    if (!def) {
      this.ghost = null;
      return;
    }
    const world = this.worldAt(p);
    this.ghost = this.ghostAt(defId, def.footprint, world);
    this.refreshZones();
  }

  /** Compute validity for a building footprint centred on a world point. */
  ghostAt(defId: string, footprint: number, world: Vec2): PlacementGhost {
    const tx = Math.floor((world.x - (footprint * TILE) / 2) / TILE);
    const ty = Math.floor((world.y - (footprint * TILE) / 2) / TILE);
    const state = this.d.getState();
    const services = this.d.getServices();
    const me = this.d.me();
    const def = this.d.registry.buildings.get(defId);
    let valid = true;
    let reason = '';
    if (!def) {
      valid = false;
      reason = 'Unknown structure.';
    } else if (!requirementsMetPublic(state, me, def.requires)) {
      valid = false;
      reason = 'Requires a structure you do not have.';
    } else if (!services.nav.canPlace(tx, ty, footprint)) {
      valid = false;
      reason = 'Blocked terrain.';
    } else if (!canBuildNearBase(state, services, me, tx, ty, footprint)) {
      valid = false;
      reason = 'Too far from your base.';
    } else {
      const player = state.players.find((pl) => pl.id === me);
      if (player && player.mana < def.cost) {
        valid = false;
        reason = 'Not enough mana.';
      }
    }
    return {
      defId,
      tx,
      ty,
      x: (tx + footprint / 2) * TILE,
      y: (ty + footprint / 2) * TILE,
      footprint,
      valid,
      reason,
    };
  }

  /** Recompute the build-zone tiles for the active ghost (cheap: it is a ring around owned buildings). */
  private refreshZones(): void {
    this.zoneTiles = [];
    if (!this.ghost) return;
    const st = this.d.getState();
    const services = this.d.getServices();
    const me = this.d.me();
    const fp = this.ghost.footprint;
    // Collect the tiles inside the build zone, but only within the ghost's neighbourhood, so this
    // stays O(zone) instead of O(map).
    const from = -BUILD_ZONE_TILES - fp;
    const to = BUILD_ZONE_TILES + fp;
    for (let dy = from; dy <= to; dy++) {
      for (let dx = from; dx <= to; dx++) {
        const tx = this.ghost.tx + dx;
        const ty = this.ghost.ty + dy;
        if (tx < 0 || ty < 0) continue;
        if (tileInBuildZone(st, services, me, tx, ty)) this.zoneTiles.push({ tx, ty });
      }
    }
  }

  /** Place the armed building at the current ghost, if valid. Returns true if a command went out. */
  confirmPlacement(): boolean {
    const g = this.ghost;
    if (!g || !this.d.app.placing) return false;
    if (!g.valid) {
      this.d.note('warn', g.reason || 'Cannot build there.');
      return false;
    }
    const ok = this.d.issue({ type: 'build', defId: g.defId, x: g.x, y: g.y });
    if (ok) {
      const def = this.d.registry.buildings.get(g.defId);
      this.d.note('info', `${def?.name ?? 'Structure'} placed.`);
      // Keep placement armed so a player can lay several structures in a row — v1's behaviour, and it
      // is what a base-building flow needs. Cancel with the same HUD button or Escape.
      this.ghost = g;
      this.d.onChange();
    }
    return ok;
  }

  /** Begin placing a building; the ghost is seeded at the nearest LEGAL spot to the pointer. */
  startPlacement(defId: string): void {
    this.d.app.placing = defId;
    const def = this.d.registry.buildings.get(defId);
    if (!def) return;
    const seed = this.lastPointer.x > 0 || this.lastPointer.y > 0 ? this.lastPointer : this.cameraCentreScreen();
    const world = this.worldAt(seed);
    /**
     * SEED A LEGAL GHOST, NOT JUST THE POINTER'S GHOST.
     *
     * The pointer is usually over the HUD when a build tile is tapped — the tile lives in the sidebar, and
     * the projection maps that screen position to a world point far outside the build zone. Seeding there
     * produced an invalid ghost ("Blocked terrain" or "Too far from your base") and the very next tap was
     * refused, which is the "I tapped the tile and it did nothing" experience.
     *
     * So: try the pointer, then in front of the selected building, then a spiral search of the tiles around
     * the base until a legal footprint is found. If nothing is legal (the base is boxed in), the ghost
     * stays at the base edge and its reason tells the player why.
     */
    let ghost = this.ghostAt(defId, def.footprint, world);
    if (!ghost.valid) {
      const near = this.nearSelectionWorld();
      if (near) {
        const g2 = this.ghostAt(defId, def.footprint, near);
        if (g2.valid) ghost = g2;
      }
    }
    if (!ghost.valid) {
      const found = this.findLegalSpot(defId, def.footprint);
      if (found) ghost = found;
    }
    this.ghost = ghost;
    this.refreshZones();
    this.d.onChange();
  }

  /**
   * Spiral outward from the player's construction yard until a legal footprint is found.
   *
   * Bounded to the build zone's radius: past that the sim refuses on `range` anyway, so searching further
   * costs time and cannot succeed. Returns null when the base genuinely has no room, which the caller
   * reports through the ghost's own reason string rather than inventing a second message.
   */
  private findLegalSpot(defId: string, footprint: number): PlacementGhost | null {
    const st = this.d.getState();
    const me = this.d.me();
    let ax = -1;
    let ay = -1;
    for (const slot of this.selectedSlots(st)) {
      if (st.entities.kind[slot] !== KIND_BUILDING) continue;
      ax = st.entities.posX[slot]!;
      ay = st.entities.posY[slot]!;
      break;
    }
    if (ax < 0) {
      // No building selected: anchor on the player's own construction yard.
      const idx = st.entities.ownerIndexFor(me);
      for (let s = 0; s < st.entities.count; s++) {
        if (st.entities.dead[s] || st.entities.kind[s] !== KIND_BUILDING) continue;
        if (st.entities.ownerIndex[s] !== idx) continue;
        const d = this.d.registry.buildings.get(st.entities.extras[s]!.defId);
        if (!d?.isConstructionYard) continue;
        ax = st.entities.posX[s]!;
        ay = st.entities.posY[s]!;
        break;
      }
    }
    if (ax < 0) return null;
    const originTx = Math.floor(ax / TILE - footprint / 2);
    const originTy = Math.floor(ay / TILE - footprint / 2);
    // Rings of increasing Chebyshev distance, starting 2 tiles out so the ghost is not inside the yard.
    for (let ring = 2; ring <= BUILD_ZONE_TILES + footprint; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const tx = originTx + dx;
          const ty = originTy + dy;
          if (tx < 0 || ty < 0) continue;
          const g = this.ghostAt(defId, footprint, { x: (tx + footprint / 2) * TILE, y: (ty + footprint / 2) * TILE });
          if (g.valid) return g;
        }
      }
    }
    return null;
  }

  cancelPlacement(): void {
    this.d.app.placing = null;
    this.ghost = null;
    this.zoneTiles = [];
    this.d.onChange();
  }

  private cameraCentreScreen(): Vec2 {
    const r = this.d.camera();
    void r;
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  private nearSelectionWorld(): Vec2 | null {
    const st = this.d.getState();
    for (const slot of this.selectedSlots(st)) {
      if (st.entities.kind[slot] !== KIND_BUILDING) continue;
      return { x: st.entities.posX[slot]! + TILE * 4, y: st.entities.posY[slot]! };
    }
    return null;
  }

  private selectedSlots(st: GameState): number[] {
    const out: number[] = [];
    for (let slot = 0; slot < st.entities.count; slot++) {
      if (st.entities.dead[slot]) continue;
      if (this.d.app.selection.has(st.entities.id[slot]!)) out.push(slot);
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────── selection helpers

  setSelection(ids: EntityId[], additive = false): void {
    if (!additive) this.d.app.selection = new Set(ids);
    else for (const id of ids) this.d.app.selection.add(id);
    this.d.onChange();
  }

  clearSelection(): void {
    this.d.app.selection.clear();
    this.armed = null;
    this.d.onChange();
  }

  /** Own units that are selected and alive. */
  private selectedUnits(st: GameState): EntityId[] {
    const me = this.d.me();
    const out: EntityId[] = [];
    for (const slot of this.selectedSlots(st)) {
      if (st.entities.kind[slot] !== KIND_UNIT) continue;
      if (st.entities.ownerId(st.entities.ownerIndex[slot]!) !== me) continue;
      out.push(st.entities.id[slot]!);
    }
    return out;
  }

  private selectedBuildings(st: GameState): EntityId[] {
    const me = this.d.me();
    const out: EntityId[] = [];
    for (const slot of this.selectedSlots(st)) {
      if (st.entities.kind[slot] !== KIND_BUILDING) continue;
      if (st.entities.ownerId(st.entities.ownerIndex[slot]!) !== me) continue;
      out.push(st.entities.id[slot]!);
    }
    return out;
  }

  private isHarvester(defId: string): boolean {
    return this.d.registry.units.get(defId)?.isHarvester === true;
  }

  private ownHarvesters(st: GameState): EntityId[] {
    const me = this.d.me();
    const out: EntityId[] = [];
    for (let slot = 0; slot < st.entities.count; slot++) {
      if (st.entities.dead[slot] || st.entities.kind[slot] !== KIND_UNIT) continue;
      if (st.entities.ownerId(st.entities.ownerIndex[slot]!) !== me) continue;
      if (!this.isHarvester(st.entities.extras[slot]!.defId)) continue;
      out.push(st.entities.id[slot]!);
    }
    return out;
  }

  private isEnemyOfMe(owner: PlayerId): boolean {
    const st = this.d.getState();
    const rel = st.relations[this.d.me()]?.[owner];
    return rel === 'enemy';
  }

  // ───────────────────────────────────────────────────────────── the tap

  /** A tap on the board. All selection and command logic funnels through here. */
  tap(p: Vec2): void {
    const st = this.d.getState();
    if (st.ended) return;

    // 1. An armed placement takes the tap.
    if (this.d.app.placing) {
      this.updateGhost(p);
      this.confirmPlacement();
      return;
    }

    const world = this.worldAt(p);
    const hit = this.pickAt(p);
    const node = this.nodeAt(p);
    this.lastDecision = {
      hit: hit ? { id: hit.id, kind: hit.kind, owner: hit.owner } : null,
      node: node ? node.id : null,
      sel: [...this.d.app.selection],
    };

    // 2. An armed order takes the tap.
    if (this.armed) {
      this.applyArmedOrder(world, hit, node);
      return;
    }
    if (this.routing) {
      const buildings = this.selectedBuildings(st);
      this.routing = false;
      if (buildings.length > 0) {
        this.issueAndReport({ type: 'setRally', buildingId: buildings[0]!, x: world.x, y: world.y }, 'Rally set.');
      }
      this.d.onChange();
      return;
    }

    const units = this.selectedUnits(st);
    const buildings = this.selectedBuildings(st);
    const harvesters = units.filter((id) => {
      const slot = st.entities.slotOf(id);
      return slot >= 0 && this.isHarvester(st.entities.extras[slot]!.defId);
    });

    // 3. Units selected: tap issues an order or re-selects.
    if (units.length > 0) {
      if (hit && this.isEnemyOfMe(hit.owner)) {
        this.issueAndReport({ type: 'attack', entityIds: units, targetId: hit.id }, 'Attacking.');
        return;
      }
      if (this.lastDecision) this.lastDecision.branch = 'units';
      if (node && harvesters.length > 0) {
        this.issueAndReport({ type: 'harvest', entityIds: harvesters, nodeId: node.id }, 'Harvesting.');
        return;
      }
      if (node && this.ownHarvesters(st).length > 0 && units.every((id) => {
        const slot = st.entities.slotOf(id);
        return slot >= 0 && this.isHarvester(st.entities.extras[slot]!.defId);
      })) {
        this.issueAndReport({ type: 'harvest', entityIds: units, nodeId: node.id }, 'Harvesting.');
        return;
      }
      if (hit && hit.owner === this.d.me() && hit.kind === KIND_UNIT) {
        // Tapping one of your own units replaces the selection with it (RTS convention).
        this.setSelection([hit.id], false);
        return;
      }
      if (hit && hit.owner === this.d.me() && hit.kind === KIND_BUILDING) {
        const garrisonable = this.garrisonCandidates(st, units, hit.id);
        if (garrisonable.length > 0) {
          this.issueAndReport({ type: 'garrison', unitIds: garrisonable, buildingId: hit.id }, 'Garrisoning.');
          return;
        }
        this.setSelection([hit.id], false);
        return;
      }
      if (this.lastDecision) this.lastDecision.branch = 'move-issued';
      this.issueAndReport({ type: 'move', entityIds: units, x: world.x, y: world.y }, 'Moving.');
      return;
    }

    // 4. A building selected: tap sets its rally point (and is how a player moves a fresh army out).
    if (buildings.length === 1 && (!hit || hit.id === buildings[0])) {
      if (this.lastDecision) this.lastDecision.branch = 'rally';
      this.issueAndReport({ type: 'setRally', buildingId: buildings[0]!, x: world.x, y: world.y }, 'Rally set.');
      return;
    }

    // 5. Nothing selected (or a non-own thing tapped): select what is under the finger.
    if (hit) {
      if (this.lastDecision) this.lastDecision.branch = 'select';
      if (hit.owner === this.d.me() || hit.kind === KIND_RESOURCE_NODE) {
        // Tapping an already-selected single entity clears it, so a tap on empty-ish ground deselects.
        if (this.d.app.selection.size === 1 && this.d.app.selection.has(hit.id)) {
          this.clearSelection();
          return;
        }
        this.setSelection([hit.id], false);
        return;
      }
      this.clearSelection();
      return;
    }
    if (this.lastDecision) this.lastDecision.branch = 'clear';
    this.clearSelection();
  }

  /** Double tap on one of your units selects every unit of that type on screen. */
  doubleTap(p: Vec2): void {
    const st = this.d.getState();
    const hit = this.pickAt(p);
    if (!hit || hit.owner !== this.d.me() || hit.kind !== KIND_UNIT) {
      this.tap(p);
      return;
    }
    const defId = st.entities.extras[hit.slot]!.defId;
    const cam = this.d.camera();
    const vp = this.d.viewport();
    const me = this.d.me();
    const ids: EntityId[] = [];
    for (let slot = 0; slot < st.entities.count; slot++) {
      if (st.entities.dead[slot] || st.entities.kind[slot] !== KIND_UNIT) continue;
      if (st.entities.extras[slot]!.defId !== defId) continue;
      if (st.entities.ownerId(st.entities.ownerIndex[slot]!) !== me) continue;
      const v = cam.worldToScreenPoint(st.entities.posX[slot]!, st.entities.posY[slot]!);
      if (v.x < 0 || v.y < 0 || v.x > vp.w || v.y > vp.h) continue;
      ids.push(st.entities.id[slot]!);
    }
    this.setSelection(ids, false);
    if (ids.length > 1) this.d.note('info', `${ids.length} selected.`);
  }

  /** Units in a screen-space box (viewport CSS px). */
  boxSelect(a: Vec2, b: Vec2, additive = false): void {
    const ids = unitsInScreenBox(
      this.d.getState(),
      this.d.me(),
      a,
      b,
      this.d.camera().view(),
      this.d.registry,
      this.d.map(),
    );
    this.setSelection(ids, additive);
    if (ids.length > 0) this.d.note('info', `${ids.length} selected.`);
  }

  // ───────────────────────────────────────────────────────────── armed orders

  /** Arm an order from the HUD. Re-arming the same order disarms it (no invisible modes). */
  arm(order: ArmedOrder): void {
    this.armed = this.armed === order ? null : order;
    this.d.app.placing = null;
    this.ghost = null;
    if (this.armed) {
      const label =
        this.armed === 'move' ? 'Move' : this.armed === 'attack' ? 'Attack' : this.armed === 'attackMove' ? 'Attack-move' : 'Harvest';
      this.d.note('info', `${label}: tap the board.`);
    }
    this.d.onChange();
  }

  /**
   * Arm rally placement for the selected structure.
   *
   * A rally point is a `setRally` command rather than one of the unit order modes, so it gets its own
   * armed flag instead of being squeezed into `ArmedOrder`. The next board tap on ground issues it.
   */
  private routing = false;

  setRallyAtSelection(): void {
    const st = this.d.getState();
    const buildings = this.selectedBuildings(st);
    if (buildings.length === 0) {
      this.d.note('warn', 'Select one of your structures first.');
      return;
    }
    this.routing = !this.routing;
    this.armed = null;
    this.d.app.placing = null;
    this.ghost = null;
    if (this.routing) this.d.note('info', 'Rally: tap the board.');
    this.d.onChange();
  }

  get isRouting(): boolean {
    return this.routing;
  }

  disarm(): void {
    if (!this.armed && !this.routing) return;
    this.armed = null;
    this.routing = false;
    this.d.onChange();
  }

  private applyArmedOrder(world: Vec2, hit: PickResult | null, node: PickResult | null): void {
    const st = this.d.getState();
    const units = this.selectedUnits(st);
    if (units.length === 0 && this.armed !== 'harvest') {
      this.d.note('warn', 'Select units first.');
      this.armed = null;
      this.d.onChange();
      return;
    }
    if (this.armed === 'move') {
      this.issueAndReport({ type: 'move', entityIds: units, x: world.x, y: world.y }, 'Moving.');
    } else if (this.armed === 'attackMove') {
      this.issueAndReport({ type: 'attackMove', entityIds: units, x: world.x, y: world.y }, 'Attack-moving.');
    } else if (this.armed === 'attack') {
      if (hit && this.isEnemyOfMe(hit.owner)) this.issueAndReport({ type: 'attack', entityIds: units, targetId: hit.id }, 'Attacking.');
      else this.d.note('warn', 'Tap an enemy to attack.');
    } else if (this.armed === 'harvest') {
      if (node) this.issueAndReport({ type: 'harvest', entityIds: units, nodeId: node.id }, 'Harvesting.');
      else this.d.note('warn', 'Tap a mana node.');
    }
    this.armed = null;
    this.d.onChange();
  }

  /** Stop every selected unit. */
  stop(): void {
    const st = this.d.getState();
    const units = this.selectedUnits(st);
    if (units.length === 0) {
      this.d.note('warn', 'Select units first.');
      return;
    }
    this.issueAndReport({ type: 'stop', entityIds: units }, 'Stopped.');
  }

  /** Set a stance on the selected units (aggressive is the default and the only one a tap-hold needs). */
  setStance(stance: 'aggressive' | 'hold' | 'standground'): void {
    const st = this.d.getState();
    const units = this.selectedUnits(st);
    if (units.length === 0) {
      this.d.note('warn', 'Select units first.');
      return;
    }
    const label = stance === 'aggressive' ? 'Aggressive' : stance === 'hold' ? 'Hold ground' : 'Stand ground';
    this.issueAndReport({ type: 'setStance', entityIds: units, stance }, `${label}.`);
  }

  /** Sell a selected building, with the refund the sim computes. */
  sellSelectedBuilding(): void {
    const st = this.d.getState();
    const buildings = this.selectedBuildings(st);
    if (buildings.length === 0) {
      this.d.note('warn', 'Select one of your buildings to sell.');
      return;
    }
    const id = buildings[0]!;
    if (this.d.issue({ type: 'sellBuilding', buildingId: id })) {
      this.d.note('info', 'Structure sold.');
      this.d.app.selection.delete(id);
      this.d.onChange();
    }
  }

  toggleRepair(): void {
    const st = this.d.getState();
    const buildings = this.selectedBuildings(st);
    if (buildings.length === 0) {
      this.d.note('warn', 'Select one of your buildings to repair.');
      return;
    }
    const id = buildings[0]!;
    const slot = st.entities.slotOf(id);
    if (slot < 0) return;
    const on = st.entities.extras[slot]!.caps.repairing === true;
    this.issueAndReport({ type: 'setRepair', buildingId: id, enabled: !on }, on ? 'Repair off.' : 'Repairing.');
  }

  /** Train a unit from the first selected producer (falling back to any owned producer). */
  train(defId: string): void {
    const st = this.d.getState();
    let producer: EntityId | null = null;
    for (const id of this.selectedBuildings(st)) {
      const slot = st.entities.slotOf(id);
      if (slot < 0) continue;
      const def = this.d.registry.buildings.get(st.entities.extras[slot]!.defId);
      if (def?.producesUnits?.includes(defId)) {
        producer = id;
        break;
      }
    }
    if (producer === null) {
      const me = this.d.me();
      for (let slot = 0; slot < st.entities.count; slot++) {
        if (st.entities.dead[slot] || st.entities.kind[slot] !== KIND_BUILDING) continue;
        if (st.entities.ownerId(st.entities.ownerIndex[slot]!) !== me) continue;
        const def = this.d.registry.buildings.get(st.entities.extras[slot]!.defId);
        if (def?.producesUnits?.includes(defId)) {
          producer = st.entities.id[slot]!;
          break;
        }
      }
    }
    if (producer === null) {
      this.d.note('warn', 'No structure can train that yet.');
      return;
    }
    const name = this.d.registry.units.get(defId)?.name ?? 'Unit';
    this.issueAndReport({ type: 'produce', buildingId: producer, defId }, `${name} queued.`);
  }

  /** Cancel the newest queue item on the first selected producer. */
  cancelQueue(): void {
    const st = this.d.getState();
    const buildings = this.selectedBuildings(st);
    if (buildings.length === 0) {
      this.d.note('warn', 'Select a production structure.');
      return;
    }
    const id = buildings[0]!;
    const slot = st.entities.slotOf(id);
    if (slot < 0) return;
    const ex = st.entities.extras[slot]!;
    const queue = (ex.caps.production as { productionQueue?: unknown[] } | undefined)?.productionQueue;
    const n = queue?.length ?? 0;
    if (n === 0) {
      this.d.note('warn', 'Queue is empty.');
      return;
    }
    this.issueAndReport({ type: 'cancelProduce', buildingId: id, index: n - 1 }, 'Cancelled.');
  }

  research(defId: string): void {
    const st = this.d.getState();
    const buildings = this.selectedBuildings(st);
    let host: EntityId | null = buildings[0] ?? null;
    if (host === null) {
      const def = this.d.registry.research.get(defId);
      if (def) {
        const me = this.d.me();
        for (let slot = 0; slot < st.entities.count; slot++) {
          if (st.entities.dead[slot] || st.entities.kind[slot] !== KIND_BUILDING) continue;
          if (st.entities.ownerId(st.entities.ownerIndex[slot]!) !== me) continue;
          if (st.entities.extras[slot]!.defId !== def.researchedAt) continue;
          host = st.entities.id[slot]!;
          break;
        }
      }
    }
    if (host === null) {
      this.d.note('warn', 'Select the structure that researches this.');
      return;
    }
    const name = this.d.registry.research.get(defId)?.name ?? 'Research';
    this.issueAndReport({ type: 'research', buildingId: host, defId }, `${name} queued.`);
  }

  // ───────────────────────────────────────────────────────────── camera

  pan(dx: number, dy: number): void {
    this.d.camera().panByScreen(dx, dy);
  }

  pinch(factor: number, center: Vec2): void {
    this.d.camera().zoomAt(center, factor);
  }

  zoomBy(factor: number): void {
    this.d.camera().zoomBy(factor);
  }

  // ───────────────────────────────────────────────────────────── internals

  private issueAndReport(cmd: CommandPayload, okText: string): void {
    if (this.d.issue(cmd)) this.d.note('info', okText);
  }

  /** Units of the selection that the tapped building can hold, per its garrison def. */
  private garrisonCandidates(st: GameState, unitIds: EntityId[], buildingId: EntityId): EntityId[] {
    const slot = st.entities.slotOf(buildingId);
    if (slot < 0) return [];
    const bdef = this.d.registry.buildings.get(st.entities.extras[slot]!.defId);
    const g = bdef?.garrison;
    if (!g) return [];
    const host = st.entities.extras[slot]!.caps.garrisonHost as
      | { garrisonedIds?: number[]; garrisonReservedIds?: number[] }
      | undefined;
    const used = (host?.garrisonedIds?.length ?? 0) + (host?.garrisonReservedIds?.length ?? 0);
    if (used >= g.capacity) return [];
    const out: EntityId[] = [];
    for (const id of unitIds) {
      const uslot = st.entities.slotOf(id);
      if (uslot < 0) continue;
      const udef = this.d.registry.units.get(st.entities.extras[uslot]!.defId);
      if (!udef?.canGarrison) continue;
      if (g.allowedUnitIds && !g.allowedUnitIds.includes(udef.id)) continue;
      out.push(id);
      if (out.length >= g.capacity - used) break;
    }
    return out;
  }

  /** Whether the pointer is over a buildable tile, for HUD feedback. */
  tileInZone(tx: number, ty: number): boolean {
    return tileInBuildZone(this.d.getState(), this.d.getServices(), this.d.me(), tx, ty);
  }

  /** Height level at a world point, used by the renderer's ghost. */
  levelAt(x: number, y: number): number {
    return levelAt(this.d.map(), x, y);
  }

  /** Attach the DOM box used to draw a drag selection rectangle. */
  attachBox(el: HTMLElement | null): void {
    this.boxEl = el;
  }

  /** Draw the drag rectangle in viewport CSS px, or hide it when `rect` is null. */
  showBox(rect: { x: number; y: number; w: number; h: number } | null): void {
    const el = this.boxEl;
    if (!el) return;
    if (!rect) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
  }
}
