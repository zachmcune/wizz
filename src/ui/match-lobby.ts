// Pre-match lobby UI: configure slots, teams, colors, positions, AI, map, and faction.
import type { Registry } from '../data/registry';
import type { LobbyClient } from '../net/lobby-client';
import { validateLobby } from '../lobby/build-config';
import { getLobbyTemplates } from '../lobby/templates';
import { TEAM_LABELS, teamLabelDisplay } from '../lobby/teams';
import type { AiDifficulty, LobbyMode, LobbySlot, LobbyState, SlotId, SlotKind } from '../lobby/types';
import { DEFAULT_COLORS } from '../lobby/types';
import { LobbyMapPreview } from './lobby-map-preview';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function appendField(grid: HTMLElement, label: string, control: HTMLElement): void {
  const lbl = el('span', 'lobby-field-label', label);
  const wrap = el('div', 'lobby-field-control');
  wrap.appendChild(control);
  grid.append(lbl, wrap);
}

function lobbyMapSize(): number {
  const h = window.innerHeight;
  const w = window.innerWidth;
  if (h <= 420) return Math.min(132, Math.floor(w * 0.3));
  if (h <= 520) return Math.min(168, Math.floor(w * 0.32));
  return Math.min(200, Math.floor(w * 0.34));
}

export interface MatchLobbyOptions {
  mode: LobbyMode;
  registry: Registry;
  initialState: LobbyState;
  room?: string;
  connId?: string;
  localSlotId?: string;
  isHost?: boolean;
  lobbyClient?: LobbyClient;
  onStart: (state: LobbyState) => void;
  onBack: () => void;
}

export class MatchLobby {
  readonly root = el('div', 'menu-screen match-lobby');
  private state: LobbyState;
  private statusEl = el('p', 'lobby-status');
  private errorEl = el('p', 'lobby-error');
  private actionBtn = el('button', 'btn big', 'Start');
  private slotEls: HTMLElement[] = [];
  private mapSelect!: HTMLSelectElement;
  private factionSelect!: HTMLSelectElement;
  private templateSelect!: HTMLSelectElement;
  private roomEl: HTMLElement | null = null;
  private bodyEl = el('div', 'lobby-body');
  private slotsWrap = el('div', 'lobby-slots');
  private bannerEl = el('div', 'lobby-banner');
  private mapPreview: LobbyMapPreview;
  private pickSlotId: SlotId | null = null;

  constructor(private opts: MatchLobbyOptions) {
    this.state = structuredClone(opts.initialState);
    this.mapPreview = new LobbyMapPreview(this.opts.registry.map(this.state.mapId), lobbyMapSize());
    this.errorEl.style.display = 'none';
    this.build();
    if (opts.lobbyClient) this.wireNetwork(opts.lobbyClient);
    this.pickSlotId = this.defaultPickSlot();
    this.refresh();
  }

  private defaultPickSlot(): SlotId | null {
    if (this.opts.localSlotId) return this.opts.localSlotId as SlotId;
    if (this.opts.mode === 'solo') return 'player0';
    const editable = this.state.slots.find((s) => s.kind !== 'closed' && this.canEditSlot(s));
    return editable?.id ?? null;
  }

