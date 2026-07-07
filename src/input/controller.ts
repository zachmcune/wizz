// Translates gestures + HUD actions into Commands for the local human player.
// Owns the view-only SessionState. All gameplay changes go out as Commands (never direct mutation).
import { TILE } from '../core/constants';
import { screenToWorld } from '../core/coords';
import type { Vec2 } from '../core/coords';
import type { Camera } from '../render/camera';
import type { Renderer } from '../render/renderer';
import type { Registry } from '../data/registry';
import type { GameState, Command, EntityId, Entity, Stance } from '../sim/types';
import { isEnemy, isAlive } from '../sim/queries';
import { createSession, type SessionState, type InputMode } from './session';

export class InputController {
  session: SessionState = createSession();
  onHarvestNoRefinery: (() => void) | null = null;

  constructor(
    private getState: () => GameState,
    private camera: Camera,
    private renderer: Renderer,
    private registry: Registry,
    private playerId: string,
    private emit: (cmd: Command) => void,
    private onOrderFeedback: (kind: string, world: Vec2) => void,
    private canPlace: (tx: number, ty: number, footprint: number) => boolean,
    private canBuildNear: (tx: number, ty: number, footprint: number) => boolean,
  ) {}

  private toWorld(p: Vec2): Vec2 {
    return screenToWorld(p, this.camera.view());
  }

  private selectionEntities(): Entity[] {
    const st = this.getState();
    const out: Entity[] = [];
    for (const id of this.session.selection) {
      const e = st.entities.get(id);
      if (isAlive(e)) out.push(e);
    }
    return out;
  }

  private ownCombatSelected(): EntityId[] {
    return this.selectionEntities()
      .filter((e) => e.owner === this.playerId && e.kind === 'unit' && e.carryMax === undefined)
      .map((e) => e.id);
  }

  private allOwnWisps(): EntityId[] {
    const st = this.getState();
    const out: EntityId[] = [];
    for (const e of st.entities.values()) {
      if (e.owner === this.playerId && e.kind === 'unit' && e.carryMax !== undefined && isAlive(e)) out.push(e.id);
    }
    return out;
  }

  private hasRefinery(): boolean {
    const st = this.getState();
    for (const b of st.entities.values()) {
      if (b.owner !== this.playerId || b.kind !== 'building' || !isAlive(b) || b.buildProgress !== undefined) continue;
      if (this.registry.buildings.get(b.defId)?.isRefinery) return true;
    }
    return false;
  }

  private issueHarvest(node: Entity, wispIds: EntityId[]): void {
    if (!wispIds.length) return;
    this.setSelection(wispIds);
    this.emit({ type: 'harvest', playerId: this.playerId, entityIds: wispIds, nodeId: node.id });
    this.onOrderFeedback('harvest', node.pos);
    if (!this.hasRefinery()) this.onHarvestNoRefinery?.();
  }

  private ownWispsSelected(): EntityId[] {
    return this.selectionEntities()
      .filter((e) => e.owner === this.playerId && e.carryMax !== undefined)
      .map((e) => e.id);
  }

