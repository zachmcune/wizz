import { el } from '../../ui/dom';
import type { Registry } from '../../data/registry';
import type { SandboxController } from '../sandbox-controller';
import { CommandPalette } from './command-palette';
import { listScenarios, loadUserScenario, type ScenarioSummary } from '../scenario-store';
import { isTouchPrimaryDevice } from './touch';

type TabId = 'economy' | 'units' | 'buildings' | 'ai' | 'map' | 'gameplay' | 'spells' | 'combat' | 'scenarios' | 'overlays';

const TABS: { id: TabId; label: string }[] = [
  { id: 'economy', label: 'Economy' },
  { id: 'units', label: 'Units' },
  { id: 'buildings', label: 'Build' },
  { id: 'ai', label: 'AI' },
  { id: 'map', label: 'Map' },
  { id: 'gameplay', label: 'Play' },
  { id: 'spells', label: 'Spells' },
  { id: 'combat', label: 'Combat' },
  { id: 'scenarios', label: 'Save' },
  { id: 'overlays', label: 'Debug' },
];

export interface SandboxPanelCallbacks {
  onPause: () => void;
  onResume: () => void;
  onStepFrame: () => void;
  onSetTimeScale: (scale: number) => void;
  isPaused: () => boolean;
}

export class SandboxPanel {
  readonly root = el('div', 'sandbox-panel');
  private backdrop = el('div', 'sandbox-backdrop');
  private fab = el('button', 'sandbox-fab', '⚙');
  private dock = el('div', 'sandbox-dock');
  private header = el('div', 'sandbox-header');
  private searchInput = el('input', 'sandbox-search') as HTMLInputElement;
  private tabBar = el('div', 'sandbox-tabs');
  private body = el('div', 'sandbox-body');
  private collapsed = true;
  private activeTab: TabId = 'economy';
  private palette: CommandPalette;
  private readonly touchMode: boolean;
  private dragStartY = 0;
  private draggingSheet = false;

  constructor(
    private controller: SandboxController,
    private registry: Registry,
    private callbacks: SandboxPanelCallbacks,
    host: HTMLElement,
  ) {
    this.touchMode = isTouchPrimaryDevice();
    if (this.touchMode) this.root.classList.add('touch');

    this.palette = new CommandPalette(controller, registry, controller.humanPlayerId, () => {});
    this.palette.mount(host);

    this.fab.type = 'button';
    this.fab.title = this.touchMode ? 'Developer tools' : 'Toggle Sandbox Panel (`)';
    this.fab.setAttribute('aria-label', 'Developer sandbox tools');
    this.fab.addEventListener('click', () => this.toggleCollapse());

    const title = el('span', 'sandbox-title', 'Sandbox');
    const paletteBtn = el('button', 'btn sandbox-btn sandbox-btn-icon');
    paletteBtn.type = 'button';
    paletteBtn.textContent = '⌘';
    paletteBtn.title = this.touchMode ? 'Command search' : 'Command palette (Ctrl+Shift+P)';
    paletteBtn.setAttribute('aria-label', 'Command palette');
    paletteBtn.addEventListener('click', () => this.palette.show());

    const restartBtn = el('button', 'btn sandbox-btn sandbox-btn-icon');
    restartBtn.type = 'button';
    restartBtn.textContent = '↻';
    restartBtn.title = 'Restart scenario';
    restartBtn.addEventListener('click', () => this.controller.restartScenario());

    const closeBtn = el('button', 'btn sandbox-btn sandbox-btn-icon');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close sandbox panel');
    closeBtn.addEventListener('click', () => this.setCollapsed(true));

    const handle = el('div', 'sandbox-sheet-handle');
    const headerRow = el('div', 'sandbox-header-row');
    headerRow.append(title, paletteBtn, restartBtn, closeBtn);
    this.header.append(handle, headerRow);

    this.searchInput.placeholder = 'Filter tools…';
    this.searchInput.addEventListener('input', () => this.renderTab());

    for (const t of TABS) {
      const btn = el('button', 'sandbox-tab');
      btn.type = 'button';
      btn.textContent = t.label;
      btn.dataset.tab = t.id;
      btn.addEventListener('click', () => {
        this.activeTab = t.id;
        this.renderTab();
        this.syncTabs();
      });
      this.tabBar.appendChild(btn);
    }

    this.backdrop.addEventListener('click', () => this.setCollapsed(true));
    this.setupSheetDrag();

    this.dock.append(this.header, this.searchInput, this.tabBar, this.body);
    this.root.append(this.backdrop, this.fab, this.dock);
    this.setCollapsed(true);
    this.renderTab();
    this.syncTabs();
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }

