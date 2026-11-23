// SKIRMISH LOBBY — the match setup console.
//
// The shape is the C&C skirmish screen: a seat list down one side, the map selection beside it, and one
// primary Start control anchored in a fixed place. Everything a player changes is a big tap target with
// a visible current value, and nothing requires scrolling to reach the action.
//
// Fixes the v1 lobby's two reported defects by construction:
//   • [E21] red error before user input: there is NO validation banner on first render. Players are
//     seeded from a valid default, so the lobby is always startable. Errors appear only when an action
//     actually fails.
//   • corners are auto-assigned (`assignStartIndices`) and re-assigned whenever the player count
//     changes, so two players can never collide on load.
//
// The map preview is a real minimap drawn from the map's own tile data — the same pixels the radar
// draws — rather than a placeholder box. A player picking a map should see its shape.

import type { App } from '../app';
import { LOBBY_COLORS, assignStartIndices, type LobbyPlayer } from '../state';
import { badge, button, el, panel, rule, teamChip } from '../../ui/kit';
import { iconEl } from '../../ui/kit';

const FACTION_NAMES: Record<string, string> = {
  arcane: 'Arcane Dominion',
  obsidian: 'Obsidian Pact',
  verdant: 'Verdant Concord',
};

const FACTION_NOTES: Record<string, string> = {
  arcane: 'Balanced summons and ley economy',
  obsidian: 'Heavy siege and fortification',
  verdant: 'Fast troops and healing groves',
};

