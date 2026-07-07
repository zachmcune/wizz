// In-match DOM HUD: context-sensitive, collapsible panels for mobile landscape.
import type { GameState, PlayerId, Entity } from '../sim/types';
import type { Registry } from '../data/registry';
import type { BuildingDef } from '../data/defs';
import { isPowerShort, powerDeficit, buildingHasPower, radarActive } from '../sim/views';
import type { InputController } from '../input/controller';
import type { Minimap } from './minimap';
import { el } from './hud/dom';
import { Collapsible } from './hud/collapsible';
import { BuildPanel } from './hud/build-panel';
import { TrainPanel } from './hud/train-panel';
import { UnitOrdersPanel } from './hud/unit-orders-panel';
import { BuildingActionsPanel } from './hud/building-actions-panel';
import { SpellBar } from './hud/spell-bar';

export class Hud {
  root = el('div', 'hud');
  private manaEl = el('span', 'stat-mana', '0');
  private powerEl = el('span', 'stat-power', '0');
  private powerStat = el('div', 'stat compact-stat power-stat');
  private selName = el('div', 'sel-name');
  private selDesc = el('div', 'sel-desc');
  private selMeta = el('div', 'sel-meta');
  private buildConfirm = el('div', 'build-confirm');
  private buildConfirmLabel = el('span', 'confirm-label');
  private buildConfirmBtn = el('button', 'btn confirm', 'Place');
  private buildCancelBtn = el('button', 'btn', 'Cancel');
  private result = el('div', 'result-overlay');
  private debugEl = el('div', 'debug-overlay');
  private hintEl = el('div', 'hint-banner');
  private debugOn = false;

  private infoPanel: Collapsible;
  private minimapPanel: Collapsible;
  private buildPanel: BuildPanel;
  private trainPanel: TrainPanel;
  private unitOrdersPanel: UnitOrdersPanel;
  private buildingActions: BuildingActionsPanel;
  private spellBar: SpellBar;
  private panelContext = '';

  onExit: (() => void) | null = null;

  constructor(
    private state: () => GameState,
    private registry: Registry,
    private controller: InputController,
    private playerId: PlayerId,
    minimap: Minimap,
  ) {
    const compact = window.innerHeight < 460 || window.innerWidth < 820;
    const top = el('div', 'topbar');
    const mana = el('div', 'stat compact-stat');
    mana.append(el('span', 'stat-label', 'Mana '), this.manaEl);
    this.powerStat.append(el('span', 'stat-label', 'Pwr '), this.powerEl);
    const dbgBtn = el('button', 'btn dbg-btn', '·');
    dbgBtn.title = 'Debug';
    dbgBtn.addEventListener('click', () => {
      this.debugOn = !this.debugOn;
      this.debugEl.style.display = this.debugOn ? 'block' : 'none';
    });
    const menuBtn = el('button', 'btn menu-btn', 'Menu');
    menuBtn.addEventListener('click', () => this.toggleMenu());
    this.spellBar = new SpellBar(registry, controller);
    top.append(mana, this.powerStat, this.spellBar.row, dbgBtn, menuBtn);

    const selBlock = el('div', 'sel-block');
    this.trainPanel = new TrainPanel(false);
    this.buildingActions = new BuildingActionsPanel(state, registry, controller);
    selBlock.append(
      this.selName,
      this.selDesc,
      this.selMeta,
      this.buildingActions.row,
      this.trainPanel.trainQueueEl,
    );
    this.infoPanel = new Collapsible('Selection', !compact);
    this.infoPanel.body.append(selBlock);

    this.unitOrdersPanel = new UnitOrdersPanel(state, registry, controller, playerId, false);
    this.buildPanel = new BuildPanel(registry, controller, false);

    const cmdCard = el('div', 'cmd-card hud-scroll');
    cmdCard.append(
      this.infoPanel.root,
      this.unitOrdersPanel.panel.root,
      this.trainPanel.panel.root,
      this.buildPanel.panel.root,
    );
    const keepScroll = (e: Event) => e.stopPropagation();
    for (const node of [
      cmdCard,
      this.spellBar.row,
      this.buildPanel.row,
      this.trainPanel.produceRow,
      this.unitOrdersPanel.row,
      this.buildingActions.row,
    ]) {
      node.addEventListener('touchstart', keepScroll, { passive: true });
      node.addEventListener('touchmove', keepScroll, { passive: true });
    }

    const minimapWrap = el('div', 'minimap-wrap');
    minimapWrap.appendChild(minimap.canvas);
    this.minimapPanel = new Collapsible('Map', false);
    this.minimapPanel.body.append(minimapWrap);
    this.minimapPanel.root.classList.add('minimap-panel');

    this.buildConfirmBtn.addEventListener('click', () => this.controller.confirmPlacement());
    this.buildCancelBtn.addEventListener('click', () => this.controller.setMode('normal'));
    this.buildConfirm.append(this.buildConfirmLabel, this.buildConfirmBtn, this.buildCancelBtn);
    this.buildConfirm.style.display = 'none';

    this.root.append(
      top,
      this.minimapPanel.root,
      cmdCard,
      this.buildConfirm,
      this.spellBar.confirm,
      this.debugEl,
      this.hintEl,
      this.result,
    );
    this.result.style.display = 'none';
    this.debugEl.style.display = 'none';
    this.hintEl.style.display = 'none';
  }

