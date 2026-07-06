// In-match DOM HUD: context-sensitive, collapsible panels for mobile landscape.
import type { GameState, PlayerId, Entity } from '../sim/types';
import type { Registry } from '../data/registry';
import type { BuildingDef } from '../data/defs';
import type { InputController } from '../input/controller';
import type { Minimap } from './minimap';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

class Collapsible {
  readonly root = el('div', 'panel');
  readonly body = el('div', 'panel-body');
  private head = el('button', 'panel-head');
  private chevron = el('span', 'panel-chevron', '▾');
  private titleEl = el('span', 'panel-title');
  open = true;

  constructor(title: string, startOpen = true) {
    this.open = startOpen;
    this.titleEl.textContent = title;
    this.head.append(this.chevron, this.titleEl);
    this.head.addEventListener('click', () => this.setOpen(!this.open));
    this.root.append(this.head, this.body);
    this.sync();
  }

  setOpen(v: boolean): void {
    this.open = v;
    this.sync();
  }

  setTitle(title: string): void {
    this.titleEl.textContent = title;
  }

  private sync(): void {
    this.root.classList.toggle('collapsed', !this.open);
    this.chevron.textContent = this.open ? '▾' : '▸';
  }
}

export class Hud {
  root = el('div', 'hud');
  private manaEl = el('span', 'stat-mana', '0');
  private powerEl = el('span', 'stat-power', '0');
  private selName = el('div', 'sel-name');
  private selDesc = el('div', 'sel-desc');
  private selMeta = el('div', 'sel-meta');
  private buildRow = el('div', 'card-row build-row');
  private produceRow = el('div', 'card-row produce-row');
  private stanceRow = el('div', 'card-row stance-row');
  private buildConfirm = el('div', 'build-confirm');
  private buildConfirmLabel = el('span', 'confirm-label');
  private buildConfirmBtn = el('button', 'btn confirm', 'Place');
  private buildCancelBtn = el('button', 'btn', 'Cancel');
  private spellRow = el('div', 'spell-row');
  private spellConfirm = el('div', 'spell-confirm');
  private result = el('div', 'result-overlay');
  private debugEl = el('div', 'debug-overlay');
  private hintEl = el('div', 'hint-banner');
  private debugOn = false;
  private produceBuildingId: number | null = null;

  private infoPanel: Collapsible;
  private unitPanel: Collapsible;
  private trainPanel: Collapsible;
  private buildPanel: Collapsible;
  private minimapPanel: Collapsible;
  private panelContext = '';

  onExit: (() => void) | null = null;

