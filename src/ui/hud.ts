// In-match DOM HUD overlay: resource readout, spell buttons, command card (build/produce/stance),
// selection info, build confirm, spell confirm, minimap host, and result overlay.
// Reads sim state + session each frame (cheap text/visibility updates) and calls the controller.
import type { GameState, PlayerId } from '../sim/types';
import type { Registry } from '../data/registry';
import type { InputController } from '../input/controller';
import type { Minimap } from './minimap';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Hud {
  root = el('div', 'hud');
  private manaEl = el('span', 'stat-mana', '0');
  private powerEl = el('span', 'stat-power', '0');
  private selInfo = el('div', 'sel-info');
  private buildRow = el('div', 'card-row build-row');
  private produceRow = el('div', 'card-row produce-row');
  private stanceRow = el('div', 'card-row stance-row');
  private buildConfirm = el('div', 'build-confirm');
  private spellRow = el('div', 'spell-row');
  private spellConfirm = el('div', 'spell-confirm');
  private result = el('div', 'result-overlay');
  private debugEl = el('div', 'debug-overlay');
  private hintEl = el('div', 'hint-banner');
  private debugOn = false;
  onExit: (() => void) | null = null;

  constructor(
    private state: () => GameState,
    private registry: Registry,
    private controller: InputController,
    private playerId: PlayerId,
    minimap: Minimap,
  ) {
    const top = el('div', 'topbar');
    const mana = el('div', 'stat');
    mana.append(el('span', 'stat-label', 'Mana '), this.manaEl);
    const power = el('div', 'stat');
    power.append(el('span', 'stat-label', 'Power '), this.powerEl);
    const dbgBtn = el('button', 'btn dbg-btn', '·');
    dbgBtn.title = 'Toggle debug overlay';
    dbgBtn.addEventListener('click', () => {
      this.debugOn = !this.debugOn;
      this.debugEl.style.display = this.debugOn ? 'block' : 'none';
    });
    const menuBtn = el('button', 'btn menu-btn', 'Menu');
    menuBtn.addEventListener('click', () => this.toggleMenu());
    top.append(mana, power, this.spellRow, dbgBtn, menuBtn);

    const minimapWrap = el('div', 'minimap-wrap');
    minimapWrap.appendChild(minimap.canvas);

    const cmdCard = el('div', 'cmd-card');
    cmdCard.append(this.selInfo, this.stanceRow, this.produceRow, this.buildRow, this.buildConfirm);

    this.root.append(top, minimapWrap, cmdCard, this.spellConfirm, this.debugEl, this.hintEl, this.result);
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
    const dismiss = () => {
      this.hintEl.style.display = 'none';
      this.hintEl.removeEventListener('pointerdown', dismiss);
    };
    this.hintEl.addEventListener('pointerdown', dismiss);
    setTimeout(dismiss, 9000);
  }

  setDebug(fps: number, tick: number, entities: number): void {
    if (!this.debugOn) return;
    const sel = this.controller.session.selection.size;
    this.debugEl.textContent = `${fps.toFixed(0)} fps · tick ${tick} · entities ${entities} · sel ${sel}`;
  }

  private buildBuildButtons(): void {
    for (const [id, def] of this.registry.buildings) {
      if (def.isConstructionYard) continue;
      const b = el('button', 'btn build-btn', def.name);
      b.dataset.def = id;
      b.addEventListener('click', () => this.controller.startBuild(id));
      this.buildRow.appendChild(b);
    }
  }

  private buildStanceButtons(): void {
    const am = el('button', 'btn', 'Attack-Move');
    am.addEventListener('click', () => this.controller.setMode('attackMove'));
    const stop = el('button', 'btn', 'Stop');
    stop.addEventListener('click', () => this.controller.stop());
    const hold = el('button', 'btn', 'Hold');
    hold.addEventListener('click', () => this.controller.setStance('hold'));
    const aggr = el('button', 'btn', 'Aggressive');
    aggr.addEventListener('click', () => this.controller.setStance('aggressive'));
    this.stanceRow.append(am, stop, hold, aggr);
  }

  private buildSpellButtons(): void {
    for (const [id, def] of this.registry.spells) {
      const b = el('button', 'btn spell-btn', def.name);
      b.dataset.spell = id;
      b.addEventListener('click', () => this.controller.startSpell(id));
      this.spellRow.appendChild(b);
    }
    const cast = el('button', 'btn confirm', 'Confirm');
    cast.addEventListener('click', () => this.controller.confirmSpell());
    this.spellConfirm.append(el('span', 'confirm-label', 'Cast spell?'), cast);
  }

  private toggleMenu(): void {
    // simple menu = surrender/exit for MVP
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

  update(): void {
    const st = this.state();
    const p = st.players.find((pl) => pl.id === this.playerId);
    if (!p) return;
    this.manaEl.textContent = Math.floor(p.mana).toString();
    this.powerEl.textContent = `${p.power}/${p.powerUsed}`;
    this.powerEl.classList.toggle('low', p.powerUsed > p.power);

    const session = this.controller.session;

    // spell buttons: enabled if unlocked and off cooldown
    for (const btn of this.spellRow.querySelectorAll<HTMLButtonElement>('.spell-btn')) {
      const sid = btn.dataset.spell!;
      const def = this.registry.spells.get(sid)!;
      const unlocked = def.requires.every((r) => p.unlockedTech.includes(r));
      const cd = p.spellCooldowns[sid] ?? 0;
      btn.disabled = !unlocked || cd > 0;
      btn.classList.toggle('active', session.spellId === sid);
      btn.textContent = cd > 0 ? `${def.name} (${Math.ceil(cd / 20)}s)` : def.name;
    }

    // build buttons: enabled if requirements met + affordable
    for (const btn of this.buildRow.querySelectorAll<HTMLButtonElement>('.build-btn')) {
      const def = this.registry.buildings.get(btn.dataset.def!)!;
      const ok = def.requires.every((r) => p.unlockedTech.includes(r)) && p.mana >= def.cost;
      btn.disabled = !ok;
      btn.classList.toggle('active', session.buildDefId === btn.dataset.def);
    }

    // selection info + produce row
    this.produceRow.innerHTML = '';
    const selIds = [...session.selection];
    const sel = selIds.map((id) => st.entities.get(id)).filter((e) => e && e.state !== 'dead');
    if (sel.length === 0) {
      this.selInfo.textContent = '';
    } else if (sel.length === 1) {
      const e = sel[0]!;
      const def = this.registry.units.get(e.defId) ?? this.registry.buildings.get(e.defId);
      this.selInfo.textContent = `${def?.name ?? e.defId}  ${Math.ceil(e.hp)}/${e.maxHp}`;
      if (e.owner === this.playerId && e.kind === 'building' && e.productionQueue) {
        const bdef = this.registry.building(e.defId);
        for (const uid of bdef.producesUnits ?? []) {
          const udef = this.registry.unit(uid);
          const btn = el('button', 'btn produce-btn', `${udef.name} (${udef.cost})`);
          const ok = udef.requires.every((r) => p.unlockedTech.includes(r)) && p.mana >= udef.cost;
          btn.disabled = !ok;
          btn.addEventListener('click', () => this.controller.produce(e.id, uid));
          this.produceRow.appendChild(btn);
        }
        const q = e.productionQueue.length;
        if (q > 0) this.selInfo.textContent += `  [queue ${q}]`;
      }
    } else {
      this.selInfo.textContent = `${sel.length} units`;
    }

    // build confirm
    this.buildConfirm.innerHTML = '';
    if (session.mode === 'build' && session.buildGhost) {
      const def = this.registry.buildings.get(session.buildDefId!)!;
      const ok = session.buildGhost.valid;
      const label = el('span', 'confirm-label', `${def.name} (${def.cost}) ${ok ? '' : '— blocked'}`);
      const confirm = el('button', 'btn confirm', 'Place');
      confirm.disabled = !ok;
      confirm.addEventListener('click', () => this.controller.confirmBuild());
      const cancel = el('button', 'btn', 'Cancel');
      cancel.addEventListener('click', () => this.controller.setMode('normal'));
      this.buildConfirm.append(label, confirm, cancel);
    }

    // spell confirm overlay
    this.spellConfirm.style.display = session.pendingConfirm ? 'flex' : 'none';

    // match end
    if (st.ended && this.result.style.display === 'none') {
      const won = p.team === st.winnerTeam;
      this.showResult(won);
    }
  }
}