  private build(): void {
    const top = el('div', 'lobby-top');
    const title = el('h1', 'menu-title lobby-title', 'Match Setup');
    const header = el('div', 'lobby-header');

    this.mapSelect = el('select', 'lobby-select') as HTMLSelectElement;
    for (const map of this.opts.registry.maps.values()) {
      const opt = el('option', undefined, map.name) as HTMLOptionElement;
      opt.value = map.id;
      this.mapSelect.appendChild(opt);
    }
    this.mapSelect.value = this.state.mapId;
    this.mapSelect.addEventListener('change', () => {
      this.state.mapId = this.mapSelect.value;
      const map = this.opts.registry.map(this.state.mapId);
      for (const slot of this.state.slots) {
        if (slot.startIndex !== null && slot.startIndex >= map.startLocations.length) {
          slot.startIndex = null;
        }
      }
      this.mapPreview.setMap(map);
      this.pushUpdate();
      this.refresh();
    });

    this.factionSelect = el('select', 'lobby-select') as HTMLSelectElement;
    for (const faction of this.opts.registry.factions.values()) {
      const opt = el('option', undefined, faction.name) as HTMLOptionElement;
      opt.value = faction.id;
      this.factionSelect.appendChild(opt);
    }
    this.factionSelect.value = this.state.factionId;
    this.factionSelect.addEventListener('change', () => {
      this.state.factionId = this.factionSelect.value;
      for (const slot of this.state.slots) {
        if (!slot.factionId || slot.factionId === this.factionSelect.value) slot.factionId = this.factionSelect.value;
      }
      this.pushUpdate();
      this.refresh();
    });

    header.append(
      el('label', 'lobby-field-label', 'Map'),
      this.mapSelect,
      el('label', 'lobby-field-label', 'Faction'),
      this.factionSelect,
    );
    top.append(title, header);

    if (this.opts.room) {
      this.roomEl = el('div', 'lobby-room');
      this.roomEl.append(el('span', 'lobby-label', 'Room code'), el('strong', 'lobby-code', this.opts.room));
    }

    for (let i = 0; i < 4; i++) {
      const panel = this.buildSlotPanel(i);
      this.slotEls.push(panel);
      this.slotsWrap.appendChild(panel);
    }

    this.mapPreview.onPositionPick((index) => {
      if (!this.pickSlotId) return;
      const slot = this.state.slots.find((s) => s.id === this.pickSlotId);
      if (!slot || !this.canEditSlot(slot) || slot.kind === 'closed') return;
      if (this.isPositionTaken(index, slot.id)) return;
      slot.startIndex = index;
      this.pushUpdate();
      this.refresh();
    });

    this.bodyEl.append(this.slotsWrap, this.mapPreview.root);

    this.bannerEl.append(this.errorEl, this.statusEl);
    this.errorEl.classList.add('lobby-banner-error');
    this.statusEl.classList.add('lobby-banner-status');

    this.templateSelect = el('select', 'lobby-select') as HTMLSelectElement;
    const blank = el('option', undefined, 'Load template…') as HTMLOptionElement;
    blank.value = '';
    this.templateSelect.appendChild(blank);
    for (const t of getLobbyTemplates(this.opts.registry)) {
      const opt = el('option', undefined, t.name) as HTMLOptionElement;
      opt.value = t.id;
      this.templateSelect.appendChild(opt);
    }
    this.templateSelect.addEventListener('change', () => {
      const id = this.templateSelect.value;
      if (!id) return;
      const template = getLobbyTemplates(this.opts.registry).find((t) => t.id === id);
      if (!template) return;
      this.state = template.apply(this.opts.registry);
      if (this.opts.mode === 'host' && this.opts.connId) {
        const hostSlot = this.state.slots.find((s) => s.kind === 'human');
        if (hostSlot) {
          hostSlot.claimedBy = this.opts.connId;
          hostSlot.ready = true;
        }
      }
      this.templateSelect.value = '';
      this.mapPreview.setMap(this.opts.registry.map(this.state.mapId));
      this.pickSlotId = this.defaultPickSlot();
      this.pushUpdate();
      this.refresh();
    });

    const footer = el('div', 'lobby-footer');
    const backBtn = el('button', 'btn', 'Back');
    backBtn.addEventListener('click', () => this.opts.onBack());
    this.actionBtn.addEventListener('click', () => this.onAction());
    footer.append(backBtn, this.templateSelect, this.actionBtn);

    const shell = el('div', 'lobby-shell');
    shell.append(top, this.roomEl ?? '', this.bodyEl, this.bannerEl, footer);
    this.root.appendChild(shell);
  }

  private buildSlotPanel(index: number): HTMLElement {
    const panel = el('div', 'lobby-slot');
    panel.dataset.index = String(index);
    panel.addEventListener('pointerdown', () => {
      const slot = this.state.slots[index]!;
      if (slot.kind !== 'closed' && this.canEditSlot(slot)) {
        this.pickSlotId = slot.id;
        this.refresh();
      }
    });
    return panel;
  }

  private spawnCount(): number {
    return this.opts.registry.map(this.state.mapId).startLocations.length;
  }

  private isPositionTaken(index: number, exceptId: string): boolean {
    return this.state.slots.some(
      (s) => s.kind !== 'closed' && s.id !== exceptId && s.startIndex === index,
    );
  }