export function mountLobby(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--lobby');
  const registry = app.registry;
  let tab: 'map' | 'seats' | 'rules' = 'map';
  let busy = false;

  // ── chrome
  const head = el('header', 'page-head lobby-head');
  const titleBlock = el('div', 'col');
  titleBlock.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'SKIRMISH'));
  const headRight = el('div', 'row');
  const countBadge = badge('2 players');
  headRight.append(countBadge);
  head.append(titleBlock, el('div', 'spacer'), headRight);

  const grid = el('div', 'lobby');

  // ── seats panel
  const seats = panel({ title: 'Commanders', accent: true, className: 'lobby__seats' });
  const seatList = el('div', 'col lobby-seats');
  seats.body.append(seatList);

  const addRow = el('div', 'row lobby-add');
  const addAi = button({ variant: 'quiet', icon: 'train', label: 'Add AI', size: 'sm' });
  addAi.dataset.testid = 'lobby-add-ai';
  const removeLast = button({ variant: 'quiet', icon: 'close', label: 'Remove', size: 'sm' });
  removeLast.dataset.testid = 'lobby-remove';
  addRow.append(addAi, removeLast);
  seats.body.append(rule(), addRow);

  // ── settings panel
  const settings = panel({ title: 'Match setup', className: 'lobby__settings' });
  const tabStripHost = el('div', 'lobby-tabs');
  const body = el('div', 'col lobby-settings');
  settings.body.append(tabStripHost, body);

  const foot = el('footer', 'lobby__foot');
  const back = button({ variant: 'quiet', icon: 'chevron-left', label: 'Back', onClick: () => app.go('menu') });
  back.dataset.testid = 'lobby-back';
  const start = button({
    variant: 'primary',
    size: 'lg',
    icon: 'flag',
    label: 'Start match',
    onClick: () => {
      if (busy) return;
      busy = true;
      start.disabled = true;
      start.textContent = 'Starting…';
      void app
        .startMatch()
        .catch((e: unknown) => {
          busy = false;
          start.disabled = false;
          start.textContent = 'Start match';
          showError(String(e));
        });
    },
  });
  start.dataset.testid = 'start-match';
  foot.append(back, el('div', 'spacer'), el('span', 'lobby__summary', ''), start);

  const errorBox = el('div', 'lobby-error');
  errorBox.dataset.testid = 'lobby-error';

  grid.append(seats.root, settings.root);
  root.append(head, errorBox, grid, foot);

  const summary = foot.querySelector('.lobby__summary') as HTMLElement;

  function showError(msg: string): void {
    errorBox.textContent = msg;
    errorBox.classList.add('is-on');
  }
  function clearError(): void {
    errorBox.textContent = '';
    errorBox.classList.remove('is-on');
  }

  // ── seat rendering
  function renderSeats(): void {
    const cfg = app.appState.lobby;
    seatList.replaceChildren();
    for (let i = 0; i < cfg.players.length; i++) {
      const p = cfg.players[i]!;
      const row = el('div', 'lobby-seat');
      row.dataset.player = p.id;

      const chip = teamChip(p.name, colorName(p.color), p.controller === 'ai' ? (p.aiDifficulty ?? 'ai') : 'you');
      row.append(chip);

      const controls = el('div', 'lobby-seat__controls');

      // Faction
      const fac = el('select', 'lobby-select');
      fac.dataset.testid = `faction-${p.id}`;
      fac.setAttribute('aria-label', `Faction for ${p.name}`);
      for (const fid of registry.factions.keys()) {
        const o = el('option', undefined, FACTION_NAMES[fid] ?? fid);
        o.value = fid;
        if (fid === p.factionId) o.selected = true;
        fac.append(o);
      }
      fac.addEventListener('change', () => {
        p.factionId = fac.value;
        clearError();
        renderSeats();
      });
      controls.append(fac);

      // Controller: the first seat is always human — someone has to play.
      if (i > 0) {
        const ctrl = el('select', 'lobby-select lobby-select--ctrl');
        ctrl.setAttribute('aria-label', `Controller for ${p.name}`);
        for (const [v, lbl] of [
          ['ai', 'AI'],
          ['human', 'Human'],
        ] as const) {
          const o = el('option', undefined, lbl);
          o.value = v;
          if (v === p.controller) o.selected = true;
          ctrl.append(o);
        }
        ctrl.addEventListener('change', () => {
          p.controller = ctrl.value as 'human' | 'ai';
          renderSeats();
          clearError();
        });
        controls.append(ctrl);

        if (p.controller === 'ai') {
          const diff = el('select', 'lobby-select lobby-select--diff');
          diff.dataset.testid = `difficulty-${p.id}`;
          diff.setAttribute('aria-label', `Difficulty for ${p.name}`);
          for (const d of ['easy', 'normal', 'hard'] as const) {
            const o = el('option', undefined, d[0]!.toUpperCase() + d.slice(1));
            o.value = d;
            if ((p.aiDifficulty ?? 'normal') === d) o.selected = true;
            diff.append(o);
          }
          diff.addEventListener('change', () => {
            p.aiDifficulty = diff.value as 'easy' | 'normal' | 'hard';
          });
          controls.append(diff);
        }

        if (cfg.players.length > 2) {
          const team = el('select', 'lobby-select lobby-select--team');
          team.setAttribute('aria-label', `Team for ${p.name}`);
          for (const t of [0, 1] as const) {
            const o = el('option', undefined, `Team ${t + 1}`);
            o.value = String(t);
            if (p.team === t) o.selected = true;
            team.append(o);
          }
          team.addEventListener('change', () => {
            p.team = Number(team.value) as 0 | 1;
            reassignColors();
            renderSeats();
            clearError();
          });
          controls.append(team);
        }
      }

      row.append(controls);
      seatList.append(row);
    }
    countBadge.textContent = `${cfg.players.length} players`;
    addAi.disabled = cfg.players.length >= 4;
    removeLast.disabled = cfg.players.length <= 2;
    updateSummary();
  }

  function updateSummary(): void {
    const cfg = app.appState.lobby;
    const map = registry.map(cfg.mapId);
    const humans = cfg.players.filter((p) => p.controller === 'human').length;
    summary.textContent = `${map.name} · ${cfg.players.length} players · ${humans === 1 ? '1 human vs AI' : `${humans} humans`}`;
  }

  function colorName(hex: string): 'blue' | 'red' | 'green' | 'gold' {
    const idx = LOBBY_COLORS.findIndex((c) => c.color === hex);
    return (['blue', 'red', 'green', 'gold'] as const)[idx >= 0 ? idx : 0]!;
  }

  /** Keep player colours distinct and stably mapped to their slot. */
  function reassignColors(): void {
    const cfg = app.appState.lobby;
    cfg.players.forEach((p, i) => {
      p.color = LOBBY_COLORS[i % LOBBY_COLORS.length]!.color;
    });
  }

  function addPlayer(): void {
    const cfg = app.appState.lobby;
    if (cfg.players.length >= 4) return;
    const n = cfg.players.length;
    const factionIds = [...registry.factions.keys()];
    const p: LobbyPlayer = {
      id: `player${n}`,
      name: n === 1 ? 'Rival' : `Rival ${n}`,
      controller: 'ai',
      team: (n % 2) as 0 | 1,
      color: LOBBY_COLORS[n % LOBBY_COLORS.length]!.color,
      factionId: factionIds[0] ?? 'arcane',
      startIndex: n,
      aiDifficulty: 'normal',
    };
    cfg.players.push(p);
    reassignColors();
    normalizeTeams();
    assignCorners();
    renderSeats();
    renderSettings();
    clearError();
  }

  function removePlayer(): void {
    const cfg = app.appState.lobby;
    if (cfg.players.length <= 2) return;
    cfg.players.pop();
    reassignColors();
    normalizeTeams();
    assignCorners();
    renderSeats();
    renderSettings();
    clearError();
  }

  /** With exactly two players they must be on opposite teams, or the match has no opponent. */
  function normalizeTeams(): void {
    const cfg = app.appState.lobby;
    if (cfg.players.length === 2) {
      cfg.players[0]!.team = 0;
      cfg.players[1]!.team = 1;
    }
  }

  /** Corners are the lobby's job so no two players can collide on load (v1's red-error bug). */
  function assignCorners(): void {
    const cfg = app.appState.lobby;
    const map = registry.map(cfg.mapId);
    cfg.players = assignStartIndices(cfg.players, map.startLocations.length);
  }

  // ── tabs
  function renderTabs(): void {
    tabStripHost.replaceChildren();
    const strip = el('div', 'tabs', undefined, { role: 'tablist' });
    for (const t of [
      { id: 'map', label: 'Map' },
      { id: 'seats', label: 'Teams' },
      { id: 'rules', label: 'Rules' },
    ] as const) {
      const b = el('button', 'tab', undefined, {
        type: 'button',
        role: 'tab',
        'aria-selected': String(tab === t.id),
      });
      b.dataset.tab = t.id;
      b.dataset.testid = `lobby-tab-${t.id}`;
      b.append(el('span', undefined, t.label));
      b.addEventListener('click', () => {
        tab = t.id;
        renderTabs();
        renderSettings();
      });
      strip.append(b);
    }
    tabStripHost.append(strip);
  }

  // ── per-tab settings
  function renderSettings(): void {
    body.replaceChildren();
    const cfg = app.appState.lobby;

    if (tab === 'map') {
      const list = el('div', 'lobby-maplist');
      for (const m of registry.maps.values()) {
        const on = m.id === cfg.mapId;
        const card = el('button', `lobby-mapcard${on ? ' is-on' : ''}`, undefined, { type: 'button' });
        card.dataset.map = m.id;
        card.dataset.testid = `map-${m.id}`;
        // A REAL minimap from the map's own tiles: a player choosing a map should see its shape.
        const preview = el('canvas', 'lobby-mapcard__preview') as HTMLCanvasElement;
        preview.width = 96;
        preview.height = 66;
        drawMapPreview(preview, m.tiles, m.tileW, m.tileH);
        card.append(preview);
        const text = el('span', 'lobby-mapcard__text');
        text.append(
          el('span', 'lobby-mapcard__name', m.name),
          el('span', 'lobby-mapcard__note dim', `${m.maxPlayers} players · ${m.tileW}×${m.tileH} tiles`),
        );
        card.append(text);
        if (on) card.append(badge('Selected', 'ok'));
        card.addEventListener('click', () => {
          cfg.mapId = m.id;
          assignCorners();
          renderSettings();
          renderSeats();
          clearError();
        });
        list.append(card);
      }
      body.append(el('span', 'eyebrow', 'Battlefield'), list);

      const map = registry.map(cfg.mapId);
      if (map.maxPlayers < cfg.players.length) {
        body.append(el('p', 'lobby-hint', `${map.name} supports up to ${map.maxPlayers} players.`));
      }
      return;
    }

    if (tab === 'seats') {
      body.append(
        el('span', 'eyebrow', 'Team assignment'),
        el('p', 'lobby-hint muted', 'Spawn corners are assigned automatically so no two players share one.'),
      );
      const teams = el('div', 'lobby-teams');
      for (const t of [0, 1] as const) {
        const col = el('div', 'lobby-team');
        const bar = el('span', 'lobby-team__bar');
        bar.style.setProperty('--team', LOBBY_COLORS[t * 1]?.color ?? LOBBY_COLORS[0]!.color);
        col.append(bar, el('span', 'eyebrow', `Team ${t + 1}`));
        for (const p of cfg.players.filter((x) => x.team === t)) {
          col.append(el('span', 'lobby-team__member', `${p.name} · corner ${p.startIndex + 1}`));
        }
        teams.append(col);
      }
      body.append(teams);
      return;
    }

    const speedRow = el('div', 'lobby-option');
    const speedVal = el('span', 'num lobby-option__value', `${cfg.speed.toFixed(2)}×`);
    const speedBtns = el('div', 'row lobby-choices');
    for (const s of [0.5, 1, 1.5, 2] as const) {
      speedBtns.append(
        button({
          size: 'sm',
          variant: cfg.speed === s ? 'primary' : 'default',
          label: `${s}×`,
          onClick: () => {
            cfg.speed = s;
            renderSettings();
          },
        }),
      );
    }
    speedRow.append(el('span', 'lobby-option__label', 'Game speed'), speedBtns, speedVal);
    body.append(speedRow, rule());

    // The faction blurbs belong here: a player choosing a side needs to know what it does.
    const facList = el('div', 'lobby-factions');
    for (const f of registry.factions.values()) {
      const card = el('div', 'lobby-faction');
      card.append(
        iconEl(factionIcon(f.id) as never, 18),
        el('span', 'lobby-faction__name', FACTION_NAMES[f.id] ?? f.name),
        el('span', 'lobby-faction__note dim', f.playstyle ?? FACTION_NOTES[f.id] ?? f.description),
      );
      facList.append(card);
    }
    body.append(el('span', 'eyebrow', 'Factions'), facList, rule());

    body.append(
      el('p', 'lobby-hint muted',
        'Sandbox mode is available from the main menu. It adds dev commands, unit spawning and free ' +
        'resources without changing the rules of a normal match.'),
    );
  }

  function factionIcon(id: string): string {
    const map: Record<string, string> = { arcane: 'crystal', obsidian: 'shield', verdant: 'research' };
    return map[id] ?? 'flag';
  }

  addAi.addEventListener('click', addPlayer);
  removeLast.addEventListener('click', removePlayer);

  assignCorners();
  renderTabs();
  renderSeats();
  renderSettings();
  clearError();

  return {
    root,
    destroy: () => {
      // Nothing global to release: all listeners are on elements that are about to be removed.
    },
  };
}

/** Draw a map's passability as a two-tone preview. The same data the radar uses. */
export function drawMapPreview(canvas: HTMLCanvasElement, tiles: number[], tileW: number, tileH: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const sx = W / tileW;
  const sy = H / tileH;
  const blocked = getComputedStyle(document.documentElement).getPropertyValue('--ink-500').trim() || '#3e4650';
  const ground = getComputedStyle(document.documentElement).getPropertyValue('--ink-800').trim() || '#1e2228';
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = blocked;
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      if (tiles[ty * tileW + tx] !== 1) continue;
      ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
    }
  }
}
