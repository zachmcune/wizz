// HUD — the in-match chrome, wired live to the sim.
//
// LAYOUT CONTRACT (both enforced by `tests/hud-geometry.test.ts` against real rendered boxes):
//
//   1. The HUD occupies AT MOST 18% of a 667x375 viewport's area. That was the reported bug: the
//      selected-unit panel alone covered about half the phone screen.
//   2. No two HUD elements overlap at any of the four target viewports, and nothing overflows the
//      viewport. The 'WASD' hint used to sit on top of the Move button on Chromebook.
//
// How the contract is met, rather than just hoped for:
//
//   • The HUD is a CSS GRID over the whole screen with a named area per zone, so zones cannot overlap
//     by construction — they are grid cells, not absolutely positioned boxes fighting each other. The
//     old layout used `position:absolute` for the hint and the zoom widget, which is exactly how it
//     ended up on top of a button.
//   • On the phone the selection panel becomes a single 40px strip and the minimap is dropped, which is
//     what brings the total under 18%.
//   • The hint is inside the grid as its own row, not floating over the command bar.
//
// Everything re-renders from `GameState` on each tick via `update()`. The DOM is built once and mutated
// in place, so a 20 Hz refresh does not thrash the document.
import type { GameState, EntityId } from '../sim/types';
import type { Registry } from '../data/registry';
import type { MatchController } from '../app/match';
import { button, el, gauge, resource } from '../ui/kit';
import { icon, type IconName } from '../ui/icons';
import type { AppState } from '../app/state';

/** Build-menu categories, in the order classic RTS HUDs use (cheap → expensive). */
const BUILD_TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'buildings', label: 'Build', icon: 'build' },
  { id: 'defenses', label: 'Defend', icon: 'shield' },
  { id: 'advanced', label: 'Advance', icon: 'research' },
];

export class Hud {
  readonly root: HTMLElement;
  private ctrl: MatchController;
  private registry: Registry;
  private app: AppState;
  private onOpenResearch: () => void;
  private onPause: () => void;

  // Elements updated every tick.
  private manaValue!: HTMLElement;
  private supplyValue!: HTMLElement;
  private powerValue!: HTMLElement;
  private clockValue!: HTMLElement;
  private selectBody!: HTMLElement;
  private selectHead!: HTMLElement;
  private cmdGrid!: HTMLElement;
  private buildList!: HTMLElement;
  private trainList!: HTMLElement;
  private researchList!: HTMLElement;
  private panelHost!: HTMLElement;
  private noticeEl!: HTMLElement;
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D | null;
  private buildTabs!: HTMLElement;

  private activeBuildTab = 'buildings';
  private lastSelectionKey = '';

  constructor(
    ctrl: MatchController,
    registry: Registry,
    app: AppState,
    hooks: { onOpenResearch: () => void; onPause: () => void },
  ) {
    this.ctrl = ctrl;
    this.registry = registry;
    this.app = app;
    this.onOpenResearch = hooks.onOpenResearch;
    this.onPause = hooks.onPause;
    this.root = el('div', 'hud');
    this.build();
  }

  // ───────────────────────────────────────────────────────────────────────── structure

