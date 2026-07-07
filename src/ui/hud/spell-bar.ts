import type { Registry } from '../../data/registry';
import type { Player } from '../../sim/types';
import type { InputController } from '../../input/controller';
import { el } from './dom';

export class SpellBar {
  readonly row = el('div', 'spell-row');
  readonly confirm = el('div', 'spell-confirm');

  constructor(
    private registry: Registry,
    private controller: InputController,
  ) {
    this.buildButtons();
    this.confirm.style.display = 'none';
  }

  private buildButtons(): void {
    for (const [id, def] of this.registry.spells) {
      const short = def.name.split(' ').map((w) => w[0]).join('');
      const b = el('button', 'btn spell-btn compact-btn', short);
      b.dataset.spell = id;
      b.title = def.name;
      b.addEventListener('click', () => {
        const spell = this.registry.spells.get(id)!;
        if (spell.effect.kind === 'beam') this.controller.startSuperweapon(id);
        else this.controller.startSpell(id);
      });
      this.row.appendChild(b);
    }
    const cast = el('button', 'btn confirm', 'Cast');
    cast.addEventListener('click', () => this.controller.confirmSpell());
    this.confirm.append(el('span', 'confirm-label', 'Cast spell?'), cast);
  }

  update(player: Player, session: InputController['session']): void {
    for (const btn of this.row.querySelectorAll<HTMLButtonElement>('.spell-btn')) {
      const sid = btn.dataset.spell!;
      const def = this.registry.spells.get(sid)!;
      const unlocked = def.requires.every((r) => player.unlockedTech.includes(r));
      const cd = player.spellCooldowns[sid] ?? 0;
      btn.disabled = !unlocked || cd > 0;
      btn.classList.toggle('active', session.spellId === sid);
      const short = def.name.split(' ').map((w) => w[0]).join('');
      btn.textContent = cd > 0 ? `${short}…` : short;
    }
    this.confirm.style.display = session.pendingConfirm ? 'flex' : 'none';
  }
}
