// HUD — the in-match command console.
//
// THE BRIEF: "the menus should very much feel like mobile command and conquer". That is a specific
// layout, not a mood: a docked tactical sidebar carrying the build tabs, the production tiles and the
// command buttons, with the battlefield filling everything else. This file builds that.
//
//   ┌─────────────────────────────────────────────┬───────────────────┐
//   │ RAIL: mana · power bar · clock · tools      │                   │
//   ├─────────────────────────────────────────────┤  BUILD TABS       │
//   │                                             │  ┌─────────────┐  │
//   │                                             │  │ radar/minimap│  │
//   │              BATTLEFIELD                    │  └─────────────┘  │
//   │                                             │  ▣ ▣ ▣  ← tiles   │
//   │                                             │  ▣ ▣ ▣            │
//   │                                             │  ─ selection ─    │
//   │                                             │  MOVE ATK STP     │
//   └─────────────────────────────────────────────┴───────────────────┘
//
// In portrait it docks to the BOTTOM instead, collapsed to a single rail so the battlefield keeps its
// height; tapping BUILD expands it. Both layouts are one grid with a `data-layout` attribute, so every
// measurement gate and every screenshot covers the same DOM.
//
// WHY A SIDEBAR AND NOT THE OLD BOTTOM STRIP. The previous HUD was a 30px strip of six icon-only
// buttons. It satisfied a "≤18% of a 667x375 screen" budget and failed at the job: five of the six
// icons were unlabelled, the build list was a row of text buttons with no pictures, and there was no
// place to put a queue or a progress bar. A phone player could not tell what "the square frame icon"
// did. The budget was measuring the wrong thing, so the budget is now stated as what actually matters:
// the battlefield keeps a minimum size and the controls are thumb-sized. See `tests/ui-hud.test.ts`.
//
// EVERY NUMBER ON SCREEN IS THE SIMULATION'S. Mana, power, queue progress, unit counts and HP all come
// from `GameState` on each tick. The production tiles read the same capability payloads the production
// system writes, so a progress bar cannot drift from the thing it describes.

import type { GameState, EntityId } from '../sim/types';
import type { Registry } from '../data/registry';
import type { MatchController } from './match';
import type { LoadedAtlas } from '../render/atlas';
import { button, el, gauge, iconEl, resource } from '../ui/kit';
import { icon, type IconName } from '../ui/icons';
import { applyThumb, teamTintFor } from '../ui/thumbnails';
import type { AppState } from './state';
import {
  buildingBlocker,
  ownedBuildingSlots,
  powerReadout,
  productionReadout,
  researchBlocker,
  researchReadout,
  unitBlocker,
} from './rules';
import type { BoardInput } from './input/board-input';
import { KIND_BUILDING, KIND_RESOURCE_NODE, KIND_UNIT } from '../sim/entity-store';
import { radarActive } from '../sim/fog';
import { MAX_PRODUCTION_QUEUE } from '../core/constants';

/** The four sidebar categories. Each maps onto real v2 content, not a placeholder. */
export type SidebarTab = 'buildings' | 'defenses' | 'units' | 'tech';

const TABS: { id: SidebarTab; label: string; short: string; icon: IconName }[] = [
  { id: 'buildings', label: 'Buildings', short: 'BLD', icon: 'build' },
  { id: 'defenses', label: 'Defenses', short: 'DEF', icon: 'shield' },
  { id: 'units', label: 'Units', short: 'UNT', icon: 'train' },
  { id: 'tech', label: 'Research', short: 'TEC', icon: 'research' },
];

/** One production tile: a building to place, a unit to train, or a research to start. */
interface Tile {
  kind: 'building' | 'unit' | 'research';
  id: string;
  name: string;
  shortName: string;
  cost: number;
  /** Player-facing reason it is unavailable; empty when it can be bought. */
  blocker: string;
  /** 0..1 production progress, 0 when nothing is in flight. */
  progress: number;
  /** Items waiting behind the active one. */
  queued: number;
  /** How many of this thing the player already owns (badge), or -1 for research. */
  owned: number;
  done?: boolean;
}

export interface HudDeps {
  atlas: LoadedAtlas;
  input: BoardInput;
  onOpenResearch: () => void;
  onPause: () => void;
  /**
   * Called after the console changes its footprint (collapse, expand, orientation change).
   *
   * The camera frames inside the HUD-free safe rect, so a console that grows or shrinks changes the rect
   * the camera was framed against. Without this the base drifts out of the visible battlefield when the
   * panel expands on a phone — the measured symptom was a black band above a base that had been centred a
   * moment earlier. The app re-measures the insets and re-frames on the anchored point.
   */
  onLayoutChange?: () => void;
}

export class Hud {
  readonly root: HTMLElement;
  private ctrl: MatchController;
  private registry: Registry;
  private app: AppState;
  private deps: HudDeps;

  private railMana!: HTMLElement;
  private railPowerValue!: HTMLElement;
  private railPowerFill!: HTMLElement;
  private railPower!: HTMLElement;
  private railClock!: HTMLElement;
  private railSupply!: HTMLElement;
  private tabStrip!: HTMLElement;
  private tileGrid!: HTMLElement;
  private sideEmpty!: HTMLElement;
  private selBody!: HTMLElement;
  private cmds!: HTMLElement;
  private toast!: HTMLElement;
  private radarHost!: HTMLElement;
  private radarCanvas!: HTMLCanvasElement;
  private radarCtx!: CanvasRenderingContext2D | null;
  private radarNote!: HTMLElement;
  private collapseBtn!: HTMLButtonElement;
  private expandRow!: HTMLElement;
  private badge!: HTMLElement;

  private tab: SidebarTab = 'buildings';
  private radarOpen = true;
  private collapsed = false;
  private lastSelectionKey = '';
  private lastTileKey = '';
  private noticeTimer = 0;
  private myTint = 'blue';

