import type { Registry } from '../../data/registry';
import type { BuildingDef, MenuCategory, UnitDef } from '../../data/defs';
import type { BuildingEntity } from '../../sim/entity-types';
import type { GameState, Player, PlayerId } from '../../sim/types';
import type { InputController } from '../../input/controller';
import { buildingHasPower, isPowerShort } from '../../sim/views';
import { el } from './dom';
import { Collapsible } from './collapsible';
import { CategoryChips } from './category-chips';
import {
  BUILD_MENU_CATEGORIES,
  isBuildCategory,
  isTrainCategory,
  MENU_CATEGORY_LABELS,
  TRAIN_MENU_CATEGORIES,
} from './menu-categories';
import {
  leastBusyProducer,
  listProducersForCategory,
  listProducersForUnit,
  trainCategoryForBuilding,
  type ProducerInfo,
} from './producers';

export type CommandMenuMode = 'hq' | 'producer';

export interface CommandMenuContext {
  mode: CommandMenuMode;
  /** Set when mode is producer — the map-selected production building. */
  producerBuildingId?: number;
  producerBuildingDefId?: string;
}

export class CommandMenuPanel {
  readonly panel: Collapsible;
  readonly trainQueueEl = el('div', 'train-queue');
  readonly touchRoots: HTMLElement[] = [];

  private categoryChips: CategoryChips;
  private producerRow = el('div', 'producer-row');
  private contentRow = el('div', 'card-row command-row');
  private contextKey = '';
  private activeCategory: MenuCategory = 'buildings';
  private activeProducerId: number | null = null;
  private context: CommandMenuContext | null = null;
  private layoutKey = '';

  constructor(
    private registry: Registry,
    private controller: InputController,
    startOpen: boolean,
    onHeadClick?: () => void,
  ) {
    this.panel = new Collapsible('Command', startOpen, onHeadClick);
    this.categoryChips = new CategoryChips((id) => this.onCategorySelect(id));
    this.panel.body.append(this.categoryChips.root, this.producerRow, this.contentRow);
    this.touchRoots = [this.categoryChips.root, this.producerRow, this.contentRow];
    this.producerRow.style.display = 'none';
  }

  setContext(context: CommandMenuContext | null): void {
    const key = context
      ? `${context.mode}:${context.producerBuildingId ?? ''}:${context.producerBuildingDefId ?? ''}`
      : '';
    const changed = key !== this.contextKey;
    this.contextKey = key;
    this.context = context;

    if (!context) return;

    if (changed) {
      if (context.mode === 'producer' && context.producerBuildingId != null) {
        this.activeProducerId = context.producerBuildingId;
        const cat = context.producerBuildingDefId
          ? trainCategoryForBuilding(this.registry, context.producerBuildingDefId)
          : null;
        if (cat) this.activeCategory = cat;
      } else if (context.mode === 'hq' && !isTrainCategory(this.activeCategory) && !isBuildCategory(this.activeCategory)) {
        this.activeCategory = 'buildings';
        this.activeProducerId = null;
      }
    }
  }

  private onCategorySelect(id: MenuCategory): void {
    this.activeCategory = id;
    if (isTrainCategory(id)) {
      const producers = listProducersForCategory(this.state, this.registry, this.playerId, id);
      if (this.activeProducerId == null || !producers.some((p) => p.entity.id === this.activeProducerId)) {
        const preferred =
          this.context?.mode === 'producer' && this.context.producerBuildingId != null
            ? producers.find((p) => p.entity.id === this.context!.producerBuildingId) ?? null
            : null;
        this.activeProducerId = preferred?.entity.id ?? leastBusyProducer(producers)?.entity.id ?? null;
      }
    } else {
      this.activeProducerId = null;
    }
    this.renderContent();
    this.renderProducers();
    this.layoutKey = `${this.contextKey}|${this.activeCategory}`;
    this.categoryChips.setActive(id);
  }

  private state!: GameState;
  private playerId!: PlayerId;
  private lastPlayer!: Player;
  private lastSession!: InputController['session'];

