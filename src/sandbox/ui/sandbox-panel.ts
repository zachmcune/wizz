import { el } from '../../ui/dom';
import type { Registry } from '../../data/registry';
import type { SandboxController } from '../sandbox-controller';
import { CommandPalette } from './command-palette';
import { listScenarios, loadUserScenario, type ScenarioSummary } from '../scenario-store';

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
  { id: 'scenarios', label: 'Scenarios' },
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
  private fab = el('button', 'sandbox-fab', '⚙');
  private dock = el('div', 'sandbox-dock');
  private header = el('div', 'sandbox-header');
  private searchInput = el('input', 'sandbox-search') as HTMLInputElement;
  private tabBar = el('div', 'sandbox-tabs');
  private body = el('div', 'sandbox-body');
  private collapsed = false;
  private activeTab: TabId = 'economy';
  private palette: CommandPalette;
  private unitSelect = el('select', 'sandbox-select') as HTMLSelectElement;
  private buildingSelect = el('select', 'sandbox-select') as HTMLSelectElement;
  private spellSelect = el('select', 'sandbox-select') as HTMLSelectElement;
  private playerSelect = el('select', 'sandbox-select') as HTMLSelectElement;

  constructor(
    private controller: SandboxController,
    private registry: Registry,
    private humanId: string,
    private callbacks: SandboxPanelCallbacks,
    host: HTMLElement,
  ) {
    this.palette = new CommandPalette(controller, registry, humanId, () => {});
    this.palette.mount(host);

    this.fab.title = 'Toggle Sandbox Panel (`)';
    this.fab.addEventListener('click', () => this.toggleCollapse());

    const title = el('span', 'sandbox-title', 'Developer Sandbox');
    const paletteBtn = el('button', 'btn sandbox-btn', '⌘');
    paletteBtn.title = 'Command palette (Ctrl+Shift+P)';
    paletteBtn.addEventListener('click', () => this.palette.show());
    const restartBtn = el('button', 'btn sandbox-btn', '↻');
    restartBtn.title = 'Restart scenario';
    restartBtn.addEventListener('click', () => this.controller.restartScenario());
    const collapseBtn = el('button', 'btn sandbox-btn', '−');
    collapseBtn.addEventListener('click', () => this.toggleCollapse());
    this.header.append(title, paletteBtn, restartBtn, collapseBtn);

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

    this.populateSelects();
    this.dock.append(this.header, this.searchInput, this.tabBar, this.body);
    this.root.append(this.fab, this.dock);
    this.renderTab();
    this.syncTabs();
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.root.classList.toggle('collapsed', this.collapsed);
  }

  showPalette(): void {
    this.palette.show();
  }

  handleGlobalKey(e: KeyboardEvent): boolean {
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
    const el = target as HTMLElement | null;
    const tag = el?.tagName?.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true;
  }

  private populateSelects(): void {
    for (const id of [...this.registry.units.keys()].sort()) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      this.unitSelect.appendChild(opt);
    }
    for (const id of [...this.registry.buildings.keys()].sort()) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      this.buildingSelect.appendChild(opt);
    }
    for (const id of [...this.registry.spells.keys()].sort()) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      this.spellSelect.appendChild(opt);
    }
    for (const p of this.controller.players) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.id} (${p.controller})`;
      this.playerSelect.appendChild(opt);
    }
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

  private section(title: string): HTMLElement {
    const s = el('div', 'sandbox-section');
    s.appendChild(el('div', 'sandbox-section-title', title));
    return s;
  }

  private renderEconomy(filter: string): void {
    if ('mana'.includes(filter) || !filter) {
      const s = this.section('Mana');
      s.append(
        this.btn('Set 5000', () => this.controller.setPlayerMana(this.humanId, 5000, 'set')),
        this.btn('Add 50000', () => this.controller.setPlayerMana(this.humanId, 50000, 'add')),
        this.btn('Remove 1000', () => this.controller.setPlayerMana(this.humanId, 1000, 'remove')),
      );
      this.body.appendChild(s);
    }
    const e = this.controller.settings.economy;
    const s2 = this.section('Toggles');
    s2.append(
      this.chip('Infinite mana', 'economy', 'infiniteMana', e.infiniteMana),
      this.chip('No costs', 'economy', 'noCosts', e.noCosts),
      this.chip('Instant build', 'economy', 'instantBuild', e.instantBuild),
      this.chip('Instant produce', 'economy', 'instantProduce', e.instantProduce),
      this.chip('Instant research', 'economy', 'instantResearch', e.instantResearch),
      this.chip('Ignore tech', 'economy', 'ignoreTechRequirements', e.ignoreTechRequirements),
    );
    this.body.appendChild(s2);
  }

  private renderUnits(filter: string): void {
    if (!filter || 'spawn'.includes(filter)) {
      const s = this.section('Spawn');
      const countInput = el('input', 'sandbox-num') as HTMLInputElement;
      countInput.type = 'number';
      countInput.value = '5';
      countInput.min = '1';
      s.append(this.unitSelect, countInput, this.playerSelect);
      s.appendChild(this.btn('Spawn at camera', () => {
        const owner = this.playerSelect.value || this.humanId;
        this.controller.spawnUnit(owner, this.unitSelect.value, Number(countInput.value) || 1);
      }));
      this.body.appendChild(s);
    }
    const s2 = this.section('Selection');
    s2.append(this.btn('Heal selected', () => this.controller.healSelected()), this.btn('Kill selected', () => this.controller.killSelected()), this.btn('Delete selected', () => this.controller.destroySelected()));
    this.body.appendChild(s2);
  }

  private renderBuildings(filter: string): void {
    void filter;
    const s = this.section('Spawn building');
    s.append(this.buildingSelect, this.playerSelect);
    s.appendChild(this.btn('Spawn at camera', () => {
      this.controller.spawnBuilding(this.playerSelect.value || this.humanId, this.buildingSelect.value, true);
    }));
    const b = this.controller.settings.build;
    s.append(this.chip('Ignore placement', 'build', 'ignorePlacementRestrictions', b.ignorePlacementRestrictions));
    this.body.appendChild(s);
  }

  private renderAi(filter: string): void {
    void filter;
    const a = this.controller.settings.ai;
    const s = this.section('AI control');
    s.append(
      this.chip('Pause AI', 'ai', 'paused', a.paused),
      this.chip('Disable AI', 'ai', 'disabled', a.disabled),
      this.chip('Reveal intel', 'ai', 'revealIntel', a.revealIntel),
    );
    const force = this.section('Force mode');
    for (const mode of ['none', 'attack', 'defend', 'expand'] as const) {
      const btn = el('button', 'sandbox-chip');
      btn.type = 'button';
      btn.textContent = mode;
      btn.classList.toggle('active', a.forceMode === mode);
      btn.addEventListener('click', () => {
        this.controller.setSetting('ai', { forceMode: mode });
        this.renderTab();
      });
      force.appendChild(btn);
    }
    this.body.append(force, s);
  }

  private renderMap(filter: string): void {
    void filter;
    const m = this.controller.settings.map;
    const s = this.section('Fog of war');
    s.append(
      this.chip('Fog enabled', 'map', 'fogEnabled', m.fogEnabled),
      this.chip('Reveal map', 'map', 'revealMap', m.revealMap),
    );
    this.body.appendChild(s);
  }

  private renderGameplay(filter: string): void {
    void filter;
    const g = this.controller.settings.gameplay;
    const s = this.section('Simulation');
    s.append(
      this.btn(this.callbacks.isPaused() ? 'Resume' : 'Pause', () => {
        if (this.callbacks.isPaused()) this.callbacks.onResume();
        else this.callbacks.onPause();
        this.renderTab();
      }),
      this.btn('Step 1 frame', () => this.callbacks.onStepFrame()),
    );
    const speed = this.section('Time scale');
    for (const sc of [0.25, 0.5, 1, 2, 4]) {
      speed.appendChild(this.btn(`${sc}x`, () => this.callbacks.onSetTimeScale(sc)));
    }
    const s2 = this.section('Freeze');
    s2.append(
      this.chip('Freeze units', 'gameplay', 'freezeUnits', g.freezeUnits),
      this.chip('Freeze projectiles', 'gameplay', 'freezeProjectiles', g.freezeProjectiles),
      this.chip('Disable win check', 'gameplay', 'disableWinCheck', g.disableWinCheck),
    );
    this.body.append(s, speed, s2);
  }

  private renderSpells(filter: string): void {
    void filter;
    const sp = this.controller.settings.spells;
    const s = this.section('Cast spell');
    s.append(this.spellSelect);
    s.appendChild(this.btn('Cast at camera', () => this.controller.castSpell(this.spellSelect.value)));
    s.append(this.chip('No cooldowns', 'spells', 'noCooldowns', sp.noCooldowns), this.chip('No mana cost', 'spells', 'noManaCost', sp.noManaCost));
    s.append(this.chip('Show radius', 'overlays', 'spellRadius', this.controller.settings.overlays.spellRadius));
    this.body.appendChild(s);
  }

  private renderCombat(filter: string): void {
    void filter;
    const s = this.section('Battlefield');
    s.append(
      this.btn('Clear all units', () => this.controller.clearUnits()),
      this.btn('Clear player units', () => this.controller.clearUnits(this.humanId)),
      this.btn('Restart scenario', () => this.controller.restartScenario()),
    );
    this.body.appendChild(s);
  }

  private async renderScenarios(filter: string): Promise<void> {
    const s = this.section('Save / Load');
    const nameInput = el('input', 'sandbox-search') as HTMLInputElement;
    nameInput.placeholder = 'Scenario name';
    s.append(nameInput, this.btn('Save scenario', () => void this.controller.saveScenario(nameInput.value || 'Untitled')));
    s.appendChild(this.btn('Quick restart', () => this.controller.restartScenario()));
    this.body.appendChild(s);

    const list = this.section('Library');
    const scenarios = (await listScenarios()).filter((sc) => !filter || sc.name.toLowerCase().includes(filter));
    for (const sc of scenarios) {
      const row = el('button', 'sandbox-palette-row');
      row.type = 'button';
      row.textContent = sc.name + (sc.builtin ? ' (builtin)' : '');
      row.addEventListener('click', () => void this.loadScenario(sc));
      list.appendChild(row);
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
      s.appendChild(this.chip(key, 'overlays', key, o[key]));
    }
    this.body.appendChild(s);
  }

  destroy(): void {
    this.palette.destroy();
    this.root.remove();
  }
}
