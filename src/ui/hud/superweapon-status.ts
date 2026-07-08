import type { GameState } from '../../sim/types';
import type { Registry } from '../../data/registry';
import { TICK_HZ } from '../../core/constants';
import { el } from './dom';

function fmt(ticks: number): string {
  const s = Math.ceil(ticks / TICK_HZ);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export class SuperweaponStatus {
  readonly root = el('div', 'superweapon-status');
  private spireId: string | null = null;
  private spellId: string | null = null;

  constructor(registry: Registry) {
    for (const [id, b] of registry.buildings) {
      if (b.isSuperweapon && b.unlocksSpells && b.unlocksSpells.length) {
        this.spireId = id;
        this.spellId = b.unlocksSpells[0]!;
        break;
      }
    }
    this.root.style.display = 'none';
  }

  update(state: GameState): void {
    if (!this.spireId || !this.spellId) return;
    const rows: string[] = [];
    for (const p of state.players) {
      if (!p.unlockedTech.includes(this.spireId)) continue;
      const firing = state.beams.some((bm) => bm.owner === p.id);
      const cd = p.spellCooldowns[this.spellId] ?? 0;
      const status = firing ? 'FIRING' : cd > 0 ? fmt(cd) : 'READY';
      rows.push(
        `<span class="sw-row"><span class="sw-swatch" style="background:${p.color}"></span>` +
          `<span class="sw-name">${p.id}</span><span class="sw-time">${status}</span></span>`,
      );
    }
    if (rows.length === 0) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';
    this.root.innerHTML =
      `<div class="sw-inner"><span class="sw-title">Astral Lance</span>${rows.join('')}</div>`;
  }
}
