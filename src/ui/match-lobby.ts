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

function lobbyMapSize(): number {
  const h = window.innerHeight;
  if (h <= 380) return 108;
  if (h <= 460) return 124;
  return 140;
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
  private hintEl = el('p', 'lobby-hint');
  private actionBtn = el('button', 'btn big', 'Start');
  private slotEls: HTMLElement[] = [];
  private mapSelect!: HTMLSelectElement;
  private factionSelect!: HTMLSelectElement;
  private templateSelect!: HTMLSelectElement;
  private roomEl: HTMLElement | null = null;
  private playersEl = el('div', 'lobby-players');
  private mapPreview: LobbyMapPreview;
  private pickSlotId: SlotId | null = null;

  constructor(private opts: MatchLobbyOptions) {
    this.state = structuredClone(opts.initialState);
    this.mapPreview = new LobbyMapPreview(this.opts.registry.map(this.state.mapId), lobbyMapSize());
    this.hintEl.style.display = 'none';
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
    const topRow = el('div', 'lobby-top-row');
    const titleBlock = el('div', 'lobby-title-block');
    titleBlock.append(
      el('h1', 'menu-title lobby-title', 'Match Setup'),
      el('p', 'lobby-map-hint', 'Tap a slot, then tap a number on the map'),
    );
    topRow.append(titleBlock, this.mapPreview.root);

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
        slot.factionId = this.factionSelect.value;
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

    if (this.opts.room) {
      this.roomEl = el('div', 'lobby-room');
      this.roomEl.append(el('span', 'lobby-label', 'Room code'), el('strong', 'lobby-code', this.opts.room));
    }

    for (let i = 0; i < 4; i++) {
      const panel = this.buildSlotPanel(i);
      this.slotEls.push(panel);
      this.playersEl.appendChild(panel);
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
        let assignedHost = false;
        for (const slot of this.state.slots) {
          if (slot.kind === 'human' && !assignedHost) {
            slot.claimedBy = this.opts.connId;
            slot.ready = true;
            assignedHost = true;
          } else if (slot.kind === 'human') {
            slot.kind = 'open';
            slot.claimedBy = null;
            slot.ready = false;
          } else if (slot.kind === 'open') {
            slot.claimedBy = null;
            slot.ready = false;
          }
        }
      }
      this.templateSelect.value = '';
      this.mapPreview.setMap(this.opts.registry.map(this.state.mapId));
      this.pickSlotId = this.defaultPickSlot();
      this.pushUpdate();
      this.refresh();
    });

    const footer = el('div', 'lobby-footer');
    const footerActions = el('div', 'lobby-footer-actions');
    const backBtn = el('button', 'btn', 'Back');
    backBtn.addEventListener('click', () => this.opts.onBack());
    this.actionBtn.addEventListener('click', () => this.onAction());
    footerActions.append(backBtn, this.templateSelect, this.actionBtn);
    footer.append(this.hintEl, footerActions);

    const shell = el('div', 'lobby-shell');
    shell.append(topRow, header, this.roomEl ?? '', this.playersEl, footer);
    this.root.appendChild(shell);
  }

  private buildSlotPanel(index: number): HTMLElement {
    const panel = el('div', 'lobby-player');
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
    panel.classList.toggle('closed', slot.kind === 'closed');

    const name = el('span', 'lobby-player-name', `P${index + 1}`);
    if (slot.claimedBy) {
      const you = slot.claimedBy === this.opts.connId || slot.claimedBy === 'local';
      if (you) name.title = 'You';
    }
    panel.appendChild(name);

    const kindSelect = el('select', 'lobby-select lobby-kind-select') as HTMLSelectElement;
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
      slot.factionId = this.state.factionId;
      this.pushUpdate();
      this.refresh();
    });
    panel.appendChild(kindSelect);

    if (slot.kind === 'closed') return;

    const teamSelect = el('select', 'lobby-select lobby-team-select') as HTMLSelectElement;
    for (const team of TEAM_LABELS) {
      const opt = el('option', undefined, teamLabelDisplay(team)) as HTMLOptionElement;
      opt.value = team;
      teamSelect.appendChild(opt);
    }
    teamSelect.value = slot.team;
    teamSelect.disabled = !canEdit;
    teamSelect.title = 'Team';
    teamSelect.addEventListener('change', () => {
      slot.team = teamSelect.value as LobbySlot['team'];
      this.pushUpdate();
      this.refresh();
    });
    panel.appendChild(teamSelect);

    const posSelect = el('select', 'lobby-select lobby-pos-select') as HTMLSelectElement;
    posSelect.title = 'Starting position';
    const dash = el('option', undefined, '-') as HTMLOptionElement;
    dash.value = '';
    posSelect.appendChild(dash);
    for (let p = 0; p < this.spawnCount(); p++) {
      const opt = el('option', undefined, String(p + 1)) as HTMLOptionElement;
      opt.value = String(p);
      if (this.isPositionTaken(p, slot.id)) opt.disabled = true;
      posSelect.appendChild(opt);
    }
    posSelect.value = slot.startIndex === null ? '' : String(slot.startIndex);
    posSelect.disabled = !canEdit;
    posSelect.addEventListener('change', () => {
      slot.startIndex = posSelect.value === '' ? null : Number(posSelect.value);
      this.pushUpdate();
      this.refresh();
    });
    panel.appendChild(posSelect);

    if (slot.kind === 'ai') {
      const diffSelect = el('select', 'lobby-select lobby-ai-select') as HTMLSelectElement;
      diffSelect.title = 'AI difficulty';
      for (const d of ['easy', 'normal', 'hard'] as AiDifficulty[]) {
        const opt = el('option', undefined, d.charAt(0).toUpperCase() + d.slice(1)) as HTMLOptionElement;
        opt.value = d;
        diffSelect.appendChild(opt);
      }
      diffSelect.value = slot.aiDifficulty ?? 'normal';
      diffSelect.disabled = !canEdit;
      diffSelect.addEventListener('change', () => {
        slot.aiDifficulty = diffSelect.value as AiDifficulty;
        this.pushUpdate();
      });
      panel.appendChild(diffSelect);
    }

    const swatches = el('div', 'lobby-swatches');
    for (const color of DEFAULT_COLORS) {
      const sw = el('button', 'lobby-swatch');
      sw.type = 'button';
      sw.style.background = color;
      sw.disabled = !canEdit;
      sw.title = 'Color';
      if (slot.color.toLowerCase() === color.toLowerCase()) sw.classList.add('active');
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        slot.color = color;
        this.pushUpdate();
        this.refresh();
      });
      swatches.appendChild(sw);
    }
    panel.appendChild(swatches);

    if (this.opts.mode === 'guest' && isMine && slot.claimedBy === this.opts.connId) {
      const readyBtn = el('button', 'btn lobby-mini-btn', slot.ready ? '…' : '✓');
      readyBtn.title = slot.ready ? 'Unready' : 'Ready';
      readyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        slot.ready = !slot.ready;
        this.opts.lobbyClient?.setReady(slot.id, slot.ready ?? false);
        this.refresh();
      });
      panel.appendChild(readyBtn);
    }

    if (this.opts.mode === 'guest' && !slot.claimedBy && (slot.kind === 'human' || slot.kind === 'open')) {
      const claimBtn = el('button', 'btn lobby-mini-btn', '+');
      claimBtn.title = 'Claim slot';
      claimBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.opts.lobbyClient?.claimSlot(slot.id, slot.team, slot.color, slot.startIndex, slot.factionId);
      });
      panel.appendChild(claimBtn);
    }
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
    client.onLobbyState = (state) => this.setRemoteState(state);
    client.onWaiting = (count, max) => this.setHint(`Players connected: ${count}/${max}`);
    client.onError = (msg) => this.setHint(msg, true);
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
    if (!validation.valid) {
      this.setHint(validation.errors[0] ?? 'Invalid setup', true);
    } else {
      this.hintEl.style.display = 'none';
      this.hintEl.textContent = '';
    }

    if (this.opts.mode === 'solo') {
      this.actionBtn.textContent = 'Start';
      this.actionBtn.disabled = !validation.valid;
    } else if (this.opts.mode === 'host') {
      this.actionBtn.textContent = 'Start Match';
      this.actionBtn.disabled = !validation.valid;
    } else {
      this.actionBtn.textContent = 'Waiting…';
      this.actionBtn.disabled = true;
    }

    const editable = this.opts.mode !== 'guest';
    this.mapSelect.disabled = !editable || this.opts.mode !== 'host';
    this.factionSelect.disabled = !editable || this.opts.mode !== 'host';
    this.templateSelect.disabled = this.opts.mode === 'guest';
  }

  setHint(text: string, isError = false): void {
    this.hintEl.textContent = text;
    this.hintEl.style.display = text ? 'block' : 'none';
    this.hintEl.classList.toggle('error', isError);
  }

  setStatus(text: string): void {
    this.setHint(text, false);
  }

  showError(text: string): void {
    this.setHint(text, true);
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
