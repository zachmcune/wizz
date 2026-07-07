import type { Registry } from '../../data/registry';
import type { GameState, Entity, PlayerId } from '../../sim/types';
import type { InputController } from '../../input/controller';
import { buildingHasPower, isPowerShort } from '../../sim/views';
import { el } from './dom';
import { Collapsible } from './collapsible';

export class TrainPanel {
  readonly panel: Collapsible;
  readonly produceRow = el('div', 'card-row produce-row');
  readonly trainQueueEl = el('div', 'train-queue');
  private produceBuildingId: number | null = null;

  constructor(startOpen: boolean) {
    this.panel = new Collapsible('Train units', startOpen);
    this.panel.body.append(this.produceRow);
  }

  clearProduceRow(): void {
    if (this.produceBuildingId === null) return;
    this.produceRow.innerHTML = '';
    this.produceBuildingId = null;
  }

  private shapeClass(shape: string): string {
    return `shape-${shape}`;
  }

  updateTrainQueue(registry: Registry, controller: InputController, building: Entity | null): void {
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
        controller.cancelProduce(building.id, i);
      });
      row.appendChild(cancel);
      this.trainQueueEl.appendChild(row);
    }
  }

  rebuildProduceRow(registry: Registry, controller: InputController, building: Entity): void {
    this.produceRow.innerHTML = '';
    this.produceBuildingId = building.id;
    const bdef = registry.building(building.defId);
    for (const uid of bdef.producesUnits ?? []) {
      const udef = registry.unit(uid);
      const btn = el('button', 'btn produce-btn');
      btn.dataset.unit = uid;
      const wrap = el('div', 'btn-stack');
      wrap.append(el('span', 'btn-title', udef.name), el('span', 'btn-sub', udef.role));
      btn.append(wrap);
      btn.addEventListener('click', () => controller.produce(building.id, uid));
      this.produceRow.appendChild(btn);
    }
  }

  updateProduceButtons(
    state: GameState,
    registry: Registry,
    playerId: PlayerId,
    player: { mana: number; unlockedTech: string[] },
    building: Entity,
  ): void {
    const offline = !buildingHasPower(state, registry, building);
    const slow = isPowerShort(state, playerId) && !offline;
    for (const btn of this.produceRow.querySelectorAll<HTMLButtonElement>('.produce-btn')) {
      const uid = btn.dataset.unit!;
      const udef = registry.unit(uid);
      const unlocked = udef.requires.every((r) => player.unlockedTech.includes(r));
      const affordable = player.mana >= udef.cost;
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

  needsProduceRebuild(buildingId: number): boolean {
    return this.produceBuildingId !== buildingId;
  }
}