  showHint(text: string): void {
    this.hintEl.textContent = text;
    this.hintEl.style.display = 'block';
    setTimeout(() => {
      this.hintEl.style.display = 'none';
    }, 12000);
  }

  setDebug(fps: number, tick: number, entities: number): void {
    if (!this.debugOn) return;
    const sel = this.controller.session.selection.size;
    this.debugEl.textContent = `${fps.toFixed(0)} fps · tick ${tick} · entities ${entities} · sel ${sel}`;
  }

  private toggleMenu(): void {
    if (this.onExit) this.onExit();
  }

  showResult(win: boolean): void {
    this.controller.clearSelection();
    this.result.innerHTML = '';
    const card = el('div', 'result-card');
    card.append(
      el('h1', 'result-title', win ? 'Victory' : 'Defeat'),
      el('p', 'result-hint', 'Drag or pinch to explore the map · two fingers to pan'),
      (() => {
        const b = el('button', 'btn big', 'Back to Menu');
        b.addEventListener('click', () => this.onExit?.());
        return b;
      })(),
    );
    this.result.append(card);
    this.result.style.display = 'flex';
  }

  private setPanelVisible(panel: Collapsible, visible: boolean): void {
    panel.root.style.display = visible ? '' : 'none';
  }

  private syncPanelLayout(
    inPlaceMode: boolean,
    showBuildPanel: boolean,
    showTrainPanel: boolean,
    showUnitPanel: boolean,
    ownBuilding: BuildingDef | null | undefined,
    selectionLabel: string,
    multiSelect: boolean,
  ): void {
    const key = [
      inPlaceMode ? 'place' : 'play',
      showBuildPanel ? 'yard' : '',
      showTrainPanel ? 'train' : '',
      showUnitPanel ? 'units' : '',
      selectionLabel,
    ].join('|');
    if (key === this.panelContext) return;
    this.panelContext = key;

    if (inPlaceMode) {
      this.infoPanel.setTitle(selectionLabel.startsWith('Deploy') ? 'Deploying' : selectionLabel.startsWith('Set') ? 'Rally' : 'Placing');
      this.infoPanel.setOpen(true);
      this.buildPanel.panel.setOpen(false);
      this.trainPanel.panel.setOpen(false);
      this.unitOrdersPanel.panel.setOpen(false);
      return;
    }
    if (showBuildPanel && ownBuilding) {
      this.buildPanel.panel.setTitle(`Build — ${ownBuilding.name}`);
      this.buildPanel.panel.setOpen(true);
      this.infoPanel.setTitle(ownBuilding.name);
      this.infoPanel.setOpen(false);
      this.trainPanel.panel.setOpen(false);
      this.unitOrdersPanel.panel.setOpen(false);
      return;
    }
    if (showTrainPanel && ownBuilding) {
      this.trainPanel.panel.setTitle(`Train — ${ownBuilding.name}`);
      this.trainPanel.panel.setOpen(true);
      this.infoPanel.setTitle(ownBuilding.name);
      this.infoPanel.setOpen(false);
      this.buildPanel.panel.setOpen(false);
      this.unitOrdersPanel.panel.setOpen(false);
      return;
    }
    if (showUnitPanel) {
      this.unitOrdersPanel.panel.setOpen(true);
      this.buildPanel.panel.setOpen(false);
      this.trainPanel.panel.setOpen(false);
      this.infoPanel.setTitle(selectionLabel);
      this.infoPanel.setOpen(!multiSelect);
      return;
    }
    this.buildPanel.panel.setOpen(false);
    this.trainPanel.panel.setOpen(false);
    this.unitOrdersPanel.panel.setOpen(false);
    this.infoPanel.setTitle('Selection');
    this.infoPanel.setOpen(true);
  }