  // ---- gesture entry points ----
  tap(screen: Vec2): void {
    const world = this.toWorld(screen);
    if (this.session.mode === 'build') {
      this.updateGhost(world);
      if (this.session.buildGhost?.valid) this.confirmBuild();
      return;
    }
    if (this.session.mode === 'deploy') {
      this.updateDeployGhost(world);
      if (this.session.buildGhost?.valid) this.confirmDeploy();
      return;
    }
    if (this.session.mode === 'attackMove') {
      const ids = this.ownCombatSelected();
      if (ids.length) {
        this.emit({ type: 'attackMove', playerId: this.playerId, entityIds: ids, x: world.x, y: world.y });
        this.onOrderFeedback('attackMove', world);
      }
      this.session.mode = 'normal';
      return;
    }
    if (this.session.mode === 'spell' && this.session.spellId) {
      this.castSpellAt(world);
      return;
    }
    if (this.session.mode === 'rally' && this.session.rallyBuildingId) {
      this.emit({
        type: 'setRally',
        playerId: this.playerId,
        buildingId: this.session.rallyBuildingId,
        x: world.x,
        y: world.y,
      });
      this.onOrderFeedback('rally', world);
      this.setMode('normal');
      return;
    }

    const st = this.getState();
    const node = this.renderer.pickResourceNode(st, world.x, world.y);
    const picked = node ?? this.renderer.pickEntity(st, world.x, world.y);
    const combatUnits = this.ownCombatSelected();
    const wisps = this.ownWispsSelected();
    const harvesters = wisps.length ? wisps : this.allOwnWisps();
    const movable = this.selectionEntities()
      .filter((e) => e.owner === this.playerId && e.kind === 'unit')
      .map((e) => e.id);

    // Combat selection: attack enemies, re-select friendly units, otherwise move.
    if (combatUnits.length > 0) {
      if (picked && isEnemy(st, this.playerId, picked.owner)) {
        this.emit({ type: 'attack', playerId: this.playerId, entityIds: combatUnits, targetId: picked.id });
        this.onOrderFeedback('attack', picked.pos);
        return;
      }
      if (picked && picked.owner === this.playerId && picked.kind === 'unit') {
        this.setSelection([picked.id]);
        return;
      }
      if (movable.length) {
        this.emit({ type: 'move', playerId: this.playerId, entityIds: movable, x: world.x, y: world.y });
        this.onOrderFeedback('move', world);
        return;
      }
    }

    if (node && harvesters.length) {
      this.issueHarvest(node, harvesters);
      return;
    }

    if (picked) {
      if (picked.owner === this.playerId && this.session.selection.has(picked.id)) {
        this.setSelection([...this.session.selection].filter((id) => id !== picked.id));
        return;
      }
      if (picked.kind === 'resource_node' && harvesters.length) {
        this.issueHarvest(picked, harvesters);
        return;
      }
      if (picked.kind === 'unit' && picked.carryMax !== undefined && picked.owner === this.playerId) {
        this.setSelection([picked.id]);
        return;
      }
      this.setSelection([picked.id]);
      return;
    }

    // empty ground
    if (movable.length) {
      this.emit({ type: 'move', playerId: this.playerId, entityIds: movable, x: world.x, y: world.y });
      this.onOrderFeedback('move', world);
      return;
    }
    this.setSelection([]);
  }

  doubleTap(screen: Vec2): void {
    const world = this.toWorld(screen);
    const st = this.getState();
    const picked = this.renderer.pickEntity(st, world.x, world.y);
    if (!picked || picked.owner !== this.playerId || picked.kind !== 'unit') {
      this.tap(screen);
      return;
    }
    const rect = this.camera.visibleWorldRect();
    const ids: EntityId[] = [];
    for (const e of st.entities.values()) {
      if (e.owner !== this.playerId || e.kind !== 'unit' || e.defId !== picked.defId) continue;
      if (e.pos.x >= rect.x && e.pos.x <= rect.x + rect.w && e.pos.y >= rect.y && e.pos.y <= rect.y + rect.h) ids.push(e.id);
    }
    this.setSelection(ids);
  }

  boxSelect(a: Vec2, b: Vec2): void {
    const wa = this.toWorld(a);
    const wb = this.toWorld(b);
    const minX = Math.min(wa.x, wb.x);
    const maxX = Math.max(wa.x, wb.x);
    const minY = Math.min(wa.y, wb.y);
    const maxY = Math.max(wa.y, wb.y);
    const st = this.getState();
    const units: EntityId[] = [];
    for (const e of st.entities.values()) {
      if (e.owner !== this.playerId || e.kind !== 'unit') continue;
      if (e.pos.x >= minX && e.pos.x <= maxX && e.pos.y >= minY && e.pos.y <= maxY) units.push(e.id);
    }
    this.setSelection(units);
    this.session.boxRect = null;
  }

  setBoxRect(a: Vec2 | null, b?: Vec2): void {
    this.session.boxRect = a && b ? { a: this.toWorld(a), b: this.toWorld(b) } : null;
  }

  panByScreen(dx: number, dy: number): void {
    this.camera.panByScreen(dx, dy);
  }

  pinch(factor: number, center: Vec2): void {
    this.camera.zoomAt(center, factor);
  }

  // ---- HUD actions ----
  setSelection(ids: EntityId[]): void {
    this.session.selection = new Set(ids);
  }

