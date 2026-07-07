// In-match DOM HUD: context-sensitive, collapsible panels for mobile landscape.
import type { GameState, PlayerId, Entity } from '../sim/types';
import { isBuilding, isUnit } from '../sim/types';
import { isAlive } from '../sim/queries';
import type { Registry } from '../data/registry';
import type { BuildingDef } from '../data/defs';
import { isPowerShort, powerDeficit, buildingHasPower, radarActive } from '../sim/views';
import type { InputController } from '../input/controller';
import type { Minimap } from './minimap';
import { el } from './hud/dom';
import { Collapsible } from './hud/collapsible';
import { CommandMenuPanel } from './hud/command-menu-panel';
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
  private commandMenu: CommandMenuPanel;
  private unitOrdersPanel: UnitOrdersPanel;
  private buildingActions: BuildingActionsPanel;
  private spellBar: SpellBar;
  private panelContext = '';
  private hudTab: 'info' | 'command' = 'info';
  private lastSelectionKey = '';
  private panelTabRow = el('div', 'panel-tab-row');
  private infoTabBtn = el('button', 'btn panel-tab', 'Info');
  private commandTabBtn = el('button', 'btn panel-tab', 'Build & Train');

  onExit: (() => void) | null = null;
  onProjectionToggle: (() => void) | null = null;
  private viewBtn = el('button', 'btn view-btn', '2.5D');

  private setHudTab(tab: 'info' | 'command'): void {
    this.hudTab = tab;
    this.infoTabBtn.classList.toggle('active', tab === 'info');
    this.commandTabBtn.classList.toggle('active', tab === 'command');
    this.infoPanel.setOpen(tab === 'info');
    this.commandMenu.panel.setOpen(tab === 'command');
  }

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
    this.viewBtn.title = 'Toggle Classic 2D / Oblique view';
    this.viewBtn.addEventListener('click', () => this.onProjectionToggle?.());
    const menuBtn = el('button', 'btn menu-btn', 'Menu');
    menuBtn.addEventListener('click', () => this.toggleMenu());
    this.spellBar = new SpellBar(registry, controller);
    top.append(mana, this.powerStat, this.spellBar.row, this.viewBtn, dbgBtn, menuBtn);

    const selBlock = el('div', 'sel-block');
    this.commandMenu = new CommandMenuPanel(registry, controller, false, () => this.setHudTab('command'));
    this.buildingActions = new BuildingActionsPanel(state, registry, controller);
    selBlock.append(
      this.selName,
      this.selDesc,
      this.selMeta,
      this.commandMenu.trainQueueEl,
    );
    this.infoPanel = new Collapsible('Selection', !compact, () => this.setHudTab('info'));
    this.infoPanel.body.append(selBlock);

    this.infoTabBtn.addEventListener('click', () => this.setHudTab('info'));
    this.commandTabBtn.addEventListener('click', () => this.setHudTab('command'));
    this.panelTabRow.append(this.infoTabBtn, this.commandTabBtn);
    this.panelTabRow.style.display = 'none';

    this.unitOrdersPanel = new UnitOrdersPanel(state, registry, controller, playerId, false);

    const cmdCard = el('div', 'cmd-card hud-scroll');
    cmdCard.append(
      this.infoPanel.root,
      this.panelTabRow,
      this.buildingActions.row,
      this.commandMenu.panel.root,
      this.unitOrdersPanel.panel.root,
    );
    const keepScroll = (e: Event) => e.stopPropagation();
    for (const node of [
      cmdCard,
      this.spellBar.row,
      this.panelTabRow,
      ...this.commandMenu.touchRoots,
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

  setProjectionMode(mode: 'ortho' | 'oblique'): void {
    this.viewBtn.textContent = mode === 'oblique' ? '2.5D' : '2D';
    this.viewBtn.title = mode === 'oblique' ? 'Switch to Classic 2D view' : 'Switch to Oblique (RA2-style) view';
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
    showCommandMenu: boolean,
    showUnitPanel: boolean,
    ownBuilding: BuildingDef | null | undefined,
    selectionLabel: string,
    multiSelect: boolean,
  ): void {
    const key = [
      inPlaceMode ? 'place' : 'play',
      showCommandMenu ? 'cmd' : '',
      showUnitPanel ? 'units' : '',
      this.hudTab,
      selectionLabel,
    ].join('|');
    if (key === this.panelContext) return;
    this.panelContext = key;

    if (inPlaceMode) {
      this.infoPanel.setTitle(selectionLabel.startsWith('Deploy') ? 'Deploying' : selectionLabel.startsWith('Set') ? 'Rally' : 'Placing');
      this.panelTabRow.style.display = 'none';
      this.infoPanel.setOpen(true);
      this.commandMenu.panel.setOpen(false);
      this.unitOrdersPanel.panel.setOpen(false);
      return;
    }
    if (showUnitPanel) {
      this.panelTabRow.style.display = 'none';
      this.unitOrdersPanel.panel.setOpen(true);
      this.commandMenu.panel.setOpen(false);
      this.infoPanel.setTitle(selectionLabel);
      this.infoPanel.setOpen(!multiSelect);
      return;
    }
    if (showCommandMenu && ownBuilding) {
      this.panelTabRow.style.display = 'flex';
      this.infoPanel.setTitle(ownBuilding.name);
      this.unitOrdersPanel.panel.setOpen(false);
      this.setHudTab(this.hudTab);
      return;
    }
    this.panelTabRow.style.display = 'none';
    this.commandMenu.panel.setOpen(false);
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

    const selIds = [...session.selection];
    const sel = selIds.map((id) => st.entities.get(id)).filter((e): e is Entity => !!e && isAlive(e));
    const single = sel.length === 1 ? sel[0]! : null;
    const singleBuilding = single && isBuilding(single) ? single : null;
    const unitsSelected = sel.some((e) => e.owner === this.playerId && e.kind === 'unit');
    const ownBuilding =
      singleBuilding?.owner === this.playerId ? this.registry.buildings.get(singleBuilding.defId) : null;

    const inBuildMode = session.mode === 'build';
    const inDeployMode = session.mode === 'deploy';
    const inRallyMode = session.mode === 'rally';
    const inPlaceMode = inBuildMode || inDeployMode || inRallyMode;
    const isHQ = !!ownBuilding?.isConstructionYard;
    const isProducer = !!ownBuilding?.producesUnits?.length && !ownBuilding.isConstructionYard;
    const showCommandMenu = !inPlaceMode && (isHQ || isProducer);
    const showUnitPanel = !inPlaceMode && unitsSelected;

    const selectionKey =
      single != null ? `b:${single.id}` : sel.length > 1 ? 'multi' : 'none';
    if (selectionKey !== this.lastSelectionKey) {
      this.lastSelectionKey = selectionKey;
      if (isHQ || isProducer) this.hudTab = 'command';
      else this.hudTab = 'info';
    }

    this.setPanelVisible(this.commandMenu.panel, showCommandMenu);
    this.setPanelVisible(this.unitOrdersPanel.panel, showUnitPanel);

    const commandContext = showCommandMenu
      ? isHQ
        ? { mode: 'hq' as const }
        : {
            mode: 'producer' as const,
            producerBuildingId: singleBuilding!.id,
            producerBuildingDefId: singleBuilding!.defId,
          }
      : null;
    if (showCommandMenu) {
      this.commandMenu.update(st, this.playerId, p, session, commandContext);
    }

    this.unitOrdersPanel.update(single, sel, inPlaceMode);
    this.buildingActions.update(p, ownBuilding, single, inPlaceMode, inRallyMode);

    if (inRallyMode) {
      this.selName.textContent = ownBuilding?.name ?? 'Set rally point';
      this.selDesc.textContent = singleBuilding?.rally
        ? 'Tap the map to move the rally point.'
        : 'Tap the map where new units should go after training.';
      this.selMeta.textContent = singleBuilding?.rally ? 'Rally point set — tap map to move' : 'No rally point';
      this.commandMenu.updateTrainQueue(this.registry, this.controller, null);
    } else if (inDeployMode && session.deployEntityId) {
      const campDef = this.registry.buildings.get('waystone_camp')!;
      this.selName.textContent = 'Deploy: Waystone Camp';
      this.selDesc.textContent = campDef.description;
      this.selMeta.textContent = 'Deploys in place if clear · tap map to reposition';
      this.commandMenu.panel.setOpen(false);
      this.commandMenu.updateTrainQueue(this.registry, this.controller, null);
    } else if (inBuildMode && session.buildDefId) {
      const placing = this.registry.buildings.get(session.buildDefId)!;
      this.selName.textContent = `Placing: ${placing.name}`;
      this.selDesc.textContent = placing.description;
      this.selMeta.textContent = `${placing.cost} mana · tap Place to confirm`;
      this.commandMenu.panel.setOpen(false);
      this.commandMenu.updateTrainQueue(this.registry, this.controller, null);
    } else if (single) {
      const def = this.registry.units.get(single.defId) ?? this.registry.buildings.get(single.defId);
      this.selName.textContent = def?.name ?? single.defId;
      if (ownBuilding && singleBuilding) {
        this.selDesc.textContent = ownBuilding.description;
        const meta: string[] = [`${Math.ceil(single.hp)}/${single.maxHp} HP`];
        if (ownBuilding.powerUsed) meta.push(`uses ${ownBuilding.powerUsed} power`);
        if (ownBuilding.powerProduced) meta.push(`+${ownBuilding.powerProduced} power`);
        if (!buildingHasPower(st, this.registry, singleBuilding)) meta.unshift('⚡ OFFLINE — low power');
        else if (isPowerShort(st, this.playerId) && (ownBuilding.producesUnits || singleBuilding.buildProgress !== undefined)) {
          meta.unshift('⚡ SLOW — low power');
        }
        if (singleBuilding.morphProgress !== undefined) meta.push(`Packing ${Math.round(singleBuilding.morphProgress * 100)}%`);
        if (singleBuilding.repairing) meta.push('repairing');
        if (singleBuilding.rally) meta.push('rally set');
        this.commandMenu.updateTrainQueue(
          this.registry,
          this.controller,
          isProducer ? singleBuilding : null,
        );
        this.selMeta.textContent = meta.join(' · ');
      } else if (def && 'role' in def && isUnit(single)) {
        this.selDesc.textContent = def.role;
        let meta = `${Math.ceil(single.hp)}/${single.maxHp} HP`;
        if (single.morphProgress !== undefined) {
          meta += ` · ${single.morphAction === 'deploy' ? 'Deploying' : 'Packing'} ${Math.round(single.morphProgress * 100)}%`;
        }
        if (single.channeling) meta += ' · conjuring mana';
        this.selMeta.textContent = meta;
        this.commandMenu.updateTrainQueue(this.registry, this.controller, null);
      } else {
        this.selDesc.textContent = '';
        this.selMeta.textContent = `${Math.ceil(single.hp)}/${single.maxHp} HP`;
        this.commandMenu.updateTrainQueue(this.registry, this.controller, null);
      }
    } else if (sel.length > 1) {
      this.selName.textContent = `${sel.length} units selected`;
      this.selDesc.textContent = 'Tap map to move. Use orders below.';
      this.selMeta.textContent = '';
      this.commandMenu.updateTrainQueue(this.registry, this.controller, null);
    } else {
      this.selName.textContent = 'Nothing selected';
      this.selDesc.textContent = 'Tap your HQ (purple) to build and train. Tap production buildings to train from there.';
      this.selMeta.textContent = short
        ? `Low power (−${deficit}) — build Ley Conduit or destroy structures`
        : 'Drag to select · two fingers to pan the map.';
      this.commandMenu.updateTrainQueue(this.registry, this.controller, null);
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
      showCommandMenu,
      showUnitPanel,
      ownBuilding,
      selectionLabel,
      sel.length > 1,
    );

    if (inRallyMode) {
      this.buildConfirm.style.display = 'flex';
      this.buildConfirmLabel.textContent = singleBuilding?.rally
        ? 'Tap map to move rally point'
        : 'Tap map to set rally point';
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