  update(): void {
    const st = this.state();
    const p = st.players.find((pl) => pl.id === this.playerId);
    if (!p) return;
    this.manaEl.textContent = Math.floor(p.mana).toString();
    const short = isPowerShort(st, this.playerId);
    const deficit = powerDeficit(st, this.playerId);
    this.powerEl.textContent = short ? `${p.powerUsed}/${p.power} (−${deficit})` : `${p.powerUsed}/${p.power}`;
    this.powerEl.classList.toggle('low', short);
    this.powerStat.classList.toggle('power-short', short);
    this.powerStat.title = short ? 'Low power — production and defenses offline. Build Ley Conduit (+60 pwr).' : '';

    const radarOn = radarActive(st, this.registry, this.playerId);
    if (st.ended) {
      this.minimapPanel.setTitle('Map');
      this.minimapPanel.root.classList.remove('minimap-offline');
    } else {
      this.minimapPanel.setTitle(radarOn ? 'Map' : 'Radar offline');
      this.minimapPanel.root.classList.toggle('minimap-offline', !radarOn);
    }

    const session = this.controller.session;
    this.spellBar.update(p, session);
    this.buildPanel.update(p, session);

    const selIds = [...session.selection];
    const sel = selIds.map((id) => st.entities.get(id)).filter((e) => e && e.state !== 'dead') as Entity[];
    const single = sel.length === 1 ? sel[0]! : null;
    const unitsSelected = sel.some((e) => e.owner === this.playerId && e.kind === 'unit');
    const ownBuilding =
      single?.owner === this.playerId && single.kind === 'building' ? this.registry.buildings.get(single.defId) : null;

    const inBuildMode = session.mode === 'build';
    const inDeployMode = session.mode === 'deploy';
    const inRallyMode = session.mode === 'rally';
    const inPlaceMode = inBuildMode || inDeployMode || inRallyMode;
    const showBuildPanel = !inPlaceMode && !!ownBuilding?.isConstructionYard;
    const showTrainPanel =
      !inPlaceMode && !!ownBuilding?.producesUnits?.length && !ownBuilding.isConstructionYard;
    const showUnitPanel = !inPlaceMode && unitsSelected;

    this.setPanelVisible(this.buildPanel.panel, showBuildPanel);
    this.setPanelVisible(this.trainPanel.panel, showTrainPanel);
    this.setPanelVisible(this.unitOrdersPanel.panel, showUnitPanel);

    this.unitOrdersPanel.update(single, sel, inPlaceMode);
    this.buildingActions.update(p, ownBuilding, single, inPlaceMode, inRallyMode);

    if (inRallyMode) {
      this.selName.textContent = ownBuilding?.name ?? 'Set rally point';
      this.selDesc.textContent = 'Tap the map where new units should go after training.';
      this.selMeta.textContent = single?.rally ? `Current rally set` : 'No rally point';
      this.trainPanel.clearProduceRow();
      this.trainPanel.updateTrainQueue(this.registry, this.controller, null);
    } else if (inDeployMode && session.deployEntityId) {
      const campDef = this.registry.buildings.get('waystone_camp')!;
      this.selName.textContent = 'Deploy: Waystone Camp';
      this.selDesc.textContent = campDef.description;
      this.selMeta.textContent = 'Deploys in place if clear · tap map to reposition';
      this.trainPanel.panel.setOpen(false);
      this.buildPanel.panel.setOpen(false);
      this.trainPanel.clearProduceRow();
      this.trainPanel.updateTrainQueue(this.registry, this.controller, null);
    } else if (inBuildMode && session.buildDefId) {
      const placing = this.registry.buildings.get(session.buildDefId)!;
      this.selName.textContent = `Placing: ${placing.name}`;
      this.selDesc.textContent = placing.description;
      this.selMeta.textContent = `${placing.cost} mana · tap Place to confirm`;
      this.trainPanel.panel.setOpen(false);
      this.buildPanel.panel.setOpen(false);
      this.trainPanel.clearProduceRow();
      this.trainPanel.updateTrainQueue(this.registry, this.controller, null);
    } else if (single) {
      const def = this.registry.units.get(single.defId) ?? this.registry.buildings.get(single.defId);
      this.selName.textContent = def?.name ?? single.defId;
      if (ownBuilding) {
        this.selDesc.textContent = ownBuilding.description;
        const meta: string[] = [`${Math.ceil(single.hp)}/${single.maxHp} HP`];
        if (ownBuilding.powerUsed) meta.push(`uses ${ownBuilding.powerUsed} power`);
        if (ownBuilding.powerProduced) meta.push(`+${ownBuilding.powerProduced} power`);
        if (!buildingHasPower(st, this.registry, single)) meta.unshift('⚡ OFFLINE — low power');
        else if (isPowerShort(st, this.playerId) && (ownBuilding.producesUnits || single.buildProgress !== undefined)) {
          meta.unshift('⚡ SLOW — low power');
        }
        if (single.morphProgress !== undefined) meta.push(`Packing ${Math.round(single.morphProgress * 100)}%`);
        if (single.repairing) meta.push('repairing');
        if (single.rally) meta.push('rally set');
        this.trainPanel.updateTrainQueue(this.registry, this.controller, single);
        if (showTrainPanel) {
          this.trainPanel.panel.setTitle(`Train — ${ownBuilding.name}`);
          if (this.trainPanel.needsProduceRebuild(single.id)) {
            this.trainPanel.rebuildProduceRow(this.registry, this.controller, single);
          }
          this.trainPanel.updateProduceButtons(st, this.registry, this.playerId, p, single);
        } else {
          this.trainPanel.clearProduceRow();
        }
        this.selMeta.textContent = meta.join(' · ');
      } else if (def && 'role' in def) {
        this.selDesc.textContent = def.role;
        let meta = `${Math.ceil(single.hp)}/${single.maxHp} HP`;
        if (single.morphProgress !== undefined) {
          meta += ` · ${single.morphAction === 'deploy' ? 'Deploying' : 'Packing'} ${Math.round(single.morphProgress * 100)}%`;
        }
        if (single.channeling) meta += ' · conjuring mana';
        this.selMeta.textContent = meta;
        this.trainPanel.clearProduceRow();
        this.trainPanel.updateTrainQueue(this.registry, this.controller, null);
      } else {
        this.selDesc.textContent = '';
        this.selMeta.textContent = `${Math.ceil(single.hp)}/${single.maxHp} HP`;
        this.trainPanel.clearProduceRow();
        this.trainPanel.updateTrainQueue(this.registry, this.controller, null);
      }
    } else if (sel.length > 1) {
      this.selName.textContent = `${sel.length} units selected`;
      this.selDesc.textContent = 'Tap map to move. Use orders below.';
      this.selMeta.textContent = '';
      this.trainPanel.clearProduceRow();
      this.trainPanel.updateTrainQueue(this.registry, this.controller, null);
    } else {
      this.selName.textContent = 'Nothing selected';
      this.selDesc.textContent = 'Tap your HQ (purple) to build. Tap colored buildings to train or view info.';
      this.selMeta.textContent = short
        ? `Low power (−${deficit}) — build Ley Conduit or destroy structures`
        : 'Drag to select · two fingers to pan the map.';
      this.trainPanel.clearProduceRow();
      this.trainPanel.updateTrainQueue(this.registry, this.controller, null);
    }

    const selectionLabel =
      inRallyMode
        ? 'Set rally'
        : inDeployMode
        ? 'Deploy camp'
        : inBuildMode && session.buildDefId
        ? this.registry.buildings.get(session.buildDefId)!.name
        : single
          ? (this.registry.units.get(single.defId) ?? this.registry.buildings.get(single.defId))?.name ?? single.defId
          : sel.length > 1
            ? `${sel.length} units`
            : 'none';
    this.syncPanelLayout(
      inPlaceMode,
      showBuildPanel,
      showTrainPanel,
      showUnitPanel,
      ownBuilding,
      selectionLabel,
      sel.length > 1,
    );

    if (inRallyMode) {
      this.buildConfirm.style.display = 'flex';
      this.buildConfirmLabel.textContent = 'Tap map to set rally point';
      this.buildConfirmBtn.style.display = 'none';
    } else if (
      (session.mode === 'build' && session.buildDefId && (session.buildGhost || session.wallDragTiles?.length)) ||
      (session.mode === 'deploy' && session.buildGhost)
    ) {
      this.buildConfirmBtn.style.display = '';
      const def =
        session.mode === 'deploy'
          ? this.registry.buildings.get('waystone_camp')!
          : this.registry.buildings.get(session.buildDefId!)!;
      const wallPreview = session.wallDragTiles?.length;
      const ok = wallPreview ? this.controller.wallPlacementValid() : session.buildGhost!.valid;
      this.buildConfirm.style.display = 'flex';
      const hint =         ok
          ? '· tap Place to confirm'
          : session.mode === 'deploy'
            ? session.buildGhost?.issue === 'node'
              ? '· on mana pool'
              : '· blocked'
            : session.buildGhost?.issue === 'node'
              ? '· on mana pool'
              : session.buildGhost?.issue === 'range'
                ? '· too far from base'
                : '· blocked';
      const prefix = session.mode === 'deploy' ? 'Deploy' : def.name;
      const costLabel =
        session.mode === 'deploy'
          ? 'free'
          : wallPreview && session.wallDragTiles
            ? String(def.cost * session.wallDragTiles.filter((t) => t.valid).length)
            : String(def.cost);
      this.buildConfirmLabel.textContent = `${prefix} (${costLabel}) ${hint}`;
      this.buildConfirmBtn.disabled = !ok;
    } else {
      this.buildConfirm.style.display = 'none';
      this.buildConfirmBtn.style.display = '';
    }

    if (st.ended && this.result.style.display === 'none') {
      this.showResult(p.team === st.winnerTeam);
    }
  }
}