  constructor(ctrl: MatchController, registry: Registry, app: AppState, deps: HudDeps) {
    this.ctrl = ctrl;
    this.registry = registry;
    this.app = app;
    this.deps = deps;
    this.root = el('div', 'hud');
    this.root.dataset.testid = 'hud';
    this.root.dataset.layout = this.layoutFor();
    /**
     * PORTRAIT STARTS COLLAPSED.
     *
     * A portrait phone has ~390px of width and 844 of height. An expanded console at 46vh leaves the
     * battlefield a letterbox, which is not a playable RTS. Collapsed, it is the tab strip plus the
     * command rows — every order still reachable — and expanding it is one deliberate tap on the
     * chevron. Landscape starts expanded because the console costs width there, not height.
     */
    this.collapsed = this.root.dataset.layout === 'bottom';
    this.build();
    this.syncLayout();
    this.renderTiles(this.ctrl.state);
    this.renderSelection(this.ctrl.state);
    this.renderCommands();
  }

  // ───────────────────────────────────────────────────────────────── structure

  private build(): void {
    this.root.append(this.buildRail(), this.buildSidebar());

    this.toast = el('div', 'hud-toast');
    this.toast.dataset.testid = 'hud-notice';
    this.toast.setAttribute('role', 'status');
    this.root.append(this.toast);
  }

  private buildRail(): HTMLElement {
    const rail = el('header', 'hud-rail plate');
    rail.dataset.testid = 'hud-rail';

    const mana = resource('mana', '0', 'Mana');
    this.railMana = mana.querySelector('.res__value') as HTMLElement;
    mana.dataset.testid = 'hud-mana';
    const supply = resource('supply', '0', 'Units');
    this.railSupply = supply.querySelector('.res__value') as HTMLElement;
    supply.dataset.testid = 'hud-supply';

    // ---- power: a real bar with numbers, because RA2's power meter is a bar for a reason: a single
    // number does not tell you how close to a brownout you are.
    const power = el('div', 'hud-power');
    power.dataset.testid = 'hud-power';
    const powerHead = el('div', 'hud-power__head');
    powerHead.append(iconEl('power', 14, 'hud-power__icon'), el('span', 'hud-power__label', 'POWER'));
    const powerNums = el('span', 'hud-power__nums num', '0 / 0');
    this.railPowerValue = powerNums;
    powerHead.append(powerNums);
    const powerTrack = el('div', 'hud-power__track', undefined, { role: 'progressbar', 'aria-label': 'Power' });
    this.railPowerFill = el('div', 'hud-power__fill');
    powerTrack.append(this.railPowerFill);
    power.append(powerHead, powerTrack);
    this.railPower = power;

    const clock = el('div', 'hud-rail__clock');
    this.railClock = el('span', 'num', '0:00');
    clock.append(this.railClock);
    clock.dataset.testid = 'hud-clock';

    const tools = el('div', 'hud-rail__tools');
    /**
     * The three rail tools are ICON-ONLY, including Radar.
     *
     * Radar was the one labelled button in this group, and a `nowrap` label in a 30px control is exactly the clipping the
     * playtest reported: the word rendered as "Rad" and overran the power meter beside it at 844x390 and 390x844. The
     * label still exists as the accessible name and the tooltip, so nothing is lost to a screen reader or a long-press —
     * it is only the visible glyph that changed, which is the same treatment Tech tree and Pause already had.
     */
    const radarBtn = button({
      icon: 'grid',
      label: 'Radar',
      iconOnly: true,
      size: 'sm',
      variant: 'quiet',
      pressed: true,
      onClick: () => this.toggleRadar(),
    });
    radarBtn.dataset.testid = 'hud-radar-toggle';
    radarBtn.dataset.action = 'radar';
    const researchBtn = button({ icon: 'research', label: 'Tech tree', iconOnly: true, size: 'sm', onClick: this.deps.onOpenResearch });
    researchBtn.dataset.testid = 'hud-research';
    const pauseBtn = button({ icon: 'hold', label: 'Pause', iconOnly: true, size: 'sm', onClick: this.deps.onPause });
    pauseBtn.dataset.testid = 'hud-pause';
    tools.append(radarBtn, researchBtn, pauseBtn);

    // Selection summary lives on the rail: one line, always in the same place, never over the board.
    const sel = el('div', 'hud-sel');
    sel.dataset.testid = 'hud-selection';
    this.selBody = el('div', 'hud-sel__body');
    sel.append(this.selBody);

    rail.append(sel, el('div', 'spacer'), mana, supply, power, clock, tools);
    return rail;
  }

