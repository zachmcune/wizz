import type { MatchConfig, Command, DevCommand, EntityId, PlayerId } from '../sim/types';
import type { SandboxSettings } from '../sim/sandbox-types';
import type { SaveMeta } from '../storage/save';
import type { Registry } from '../data/registry';
import type { SimServices } from '../sim/context';
import type { GameState } from '../sim/types';
import { visibilitySystem } from '../sim/systems/visibility';
import { recomputePower } from '../sim/factory';
import { applyTransferState } from '../sim/state-transfer';
import { rebuildBuildingNav } from '../sim/building-nav';
import type { SimController } from '../app/match/sim-controller';
import type { InputController } from '../input/controller';
import type { Camera } from '../render/camera';
import { serializeScenario, saveUserScenario, type SavedScenario } from './scenario-store';
import { applySandboxEconomyCheats } from '../sim/systems/sandbox-economy';

export interface SandboxControllerDeps {
  state: GameState;
  services: SimServices;
  registry: Registry;
  simCtrl: SimController;
  getHumanId: () => PlayerId;
  setHumanId: (playerId: PlayerId) => void;
  controller: InputController;
  camera: Camera;
  matchConfig: MatchConfig;
  saveMeta: SaveMeta;
}

export class SandboxController {
  private baseline: SavedScenario | null = null;

  constructor(private deps: SandboxControllerDeps) {
    this.captureBaseline('Sandbox Session');
  }

  get settings(): SandboxSettings {
    return this.deps.state.sandbox!.settings;
  }

  get humanPlayerId(): PlayerId {
    return this.deps.getHumanId();
  }

  get players() {
    return this.deps.state.players;
  }

  switchControlledPlayer(playerId: PlayerId): boolean {
    if (!this.deps.state.players.some((p) => p.id === playerId && !p.defeated)) return false;
    if (!this.settings.gameplay.multiPlayerControl) {
      const player = this.deps.state.players.find((p) => p.id === playerId);
      if (player?.controller !== 'human') return false;
    }
    this.deps.setHumanId(playerId);
    return true;
  }

  setPlayerController(targetPlayerId: PlayerId, controller: 'human' | 'ai'): void {
    this.enqueueDev({
      type: 'devConfigurePlayer',
      playerId: this.humanPlayerId,
      targetPlayerId,
      controller,
    });
    this.syncAi();
  }

  enqueueDev(cmd: DevCommand): void {
    this.deps.simCtrl.enqueueCommands([cmd]);
  }

  enqueue(cmd: Command): void {
    this.deps.simCtrl.enqueueCommands([cmd]);
  }

  setSetting<K extends keyof SandboxSettings>(section: K, patch: Partial<SandboxSettings[K]>): void {
    Object.assign(this.deps.state.sandbox!.settings[section], patch);
    if (section === 'ai') this.syncAi();
    if (section === 'map') this.refreshVisibility();
    if (section === 'economy') this.refreshEconomyCheats();
  }

  toggleSetting(section: keyof SandboxSettings, key: string): void {
    const group = this.deps.state.sandbox!.settings[section] as unknown as Record<string, unknown>;
    if (typeof group[key] === 'boolean') {
      group[key] = !group[key];
      if (section === 'ai') this.syncAi();
      if (section === 'map') this.refreshVisibility();
      if (section === 'economy') this.refreshEconomyCheats();
    }
  }

  refreshEconomyCheats(): void {
    applySandboxEconomyCheats(this.deps.state, { services: this.deps.services, events: [] });
  }

  syncAi(): void {
    const ai = this.settings.ai;
    const forceActive = ai.forceMode === 'attack' || ai.forceMode === 'defend';
    const enabled =
      forceActive || (!ai.disabled && !ai.paused && !this.settings.gameplay.freezeAi);
    this.deps.simCtrl.setAiEnabled(enabled);
  }

  refreshVisibility(): void {
    visibilitySystem(this.deps.state, { services: this.deps.services, events: [] });
  }

  setPlayerMana(playerId: PlayerId, amount: number, mode: 'set' | 'add' | 'remove'): void {
    this.enqueueDev({ type: 'devSetMana', playerId, amount, mode });
  }