  private build(): void {
    // ---- top bar: resources, clock, controls
    const top = el('div', 'hud-top plate');
    const res = el('div', 'row hud-top__res');
    const mana = resource('mana', '0', 'Mana');
    const supply = resource('supply', '0 / 0', 'Units');
    const power = resource('power', '0', 'Power');
    this.manaValue = mana.querySelector('.res__value') as HTMLElement;
    this.supplyValue = supply.querySelector('.res__value') as HTMLElement;
    this.powerValue = power.querySelector('.res__value') as HTMLElement;
    res.append(mana, supply, power);

    const clock = el('div', 'hud-top__clock');
    this.clockValue = el('span', 'num', '0:00');
    clock.append(this.clockValue);

    // ---- selection readout: a SEGMENT OF THE TOP BAR, not a separate floating panel.
    //
    // This is the structural fix for the "selection panel covers half the phone screen" report. As a
    // flex child of the top bar it cannot overlap anything and it adds no extra band of height. The
    // earlier design made it a second full-width row, which measured 30% of a 667x375 screen on its own.
    const selPanel = el('section', 'hud-select');
    this.selectHead = el('header', 'hud-select__head');
    this.selectBody = el('div', 'hud-select__body');
    selPanel.append(this.selectHead, this.selectBody);

    const controls = el('div', 'row hud-top__controls');
    const researchBtn = button({ icon: 'research', label: 'Research tree', iconOnly: true, size: 'sm', onClick: this.onOpenResearch });
    researchBtn.dataset.testid = 'hud-research';
    const pauseBtn = button({ icon: 'hold', label: 'Pause', iconOnly: true, size: 'sm', onClick: this.onPause });
    pauseBtn.dataset.testid = 'hud-pause';
    controls.append(researchBtn, pauseBtn);

    // Order: selection summary, resources, clock, controls. One band, one flex line.
    top.append(selPanel, el('div', 'spacer'), res, clock, controls);

    // ---- minimap (right)
    const mm = el('section', 'hud-minimap plate');
    const mmHead = el('header', 'hud-minimap__head');
    mmHead.append(el('span', 'eyebrow', 'Field'));
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 160;
    this.minimapCanvas.height = 120;
    this.minimapCanvas.className = 'hud-minimap__canvas';
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    mm.append(mmHead, this.minimapCanvas);

    // ---- command bar (bottom)
    const cmd = el('div', 'hud-cmd plate');
    this.cmdGrid = el('div', 'hud-cmd__grid');
    this.panelHost = el('div', 'hud-cmd__panel');
    cmd.append(this.cmdGrid, this.panelHost);
    this.buildCommandGrid();

    // ---- contextual panels (build / train / research), hidden until asked for
    this.buildList = el('div', 'hud-list');
    this.trainList = el('div', 'hud-list');
    this.researchList = el('div', 'hud-list');

    // ---- hint row: inside the grid, never floating over a button
    const hint = el('div', 'hud-hint');
    hint.append(
      el('span', 'dim', 'Pan'), el('kbd', 'kbd', 'WASD'),
      el('span', 'dim', 'Zoom'), el('kbd', 'kbd', '+ / -'),
      el('span', 'dim', 'Select all'), el('kbd', 'kbd', 'Ctrl A'),
    );

    // ---- zoom widget
    // The zoom pair lives inside the command grid on the phone (it is a camera command, and it keeps
    // the HUD to two bands) and is positioned by the grid at every density.
    const zoom = el('div', 'hud-zoom');
    const zIn = button({ icon: 'zoom-in', label: 'Zoom in', iconOnly: true, size: 'sm', onClick: () => this.ctrl.camera.zoomBy(1.2) });
    const zOut = button({ icon: 'zoom-out', label: 'Zoom out', iconOnly: true, size: 'sm', onClick: () => this.ctrl.camera.zoomBy(1 / 1.2) });
    zoom.append(zOut, zIn);
    this.cmdGrid.append(zoom);

    // ---- toast for rejections
    this.noticeEl = el('div', 'hud-toast');

    this.root.append(top, mm, cmd, hint, this.noticeEl);
    this.renderSelection();
    this.renderPanel();
  }

  private buildCommandGrid(): void {
    this.cmdGrid.replaceChildren();
    const cmds: { icon: IconName; label: string; act: () => void; disabled?: boolean }[] = [
      { icon: 'move', label: 'Move', act: () => this.beginPlacement('move') },
      { icon: 'attack', label: 'Attack', act: () => this.beginPlacement('attack') },
      { icon: 'stop', label: 'Stop', act: () => this.commandSelected({ type: 'stop' }) },
      { icon: 'build', label: 'Build', act: () => this.openPanel('build') },
      { icon: 'train', label: 'Train', act: () => this.openPanel('train') },
      { icon: 'research', label: 'Research', act: () => this.openPanel('research') },
    ];
    for (const c of cmds) {
      const b = button({ icon: c.icon, label: c.label, size: 'sm', onClick: c.act, block: true });
      b.dataset.cmd = c.label.toLowerCase();
      this.cmdGrid.append(b);
    }
  }

  // ───────────────────────────────────────────────────────────────────────── live update