  setMode(mode: InputMode): void {
    this.session.mode = mode;
    if (mode !== 'build') {
      this.session.buildDefId = null;
      this.session.buildGhost = null;
    }
    if (mode !== 'deploy') {
      this.session.deployEntityId = null;
      if (mode !== 'build') this.session.buildGhost = null;
    }
    if (mode !== 'spell') this.session.spellId = null;
    if (mode !== 'rally') {
      this.session.rallyBuildingId = null;
      this.session.rallyCursor = null;
    }
  }

  startBuild(defId: string): void {
    this.session.mode = 'build';
    this.session.buildDefId = defId;
    const sel = this.selectionEntities()[0];
    const anchor = sel?.pos ?? { x: this.camera.visibleWorldRect().x + 100, y: this.camera.visibleWorldRect().y + 100 };
    this.updateGhost(anchor);
  }

  updateGhost(world: Vec2): void {
    if (!this.session.buildDefId) return;
    const def = this.registry.buildings.get(this.session.buildDefId);
    if (!def) return;
    const tx = Math.floor((world.x - (def.footprint * TILE) / 2) / TILE);
    const ty = Math.floor((world.y - (def.footprint * TILE) / 2) / TILE);
    const cx = (tx + def.footprint / 2) * TILE;
    const cy = (ty + def.footprint / 2) * TILE;
    const navOk = this.canPlace(tx, ty, def.footprint);
    const zoneOk = this.canBuildNear(tx, ty, def.footprint);
    const valid = navOk && zoneOk;
    const issue = !navOk ? 'blocked' : !zoneOk ? 'range' : undefined;
    this.session.buildGhost = { x: cx, y: cy, valid, issue };
  }

  confirmBuild(): void {
    if (this.session.mode !== 'build' || !this.session.buildDefId || !this.session.buildGhost) return;
    if (!this.session.buildGhost.valid) return;
    this.emit({
      type: 'build',
      playerId: this.playerId,
      defId: this.session.buildDefId,
      x: this.session.buildGhost.x,
      y: this.session.buildGhost.y,
    });
    this.onOrderFeedback('build', this.session.buildGhost);
    this.setMode('normal');
  }

  startDeploy(entityId: EntityId): void {
    const unit = this.getState().entities.get(entityId);
    if (!unit || unit.owner !== this.playerId || unit.kind !== 'unit') return;
    const udef = this.registry.units.get(unit.defId);
    if (!udef?.deploysAs) return;
    this.session.mode = 'deploy';
    this.session.deployEntityId = entityId;
    this.updateDeployGhost(unit.pos);
  }

  updateDeployGhost(world: Vec2): void {
    const entityId = this.session.deployEntityId;
    if (!entityId) return;
    const unit = this.getState().entities.get(entityId);
    const udef = unit ? this.registry.units.get(unit.defId) : null;
    const def = udef?.deploysAs ? this.registry.buildings.get(udef.deploysAs) : null;
    if (!def) return;
    const tx = Math.floor((world.x - (def.footprint * TILE) / 2) / TILE);
    const ty = Math.floor((world.y - (def.footprint * TILE) / 2) / TILE);
    const cx = (tx + def.footprint / 2) * TILE;
    const cy = (ty + def.footprint / 2) * TILE;
    const navOk = this.canPlace(tx, ty, def.footprint);
    const zoneOk = this.canBuildNear(tx, ty, def.footprint);
    const valid = navOk && zoneOk;
    const issue = !navOk ? 'blocked' : !zoneOk ? 'range' : undefined;
    this.session.buildGhost = { x: cx, y: cy, valid, issue };
  }

  confirmDeploy(): void {
    if (this.session.mode !== 'deploy' || !this.session.deployEntityId || !this.session.buildGhost) return;
    if (!this.session.buildGhost.valid) return;
    this.emit({
      type: 'deploy',
      playerId: this.playerId,
      entityId: this.session.deployEntityId,
      x: this.session.buildGhost.x,
      y: this.session.buildGhost.y,
    });
    this.onOrderFeedback('deploy', this.session.buildGhost);
    this.setMode('normal');
  }

