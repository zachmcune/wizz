// Translates gestures + HUD actions into Commands for the local human player.
// Owns the view-only SessionState. Mode-specific tap logic lives in input/modes/.
import { screenToWorld } from '../core/coords';
import type { Vec2 } from '../core/coords';
import type { Camera } from '../render/camera';
import type { Registry } from '../data/registry';
import type { NavGrid } from '../sim/nav-grid';
import type { GameState, Command, EntityId, Entity, Stance } from '../sim/types';
import { isHarvester } from '../sim/entity-types';
import { isAlive } from '../sim/queries';
import { createSession, type SessionState, type InputMode } from './session';
import type { InputContext } from './input-context';
import {
  handleModeTap,
  boxSelect,
  doubleTapSelectType,
  confirmBuild,
  confirmWallDrag,
  confirmDeploy,
  confirmRally as confirmRallyAt,
  confirmSpell as runConfirmSpell,
  finishWallDrag as runFinishWallDrag,
  hasWallDragTiles,
  isWallBuild,
  previewWallAt,
  startDeploy,
  startRally,
  startSpell,
  startWallDrag,
  updateBuildGhost,
  updateDeployGhost,
  updateRallyCursor,
  updateWallDrag,
  wallPlacementValid,
} from './modes';

export class InputController {
  session: SessionState = createSession();
  onHarvestNoRefinery: (() => void) | null = null;

  constructor(
    private getState: () => GameState,
    private camera: Camera,
    private registry: Registry,
    private nav: NavGrid,
    private playerId: string,
    private emit: (cmd: Command) => void,
    private onOrderFeedback: (kind: string, world: Vec2) => void,
    private canPlace: (tx: number, ty: number, footprint: number, spacing?: number) => boolean,
    private canBuildNear: (tx: number, ty: number, footprint: number) => boolean,
    private onNode: (tx: number, ty: number, footprint: number) => boolean,
  ) {}

  private ctx(): InputContext {
    return {
      session: this.session,
      playerId: this.playerId,
      getState: () => this.getState(),
      registry: this.registry,
      nav: this.nav,
      camera: this.camera,
      toWorld: (p) => this.toWorld(p),
      emit: (cmd) => this.emit(cmd),
      onOrderFeedback: (kind, world) => this.onOrderFeedback(kind, world),
      canPlace: this.canPlace,
      canBuildNear: this.canBuildNear,
      onNode: this.onNode,
      setSelection: (ids) => this.setSelection(ids),
      setMode: (mode) => this.setMode(mode),
      ownCombatSelected: () => this.ownCombatSelected(),
      ownWispsSelected: () => this.ownWispsSelected(),
      allOwnWisps: () => this.allOwnWisps(),
      selectionEntities: () => this.selectionEntities(),
      issueHarvest: (node, wispIds) => this.issueHarvest(node, wispIds),
    };
  }

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
      .filter((e) => e.owner === this.playerId && isHarvester(e))
      .map((e) => e.id);
  }

  tap(screen: Vec2): void {
    const world = this.toWorld(screen);
    handleModeTap(this.ctx(), this.session.mode, screen, world);
  }

  doubleTap(screen: Vec2): void {
    doubleTapSelectType(this.ctx(), screen, this.toWorld(screen));
  }

  boxSelect(a: Vec2, b: Vec2): void {
    boxSelect(this.ctx(), a, b);
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

  setSelection(ids: EntityId[]): void {
    this.session.selection = new Set(ids);
  }

  setMode(mode: InputMode): void {
    this.session.mode = mode;
    if (mode !== 'build') {
      this.session.buildDefId = null;
      this.session.buildGhost = null;
      this.session.wallDragTiles = null;
      this.session.wallDragStart = null;
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
    this.session.wallDragTiles = null;
    this.session.wallDragStart = null;
    const sel = this.selectionEntities()[0];
    const anchor = sel?.pos ?? { x: this.camera.visibleWorldRect().x + 100, y: this.camera.visibleWorldRect().y + 100 };
    updateBuildGhost(this.ctx(), anchor);
  }

  isWallBuild(): boolean {
    return isWallBuild(this.ctx());
  }

  hasWallDragTiles(): boolean {
    return hasWallDragTiles(this.ctx());
  }

  startWallDrag(world: Vec2): void {
    startWallDrag(this.ctx(), world);
  }

  updateWallDrag(world: Vec2): void {
    updateWallDrag(this.ctx(), world);
  }

  previewWallAt(world: Vec2): void {
    previewWallAt(this.ctx(), world);
  }

  finishWallDrag(): void {
    runFinishWallDrag(this.ctx());
  }

  wallPlacementValid(): boolean {
    return wallPlacementValid(this.ctx());
  }

  confirmPlacement(): void {
    if (this.session.mode === 'deploy') {
      confirmDeploy(this.ctx());
      return;
    }
    if (this.isWallBuild() && this.hasWallDragTiles()) {
      confirmWallDrag(this.ctx());
      return;
    }
    confirmBuild(this.ctx());
  }

  updateGhost(world: Vec2): void {
    updateBuildGhost(this.ctx(), world);
  }

  confirmBuild(): void {
    confirmBuild(this.ctx());
  }

  startDeploy(entityId: EntityId): void {
    startDeploy(this.ctx(), entityId);
  }

  updateDeployGhost(world: Vec2): void {
    updateDeployGhost(this.ctx(), world);
  }

  confirmDeploy(): void {
    confirmDeploy(this.ctx());
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
    startRally(this.ctx(), buildingId);
  }

  confirmRally(world: Vec2): void {
    confirmRallyAt(this.ctx(), world);
  }

  updateRallyCursor(world: Vec2): void {
    updateRallyCursor(this.ctx(), world);
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
    startSpell(this.ctx(), spellId);
  }

  confirmSpell(): void {
    runConfirmSpell(this.ctx());
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