  constructor(
    private state: () => GameState,
    private registry: Registry,
    private controller: InputController,
    private playerId: PlayerId,
    minimap: Minimap,
  ) {
    const top = el('div', 'topbar');
    const mana = el('div', 'stat compact-stat');
    mana.append(el('span', 'stat-label', 'Mana '), this.manaEl);
    const power = el('div', 'stat compact-stat');
    power.append(el('span', 'stat-label', 'Pwr '), this.powerEl);
    const dbgBtn = el('button', 'btn dbg-btn', '·');
    dbgBtn.title = 'Debug';
    dbgBtn.addEventListener('click', () => {
      this.debugOn = !this.debugOn;
      this.debugEl.style.display = this.debugOn ? 'block' : 'none';
    });
    const menuBtn = el('button', 'btn menu-btn', 'Menu');
    menuBtn.addEventListener('click', () => this.toggleMenu());
    top.append(mana, power, this.spellRow, dbgBtn, menuBtn);

    const selBlock = el('div', 'sel-block');
    selBlock.append(this.selName, this.selDesc, this.selMeta);
    const compact = window.innerHeight < 460 || window.innerWidth < 820;
    this.infoPanel = new Collapsible('Selection', !compact);
    this.infoPanel.body.append(selBlock);

    this.unitPanel = new Collapsible('Unit orders', false);
    this.unitPanel.body.append(this.stanceRow);

    this.trainPanel = new Collapsible('Train units', false);
    this.trainPanel.body.append(this.produceRow);

    this.buildPanel = new Collapsible('Build structures', false);
    this.buildPanel.body.append(this.buildRow);

    const cmdCard = el('div', 'cmd-card hud-scroll');
    cmdCard.append(this.infoPanel.root, this.unitPanel.root, this.trainPanel.root, this.buildPanel.root);
    // Keep touch scrolling inside HUD (canvas uses touch-action: none).
    const keepScroll = (e: Event) => e.stopPropagation();
    for (const node of [cmdCard, this.spellRow, this.buildRow, this.produceRow, this.stanceRow]) {
      node.addEventListener('touchstart', keepScroll, { passive: true });
      node.addEventListener('touchmove', keepScroll, { passive: true });
    }

    const minimapWrap = el('div', 'minimap-wrap');
    minimapWrap.appendChild(minimap.canvas);
    this.minimapPanel = new Collapsible('Map', false);
    this.minimapPanel.body.append(minimapWrap);
    this.minimapPanel.root.classList.add('minimap-panel');

    this.buildConfirmBtn.addEventListener('click', () => this.controller.confirmBuild());
    this.buildCancelBtn.addEventListener('click', () => this.controller.setMode('normal'));
    this.buildConfirm.append(this.buildConfirmLabel, this.buildConfirmBtn, this.buildCancelBtn);
    this.buildConfirm.style.display = 'none';

    this.root.append(top, this.minimapPanel.root, cmdCard, this.buildConfirm, this.spellConfirm, this.debugEl, this.hintEl, this.result);
    this.buildBuildButtons();
    this.buildStanceButtons();
    this.buildSpellButtons();
    this.result.style.display = 'none';
    this.spellConfirm.style.display = 'none';
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

  private buildBuildButtons(): void {
    for (const [, def] of this.registry.buildings) {
      if (def.isConstructionYard) continue;
      const b = el('button', 'btn build-btn');
      b.dataset.def = def.id;
      b.style.borderLeftColor = def.art.accent;
      b.append(this.buildBtnLabel(def));
      b.addEventListener('click', () => this.controller.startBuild(def.id));
      this.buildRow.appendChild(b);
    }
  }

  private buildBtnLabel(def: BuildingDef): HTMLElement {
    const wrap = el('div', 'btn-stack');
    const title = el('span', 'btn-title', def.name);
    const sub = el('span', 'btn-sub', `${def.cost} mana`);
    wrap.append(title, sub);
    return wrap;
  }

  private buildStanceButtons(): void {
    const deselect = el('button', 'btn', 'Deselect');
    deselect.addEventListener('click', () => this.controller.clearSelection());
    const stop = el('button', 'btn', 'Stop');
    stop.addEventListener('click', () => this.controller.stop());
    const am = el('button', 'btn', 'Attack-Move');
    am.addEventListener('click', () => this.controller.setMode('attackMove'));
    this.stanceRow.append(deselect, stop, am);
  }

  private clearProduceRow(): void {
    if (this.produceBuildingId === null) return;
    this.produceRow.innerHTML = '';
    this.produceBuildingId = null;
  }

  private rebuildProduceRow(building: Entity): void {
    this.produceRow.innerHTML = '';
    this.produceBuildingId = building.id;
    const bdef = this.registry.building(building.defId);
    for (const uid of bdef.producesUnits ?? []) {
      const udef = this.registry.unit(uid);
      const btn = el('button', 'btn produce-btn');
      btn.dataset.unit = uid;
      const wrap = el('div', 'btn-stack');
      wrap.append(el('span', 'btn-title', udef.name), el('span', 'btn-sub', udef.role));
      btn.append(wrap);
      btn.addEventListener('click', () => this.controller.produce(building.id, uid));
      this.produceRow.appendChild(btn);
    }
  }

  private updateProduceButtons(p: { mana: number; unlockedTech: string[] }): void {
    for (const btn of this.produceRow.querySelectorAll<HTMLButtonElement>('.produce-btn')) {
      const uid = btn.dataset.unit!;
      const udef = this.registry.unit(uid);
      const ok = udef.requires.every((r) => p.unlockedTech.includes(r)) && p.mana >= udef.cost;
      btn.disabled = !ok;
      const sub = btn.querySelector('.btn-sub');
      if (sub) sub.textContent = `${udef.role} · ${udef.cost} mana`;
    }
  }

  private buildSpellButtons(): void {
    for (const [id, def] of this.registry.spells) {
      const short = def.name.split(' ').map((w) => w[0]).join('');
      const b = el('button', 'btn spell-btn compact-btn', short);
      b.dataset.spell = id;
      b.title = def.name;
      b.addEventListener('click', () => this.controller.startSpell(id));
      this.spellRow.appendChild(b);
    }
    const cast = el('button', 'btn confirm', 'Cast');
    cast.addEventListener('click', () => this.controller.confirmSpell());
    this.spellConfirm.append(el('span', 'confirm-label', 'Cast spell?'), cast);
  }

  private toggleMenu(): void {
    if (this.onExit) this.onExit();
  }

  showResult(win: boolean): void {
    this.result.innerHTML = '';
    this.result.append(
      el('h1', 'result-title', win ? 'Victory' : 'Defeat'),
      (() => {
        const b = el('button', 'btn big', 'Back to Menu');
        b.addEventListener('click', () => this.onExit?.());
        return b;
      })(),
    );
    this.result.style.display = 'flex';
  }

  private setPanelVisible(panel: Collapsible, visible: boolean): void {
    panel.root.style.display = visible ? '' : 'none';
  }

  /** Open one primary panel when context changes so small screens stay usable. */
  private syncPanelLayout(
    inBuildMode: boolean,
    showBuildPanel: boolean,
    showTrainPanel: boolean,
    showUnitPanel: boolean,
    ownBuilding: BuildingDef | null | undefined,
    selectionLabel: string,
    multiSelect: boolean,
  ): void {
    const key = [
      inBuildMode ? 'build' : 'play',
      showBuildPanel ? 'yard' : '',
      showTrainPanel ? 'train' : '',
      showUnitPanel ? 'units' : '',
      selectionLabel,
    ].join('|');
    if (key === this.panelContext) return;
    this.panelContext = key;

    if (inBuildMode) {
      this.infoPanel.setTitle('Placing');
      this.infoPanel.setOpen(true);
      this.buildPanel.setOpen(false);
      this.trainPanel.setOpen(false);
      this.unitPanel.setOpen(false);
      return;
    }
    if (showBuildPanel && ownBuilding) {
      this.buildPanel.setTitle(`Build — ${ownBuilding.name}`);
      this.buildPanel.setOpen(true);
      this.infoPanel.setTitle(ownBuilding.name);
      this.infoPanel.setOpen(false);
      this.trainPanel.setOpen(false);
      this.unitPanel.setOpen(false);
      return;
    }
    if (showTrainPanel && ownBuilding) {
      this.trainPanel.setTitle(`Train — ${ownBuilding.name}`);
      this.trainPanel.setOpen(true);
      this.infoPanel.setTitle(ownBuilding.name);
      this.infoPanel.setOpen(false);
      this.buildPanel.setOpen(false);
      this.unitPanel.setOpen(false);
      return;
    }
    if (showUnitPanel) {
      this.unitPanel.setOpen(true);
      this.buildPanel.setOpen(false);
      this.trainPanel.setOpen(false);
      this.infoPanel.setTitle(selectionLabel);
      this.infoPanel.setOpen(!multiSelect);
      return;
    }
    this.buildPanel.setOpen(false);
    this.trainPanel.setOpen(false);
    this.unitPanel.setOpen(false);
    this.infoPanel.setTitle('Selection');
    this.infoPanel.setOpen(true);
  }

  update(): void {
    const st = this.state();
    const p = st.players.find((pl) => pl.id === this.playerId);
    if (!p) return;
    this.manaEl.textContent = Math.floor(p.mana).toString();
    this.powerEl.textContent = `${p.powerUsed}/${p.power}`;
    this.powerEl.classList.toggle('low', p.powerUsed > p.power);

    const session = this.controller.session;

    for (const btn of this.spellRow.querySelectorAll<HTMLButtonElement>('.spell-btn')) {
      const sid = btn.dataset.spell!;
      const def = this.registry.spells.get(sid)!;
      const unlocked = def.requires.every((r) => p.unlockedTech.includes(r));
      const cd = p.spellCooldowns[sid] ?? 0;
      btn.disabled = !unlocked || cd > 0;
      btn.classList.toggle('active', session.spellId === sid);
      const short = def.name.split(' ').map((w) => w[0]).join('');
      btn.textContent = cd > 0 ? `${short}…` : short;
    }

    for (const btn of this.buildRow.querySelectorAll<HTMLButtonElement>('.build-btn')) {
      const def = this.registry.buildings.get(btn.dataset.def!)!;
      const unlocked = def.requires.every((r) => p.unlockedTech.includes(r));
      const affordable = p.mana >= def.cost;
      const ok = unlocked && affordable;
      btn.disabled = !ok;
      btn.classList.toggle('active', session.buildDefId === btn.dataset.def);
      btn.classList.toggle('unaffordable', unlocked && !affordable);
      btn.classList.toggle('locked-out', !unlocked);
      const sub = btn.querySelector('.btn-sub');
      if (sub) sub.textContent = !unlocked ? 'Locked' : `${def.cost} mana`;
    }

    const selIds = [...session.selection];
    const sel = selIds.map((id) => st.entities.get(id)).filter((e) => e && e.state !== 'dead') as Entity[];
    const single = sel.length === 1 ? sel[0]! : null;
    const unitsSelected = sel.some((e) => e.owner === this.playerId && e.kind === 'unit');
    const ownBuilding =
      single?.owner === this.playerId && single.kind === 'building' ? this.registry.buildings.get(single.defId) : null;

    const inBuildMode = session.mode === 'build';
    const showBuildPanel = !inBuildMode && !!ownBuilding?.isConstructionYard;
    const showTrainPanel =
      !inBuildMode && !!ownBuilding?.producesUnits?.length && !ownBuilding.isConstructionYard;
    const showUnitPanel = !inBuildMode && unitsSelected;

    this.setPanelVisible(this.buildPanel, showBuildPanel);
    this.setPanelVisible(this.trainPanel, showTrainPanel);
    this.setPanelVisible(this.unitPanel, showUnitPanel);

    if (inBuildMode && session.buildDefId) {
      const placing = this.registry.buildings.get(session.buildDefId)!;
      this.selName.textContent = `Placing: ${placing.name}`;
      this.selDesc.textContent = placing.description;
      this.selMeta.textContent = `${placing.cost} mana · release finger or tap Place`;
      this.trainPanel.setOpen(false);
      this.buildPanel.setOpen(false);
      this.clearProduceRow();
    } else if (single) {
      const def = this.registry.units.get(single.defId) ?? this.registry.buildings.get(single.defId);
      this.selName.textContent = def?.name ?? single.defId;
      if (ownBuilding) {
        this.selDesc.textContent = ownBuilding.description;
        const meta: string[] = [`${Math.ceil(single.hp)}/${single.maxHp} HP`];
        if (ownBuilding.powerUsed) meta.push(`uses ${ownBuilding.powerUsed} power`);
        if (ownBuilding.powerProduced) meta.push(`+${ownBuilding.powerProduced} power`);
        if (single.productionQueue?.length) meta.push(`queue ${single.productionQueue.length}`);
        this.selMeta.textContent = meta.join(' · ');
        if (showTrainPanel) {
          this.trainPanel.setTitle(`Train — ${ownBuilding.name}`);
          if (this.produceBuildingId !== single.id) this.rebuildProduceRow(single);
          this.updateProduceButtons(p);
        } else {
          this.clearProduceRow();
        }
      } else if (def && 'role' in def) {
        this.selDesc.textContent = def.role;
        this.selMeta.textContent = `${Math.ceil(single.hp)}/${single.maxHp} HP`;
        this.clearProduceRow();
      } else {
        this.selDesc.textContent = '';
        this.selMeta.textContent = `${Math.ceil(single.hp)}/${single.maxHp} HP`;
        this.clearProduceRow();
      }
    } else if (sel.length > 1) {
      this.selName.textContent = `${sel.length} units selected`;
      this.selDesc.textContent = 'Tap map to move. Use orders below.';
      this.selMeta.textContent = '';
      this.clearProduceRow();
    } else {
      this.selName.textContent = 'Nothing selected';
      this.selDesc.textContent = 'Tap your HQ (purple) to build. Tap colored buildings to train or view info.';
      this.selMeta.textContent = 'Labels on map match building colors.';
      this.clearProduceRow();
    }

    const selectionLabel =
      inBuildMode && session.buildDefId
        ? this.registry.buildings.get(session.buildDefId)!.name
        : single
          ? (this.registry.units.get(single.defId) ?? this.registry.buildings.get(single.defId))?.name ?? single.defId
          : sel.length > 1
            ? `${sel.length} units`
            : 'none';
    this.syncPanelLayout(
      inBuildMode,
      showBuildPanel,
      showTrainPanel,
      showUnitPanel,
      ownBuilding,
      selectionLabel,
      sel.length > 1,
    );

    if (session.mode === 'build' && session.buildGhost && session.buildDefId) {
      const def = this.registry.buildings.get(session.buildDefId)!;
      const ok = session.buildGhost.valid;
      this.buildConfirm.style.display = 'flex';
      this.buildConfirmLabel.textContent = `${def.name} (${def.cost}) ${ok ? '· release to place' : '· blocked'}`;
      this.buildConfirmBtn.disabled = !ok;
    } else {
      this.buildConfirm.style.display = 'none';
    }

    this.spellConfirm.style.display = session.pendingConfirm ? 'flex' : 'none';

    if (st.ended && this.result.style.display === 'none') {
      this.showResult(p.team === st.winnerTeam);
    }
  }
}