  spawnUnit(owner: PlayerId, defId: string, count: number, x?: number, y?: number): void {
    const cam = this.deps.camera.view();
    const wx = x ?? cam.x;
    const wy = y ?? cam.y;
    const before = this.deps.state.nextEntityId;
    this.enqueueDev({ type: 'devSpawnUnit', playerId: owner, defId, x: wx, y: wy, count });
    const ids: EntityId[] = [];
    for (let id = before; id < before + count; id++) ids.push(id);
    if (owner === this.humanPlayerId) this.selectEntities(ids);
  }

  spawnBuilding(owner: PlayerId, defId: string, complete = true, x?: number, y?: number): void {
    const cam = this.deps.camera.view();
    this.enqueueDev({
      type: 'devSpawnBuilding',
      playerId: owner,
      defId,
      x: x ?? cam.x,
      y: y ?? cam.y,
      complete,
    });
  }

  destroySelected(): void {
    const ids = [...this.deps.controller.session.selection];
    if (!ids.length) return;
    this.enqueueDev({ type: 'devDestroyEntity', playerId: this.humanPlayerId, entityIds: ids });
    this.deps.controller.clearSelection();
  }

  healSelected(): void {
    for (const id of this.deps.controller.session.selection) {
      this.enqueueDev({ type: 'devSetEntityHp', playerId: this.humanPlayerId, entityId: id, hp: 'max' });
    }
  }

  killSelected(): void {
    for (const id of this.deps.controller.session.selection) {
      this.enqueueDev({ type: 'devSetEntityHp', playerId: this.humanPlayerId, entityId: id, hp: 'kill' });
    }
    this.deps.controller.clearSelection();
  }

  clearUnits(playerId?: PlayerId): void {
    this.enqueueDev({ type: 'devClearUnits', playerId: this.humanPlayerId, targetPlayerId: playerId });
  }

  unlockAllTech(playerId?: PlayerId): void {
    this.enqueueDev({ type: 'devUnlockTech', playerId: playerId ?? this.humanPlayerId, defId: 'all' });
  }

  castSpell(spellId: string, x?: number, y?: number): void {
    const cam = this.deps.camera.view();
    this.enqueueDev({
      type: 'devCastSpell',
      playerId: this.humanPlayerId,
      spellId,
      x: x ?? cam.x,
      y: y ?? cam.y,
    });
  }

  addAiPlayer(id: PlayerId, team: number, difficulty: 'easy' | 'normal' | 'hard', startIndex: number): void {
    this.enqueueDev({
      type: 'devAddPlayer',
      playerId: this.humanPlayerId,
      newPlayerId: id,
      controller: 'ai',
      team,
      color: '#ff5d5d',
      startIndex,
      aiDifficulty: difficulty,
    });
  }

  selectEntities(ids: EntityId[]): void {
    this.deps.controller.session.selection.clear();
    for (const id of ids) this.deps.controller.session.selection.add(id);
  }

  captureBaseline(name: string): void {
    this.baseline = serializeScenario(name, this.deps.state, this.deps.matchConfig, this.deps.saveMeta, ['session']);
  }

  restartScenario(): void {
    if (!this.baseline) return;
    applyTransferState(this.deps.state, this.baseline.state);
    rebuildBuildingNav(this.deps.state, this.deps.services, this.deps.registry);
    if (this.baseline.sandbox) {
      this.deps.state.sandbox = { enabled: true, settings: structuredClone(this.baseline.sandbox) };
    }
    recomputePower(this.deps.state, this.deps.services);
    this.refreshVisibility();
    this.deps.controller.clearSelection();
  }

  loadScenario(scenario: SavedScenario): void {
    applyTransferState(this.deps.state, scenario.state);
    rebuildBuildingNav(this.deps.state, this.deps.services, this.deps.registry);
    if (scenario.sandbox) {
      this.deps.state.sandbox = { enabled: true, settings: structuredClone(scenario.sandbox) };
    }
    recomputePower(this.deps.state, this.deps.services);
    this.refreshVisibility();
    this.captureBaseline(scenario.name);
  }

  async saveScenario(name: string, tags: string[] = []): Promise<void> {
    await saveUserScenario(serializeScenario(name, this.deps.state, this.deps.matchConfig, this.deps.saveMeta, tags));
  }
}