  pack(buildingId: EntityId): void {
    this.emit({ type: 'pack', playerId: this.playerId, buildingId });
    const b = this.getState().entities.get(buildingId);
    if (b) this.onOrderFeedback('pack', b.pos);
  }

  sellBuilding(buildingId: EntityId): void {
    this.emit({ type: 'sellBuilding', playerId: this.playerId, buildingId });
    this.session.selection.delete(buildingId);
    this.setMode('normal');
  }

  setRepair(buildingId: EntityId, enabled: boolean): void {
    this.emit({ type: 'setRepair', playerId: this.playerId, buildingId, enabled });
  }

  channel(entityIds: EntityId[], enabled: boolean): void {
    if (!entityIds.length) return;
    this.emit({ type: 'channel', playerId: this.playerId, entityIds, enabled });
  }

  startRally(buildingId: EntityId): void {
    const b = this.getState().entities.get(buildingId);
    if (!b || b.owner !== this.playerId || b.kind !== 'building') return;
    const bdef = this.registry.buildings.get(b.defId);
    if (!bdef?.producesUnits?.length) return;
    this.session.mode = 'rally';
    this.session.rallyBuildingId = buildingId;
    this.session.rallyCursor = { ...b.pos };
  }

  updateRallyCursor(world: Vec2): void {
    if (this.session.mode === 'rally') this.session.rallyCursor = { x: world.x, y: world.y };
  }

  produce(buildingId: EntityId, defId: string): void {
    this.emit({ type: 'produce', playerId: this.playerId, buildingId, defId });
  }

  cancelProduce(buildingId: EntityId, index: number): void {
    this.emit({ type: 'cancelProduce', playerId: this.playerId, buildingId, index });
  }

  setStance(stance: Stance): void {
    const ids = this.ownCombatSelected();
    if (ids.length) this.emit({ type: 'setStance', playerId: this.playerId, entityIds: ids, stance });
  }

  stop(): void {
    const ids = this.selectionEntities().filter((e) => e.owner === this.playerId && e.kind === 'unit').map((e) => e.id);
    if (ids.length) this.emit({ type: 'stop', playerId: this.playerId, entityIds: ids });
  }

  setRallyToSelectionBuilding(world: Vec2): void {
    const b = this.selectionEntities().find((e) => e.owner === this.playerId && e.kind === 'building');
    if (b) this.emit({ type: 'setRally', playerId: this.playerId, buildingId: b.id, x: world.x, y: world.y });
  }

  startSpell(spellId: string): void {
    this.session.mode = 'spell';
    this.session.spellId = spellId;
  }

  private castSpellAt(world: Vec2): void {
    const spellId = this.session.spellId!;
    const spell = this.registry.spells.get(spellId);
    if (!spell) return;
    if (spell.requiresConfirm && !this.session.pendingConfirm) {
      this.session.pendingConfirm = { spellId, x: world.x, y: world.y };
      return;
    }
    const entityIds = spell.targeting === 'group' ? this.ownCombatSelected() : undefined;
    this.emit({ type: 'castSpell', playerId: this.playerId, spellId, x: world.x, y: world.y, entityIds });
    this.onOrderFeedback('spell', world);
    this.session.pendingConfirm = null;
    this.setMode('normal');
  }

  confirmSpell(): void {
    if (this.session.pendingConfirm) {
      const { spellId, x, y } = this.session.pendingConfirm;
      const spell = this.registry.spells.get(spellId);
      const entityIds = spell?.targeting === 'group' ? this.ownCombatSelected() : undefined;
      this.emit({ type: 'castSpell', playerId: this.playerId, spellId, x, y, entityIds });
      this.onOrderFeedback('spell', { x, y });
      this.session.pendingConfirm = null;
      this.setMode('normal');
    }
  }

  surrender(): void {
    this.emit({ type: 'surrender', playerId: this.playerId });
  }

  clearSelection(): void {
    this.setSelection([]);
    if (
      this.session.mode === 'build' ||
      this.session.mode === 'spell' ||
      this.session.mode === 'attackMove' ||
      this.session.mode === 'deploy' ||
      this.session.mode === 'rally'
    ) {
      this.setMode('normal');
    }
    this.session.pendingConfirm = null;
  }
}