  private renderSlotPanel(panel: HTMLElement, slot: LobbySlot, index: number): void {
    panel.replaceChildren();
    const canEdit = this.canEditSlot(slot);
    const isMine = slot.id === this.opts.localSlotId || (this.opts.mode === 'solo' && index === 0);
    const isPickTarget = this.pickSlotId === slot.id;

    panel.classList.toggle('pick-target', isPickTarget);

    const head = el('div', 'lobby-slot-head');
    head.append(el('span', 'lobby-slot-title', `Player ${index + 1}`));
    if (slot.claimedBy) {
      const tag = slot.claimedBy === this.opts.connId ? ' (You)' : slot.claimedBy === 'local' ? ' (You)' : ' (Taken)';
      head.append(el('span', 'lobby-slot-claim', tag));
    }
    panel.appendChild(head);

    const kindSelect = el('select', 'lobby-select') as HTMLSelectElement;
    for (const kind of ['closed', 'human', 'ai', 'open'] as SlotKind[]) {
      if (this.opts.mode === 'solo' && kind === 'open') continue;
      const opt = el('option', undefined, kind.charAt(0).toUpperCase() + kind.slice(1)) as HTMLOptionElement;
      opt.value = kind;
      kindSelect.appendChild(opt);
    }
    kindSelect.value = slot.kind;
    kindSelect.disabled = !this.canEditKind();
    kindSelect.addEventListener('change', () => {
      slot.kind = kindSelect.value as SlotKind;
      if (slot.kind === 'ai' && !slot.aiDifficulty) slot.aiDifficulty = 'normal';
      if (slot.kind === 'human' && this.opts.mode === 'solo' && index === 0) slot.claimedBy = 'local';
      if (slot.kind !== 'human' && slot.kind !== 'open') {
        slot.claimedBy = null;
        slot.ready = false;
      }
      if (slot.kind === 'closed') slot.startIndex = null;
      this.pushUpdate();
      this.refresh();
    });

    const teamSelect = el('select', 'lobby-select') as HTMLSelectElement;
    for (const team of TEAM_LABELS) {
      const opt = el('option', undefined, teamLabelDisplay(team)) as HTMLOptionElement;
      opt.value = team;
      teamSelect.appendChild(opt);
    }
    teamSelect.value = slot.team;
    teamSelect.disabled = !canEdit;
    teamSelect.addEventListener('change', () => {
      slot.team = teamSelect.value as LobbySlot['team'];
      this.pushUpdate();
      this.refresh();
    });

    const posSelect = el('select', 'lobby-select lobby-select-narrow') as HTMLSelectElement;
    const dash = el('option', undefined, '-') as HTMLOptionElement;
    dash.value = '';
    posSelect.appendChild(dash);
    const count = this.spawnCount();
    for (let p = 0; p < count; p++) {
      const opt = el('option', undefined, String(p + 1)) as HTMLOptionElement;
      opt.value = String(p);
      if (this.isPositionTaken(p, slot.id)) opt.disabled = true;
      posSelect.appendChild(opt);
    }
    posSelect.value = slot.startIndex === null ? '' : String(slot.startIndex);
    posSelect.disabled = !canEdit || slot.kind === 'closed';
    posSelect.addEventListener('change', () => {
      slot.startIndex = posSelect.value === '' ? null : Number(posSelect.value);
      this.pushUpdate();
      this.refresh();
    });

    const swatches = el('div', 'lobby-swatches');
    for (const color of DEFAULT_COLORS) {
      const sw = el('button', 'lobby-swatch');
      sw.type = 'button';
      sw.style.background = color;
      sw.disabled = !canEdit;
      if (slot.color.toLowerCase() === color.toLowerCase()) sw.classList.add('active');
      sw.addEventListener('click', () => {
        slot.color = color;
        this.pushUpdate();
        this.refresh();
      });
      swatches.appendChild(sw);
    }

    const diffSelect = el('select', 'lobby-select') as HTMLSelectElement;
    for (const d of ['easy', 'normal', 'hard'] as AiDifficulty[]) {
      const opt = el('option', undefined, d.charAt(0).toUpperCase() + d.slice(1)) as HTMLOptionElement;
      opt.value = d;
      diffSelect.appendChild(opt);
    }
    diffSelect.value = slot.aiDifficulty ?? 'normal';
    diffSelect.disabled = !canEdit || slot.kind !== 'ai';
    diffSelect.addEventListener('change', () => {
      slot.aiDifficulty = diffSelect.value as AiDifficulty;
      this.pushUpdate();
    });

    const factionSelect = el('select', 'lobby-select') as HTMLSelectElement;
    for (const faction of this.opts.registry.factions.values()) {
      const opt = el('option', undefined, faction.name) as HTMLOptionElement;
      opt.value = faction.id;
      factionSelect.appendChild(opt);
    }
    factionSelect.value = slot.factionId || this.state.factionId;
    factionSelect.disabled = !canEdit;
    factionSelect.addEventListener('change', () => {
      slot.factionId = factionSelect.value;
      this.pushUpdate();
    });

    const grid = el('div', 'lobby-slot-grid');
    appendField(grid, 'Type', kindSelect);
    appendField(grid, 'Team', teamSelect);
    if (slot.kind !== 'closed') {
      appendField(grid, 'Position', posSelect);
      appendField(grid, 'Color', swatches);
    }
    if (slot.kind === 'ai') appendField(grid, 'AI', diffSelect);
    if (slot.kind !== 'closed') appendField(grid, 'Faction', factionSelect);
    panel.appendChild(grid);

    const actions = el('div', 'lobby-slot-actions');

    if (this.opts.mode === 'guest' && isMine && slot.claimedBy === this.opts.connId) {
      const readyBtn = el('button', 'btn', slot.ready ? 'Unready' : 'Ready');
      readyBtn.addEventListener('click', () => {
        slot.ready = !slot.ready;
        this.opts.lobbyClient?.setReady(slot.id, slot.ready ?? false);
        this.refresh();
      });
      actions.appendChild(readyBtn);
    }

    if (this.opts.mode === 'guest' && !slot.claimedBy && (slot.kind === 'human' || slot.kind === 'open')) {
      const claimBtn = el('button', 'btn', 'Claim Slot');
      claimBtn.addEventListener('click', () => {
        this.opts.lobbyClient?.claimSlot(slot.id, slot.team, slot.color, slot.startIndex, slot.factionId);
      });
      actions.appendChild(claimBtn);
    }

    if (actions.childElementCount > 0) panel.appendChild(actions);

    if (slot.kind === 'closed') panel.classList.add('closed');
    else panel.classList.remove('closed');
  }