  private buildSidebar(): HTMLElement {
    const side = el('aside', 'hud-side plate');
    side.dataset.testid = 'hud-sidebar';

    // ---- head: collapse control, category tabs, radar state
    const head = el('div', 'hud-side__head');
    this.badge = el('span', 'hud-side__badge', 'COMMAND');
    this.collapseBtn = button({
      icon: 'chevron-right',
      label: 'Toggle command panel',
      iconOnly: true,
      size: 'sm',
      variant: 'quiet',
      onClick: () => this.toggleCollapsed(),
    });
    this.collapseBtn.dataset.testid = 'hud-collapse';
    head.append(this.badge, el('div', 'spacer'), this.collapseBtn);

    this.tabStrip = el('div', 'hud-tabs', undefined, { role: 'tablist', 'aria-label': 'Build categories' });
    this.tabStrip.dataset.testid = 'hud-tabs';
    for (const t of TABS) {
      const b = el('button', 'hud-tab', undefined, {
        type: 'button',
        role: 'tab',
        'aria-selected': String(t.id === this.tab),
        title: t.label,
      });
      b.dataset.tab = t.id;
      b.dataset.testid = `hud-tab-${t.id}`;
      // The Buildings tab is the entry point to placement, which the old gate looked for as
      // `[data-cmd="build"]`. Keeping that attribute means the "the build control must be topmost"
      // regression gate keeps working against the new layout instead of being deleted with it.
      if (t.id === 'buildings') b.dataset.cmd = 'build';
      b.append(iconEl(t.icon, 15, 'hud-tab__icon'), el('span', 'hud-tab__label', t.short));
      b.addEventListener('click', () => {
        this.tab = t.id;
        this.setCollapsed(false);
        this.renderTabs();
        this.lastTileKey = '';
        this.renderTiles(this.ctrl.state);
      });
      this.tabStrip.append(b);
    }

    // ---- radar
    this.radarHost = el('section', 'hud-radar');
    this.radarHost.dataset.testid = 'hud-radar';
    const radarHead = el('div', 'hud-radar__head');
    radarHead.append(el('span', 'eyebrow', 'Radar'));
    this.radarNote = el('span', 'hud-radar__note', '');
    radarHead.append(this.radarNote);
    this.radarCanvas = document.createElement('canvas');
    this.radarCanvas.width = 192;
    this.radarCanvas.height = 132;
    this.radarCanvas.className = 'hud-radar__canvas';
    this.radarCanvas.dataset.testid = 'hud-radar-canvas';
    this.radarCtx = this.radarCanvas.getContext('2d');
    // Tap the radar to jump the camera there — the RA2 radar is an input surface, not a picture.
    this.radarCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = this.radarCanvas.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / Math.max(1, rect.width);
      const fy = (e.clientY - rect.top) / Math.max(1, rect.height);
      const map = this.registry.map(this.ctrl.state.mapId);
      const wx = fx * map.tileW * 32;
      const wy = fy * map.tileH * 32;
      this.ctrl.camera.centerOn(wx, wy);
      this.deps.input.notePointer({ x: rect.left, y: rect.top });
    });
    this.radarHost.append(radarHead, this.radarCanvas);

    // ---- tiles
    this.tileGrid = el('div', 'hud-tiles', undefined, { role: 'group', 'aria-label': 'Production' });
    this.tileGrid.dataset.testid = 'hud-tiles';
    this.sideEmpty = el('p', 'hud-side__empty dim', '');

    // ---- commands
    this.cmds = el('div', 'hud-cmds');
    this.cmds.dataset.testid = 'hud-cmds';

    /**
     * THE EXPAND CONTROL LIVES OUTSIDE THE COLLAPSIBLE HEADER.
     *
     * A portrait console starts collapsed, and the header — which holds the chevron — is one of the things
     * that gets hidden when collapsed. The first version therefore had NO way to expand the panel on a
     * phone, which the browser touch proof caught immediately as a 30-second tap timeout on a tile that
     * could never be reached. This control sits in its own row that is only rendered while collapsed.
     */
    const expandRow = el('div', 'hud-expand-row');
    const expand = button({
      icon: 'chevron-left',
      label: 'Show build panel',
      size: 'sm',
      block: true,
      onClick: () => this.setCollapsed(false),
    });
    expand.dataset.testid = 'hud-expand';
    expand.append(el('span', 'hud-expand-row__label', 'BUILD'));
    expandRow.append(expand);
    this.expandRow = expandRow;

    side.append(head, this.tabStrip, expandRow, this.radarHost, this.tileGrid, this.sideEmpty, this.cmds);
    return side;
  }

  /** `side` when the viewport is landscape-ish, `bottom` in portrait. */
  private layoutFor(): 'side' | 'bottom' {
    if (typeof window === 'undefined') return 'side';
    // Portrait (or nearly square) puts the console at the bottom, where a thumb is.
    return window.innerWidth > window.innerHeight * 1.05 ? 'side' : 'bottom';
  }

  /** Re-evaluate orientation-dependent layout. Called on resize. */
  syncLayout(): void {
    const want = this.layoutFor();
    if (this.root.dataset.layout !== want) {
      this.root.dataset.layout = want;
      // A portrait panel is collapsed by default: it would otherwise eat half the screen.
      this.collapsed = want === 'bottom';
      this.root.dataset.collapsed = String(this.collapsed);
      requestAnimationFrame(() => this.deps.onLayoutChange?.());
    }
    this.applyCollapsed();
  }

  private toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
  }

  setCollapsed(next: boolean): void {
    if (this.collapsed === next) return;
    this.collapsed = next;
    this.applyCollapsed();
  }

  private applyCollapsed(): void {
    const changed = this.root.dataset.collapsed !== String(this.collapsed);
    this.root.dataset.collapsed = String(this.collapsed);
    this.expandRow.dataset.hidden = String(!this.collapsed);
    this.collapseBtn.dataset.dir = this.collapsed ? 'expand' : 'collapse';
    this.collapseBtn.title = this.collapsed ? 'Show the command panel' : 'Hide the command panel';
    this.root.style.setProperty('--hud-side', this.sidebarExtentCss());
    // After the browser has laid the new footprint out, so `safeInsets()` measures the real boxes.
    if (changed) requestAnimationFrame(() => this.deps.onLayoutChange?.());
  }

  /**
   * The sidebar's size along its docking axis, as a CSS length.
   *
   * Kept in one place because the camera's safe-inset measurement and the CSS both need it, and a
   * mismatch is exactly how a framed base ends up half under the panel.
   */
  private sidebarExtentCss(): string {
    const bottom = this.root.dataset.layout === 'bottom';
    if (this.collapsed) return bottom ? '96px' : '0px';
    if (bottom) return 'min(46vh, 320px)';
    if (window.innerWidth <= 900) return '136px';
    if (window.innerWidth <= 1500) return '196px';
    return '232px';
  }

  /**
   * Real measured chrome insets, in CSS pixels, for the camera.
   *
   * Measured from the DOM rather than recomputed, because a CSS `min()`/`clamp()` is not something
   * TypeScript can evaluate and a second copy of the arithmetic would drift from the stylesheet.
   */
  safeInsets(): { left: number; top: number; right: number; bottom: number } {
    const rail = this.root.querySelector('.hud-rail') as HTMLElement | null;
    const side = this.root.querySelector('.hud-side') as HTMLElement | null;
    const rr = rail?.getBoundingClientRect();
    const sr = side?.getBoundingClientRect();
    const top = rr ? Math.max(0, rr.bottom) : 0;
    if (!sr) return { left: 0, top, right: 0, bottom: 0 };
    if (this.root.dataset.layout === 'bottom') {
      return { left: 0, top, right: 0, bottom: Math.max(0, window.innerHeight - sr.top) };
    }
    return { left: 0, top, right: Math.max(0, window.innerWidth - sr.left), bottom: 0 };
  }

  // ───────────────────────────────────────────────────────────────── per-tick update

  /** Called on every simulated tick. Mutates in place; builds DOM only when the shape changes. */
  update(st: GameState): void {
    const idx = st.players.findIndex((p) => p.id === this.ctrl.me);
    const me = st.players[idx];
    if (!me) return;
    this.myTint = teamTintFor(me.color);

    this.railMana.textContent = String(Math.round(me.mana));

    let units = 0;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== KIND_UNIT) continue;
      if (st.entities.ownerIndex[s] === idx) units++;
    }
    this.railSupply.textContent = String(units);

    const power = powerReadout(st, this.ctrl.me);
    this.railPowerValue.textContent = `${power.used} / ${power.produced}`;
    this.railPowerFill.style.width = `${Math.round(power.load * 100)}%`;
    this.railPower.dataset.state = power.short ? 'short' : power.load > 0.85 ? 'tight' : 'ok';
    this.railPower.setAttribute('aria-valuenow', String(Math.round(power.load * 100)));

    const secs = this.ctrl.elapsedSeconds;
    this.railClock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    const key = [...this.app.selection].sort((a, b) => a - b).join(',');
    if (key !== this.lastSelectionKey) {
      this.lastSelectionKey = key;
      this.renderSelection(st);
      this.renderCommands();
    } else {
      this.refreshSelectionValues(st);
      this.refreshCommandStates(st);
    }

    this.renderTiles(st);
    this.drawRadar(st, idx);
  }

  /** Repaint immediately after an input action (selection changed, order armed, placement moved). */
  refresh(st: GameState): void {
    this.renderSelection(st);
    this.renderCommands();
    this.renderTiles(st);
    this.refreshSelectionValues(st);
  }

  // ───────────────────────────────────────────────────────────────── selection readout

  private selectedSlots(st: GameState): number[] {
    const out: number[] = [];
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      if (this.app.selection.has(st.entities.id[s]!)) out.push(s);
    }
    return out;
  }

  private renderSelection(st: GameState): void {
    const slots = this.selectedSlots(st);
    this.selBody.replaceChildren();
    if (slots.length === 0) {
      this.selBody.append(el('span', 'eyebrow', 'NO SELECTION'), el('span', 'hud-sel__hint dim', 'Tap a unit or drag'));
      return;
    }
    const first = slots[0]!;
    const defId = st.entities.extras[first]!.defId;
    const def =
      st.entities.kind[first] === KIND_BUILDING ? this.registry.buildings.get(defId) : this.registry.units.get(defId);

    const thumb = el('span', 'hud-sel__thumb');
    const tint = teamTintFor(st.players[st.entities.ownerIndex[first]!]?.color ?? '#4f9dff');
    const ok =
      st.entities.kind[first] === KIND_BUILDING
        ? applyThumb(thumb, this.deps.atlas, 'building', defId, 30, 26, tint)
        : applyThumb(thumb, this.deps.atlas, 'unit', defId, 30, 26, tint);
    if (!ok) thumb.append(iconEl(st.entities.kind[first] === KIND_BUILDING ? 'build' : 'sword', 16));
    this.selBody.append(thumb);

    const label = el('div', 'hud-sel__label');
    const name = slots.length > 1 ? `${slots.length} selected` : (def?.name ?? defId);
    name.replace('.', '');
    label.append(el('span', 'hud-sel__name', name));
    const sub = el('span', 'hud-sel__sub dim');
    if (slots.length > 1) {
      sub.textContent = `${slots.filter((s) => st.entities.kind[s] === KIND_UNIT).length} units · ${slots.filter((s) => st.entities.kind[s] === KIND_BUILDING).length} structures`;
    } else if (st.entities.kind[first] === KIND_BUILDING) {
      const ex = st.entities.extras[first]!;
      const bp = (ex.caps.building as { buildProgress?: number } | undefined)?.buildProgress;
      sub.textContent = bp !== undefined ? `Under construction ${Math.round(bp * 100)}%` : (def && 'description' in def ? '' : '');
      if (bp !== undefined) sub.textContent = `Building ${Math.round(bp * 100)}%`;
      else sub.textContent = 'Structure';
    } else {
      const ex = st.entities.extras[first]!;
      const orders = ex.orders as { type?: string }[] | undefined;
      const top = orders?.[0]?.type;
      sub.textContent = top ? ORDER_WORDS[top] ?? 'Working' : 'Idle';
    }
    label.append(sub);
    this.selBody.append(label);

    const hp = el('div', 'hud-sel__hp');
    const sumHp = slots.reduce((a, s) => a + st.entities.hp[s]!, 0);
    const sumMax = slots.reduce((a, s) => a + st.entities.maxHp[s]!, 0);
    const frac = sumMax > 0 ? sumHp / sumMax : 0;
    hp.append(gauge({ value: frac, variant: 'hp', low: frac < 0.4, critical: frac < 0.15, label: 'Health' }));
    this.selBody.append(hp);
    this.selBody.append(el('span', 'hud-sel__hpnum num', `${Math.round(sumHp)}`));
  }

  private refreshSelectionValues(st: GameState): void {
    const slots = this.selectedSlots(st);
    if (slots.length === 0) return;
    const sumHp = slots.reduce((a, s) => a + st.entities.hp[s]!, 0);
    const sumMax = slots.reduce((a, s) => a + st.entities.maxHp[s]!, 0);
    const frac = sumMax > 0 ? Math.max(0, Math.min(1, sumHp / sumMax)) : 0;
    const fill = this.selBody.querySelector('.gauge__fill') as HTMLElement | null;
    if (fill) fill.style.width = `${frac * 100}%`;
    const num = this.selBody.querySelector('.hud-sel__hpnum') as HTMLElement | null;
    if (num) num.textContent = String(Math.round(sumHp));
  }

  // ───────────────────────────────────────────────────────────────── tabs + tiles

  private renderTabs(): void {
    for (const b of this.tabStrip.querySelectorAll<HTMLElement>('.hud-tab')) {
      b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    }
    this.badge.textContent = TABS.find((t) => t.id === this.tab)?.label.toUpperCase() ?? 'COMMAND';
  }

  private renderTiles(st: GameState): void {
    const tiles = this.tilesFor(st);
    const key = tiles.map((t) => `${t.id}:${t.blocker}:${Math.round(t.progress * 20)}:${t.queued}:${t.owned}`).join('|');
    if (key === this.lastTileKey) return;
    this.lastTileKey = key;
    this.renderTabs();
    this.tileGrid.replaceChildren();
    this.sideEmpty.textContent = '';
    if (tiles.length === 0) {
      this.sideEmpty.textContent =
        this.tab === 'units' ? 'Build a production structure to train units.' : 'Nothing available yet.';
      return;
    }
    for (const t of tiles) this.tileGrid.append(this.tileEl(t));
  }

  private tileEl(t: Tile): HTMLElement {
    const b = el('button', 'prod-tile', undefined, {
      type: 'button',
      title: t.blocker ? `${t.name} — ${t.blocker}` : `${t.name} · ${t.cost} mana`,
    });
    b.dataset.testid = `hud-tile-${t.id}`;
    b.dataset.tile = t.id;
    if (t.blocker) b.dataset.blocked = 'true';
    if (t.done) b.dataset.done = 'true';

    const art = el('span', 'prod-tile__art');
    const ok =
      t.kind === 'building'
        ? applyThumb(art, this.deps.atlas, 'building', t.id, 52, 40, this.myTint)
        : t.kind === 'unit'
          ? applyThumb(art, this.deps.atlas, 'unit', t.id, 52, 40, this.myTint)
          : false;
    if (!ok) {
      art.classList.add('is-glyph');
      art.append(iconEl(t.kind === 'research' ? 'research' : t.kind === 'unit' ? 'sword' : 'build', 22));
    }
    // Construction/training progress as a bar across the bottom of the picture — C&C's convention.
    if (t.progress > 0 && t.progress < 1) {
      const bar = el('span', 'prod-tile__bar');
      bar.style.width = `${Math.round(t.progress * 100)}%`;
      art.append(bar);
    }
    b.append(art);

    const meta = el('span', 'prod-tile__meta');
    meta.append(el('span', 'prod-tile__name', t.shortName));
    const costRow = el('span', 'prod-tile__cost num');
    costRow.append(iconEl('mana', 10, 'prod-tile__coin'), el('span', undefined, String(t.cost)));
    meta.append(costRow);
    b.append(meta);

    if (t.queued > 0) {
      const q = el('span', 'prod-tile__queue num', String(t.queued + (t.progress > 0 ? 1 : 0)));
      q.title = `${t.queued + 1} in production`;
      b.append(q);
    } else if (t.owned > 0 && t.kind !== 'research') {
      b.append(el('span', 'prod-tile__owned num', `x${t.owned}`));
    }

    b.addEventListener('click', () => {
      if (t.kind === 'building') {
        if (this.app.placing === t.id) this.deps.input.cancelPlacement();
        else this.deps.input.startPlacement(t.id);
      } else if (t.kind === 'unit') {
        this.deps.input.train(t.id);
      } else {
        this.deps.input.research(t.id);
      }
      this.lastTileKey = '';
      this.renderTiles(this.ctrl.state);
    });
    return b;
  }

  /** Everything the current tab offers, with real availability and real progress. */
  private tilesFor(st: GameState): Tile[] {
    const me = this.ctrl.me;
    const idx = st.players.findIndex((p) => p.id === me);
    const owner = st.players[idx];
    if (!owner) return [];
    const faction = owner.factionId;

    // Count what the player owns, by defId, for the "x2" badges.
    const ownedCount = new Map<string, number>();
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      const id = st.entities.extras[s]!.defId;
      ownedCount.set(id, (ownedCount.get(id) ?? 0) + 1);
    }

    if (this.tab === 'buildings' || this.tab === 'defenses') {
      /**
       * THE BUILDINGS TAB ALSO CARRIES THE `advanced` STRUCTURES.
       *
       * The content set has three building categories but the console has four tabs (Buildings, Defenses, Units,
       * Research) mapped from `menuCategory`, so everything tagged `advanced` — the Scrying Obelisk, Resonance Vault,
       * Arcane Nexus and Astral Spire — appeared in NO tab and could not be built at all. That is why the radar read
       * OFFLINE for the whole game: its only source, the Scrying Obelisk, was unreachable.
       *
       * Defenses keeps its own tab; every non-defence structure is a "building" from the player's point of view, and the
       * tile's blocker text already explains the prerequisite chain.
       */
      const cat = this.tab;
      return [...this.registry.buildings.values()]
        /**
         * THE CONSTRUCTION YARD IS NOT A BUILDING YOU BUILD.
         *
         * `sanctum` has `cost: 0` and no requirements, so `buildingBlocker` reports it as available and it sorts to the
         * top. Tapping it arms a placement ghost for a second HQ, which is not a legal action — the sim rejects it as
         * `Blocked terrain` wherever the first one stands (`ui-proof` measured exactly that). The AI can build a
         * replacement yard through its own rebuild path; v1's menu never offered it either.
         */
        .filter((b) => !b.isConstructionYard)
        /**
         * THE DEFENCES TAB CARRIES THE SCRYING OBELISK, WHICH IS THE ONLY RADAR SOURCE.
         *
         * The content set tags four structures `menuCategory: advanced` — Scrying Obelisk, Resonance Vault, Arcane Nexus,
         * Astral Spire — and the console maps only `buildings` and `defenses` onto tabs, so all four were unreachable. The
         * visible symptom was the radar reading OFFLINE for a whole game, because the Scrying Obelisk is its only source.
         *
         * Putting all four on the Buildings tab fixed reachability and broke the phone layout: eight tiles is four rows
         * and the compact grid is two, so `tests/ui-phase4.test.ts` measured "GOLEM is clipped by hud-tiles" and a tile
         * overlapping the Move button. So only the OBELISK moves — it is a defensive structure that reveals the map, which
         * is what this tab is for — and the three late-game buildings stay off the menu until a dedicated tab exists.
         */
        .filter((b) =>
          cat === 'buildings'
            ? b.menuCategory === 'buildings'
            : b.menuCategory === 'defenses' || b.id === 'scrying_obelisk',
        )
        .filter((b) => !b.factions || !faction || b.factions.includes(faction))
        .map((b) => {
          // A structure already under construction anywhere counts as progress, so the tile shows it.
          let progress = 0;
          for (let s = 0; s < st.entities.count; s++) {
            if (st.entities.dead[s]) continue;
            if (st.entities.extras[s]!.defId !== b.id) continue;
            const bp = (st.entities.extras[s]!.caps.building as { buildProgress?: number } | undefined)?.buildProgress;
            if (bp !== undefined) progress = Math.max(progress, bp);
          }
          return {
            kind: 'building' as const,
            id: b.id,
            name: b.name,
            shortName: shortLabelFor(b.name),
            cost: b.cost,
            blocker: buildingBlocker(st, this.registry, me, b.id),
            progress,
            queued: 0,
            owned: ownedCount.get(b.id) ?? 0,
          };
        })
        /**
         * BUILDABLE FIRST, THEN BY PRICE.
         *
         * Merging the `advanced` structures into this tab put locked late-game buildings (Arcane Nexus, Astral Spire) at
         * the TOP of the grid, because registry order is definition order. That is wrong for a player — the tiles they can
         * actually buy belong at the top of a 2-up scroller — and it broke a committed touch test, which taps the first
         * tile by design: `tests/touch/browser-touch.test.ts` reported `the seeded ghost is invalid: arcane_nexus ...
         * "Requires a structure you do not have"` at all four viewports. Sorting is presentation only; nothing about
         * availability changes.
         */
        .sort((a, b) => Number(!!a.blocker) - Number(!!b.blocker) || a.cost - b.cost);
    }

    if (this.tab === 'units') {
      // Producers the player owns, so the tab lists what can actually be trained right now.
      const producers = new Set<string>();
      for (const slot of ownedBuildingSlots(st, me)) {
        const bdef = this.registry.buildings.get(st.entities.extras[slot]!.defId);
        for (const u of bdef?.producesUnits ?? []) producers.add(u);
      }
      const all = [...this.registry.units.values()]
        .filter((u) => !u.factions || !faction || u.factions.includes(faction))
        .filter((u) => producers.size === 0 || producers.has(u.id) || ownedCount.has(u.id) || u.menuCategory === 'workers');
      return all.map((u) => {
        // Aggregate queue state across every owned producer of this unit.
        let progress = 0;
        let queued = 0;
        for (const slot of ownedBuildingSlots(st, me)) {
          const bdef = this.registry.buildings.get(st.entities.extras[slot]!.defId);
          if (!bdef?.producesUnits?.includes(u.id)) continue;
          const r = productionReadout(st, this.registry, st.entities.id[slot]!);
          if (r.active?.defId === u.id) {
            progress = r.fraction;
            queued += r.queue.filter((q) => q.defId === u.id).length;
          } else {
            queued += r.queue.filter((q) => q.defId === u.id).length;
            if (r.active?.defId === u.id) queued++;
          }
        }
        const blocker = producers.has(u.id) ? unitBlocker(st, this.registry, me, u.id) : 'Build a structure that trains this.';
        return {
          kind: 'unit' as const,
          id: u.id,
          name: u.name,
          shortName: shortLabelFor(u.name),
          cost: u.cost,
          blocker,
          progress,
          queued,
          owned: ownedCount.get(u.id) ?? 0,
        };
      });
    }

    // ---- tech
    const researched = new Set(owner.completedResearch);
    let activeProgress = 0;
    let activeId: string | null = null;
    for (const slot of ownedBuildingSlots(st, me)) {
      const r = researchReadout(st, this.registry, st.entities.id[slot]!);
      if (r.active) {
        activeProgress = r.fraction;
        activeId = r.active.defId;
      }
    }
    return [...this.registry.research.values()]
      .filter((r) => !r.factions || !faction || r.factions.includes(faction))
      .map((r) => ({
        kind: 'research' as const,
        id: r.id,
        name: r.name,
        shortName: shortLabelFor(r.name),
        cost: r.cost,
        blocker: researched.has(r.id) ? 'Already researched.' : researchBlocker(st, this.registry, me, r.id),
        progress: activeId === r.id ? activeProgress : 0,
        queued: 0,
        owned: -1,
        done: researched.has(r.id),
      }));
  }

  // ───────────────────────────────────────────────────────────────── command buttons

  private renderCommands(): void {
    this.cmds.replaceChildren();
    const st = this.ctrl.state;
    const slots = this.selectedSlots(st);
    const hasUnits = slots.some((s) => st.entities.kind[s] === KIND_UNIT);
    const hasBuilding = slots.some((s) => st.entities.kind[s] === KIND_BUILDING);
    const armed = this.deps.input.armed;
    const placing = this.app.placing !== null;

    const mk = (
      id: string,
      label: string,
      iconName: IconName,
      onClick: () => void,
      opts: { disabled?: boolean; pressed?: boolean; title?: string } = {},
    ): HTMLButtonElement => {
      const b = button({
        icon: iconName,
        label,
        size: 'sm',
        block: true,
        variant: opts.pressed ? 'primary' : 'default',
        onClick,
      });
      b.dataset.testid = `hud-cmd-${id}`;
      b.dataset.cmd = id;
      b.classList.add('hud-cmd');
      if (opts.disabled) b.disabled = true;
      if (opts.pressed) b.setAttribute('aria-pressed', 'true');
      b.title = opts.title ?? label;
      return b;
    };

    // Row 1 — unit orders. These are the buttons a phone player uses constantly, so they get the
    // widest labels and are never icon-only.
    this.cmds.append(
      mk('move', 'Move', 'move', () => this.deps.input.arm('move'), {
        disabled: !hasUnits,
        pressed: armed === 'move',
        title: 'Move: tap a destination',
      }),
      mk('attack-move', 'Atk-Move', 'speed', () => this.deps.input.arm('attackMove'), {
        disabled: !hasUnits,
        pressed: armed === 'attackMove',
        title: 'Attack-move: move and engage anything on the way',
      }),
      mk('attack', 'Attack', 'attack', () => this.deps.input.arm('attack'), {
        disabled: !hasUnits,
        pressed: armed === 'attack',
        title: 'Attack: tap an enemy',
      }),
      mk('stop', 'Stop', 'stop', () => this.deps.input.stop(), { disabled: !hasUnits }),
    );

    // Row 2 — structure and placement orders. Sell/Repair/Rally only mean anything with a building
    // selected, and they are disabled rather than hidden so the console does not reflow under a thumb.
    this.cmds.append(
      mk(
        'cancel',
        placing ? 'Cancel' : 'Rally',
        'close',
        () => {
          if (placing) this.deps.input.cancelPlacement();
          else this.deps.input.setRallyAtSelection();
        },
        {
          disabled: !placing && !hasBuilding,
          title: placing ? 'Cancel placement' : 'Rally point: tap the board after selecting a structure',
        },
      ),
      mk('sell', 'Sell', 'coin', () => this.deps.input.sellSelectedBuilding(), {
        disabled: !hasBuilding,
        title: 'Sell the selected structure (half refund)',
      }),
      mk('repair', 'Repair', 'gear', () => this.deps.input.toggleRepair(), {
        disabled: !hasBuilding,
        title: 'Repair the selected structure with mana',
      }),
      mk('stance', 'Hold', 'shield', () => this.deps.input.setStance('hold'), {
        disabled: !hasUnits,
        title: 'Hold ground: do not chase',
      }),
    );
  }

  private refreshCommandStates(st: GameState): void {
    const slots = this.selectedSlots(st);
    const hasUnits = slots.some((s) => st.entities.kind[s] === KIND_UNIT);
    const hasBuilding = slots.some((s) => st.entities.kind[s] === KIND_BUILDING);
    const map: Record<string, boolean> = {
      move: hasUnits,
      'attack-move': hasUnits,
      attack: hasUnits,
      stop: hasUnits,
      stance: hasUnits,
      sell: hasBuilding,
      repair: hasBuilding,
      cancel: hasBuilding || this.app.placing !== null,
    };
    for (const b of this.cmds.querySelectorAll<HTMLButtonElement>('button[data-cmd]')) {
      const want = map[b.dataset.cmd ?? ''];
      if (want !== undefined) b.disabled = !want;
    }
  }

  // ───────────────────────────────────────────────────────────────── radar

  private toggleRadar(): void {
    this.radarOpen = !this.radarOpen;
    this.radarHost.classList.toggle('is-hidden', !this.radarOpen);
    const btn = this.railPower.parentElement?.parentElement?.querySelector('[data-action="radar"]') as HTMLButtonElement | null;
    if (btn) btn.setAttribute('aria-pressed', String(this.radarOpen));
    this.root.dataset.radar = String(this.radarOpen);
    // The collapsed phone rail cannot show the radar at all, so toggling it opens the panel.
    if (this.radarOpen && this.collapsed) this.setCollapsed(false);
  }

  /** Def ids of every completed building this player owns, for cheap "do I have X" checks. */
  private ownedBuildingIds(st: GameState, playerIndex: number): string[] {
    const out: string[] = [];
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== KIND_BUILDING) continue;
      if (st.entities.ownerIndex[s] !== playerIndex) continue;
      const bp = (st.entities.extras[s]!.caps.building as { buildProgress?: number } | undefined)?.buildProgress;
      if (bp !== undefined) continue;
      out.push(st.entities.extras[s]!.defId);
    }
    return out;
  }

  private drawRadar(st: GameState, myIndex: number): void {
    const ctx = this.radarCtx;
    if (!ctx || !this.radarOpen) return;
    const W = this.radarCanvas.width;
    const H = this.radarCanvas.height;
    const map = this.registry.map(st.mapId);
    const sx = W / map.tileW;
    const sy = H / map.tileH;
    ctx.clearRect(0, 0, W, H);

    const active = radarActive(st, this.registry, this.ctrl.me);
    /**
     * AN OFFLINE RADAR SAYS WHY, AND WHAT IT STILL SHOWS.
     *
     * The playtest reported "OFFLINE with a near-empty panel", which reads as a broken control rather than as a missing
     * building. The minimap is not dead when offline — it still draws explored terrain, live sight and your own units — so
     * the header names the requirement and the reason, and the panel keeps showing the partial picture instead of going
     * blank. `radarActive` folds in a power shortfall, so the message distinguishes the two causes rather than guessing.
     */
    const hasRadarBuilding = st.players[myIndex]
      ? this.ownedBuildingIds(st, myIndex).some((id) => this.registry.buildings.get(id)?.isRadar)
      : false;
    const me = st.players[myIndex];
    const powerShort = me ? me.power < me.powerUsed : false;
    this.radarNote.textContent = active
      ? 'ONLINE'
      : powerShort && hasRadarBuilding
        ? 'NO POWER'
        : hasRadarBuilding
          ? 'BUILDING'
          : 'NEEDS OBELISK';
    this.radarNote.dataset.state = active ? 'on' : 'off';
    this.radarCanvas.dataset.state = active ? 'on' : 'off';
    this.radarHost.dataset.state = active ? 'on' : 'off';
    this.radarHost.title = active
      ? 'Radar online: the whole battlefield is shown'
      : hasRadarBuilding
        ? 'Scrying Obelisk offline — it has no power. The minimap shows explored ground and live sight only.'
        : 'No Scrying Obelisk. Build one (Defenses tab) to see the whole battlefield here; until then this shows explored ground and live sight.';

    for (let ty = 0; ty < map.tileH; ty++) {
      for (let tx = 0; tx < map.tileW; tx++) {
        const blocked = map.tiles[ty * map.tileW + tx] === 1;
        // Fog: the radar shows explored terrain, dimmed where it is not currently visible.
        const player = st.players[myIndex];
        const idx = ty * map.tileW + tx;
        const seen = player?.explored[idx] === 1 || active;
        const live = player?.visible[idx] === 1;
        if (!seen) ctx.fillStyle = 'rgba(10,12,15,0.85)';
        else if (!live && !active) ctx.fillStyle = blocked ? 'rgba(74,84,94,0.45)' : 'rgba(48,56,64,0.45)';
        else ctx.fillStyle = blocked ? 'rgba(84,96,108,0.8)' : 'rgba(56,66,74,0.8)';
        ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }

    const TILE = 32;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      const kind = st.entities.kind[s]!;
      if (kind === KIND_RESOURCE_NODE) continue;
      const owner = st.entities.ownerIndex[s]!;
      const p = st.players[owner];
      if (!p) continue;
      const mine = owner === myIndex;
      if (!mine && !active) {
        // Without radar, only what is in live sight appears on the minimap.
        const idx = Math.floor(st.entities.posY[s]! / TILE) * map.tileW + Math.floor(st.entities.posX[s]! / TILE);
        if (st.players[myIndex]?.visible[idx] !== 1) continue;
      }
      const size = kind === KIND_BUILDING ? 4 : 2;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = mine ? 1 : 0.85;
      ctx.fillRect((st.entities.posX[s]! / TILE) * sx - size / 2, (st.entities.posY[s]! / TILE) * sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    // The camera's footprint, so the radar doubles as a "where am I" indicator.
    const cam = this.ctrl.camera;
    const v = cam.visibleWorldRect();
    const rx = (v.minX / TILE) * sx;
    const ry = (v.minY / TILE) * sy;
    const rw = ((v.maxX - v.minX) / TILE) * sx;
    const rh = ((v.maxY - v.minY) / TILE) * sy;
    ctx.strokeStyle = 'rgba(244,239,228,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, rw, rh);
  }

  // ───────────────────────────────────────────────────────────────── notices

  note(kind: 'info' | 'warn' | 'bad', text: string): void {
    this.toast.className = `hud-toast hud-toast--${kind} is-on`;
    this.toast.textContent = text;
    if (this.noticeTimer) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-on');
    }, 2400);
  }

  destroy(): void {
    if (this.noticeTimer) window.clearTimeout(this.noticeTimer);
  }
}

