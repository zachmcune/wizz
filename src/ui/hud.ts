// In-match DOM HUD: context-sensitive, collapsible panels for mobile landscape.
import type { GameState, PlayerId, Entity } from '../sim/types';
import type { Registry } from '../data/registry';
import type { BuildingDef } from '../data/defs';
import { isPowerShort, powerDeficit, buildingHasPower } from '../sim/power';
import { radarActive } from '../sim/fog';
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
  private powerStat = el('div', 'stat compact-stat power-stat');
  private selName = el('div', 'sel-name');
  private selDesc = el('div', 'sel-desc');
  private selMeta = el('div', 'sel-meta');
  private trainQueueEl = el('div', 'train-queue');
  private buildRow = el('div', 'card-row build-row');
  private produceRow = el('div', 'card-row produce-row');
  private stanceRow = el('div', 'card-row stance-row');
  private buildingRow = el('div', 'card-row building-row');
  private sellBtn = el('button', 'btn', 'Sell');
  private repairBtn = el('button', 'btn', 'Repair');
  private rallyBtn = el('button', 'btn', 'Set Rally');
  private buildConfirm = el('div', 'build-confirm');
  private buildConfirmLabel = el('span', 'confirm-label');
  private buildConfirmBtn = el('button', 'btn confirm', 'Place');
  private buildCancelBtn = el('button', 'btn', 'Cancel');
  private deployBtn = el('button', 'btn', 'Deploy');
  private packBtn = el('button', 'btn', 'Pack Up');
  private conjureBtn = el('button', 'btn', 'Conjure');
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
    this.powerStat.append(el('span', 'stat-label', 'Pwr '), this.powerEl);
    const dbgBtn = el('button', 'btn dbg-btn', '·');
    dbgBtn.title = 'Debug';
    dbgBtn.addEventListener('click', () => {
      this.debugOn = !this.debugOn;
      this.debugEl.style.display = this.debugOn ? 'block' : 'none';
    });
    const menuBtn = el('button', 'btn menu-btn', 'Menu');
    menuBtn.addEventListener('click', () => this.toggleMenu());
    top.append(mana, this.powerStat, this.spellRow, dbgBtn, menuBtn);

    const selBlock = el('div', 'sel-block');
    selBlock.append(this.selName, this.selDesc, this.selMeta, this.buildingRow, this.trainQueueEl);
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
    for (const node of [cmdCard, this.spellRow, this.buildRow, this.produceRow, this.stanceRow, this.buildingRow]) {
      node.addEventListener('touchstart', keepScroll, { passive: true });
      node.addEventListener('touchmove', keepScroll, { passive: true });
    }

    const minimapWrap = el('div', 'minimap-wrap');
    minimapWrap.appendChild(minimap.canvas);
    this.minimapPanel = new Collapsible('Map', false);
    this.minimapPanel.body.append(minimapWrap);
    this.minimapPanel.root.classList.add('minimap-panel');

    this.buildConfirmBtn.addEventListener('click', () => {
      if (this.controller.session.mode === 'deploy') this.controller.confirmDeploy();
      else this.controller.confirmBuild();
    });
    this.buildCancelBtn.addEventListener('click', () => this.controller.setMode('normal'));
    this.buildConfirm.append(this.buildConfirmLabel, this.buildConfirmBtn, this.buildCancelBtn);
    this.buildConfirm.style.display = 'none';

    this.root.append(top, this.minimapPanel.root, cmdCard, this.buildConfirm, this.spellConfirm, this.debugEl, this.hintEl, this.result);
    this.buildBuildButtons();
    this.buildStanceButtons();
    this.buildBuildingButtons();
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
    const costParts = [`${def.cost} mana`];
    if (def.powerUsed) costParts.push(`${def.powerUsed} pwr`);
    if (def.powerProduced) costParts.push(`+${def.powerProduced} pwr`);
    const sub = el('span', 'btn-sub', costParts.join(' · '));
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
    this.deployBtn.style.display = 'none';
    this.packBtn.style.display = 'none';
    this.deployBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.startDeploy(id);
    });
    this.packBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.pack(id);
    });
    this.conjureBtn.style.display = 'none';
    this.conjureBtn.addEventListener('click', () => {
      const st = this.state();
      const ids = [...this.controller.session.selection].filter((id) => {
        const e = st.entities.get(id);
        return e?.owner === this.playerId && e.kind === 'unit' && this.registry.units.get(e.defId)?.canConjureMana;
      });
      if (!ids.length) return;
      const single = st.entities.get(ids[0]!);
      this.controller.channel(ids, !single?.channeling);
    });
    this.stanceRow.append(deselect, stop, am, this.deployBtn, this.packBtn, this.conjureBtn);
  }

  private buildBuildingButtons(): void {
    this.buildingRow.style.display = 'none';
    this.sellBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.sellBuilding(id);
    });
    this.repairBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id === undefined) return;
      const st = this.state();
      const b = st.entities.get(id);
      this.controller.setRepair(id, !b?.repairing);
    });
    this.rallyBtn.addEventListener('click', () => {
      const id = [...this.controller.session.selection][0];
      if (id !== undefined) this.controller.startRally(id);
    });
    this.buildingRow.append(this.sellBtn, this.repairBtn, this.rallyBtn);
  }

  private clearProduceRow(): void {
    if (this.produceBuildingId === null) return;
    this.produceRow.innerHTML = '';
    this.produceBuildingId = null;
  }

  private shapeClass(shape: string): string {
    return `shape-${shape}`;
  }

  private updateTrainQueue(building: Entity | null): void {
    this.trainQueueEl.innerHTML = '';
    const queue = building?.productionQueue;
    if (!building || !queue?.length) {
      this.trainQueueEl.style.display = 'none';
      return;
    }
    this.trainQueueEl.style.display = 'flex';
    const heading = el('div', 'train-queue-label', 'Training');
    this.trainQueueEl.appendChild(heading);
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]!;
      const udef = this.registry.units.get(item.defId);
      if (!udef) continue;
      const row = el('div', 'train-queue-item');
      row.dataset.index = String(i);
      const icon = el('span', `queue-icon ${this.shapeClass(udef.art.shape)}`);
      icon.style.backgroundColor = udef.art.accent;
      const meta = el('div', 'queue-meta');
      meta.append(el('span', 'queue-name', udef.name));
      const bar = el('div', 'queue-bar');
      const fill = el('div', 'queue-fill');
      const pct = Math.min(100, Math.round((item.progress / Math.max(1, item.required)) * 100));
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      meta.append(bar);
      row.append(icon, meta);
      const cancel = el('button', 'queue-cancel', '×');
      cancel.title = 'Cancel';
      cancel.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.controller.cancelProduce(building.id, i);
      });
      row.appendChild(cancel);
      this.trainQueueEl.appendChild(row);
    }
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

  private updateProduceButtons(p: { mana: number; unlockedTech: string[] }, building: Entity): void {
    const st = this.state();
    const offline = !buildingHasPower(st, this.registry, building);
    const slow = isPowerShort(st, this.playerId) && !offline;
    for (const btn of this.produceRow.querySelectorAll<HTMLButtonElement>('.produce-btn')) {
      const uid = btn.dataset.unit!;
      const udef = this.registry.unit(uid);
      const unlocked = udef.requires.every((r) => p.unlockedTech.includes(r));
      const affordable = p.mana >= udef.cost;
      const ok = unlocked && affordable && !offline;
      btn.disabled = !ok;
      btn.classList.toggle('no-power', offline || slow);
      const sub = btn.querySelector('.btn-sub');
      if (sub) {
        if (offline) sub.textContent = 'No power';
        else if (slow) sub.textContent = 'Slow (low power)';
        else if (!affordable) sub.textContent = `${udef.cost} mana`;
        else if (!unlocked) sub.textContent = 'Locked';
        else sub.textContent = `${udef.role} · ${udef.cost} mana`;
      }
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
    const short = isPowerShort(st, this.playerId);
    const deficit = powerDeficit(st, this.playerId);
    this.powerEl.textContent = short ? `${p.powerUsed}/${p.power} (−${deficit})` : `${p.powerUsed}/${p.power}`;
    this.powerEl.classList.toggle('low', short);
    this.powerStat.classList.toggle('power-short', short);
    this.powerStat.title = short ? 'Low power — production and defenses offline. Build Ley Conduit (+60 pwr).' : '';

    const radarOn = radarActive(st, this.registry, this.playerId);
    this.minimapPanel.setTitle(radarOn ? 'Map' : 'Radar offline');
    this.minimapPanel.root.classList.toggle('minimap-offline', !radarOn);

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
    const inDeployMode = session.mode === 'deploy';
    const inRallyMode = session.mode === 'rally';
    const inPlaceMode = inBuildMode || inDeployMode || inRallyMode;
    const showBuildPanel = !inPlaceMode && !!ownBuilding?.isConstructionYard;
    const showTrainPanel =
      !inPlaceMode && !!ownBuilding?.producesUnits?.length && !ownBuilding.isConstructionYard;
    const showUnitPanel = !inPlaceMode && unitsSelected;

    this.setPanelVisible(this.buildPanel, showBuildPanel);
    this.setPanelVisible(this.trainPanel, showTrainPanel);
    this.setPanelVisible(this.unitPanel, showUnitPanel);

    const wagonReady =
      single?.owner === this.playerId &&
      single.defId === 'waystone_wagon' &&
      single.morphProgress === undefined &&
      single.state === 'idle' &&
      single.orders.length === 0;
    const campReady =
      single?.owner === this.playerId &&
      single.defId === 'waystone_camp' &&
      single.morphProgress === undefined &&
      !(single.productionQueue?.length);
    this.deployBtn.style.display = wagonReady && !inPlaceMode ? '' : 'none';
    this.packBtn.style.display = campReady && !inPlaceMode ? '' : 'none';

    const weaversSelected = sel.filter(
      (e) => e.owner === this.playerId && e.kind === 'unit' && this.registry.units.get(e.defId)?.canConjureMana,
    );
    const showConjure = !inPlaceMode && weaversSelected.length > 0;
    this.conjureBtn.style.display = showConjure ? '' : 'none';
    if (showConjure) {
      const channeling = weaversSelected.some((e) => e.channeling);
      const bal = this.registry.balance;
      this.conjureBtn.textContent = channeling
        ? 'Stop Conjuring'
        : `Conjure (${bal.conjureManaAmount}/${bal.conjureManaIntervalSeconds}s)`;
      this.conjureBtn.classList.toggle('active', channeling);
    }

    const completeBuilding = ownBuilding && single && single.buildProgress === undefined && single.morphProgress === undefined;
    const canSell = !!completeBuilding && !ownBuilding.isConstructionYard;
    const canRepair = !!completeBuilding && single!.hp < single!.maxHp;
    const canRally = !!completeBuilding && !!ownBuilding.producesUnits?.length && !ownBuilding.isConstructionYard;
    const showBuildingRow = !inPlaceMode && !!ownBuilding && (canSell || canRepair || canRally || single?.repairing);
    this.buildingRow.style.display = showBuildingRow ? 'flex' : 'none';
    this.sellBtn.style.display = canSell ? '' : 'none';
    if (canSell && ownBuilding) {
      const refund = Math.floor(ownBuilding.cost * this.registry.balance.sellRefundRatio);
      this.sellBtn.textContent = `Sell (+${refund})`;
      this.sellBtn.disabled = !!(single?.productionQueue?.length || single?.repairing);
    }
    this.repairBtn.style.display = canRepair || single?.repairing ? '' : 'none';
    if (canRepair || single?.repairing) {
      const repairing = !!single?.repairing;
      const costPerTick = this.registry.balance.repairHpPerTick * this.registry.balance.repairManaPerHp;
      const costLabel = costPerTick < 1 ? costPerTick.toFixed(1) : String(Math.round(costPerTick));
      this.repairBtn.textContent = repairing ? 'Stop Repair' : `Repair (${costLabel}/tick)`;
      this.repairBtn.classList.toggle('active', repairing);
      this.repairBtn.disabled = !repairing && p.mana < costPerTick;
    }
    this.rallyBtn.style.display = canRally ? '' : 'none';
    this.rallyBtn.classList.toggle('active', inRallyMode);
    if (canRally && single?.rally) {
      this.rallyBtn.textContent = 'Set Rally ✓';
    } else {
      this.rallyBtn.textContent = inRallyMode ? 'Tap map…' : 'Set Rally';
    }

    if (inRallyMode) {
      this.selName.textContent = ownBuilding?.name ?? 'Set rally point';
      this.selDesc.textContent = 'Tap the map where new units should go after training.';
      this.selMeta.textContent = single?.rally ? `Current rally set` : 'No rally point';
      this.clearProduceRow();
      this.updateTrainQueue(null);
    } else if (inDeployMode && session.deployEntityId) {
      const campDef = this.registry.buildings.get('waystone_camp')!;
      this.selName.textContent = 'Deploy: Waystone Camp';
      this.selDesc.textContent = campDef.description;
      this.selMeta.textContent = 'Choose a spot in your build zone · tap Place to confirm';
      this.trainPanel.setOpen(false);
      this.buildPanel.setOpen(false);
      this.clearProduceRow();
      this.updateTrainQueue(null);
    } else if (inBuildMode && session.buildDefId) {
      const placing = this.registry.buildings.get(session.buildDefId)!;
      this.selName.textContent = `Placing: ${placing.name}`;
      this.selDesc.textContent = placing.description;
      this.selMeta.textContent = `${placing.cost} mana · tap Place to confirm`;
      this.trainPanel.setOpen(false);
      this.buildPanel.setOpen(false);
      this.clearProduceRow();
      this.updateTrainQueue(null);
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
        this.updateTrainQueue(single);
        if (showTrainPanel) {
          this.trainPanel.setTitle(`Train — ${ownBuilding.name}`);
          if (this.produceBuildingId !== single.id) this.rebuildProduceRow(single);
          this.updateProduceButtons(p, single);
        } else {
          this.clearProduceRow();
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
        this.clearProduceRow();
        this.updateTrainQueue(null);
      } else {
        this.selDesc.textContent = '';
        this.selMeta.textContent = `${Math.ceil(single.hp)}/${single.maxHp} HP`;
        this.clearProduceRow();
        this.updateTrainQueue(null);
      }
    } else if (sel.length > 1) {
      this.selName.textContent = `${sel.length} units selected`;
      this.selDesc.textContent = 'Tap map to move. Use orders below.';
      this.selMeta.textContent = '';
      this.clearProduceRow();
      this.updateTrainQueue(null);
    } else {
      this.selName.textContent = 'Nothing selected';
      this.selDesc.textContent = 'Tap your HQ (purple) to build. Tap colored buildings to train or view info.';
      this.selMeta.textContent = short
        ? `Low power (−${deficit}) — build Ley Conduit or destroy structures`
        : 'Drag to select · two fingers to pan the map.';
      this.clearProduceRow();
      this.updateTrainQueue(null);
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

    if ((session.mode === 'build' && session.buildGhost && session.buildDefId) || (session.mode === 'deploy' && session.buildGhost)) {
      const def =
        session.mode === 'deploy'
          ? this.registry.buildings.get('waystone_camp')!
          : this.registry.buildings.get(session.buildDefId!)!;
      const ok = session.buildGhost!.valid;
      this.buildConfirm.style.display = 'flex';
      const hint =
        ok ? '· tap Place to confirm' : session.buildGhost!.issue === 'range' ? '· too far from base' : '· blocked';
      const prefix = session.mode === 'deploy' ? 'Deploy' : def.name;
      this.buildConfirmLabel.textContent = `${prefix} (${session.mode === 'deploy' ? 'free' : def.cost}) ${hint}`;
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