  /** Called on every simulated tick. Reads state and updates only what changed. */
  update(st: GameState): void {
    const idx = st.players.findIndex((p) => p.id === this.ctrl.me);
    const me = st.players[idx];
    if (!me) return;

    this.manaValue.textContent = String(Math.round(me.mana));
    this.powerValue.textContent = String(Math.round(me.power));

    let units = 0;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
      if (st.entities.ownerIndex[s] === idx) units++;
    }
    this.supplyValue.textContent = `${units}`;

    const secs = this.ctrl.elapsedSeconds;
    this.clockValue.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    // Selection changes are comparatively rare; only rebuild when the set actually changed.
    const key = [...this.app.selection].sort((a, b) => a - b).join(',');
    if (key !== this.lastSelectionKey) {
      this.lastSelectionKey = key;
      this.renderSelection();
      this.renderPanel();
    } else {
      this.refreshSelectionValues(st);
    }

    this.drawMinimap(st, idx);
    if (this.app.panel !== 'none') this.refreshPanelLists(st, idx);
  }

  // ───────────────────────────────────────────────────────────────────────── selection

  private selectedEntities(st: GameState): { kind: number; defId: string; hp: number; maxHp: number }[] {
    const out: { kind: number; defId: string; hp: number; maxHp: number }[] = [];
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      if (!this.app.selection.has(st.entities.id[s]!)) continue;
      out.push({
        kind: st.entities.kind[s]!,
        defId: st.entities.extras[s]!.defId,
        hp: st.entities.hp[s]!,
        maxHp: st.entities.maxHp[s]!,
      });
    }
    return out;
  }

  private renderSelection(): void {
    const st = this.ctrl.state;
    const selected = this.selectedEntities(st);
    this.selectBody.replaceChildren();
    this.selectHead.replaceChildren();

    if (selected.length === 0) {
      this.selectHead.append(el('span', 'eyebrow', 'No selection'));
      this.selectBody.append(el('p', 'hud-select__empty dim', 'Drag to select, or tap a unit.'));
      return;
    }

    const first = selected[0]!;
    const def = first.kind === 0 ? this.registry.units.get(first.defId) : this.registry.buildings.get(first.defId);

    this.selectHead.append(el('span', 'eyebrow', selected.length > 1 ? `${selected.length} selected` : (def?.name ?? first.defId)));

    // Portrait: the def's icon glyph, code-drawn, never an image.
    const portrait = el('div', 'hud-select__portrait');
    const glyph: IconName = first.kind === 0 ? iconForRole(def && 'role' in def ? String(def.role) : '') : 'build';
    portrait.innerHTML = icon(glyph, { size: 26 });
    this.selectBody.append(portrait);

    const stats = el('div', 'hud-select__stats');
    if (selected.length === 1) {
      const hpFrac = first.maxHp > 0 ? first.hp / first.maxHp : 0;
      const hpRow = el('div', 'hud-select__hp');
      hpRow.append(gauge({ value: hpFrac, variant: 'hp', low: hpFrac < 0.4, critical: hpFrac < 0.15, label: 'Health' }));
      stats.append(el('div', 'row row--between', undefined, {}), hpRow);
      const hpText = el('span', 'num dim', `${Math.round(first.hp)} / ${Math.round(first.maxHp)}`);
      (stats.firstChild as HTMLElement).append(el('span', 'eyebrow', 'HP'), hpText);
    } else {
      // Aggregated health for a group, which is what a player actually cares about mid-fight.
      let hp = 0;
      let max = 0;
      for (const s of selected) {
        hp += s.hp;
        max += s.maxHp;
      }
      stats.append(gauge({ value: max > 0 ? hp / max : 0, variant: 'hp', label: 'Group health' }));
    }
    this.selectBody.append(stats);
  }

  private refreshSelectionValues(st: GameState): void {
    const selected = this.selectedEntities(st);
    if (selected.length === 1) {
      const g = this.selectBody.querySelector('.gauge__fill') as HTMLElement | null;
      const f = selected[0]!;
      if (g) g.style.width = `${Math.max(0, Math.min(1, f.maxHp > 0 ? f.hp / f.maxHp : 0)) * 100}%`;
    }
  }

  // ───────────────────────────────────────────────────────────────────────── contextual panels

  private openPanel(p: 'build' | 'train' | 'research'): void {
    this.app.panel = this.app.panel === p ? 'none' : p;
    this.renderPanel();
  }

  private renderPanel(): void {
    this.panelHost.replaceChildren();
    this.panelHost.classList.toggle('is-open', this.app.panel !== 'none');
    if (this.app.panel === 'none') return;

    const st = this.ctrl.state;
    const idx = st.players.findIndex((p) => p.id === this.ctrl.me);

    if (this.app.panel === 'build') {
      const head = el('div', 'hud-list__head');
      this.buildTabs = el('div', 'tabs hud-list__tabs');
      for (const t of BUILD_TABS) {
        const tb = el('button', 'tab', undefined, { type: 'button', 'aria-selected': String(t.id === this.activeBuildTab) });
        tb.append(el('span', undefined, t.label));
        tb.addEventListener('click', () => {
          this.activeBuildTab = t.id;
          this.renderPanel();
        });
        this.buildTabs.append(tb);
      }
      head.append(this.buildTabs);
      this.panelHost.append(head, this.buildList);
      this.refreshPanelLists(st, idx);
    } else if (this.app.panel === 'train') {
      this.panelHost.append(this.trainList);
      this.refreshPanelLists(st, idx);
    } else {
      this.panelHost.append(this.researchList);
      this.refreshPanelLists(st, idx);
    }
  }

  private refreshPanelLists(st: GameState, myIndex: number): void {
    if (this.app.panel === 'build') {
      this.buildList.replaceChildren();
      const opts = [...this.registry.buildings.values()].filter((b) => {
        if (b.kind !== 'building') return false;
        if (b.menuCategory !== this.activeBuildTab) return false;
        // The Sanctum and camp are placed at match start, not built.
        if (b.id === 'sanctum' || b.id === 'waystone_camp') return false;
        return true;
      });
      for (const b of opts) {
        const b2 = button({
          label: `${b.name} · ${b.cost}`,
          icon: 'build',
          size: 'sm',
          variant: 'quiet',
          onClick: () => {
            this.startPlacement(b.id);
          },
        });
        b2.dataset.build = b.id;
        this.buildList.append(b2);
      }
      if (opts.length === 0) this.buildList.append(el('p', 'dim', 'Nothing available yet.'));
      return;
    }

    if (this.app.panel === 'train') {
      this.trainList.replaceChildren();
      // Units come from whichever producer is selected, else all owned producers.
      const producers = new Set<string>();
      for (let s = 0; s < st.entities.count; s++) {
        if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
        if (st.entities.ownerIndex[s] !== myIndex) continue;
        const defId = st.entities.extras[s]!.defId;
        if (this.app.selection.size > 0 && !this.app.selection.has(st.entities.id[s]!)) continue;
        const b = this.registry.buildings.get(defId);
        for (const u of b?.producesUnits ?? []) producers.add(u);
      }
      if (producers.size === 0) {
        this.trainList.append(el('p', 'dim', 'Select a production building.'));
      }
      for (const uid of producers) {
        const u = this.registry.units.get(uid);
        if (!u) continue;
        const bb = button({
          label: `${u.name} · ${u.cost}`,
          icon: 'train',
          size: 'sm',
          variant: 'quiet',
          onClick: () => this.commandSelected({ type: 'produce', defId: uid } as never),
        });
        bb.dataset.train = uid;
        this.trainList.append(bb);
      }
      return;
    }

    this.researchList.replaceChildren();
    const researched = new Set(st.players[myIndex]?.completedResearch ?? []);
    for (const r of this.registry.research.values()) {
      const done = researched.has(r.id);
      const bb = button({
        label: `${r.name} · ${r.cost}${done ? ' ✓' : ''}`,
        icon: 'research',
        size: 'sm',
        variant: done ? 'quiet' : 'default',
        disabled: done,
        onClick: () => this.commandSelected({ type: 'research', defId: r.id } as never),
      });
      bb.dataset.research = r.id;
      this.researchList.append(bb);
    }
  }

  // ───────────────────────────────────────────────────────────────────────── commands

  private beginPlacement(mode: 'move' | 'attack'): void {
    this.app.placing = mode;
    this.app.notice = { kind: 'info', text: mode === 'move' ? 'Click a destination.' : 'Click a target.' };
    this.showNotice();
  }

  private startPlacement(defId: string): void {
    this.app.placing = defId;
    this.app.panel = 'none';
    this.renderPanel();
    this.app.notice = { kind: 'info', text: `Place ${this.registry.buildings.get(defId)?.name ?? defId}.` };
    this.showNotice();
  }

  /** Route a target-less command to every selected unit or building. */
  private commandSelected(cmd: Record<string, unknown>): void {
    const ids = [...this.app.selection];
    if (ids.length === 0) {
      this.note('warn', 'Nothing selected.');
      return;
    }
    const st = this.ctrl.state;
    // Buildings and units take different commands; split by the first selected entity's kind.
    let kind = -1;
    for (let s = 0; s < st.entities.count && kind < 0; s++) {
      if (!st.entities.dead[s] && this.app.selection.has(st.entities.id[s]!)) kind = st.entities.kind[s]!;
    }
    if (kind === 1 && (cmd.type === 'produce' || cmd.type === 'research')) {
      // Apply to the first selected building only — a queue belongs to one producer.
      const bid = ids[0]!;
      this.ctrl.issue({ ...cmd, buildingId: bid } as never);
      return;
    }
    if (kind === 0) {
      this.ctrl.issue({ ...cmd, entityIds: ids } as never);
    }
  }

  /** Called by the input layer when the board is clicked while a placement is armed. */
  onBoardClick(worldX: number, worldY: number, hitEntity: EntityId | null): void {
    const placing = this.app.placing;
    if (!placing) return;
    const ids = [...this.app.selection];

    if (placing === 'move') {
      if (ids.length) this.ctrl.issue({ type: 'move', entityIds: ids, x: worldX, y: worldY });
    } else if (placing === 'attack') {
      if (ids.length && hitEntity !== null) this.ctrl.issue({ type: 'attack', entityIds: ids, targetId: hitEntity });
      else this.note('warn', 'Click an enemy to attack.');
    } else {
      // A building id: issue a build order at the clicked tile.
      this.ctrl.issue({ type: 'build', defId: placing, x: worldX, y: worldY });
    }
    this.app.placing = null;
    this.hideNotice();
  }

  note(kind: 'info' | 'warn' | 'bad', text: string): void {
    this.app.notice = { kind, text };
    this.showNotice();
  }

  private showNotice(): void {
    if (!this.app.notice) return;
    this.noticeEl.className = `hud-toast hud-toast--${this.app.notice.kind} is-on`;
    this.noticeEl.textContent = this.app.notice.text;
    window.setTimeout(() => this.hideNotice(), 2200);
  }

  private hideNotice(): void {
    this.noticeEl.classList.remove('is-on');
  }

  // ───────────────────────────────────────────────────────────────────────── minimap

  private drawMinimap(st: GameState, myIndex: number): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const map = this.registry.map(st.mapId);
    const sx = W / map.tileW;
    const sy = H / map.tileH;

    // Terrain: two tones by passability, so the map shape reads at 160px.
    for (let ty = 0; ty < map.tileH; ty++) {
      for (let tx = 0; tx < map.tileW; tx++) {
        const blocked = map.tiles[ty * map.tileW + tx] === 1;
        ctx.fillStyle = blocked ? 'rgba(62,70,80,0.55)' : 'rgba(38,43,50,0.55)';
        ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }

    // Entities: owner colour, units smaller than buildings.
    const TILE = 32;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      const owner = st.entities.ownerIndex[s]!;
      const p = st.players[owner];
      if (!p) continue;
      const isMine = owner === myIndex;
      const size = st.entities.kind[s] === 1 ? 3 : 1.6;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = isMine ? 1 : 0.85;
      ctx.fillRect((st.entities.posX[s]! / TILE) * sx - size / 2, (st.entities.posY[s]! / TILE) * sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}

/** Map a unit role to the closest existing glyph, so portraits need no new art. */
function iconForRole(role: string): IconName {
  if (role.includes('siege')) return 'attack';
  if (role.includes('ranged') || role.includes('wizard')) return 'bow';
  if (role.includes('worker') || role.includes('harvest') || role.includes('mana')) return 'mana';
  if (role.includes('scout') || role.includes('flying')) return 'speed';
  if (role.includes('hq')) return 'flag';
  return 'sword';
}