  private canEditSlot(slot: LobbySlot): boolean {
    if (this.opts.mode === 'solo') return true;
    if (this.opts.mode === 'host') return true;
    if (slot.claimedBy === this.opts.connId) return true;
    if (!slot.claimedBy && (slot.kind === 'human' || slot.kind === 'open')) return true;
    return false;
  }

  private canEditKind(): boolean {
    return this.opts.mode === 'host' || this.opts.mode === 'solo';
  }

  private wireNetwork(client: LobbyClient): void {
    client.onLobbyState = (state) => {
      this.setRemoteState(state);
    };
    client.onWaiting = (count, max) => {
      this.setStatus(`Players connected: ${count}/${max}`);
    };
    client.onError = (msg) => this.showError(msg);
  }

  private pushUpdate(): void {
    if (this.opts.mode === 'host') this.opts.lobbyClient?.updateLobby(this.state);
    this.refresh();
  }

  private refresh(): void {
    this.mapSelect.value = this.state.mapId;
    this.factionSelect.value = this.state.factionId;
    for (let i = 0; i < 4; i++) {
      this.renderSlotPanel(this.slotEls[i]!, this.state.slots[i]!, i);
    }

    this.mapPreview.setSize(lobbyMapSize());
    this.mapPreview.setAssignments(this.state.slots);
    this.mapPreview.render();

    const map = this.opts.registry.map(this.state.mapId);
    const validation = validateLobby(this.state, this.opts.mode, map, this.opts.localSlotId);
    const hasError = !validation.valid;
    this.errorEl.style.display = hasError ? 'block' : 'none';
    this.errorEl.textContent = hasError ? validation.errors[0] ?? '' : '';
    this.bannerEl.style.display = hasError || this.statusEl.textContent ? 'block' : 'none';

    if (this.opts.mode === 'solo') {
      this.actionBtn.textContent = 'Start';
      this.actionBtn.disabled = !validation.valid;
    } else if (this.opts.mode === 'host') {
      this.actionBtn.textContent = 'Start Match';
      this.actionBtn.disabled = !validation.valid;
    } else {
      this.actionBtn.textContent = 'Waiting for host…';
      this.actionBtn.disabled = true;
    }

    const editable = this.opts.mode !== 'guest';
    this.mapSelect.disabled = !editable || this.opts.mode !== 'host';
    this.factionSelect.disabled = !editable || this.opts.mode !== 'host';
    this.templateSelect.disabled = this.opts.mode === 'guest';
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  showError(text: string): void {
    this.errorEl.textContent = text;
    this.errorEl.style.display = 'block';
  }

  getState(): LobbyState {
    return this.state;
  }

  setLocalSlotId(slotId: string): void {
    this.opts.localSlotId = slotId;
    this.pickSlotId = slotId as SlotId;
    this.refresh();
  }

  setRemoteState(state: LobbyState): void {
    this.state = state;
    this.mapPreview.setMap(this.opts.registry.map(this.state.mapId));
    this.refresh();
  }

  private onAction(): void {
    const map = this.opts.registry.map(this.state.mapId);
    const validation = validateLobby(this.state, this.opts.mode, map, this.opts.localSlotId);
    if (!validation.valid) return;

    if (this.opts.mode === 'host') {
      this.opts.lobbyClient?.startMatch();
      return;
    }

    const seed = this.state.seed ?? Math.floor(Math.random() * 0xffffffff);
    this.opts.onStart({ ...this.state, seed });
  }

  destroy(): void {
    this.root.remove();
  }
}