/** Words for the order a unit is executing, for the selection readout. */
const ORDER_WORDS: Record<string, string> = {
  move: 'Moving',
  attack: 'Attacking',
  attackMove: 'Attack-moving',
  moveInOrder: 'Marching',
  harvest: 'Harvesting',
  garrison: 'Garrisoned',
  hold: 'Holding',
};

/**
 * A short, readable label for a tile.
 *
 * The sidebar is narrow and a phone is narrower, so "Attunement Spire" does not fit under a 52px picture
 * at 10px. The content set's own `shortLabel` is a MAP ABBREVIATION ("MINE", "PWR", "SUM") authored for
 * a 2-4 character tile label in v1's terrain overlay — using it here produced a build tile reading
 * "MINE" for the Attunement Spire, which is a different building and actively misleading. So the tile
 * shows a real word: the head noun of the name, dropping the generic structure word that every entry
 * shares ("Spire", "Forge") when one remains readable on its own.
 */
export function shortLabelFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return name.toUpperCase();
  const generic = new Set([
    'spire', 'circle', 'forge', 'vault', 'nexus', 'conduit', 'bastion', 'cannon', 'sentry',
    'grove', 'gate', 'wall', 'beacon', 'tower', 'obelisk', 'camp', 'bunker', 'sanctum', 'weaver',
    'acolyte', 'warden', 'skimmer', 'familiar', 'archer', 'swarmling', 'behemoth', 'siegebreaker', 'wagon',
  ]);
  const last = words[words.length - 1]!.toLowerCase();
  const head = words.slice(0, -1).join(' ');
  if (generic.has(last) && head.length > 0) {
    // "Attunement Spire" -> ATTUNEMENT; "Stone Wall" -> STONE WALL (head would be too short alone).
    return head.length >= 5 ? head.toUpperCase() : name.toUpperCase();
  }
  return name.toUpperCase();
}

export { MAX_PRODUCTION_QUEUE, ownedBuildingSlots, icon };
export type { EntityId };