  toggleCollapse(): void {
    this.setCollapsed(!this.collapsed);
  }

  private setCollapsed(v: boolean): void {
    this.collapsed = v;
    this.root.classList.toggle('collapsed', v);
    this.root.classList.toggle('expanded', !v);
  }

  showPalette(): void {
    this.palette.show();
  }

  setControlledPlayer(playerId: string): void {
    this.palette.setHumanId(playerId);
  }

  handleGlobalKey(e: KeyboardEvent): boolean {
    if (this.touchMode) return false;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      this.palette.show();
      return true;
    }
    if (e.key === '`' && !this.isEditable(e.target)) {
      e.preventDefault();
      this.toggleCollapse();
      return true;
    }
    return false;
  }

  private isEditable(target: EventTarget | null): boolean {
    const node = target as HTMLElement | null;
    const tag = node?.tagName?.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node?.isContentEditable === true;
  }

  private setupSheetDrag(): void {
    if (!this.touchMode) return;
    const onStart = (e: PointerEvent) => {
      if (this.collapsed) return;
      this.draggingSheet = true;
      this.dragStartY = e.clientY;
      this.dock.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.draggingSheet) return;
      const dy = e.clientY - this.dragStartY;
      if (dy > 48) this.setCollapsed(true);
    };
    const onEnd = (e: PointerEvent) => {
      if (!this.draggingSheet) return;
      this.draggingSheet = false;
      this.dock.releasePointerCapture(e.pointerId);
    };
    this.header.addEventListener('pointerdown', onStart);
    this.header.addEventListener('pointermove', onMove);
    this.header.addEventListener('pointerup', onEnd);
    this.header.addEventListener('pointercancel', onEnd);
  }

  private makeSelect(ids: string[], selected?: string): HTMLSelectElement {
    const select = el('select', 'sandbox-select') as HTMLSelectElement;
    for (const id of ids) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      select.appendChild(opt);
    }
    if (selected) select.value = selected;
    return select;
  }

  private makePlayerSelect(): HTMLSelectElement {
    const select = el('select', 'sandbox-select') as HTMLSelectElement;
    for (const p of this.controller.players) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.id} (${p.controller})`;
      select.appendChild(opt);
    }
    select.value = this.controller.humanPlayerId;
    return select;
  }

  private syncTabs(): void {
    for (const btn of this.tabBar.querySelectorAll<HTMLButtonElement>('.sandbox-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
    }
  }

  private renderTab(): void {
    this.body.replaceChildren();
    const filter = this.searchInput.value.toLowerCase();
    switch (this.activeTab) {
      case 'economy':
        this.renderEconomy(filter);
        break;
      case 'units':
        this.renderUnits(filter);
        break;
      case 'buildings':
        this.renderBuildings(filter);
        break;
      case 'ai':
        this.renderAi(filter);
        break;
      case 'map':
        this.renderMap(filter);
        break;
      case 'gameplay':
        this.renderGameplay(filter);
        break;
      case 'spells':
        this.renderSpells(filter);
        break;
      case 'combat':
        this.renderCombat(filter);
        break;
      case 'scenarios':
        void this.renderScenarios(filter);
        break;
      case 'overlays':
        this.renderOverlays(filter);
        break;
    }
  }

  private chip(label: string, section: keyof import('../../sim/sandbox-types').SandboxSettings, key: string, active: boolean): HTMLElement {
    const btn = el('button', 'sandbox-chip');
    btn.type = 'button';
    btn.textContent = label;
    btn.classList.toggle('active', active);
    btn.addEventListener('click', () => {
      this.controller.toggleSetting(section, key);
      this.renderTab();
    });
    return btn;
  }

  private btn(label: string, action: () => void): HTMLElement {
    const b = el('button', 'btn sandbox-action', label);
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  }

  private stepper(value: number, onChange: (n: number) => void): HTMLElement {
    const wrap = el('div', 'sandbox-stepper');
    const minus = el('button', 'sandbox-stepper-btn', '−');
    const plus = el('button', 'sandbox-stepper-btn', '+');
    const label = el('span', 'sandbox-stepper-val', String(value));
    minus.type = 'button';
    plus.type = 'button';
    let v = value;
    const sync = () => {
      label.textContent = String(v);
      onChange(v);
    };
    minus.addEventListener('click', () => {
      v = Math.max(1, v - 1);
      sync();
    });
    plus.addEventListener('click', () => {
      v = Math.min(999, v + 1);
      sync();
    });
    wrap.append(minus, label, plus);
    return wrap;
  }

  private section(title: string): HTMLElement {
    const s = el('div', 'sandbox-section');
    s.appendChild(el('div', 'sandbox-section-title', title));
    return s;
  }

  private unitIds(): string[] {
    return [...this.registry.units.keys()].sort();
  }

  private buildingIds(): string[] {
    return [...this.registry.buildings.keys()].sort();
  }

  private spellIds(): string[] {
    return [...this.registry.spells.keys()].sort();
  }

  private renderEconomy(filter: string): void {
    if ('mana'.includes(filter) || !filter) {
      const s = this.section('Mana');
      const row = el('div', 'sandbox-btn-row');
      row.append(
        this.btn('Set 5k', () => this.controller.setPlayerMana(this.controller.humanPlayerId, 5000, 'set')),
        this.btn('+50k', () => this.controller.setPlayerMana(this.controller.humanPlayerId, 50000, 'add')),
        this.btn('−1k', () => this.controller.setPlayerMana(this.controller.humanPlayerId, 1000, 'remove')),
      );
      s.appendChild(row);
      this.body.appendChild(s);
    }
    const e = this.controller.settings.economy;
    const s2 = this.section('Toggles');
    const chips = el('div', 'sandbox-chip-grid');
    chips.append(
      this.chip('∞ Mana', 'economy', 'infiniteMana', e.infiniteMana),
      this.chip('∞ Power', 'economy', 'infinitePower', e.infinitePower),
      this.chip('Free', 'economy', 'noCosts', e.noCosts),
      this.chip('Instant build', 'economy', 'instantBuild', e.instantBuild),
      this.chip('Instant produce', 'economy', 'instantProduce', e.instantProduce),
      this.chip('Instant research', 'economy', 'instantResearch', e.instantResearch),
      this.chip('Skip tech', 'economy', 'ignoreTechRequirements', e.ignoreTechRequirements),
    );
    s2.appendChild(chips);
    this.body.appendChild(s2);
  }

  private renderUnits(filter: string): void {
    if (!filter || 'spawn'.includes(filter)) {
      const s = this.section('Spawn at camera');
      let count = 5;
      const unitSelect = this.makeSelect(this.unitIds());
      const playerSelect = this.makePlayerSelect();
      const countStepper = this.stepper(count, (n) => {
        count = n;
      });
      s.append(unitSelect, playerSelect, countStepper);
      s.appendChild(this.btn('Spawn', () => {
        this.controller.spawnUnit(playerSelect.value || this.controller.humanPlayerId, unitSelect.value, count);
      }));
      this.body.appendChild(s);
    }
    const s2 = this.section('Selection');
    const row = el('div', 'sandbox-btn-row');
    row.append(
      this.btn('Heal', () => this.controller.healSelected()),
      this.btn('Kill', () => this.controller.killSelected()),
      this.btn('Delete', () => this.controller.destroySelected()),
    );
    s2.appendChild(row);
    this.body.appendChild(s2);
  }

  private renderBuildings(filter: string): void {
    void filter;
    const s = this.section('Spawn at camera');
    const buildingSelect = this.makeSelect(this.buildingIds());
    const playerSelect = this.makePlayerSelect();
    s.append(buildingSelect, playerSelect);
    s.appendChild(this.btn('Spawn building', () => {
      this.controller.spawnBuilding(playerSelect.value || this.controller.humanPlayerId, buildingSelect.value, true);
    }));
    const b = this.controller.settings.build;
    s.append(this.chip('Free placement', 'build', 'ignorePlacementRestrictions', b.ignorePlacementRestrictions));
    this.body.appendChild(s);
  }

  private renderAi(filter: string): void {
    void filter;
    const a = this.controller.settings.ai;
    const g = this.controller.settings.gameplay;
    const s = this.section('Player control');
    const controlRow = el('div', 'sandbox-chip-grid');
    controlRow.append(this.chip('Control any player', 'gameplay', 'multiPlayerControl', g.multiPlayerControl));
    s.appendChild(controlRow);

    const active = this.section('Active player');
    const activeSelect = this.makePlayerSelect();
    activeSelect.addEventListener('change', () => {
      if (this.controller.switchControlledPlayer(activeSelect.value)) this.renderTab();
    });
    active.appendChild(activeSelect);

    const slots = this.section('Player slots');
    for (const p of this.controller.players) {
      const row = el('div', 'sandbox-btn-row');
      const label = el('span', 'sandbox-player-label', `${p.id} · team ${p.team} · ${p.controller}`);
      const humanBtn = this.btn('Human', () => {
        this.controller.setPlayerController(p.id, 'human');
        this.renderTab();
      });
      const aiBtn = this.btn('AI', () => {
        this.controller.setPlayerController(p.id, 'ai');
        this.renderTab();
      });
      if (p.controller === 'human') humanBtn.classList.add('active');
      else aiBtn.classList.add('active');
      row.append(label, humanBtn, aiBtn);
      slots.appendChild(row);
    }

    const aiSection = this.section('AI control');
    const chips = el('div', 'sandbox-chip-grid');
    chips.append(
      this.chip('Pause AI', 'ai', 'paused', a.paused),
      this.chip('Disable AI', 'ai', 'disabled', a.disabled),
      this.chip('Show intel', 'ai', 'revealIntel', a.revealIntel),
    );
    aiSection.appendChild(chips);
    const force = this.section('Force mode');
    const forceRow = el('div', 'sandbox-chip-grid');
    for (const mode of ['none', 'attack', 'defend', 'expand'] as const) {
      const btn = el('button', 'sandbox-chip');
      btn.type = 'button';
      btn.textContent = mode;
      btn.classList.toggle('active', a.forceMode === mode);
      btn.addEventListener('click', () => {
        this.controller.setSetting('ai', { forceMode: mode });
        this.renderTab();
      });
      forceRow.appendChild(btn);
    }
    force.appendChild(forceRow);
    const hint = el(
      'p',
      'sandbox-hint',
      'Force attack sends combat units to the enemy HQ. Spawn troops first — harvesters cannot fight.',
    );
    this.body.append(s, active, slots, aiSection, force, hint);
  }

  private renderMap(filter: string): void {
    void filter;
    const m = this.controller.settings.map;
    const s = this.section('Fog of war');
    const chips = el('div', 'sandbox-chip-grid');
    chips.append(
      this.chip('Fog on', 'map', 'fogEnabled', m.fogEnabled),
      this.chip('Reveal all', 'map', 'revealMap', m.revealMap),
    );
    s.appendChild(chips);
    this.body.appendChild(s);
  }

  private renderGameplay(filter: string): void {
    void filter;
    const g = this.controller.settings.gameplay;
    const s = this.section('Simulation');
    const simRow = el('div', 'sandbox-btn-row');
    simRow.append(
      this.btn(this.callbacks.isPaused() ? 'Resume' : 'Pause', () => {
        if (this.callbacks.isPaused()) this.callbacks.onResume();
        else this.callbacks.onPause();
        this.renderTab();
      }),
      this.btn('+1 frame', () => this.callbacks.onStepFrame()),
    );
    s.appendChild(simRow);

    const speed = this.section('Speed');
    const speedRow = el('div', 'sandbox-btn-row');
    for (const sc of [0.25, 0.5, 1, 2, 4]) {
      speedRow.appendChild(this.btn(`${sc}×`, () => this.callbacks.onSetTimeScale(sc)));
    }
    speed.appendChild(speedRow);

    const s2 = this.section('Freeze');
    const freezeRow = el('div', 'sandbox-chip-grid');
    freezeRow.append(
      this.chip('Units', 'gameplay', 'freezeUnits', g.freezeUnits),
      this.chip('Projectiles', 'gameplay', 'freezeProjectiles', g.freezeProjectiles),
      this.chip('No win', 'gameplay', 'disableWinCheck', g.disableWinCheck),
    );
    s2.appendChild(freezeRow);
    this.body.append(s, speed, s2);
  }

  private renderSpells(filter: string): void {
    void filter;
    const sp = this.controller.settings.spells;
    const s = this.section('Cast at camera');
    const spellSelect = this.makeSelect(this.spellIds());
    s.append(spellSelect);
    s.appendChild(this.btn('Cast spell', () => this.controller.castSpell(spellSelect.value)));
    const chips = el('div', 'sandbox-chip-grid');
    chips.append(
      this.chip('No CD', 'spells', 'noCooldowns', sp.noCooldowns),
      this.chip('Free cast', 'spells', 'noManaCost', sp.noManaCost),
      this.chip('Show radius', 'overlays', 'spellRadius', this.controller.settings.overlays.spellRadius),
    );
    s.appendChild(chips);
    this.body.appendChild(s);
  }

  private renderCombat(filter: string): void {
    void filter;
    const s = this.section('Battlefield');
    const row = el('div', 'sandbox-btn-row');
    row.append(
      this.btn('Clear all units', () => this.controller.clearUnits()),
      this.btn('Clear mine', () => this.controller.clearUnits(this.controller.humanPlayerId)),
      this.btn('Restart', () => this.controller.restartScenario()),
    );
    s.appendChild(row);
    this.body.appendChild(s);
  }

  private async renderScenarios(filter: string): Promise<void> {
    const s = this.section('Save / load');
    const nameInput = el('input', 'sandbox-search sandbox-name-input') as HTMLInputElement;
    nameInput.placeholder = 'Scenario name';
    nameInput.autocomplete = 'off';
    const row = el('div', 'sandbox-btn-row');
    row.append(
      this.btn('Save', () => void this.controller.saveScenario(nameInput.value || 'Untitled')),
      this.btn('Restart', () => this.controller.restartScenario()),
    );
    s.append(nameInput, row);
    this.body.appendChild(s);

    const list = this.section('Library');
    const scenarios = (await listScenarios()).filter((sc) => !filter || sc.name.toLowerCase().includes(filter));
    for (const sc of scenarios) {
      const rowBtn = el('button', 'sandbox-list-row');
      rowBtn.type = 'button';
      rowBtn.textContent = sc.name + (sc.builtin ? ' ★' : '');
      rowBtn.addEventListener('click', () => void this.loadScenario(sc));
      list.appendChild(rowBtn);
    }
    this.body.appendChild(list);
  }

  private async loadScenario(summary: ScenarioSummary): Promise<void> {
    if (summary.builtin) {
      this.controller.restartScenario();
      return;
    }
    const sc = await loadUserScenario(summary.id);
    if (sc) this.controller.loadScenario(sc);
  }

  private renderOverlays(filter: string): void {
    void filter;
    const o = this.controller.settings.overlays;
    const s = this.section('Debug overlays');
    const chips = el('div', 'sandbox-chip-grid');
    const keys: (keyof typeof o)[] = [
      'fps',
      'frameTime',
      'memory',
      'unitIds',
      'healthBars',
      'visionRadius',
      'attackRadius',
      'navigationGrid',
      'buildingFootprints',
      'spellRadius',
    ];
    for (const key of keys) {
      chips.appendChild(this.chip(key, 'overlays', key, o[key]));
    }
    s.appendChild(chips);
    this.body.appendChild(s);
  }

  destroy(): void {
    this.palette.destroy();
    this.root.remove();
  }
}