  update(
    state: GameState,
    playerId: PlayerId,
    player: Player,
    session: InputController['session'],
    context: CommandMenuContext | null,
  ): void {
    this.state = state;
    this.playerId = playerId;
    this.lastPlayer = player;
    this.lastSession = session;
    this.setContext(context);

    if (!context) return;

    const categories =
      context.mode === 'hq' || context.mode === 'producer'
        ? [...BUILD_MENU_CATEGORIES, ...TRAIN_MENU_CATEGORIES].map((id) => ({
            id,
            label: MENU_CATEGORY_LABELS[id],
          }))
        : TRAIN_MENU_CATEGORIES.map((id) => ({ id, label: MENU_CATEGORY_LABELS[id] }));

    const validIds = new Set(categories.map((c) => c.id));
    if (!validIds.has(this.activeCategory)) {
      this.activeCategory = context.mode === 'hq' ? 'buildings' : trainCategoryForBuilding(this.registry, context.producerBuildingDefId ?? '') ?? 'workers';
    }

    this.categoryChips.setCategories(categories);
    this.categoryChips.setActive(this.activeCategory);

    if (context.mode === 'hq') {
      this.panel.setTitle('Command');
    } else {
      const bdef = context.producerBuildingDefId
        ? this.registry.building(context.producerBuildingDefId)
        : null;
      this.panel.setTitle(bdef ? `Train — ${bdef.name}` : 'Train');
    }

    const layoutKey = `${this.contextKey}|${this.activeCategory}`;
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.renderContent();
      this.renderProducers();
    } else {
      this.refreshProducerLabels();
    }
    this.updateItemStates(player, session);
  }

  updateTrainQueue(registry: Registry, controller: InputController, building: BuildingEntity | null): void {
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
      const udef = registry.units.get(item.defId);
      if (!udef) continue;
      const row = el('div', 'train-queue-item');
      const icon = el('span', `queue-icon shape-${udef.art.shape}`);
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
        controller.cancelProduce(building.id, i);
      });
      row.appendChild(cancel);
      this.trainQueueEl.appendChild(row);
    }
  }

  private refreshProducerLabels(): void {
    if (!isTrainCategory(this.activeCategory)) return;
    const producers = listProducersForCategory(this.state, this.registry, this.playerId, this.activeCategory);
    const byId = new Map(producers.map((p) => [p.entity.id, p]));
    for (const btn of this.producerRow.querySelectorAll<HTMLButtonElement>('.producer-chip')) {
      const info = byId.get(Number(btn.dataset.buildingId));
      if (!info) continue;
      const queue = info.queueLength > 0 ? ` · Q${info.queueLength}` : '';
      btn.textContent = `${info.label}${queue}`;
      btn.classList.toggle('offline', info.offline);
      btn.classList.toggle('slow', info.slow && !info.offline);
    }
  }

  private renderProducers(): void {
    this.producerRow.innerHTML = '';
    if (!isTrainCategory(this.activeCategory)) {
      this.producerRow.style.display = 'none';
      return;
    }
    const producers = listProducersForCategory(
      this.state,
      this.registry,
      this.playerId,
      this.activeCategory,
    );
    if (!producers.length) {
      this.producerRow.style.display = 'none';
      return;
    }
    this.producerRow.style.display = 'flex';
    const label = el('span', 'producer-row-label', 'Train at');
    this.producerRow.appendChild(label);
    for (const info of producers) {
      this.producerRow.appendChild(this.makeProducerChip(info));
    }
  }

  private makeProducerChip(info: ProducerInfo): HTMLElement {
    const btn = el('button', 'producer-chip');
    btn.type = 'button';
    btn.dataset.buildingId = String(info.entity.id);
    const queue = info.queueLength > 0 ? ` · Q${info.queueLength}` : '';
    btn.textContent = `${info.label}${queue}`;
    btn.classList.toggle('active', info.entity.id === this.activeProducerId);
    btn.classList.toggle('offline', info.offline);
    btn.classList.toggle('slow', info.slow && !info.offline);
    btn.addEventListener('click', () => {
      this.activeProducerId = info.entity.id;
      for (const chip of this.producerRow.querySelectorAll<HTMLButtonElement>('.producer-chip')) {
        chip.classList.toggle('active', Number(chip.dataset.buildingId) === this.activeProducerId);
      }
      this.updateItemStates(this.lastPlayer, this.lastSession);
    });
    return btn;
  }

  private renderContent(): void {
    this.contentRow.innerHTML = '';
    if (isBuildCategory(this.activeCategory)) {
      for (const [, def] of this.registry.buildings) {
        if (def.isConstructionYard || def.menuCategory !== this.activeCategory) continue;
        this.contentRow.appendChild(this.makeBuildButton(def));
      }
      return;
    }
    if (isTrainCategory(this.activeCategory)) {
      for (const [, udef] of this.registry.units) {
        if (udef.menuCategory !== this.activeCategory) continue;
        this.contentRow.appendChild(this.makeTrainButton(udef));
      }
    }
  }

  private makeBuildButton(def: BuildingDef): HTMLElement {
    const btn = el('button', 'btn build-btn');
    btn.dataset.def = def.id;
    btn.style.borderLeftColor = def.art.accent;
    const wrap = el('div', 'btn-stack');
    wrap.append(el('span', 'btn-title', def.name));
    const costParts = [`${def.cost} mana`];
    if (def.powerUsed) costParts.push(`${def.powerUsed} pwr`);
    if (def.powerProduced) costParts.push(`+${def.powerProduced} pwr`);
    wrap.append(el('span', 'btn-sub', costParts.join(' · ')));
    btn.append(wrap);
    btn.addEventListener('click', () => this.controller.startBuild(def.id));
    return btn;
  }

  private makeTrainButton(udef: UnitDef): HTMLElement {
    const btn = el('button', 'btn produce-btn');
    btn.dataset.unit = udef.id;
    const wrap = el('div', 'btn-stack');
    wrap.append(el('span', 'btn-title', udef.name), el('span', 'btn-sub', udef.role));
    btn.append(wrap);
    btn.addEventListener('click', () => this.queueUnit(udef.id));
    return btn;
  }

  private queueUnit(unitDefId: string): void {
    const producers = listProducersForUnit(this.state, this.registry, this.playerId, unitDefId);
    if (!producers.length) return;
    let target =
      this.activeProducerId != null
        ? producers.find((p) => p.entity.id === this.activeProducerId) ?? null
        : null;
    if (!target) target = leastBusyProducer(producers);
    if (!target) return;
    this.activeProducerId = target.entity.id;
    for (const chip of this.producerRow.querySelectorAll<HTMLButtonElement>('.producer-chip')) {
      chip.classList.toggle('active', Number(chip.dataset.buildingId) === this.activeProducerId);
    }
    this.refreshProducerLabels();
    this.controller.produce(target.entity.id, unitDefId);
  }

  private updateItemStates(player: Player, session: InputController['session']): void {
    for (const btn of this.contentRow.querySelectorAll<HTMLButtonElement>('.build-btn')) {
      const def = this.registry.buildings.get(btn.dataset.def!)!;
      const unlocked = def.requires.every((r) => player.unlockedTech.includes(r));
      const affordable = player.mana >= def.cost;
      btn.disabled = !unlocked || !affordable;
      btn.classList.toggle('active', session.buildDefId === btn.dataset.def);
      btn.classList.toggle('unaffordable', unlocked && !affordable);
      btn.classList.toggle('locked-out', !unlocked);
      const sub = btn.querySelector('.btn-sub');
      if (sub) sub.textContent = !unlocked ? 'Locked' : `${def.cost} mana`;
    }

    const st = this.state;
    for (const btn of this.contentRow.querySelectorAll<HTMLButtonElement>('.produce-btn')) {
      const uid = btn.dataset.unit!;
      const udef = this.registry.unit(uid);
      const producers = listProducersForUnit(st, this.registry, this.playerId, uid);
      const unlocked = udef.requires.every((r) => player.unlockedTech.includes(r));
      const affordable = player.mana >= udef.cost;
      const producerDef = this.registry.building(udef.producedBy);
      const hasProducer = producers.length > 0;
      const activeProducer =
        this.activeProducerId != null
          ? producers.find((p) => p.entity.id === this.activeProducerId) ?? null
          : null;
      const target = activeProducer ?? leastBusyProducer(producers);
      const offline = target ? !buildingHasPower(st, this.registry, target.entity) : false;
      const slow = target ? isPowerShort(st, this.playerId) && !offline : false;
      const ok = unlocked && affordable && hasProducer && !offline;
      btn.disabled = !ok;
      btn.classList.toggle('no-power', offline || slow);
      const sub = btn.querySelector('.btn-sub');
      if (sub) {
        if (!hasProducer) sub.textContent = `Needs ${producerDef.name}`;
        else if (offline) sub.textContent = 'No power';
        else if (slow) sub.textContent = 'Slow (low power)';
        else if (!affordable) sub.textContent = `${udef.cost} mana`;
        else if (!unlocked) sub.textContent = 'Locked';
        else sub.textContent = `${udef.role} · ${udef.cost} mana`;
      }
    }

    for (const btn of this.producerRow.querySelectorAll<HTMLButtonElement>('.producer-chip')) {
      btn.classList.toggle('active', Number(btn.dataset.buildingId) === this.activeProducerId);
    }
  }
}
