import type { Registry } from '../../data/registry';
import type { BuildingDef } from '../../data/defs';
import type { Player } from '../../sim/types';
import type { InputController } from '../../input/controller';
import { el } from './dom';
import { Collapsible } from './collapsible';

export class BuildPanel {
  readonly panel: Collapsible;
  readonly row = el('div', 'card-row build-row');

  constructor(
    private registry: Registry,
    private controller: InputController,
    startOpen: boolean,
  ) {
    this.panel = new Collapsible('Build structures', startOpen);
    this.panel.body.append(this.row);
    this.buildButtons();
  }

  private buildButtons(): void {
    for (const [, def] of this.registry.buildings) {
      if (def.isConstructionYard) continue;
      const b = el('button', 'btn build-btn');
      b.dataset.def = def.id;
      b.style.borderLeftColor = def.art.accent;
      b.append(this.buildBtnLabel(def));
      b.addEventListener('click', () => this.controller.startBuild(def.id));
      this.row.appendChild(b);
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

  update(player: Player, session: InputController['session']): void {
    for (const btn of this.row.querySelectorAll<HTMLButtonElement>('.build-btn')) {
      const def = this.registry.buildings.get(btn.dataset.def!)!;
      const unlocked = def.requires.every((r) => player.unlockedTech.includes(r));
      const affordable = player.mana >= def.cost;
      const ok = unlocked && affordable;
      btn.disabled = !ok;
      btn.classList.toggle('active', session.buildDefId === btn.dataset.def);
      btn.classList.toggle('unaffordable', unlocked && !affordable);
      btn.classList.toggle('locked-out', !unlocked);
      const sub = btn.querySelector('.btn-sub');
      if (sub) sub.textContent = !unlocked ? 'Locked' : `${def.cost} mana`;
    }
  }
}
