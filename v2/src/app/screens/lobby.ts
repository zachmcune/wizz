// LOBBY — 2 to 4 players, factions, map, AI difficulty, live match start.
//
// Fixes the v1 lobby's two reported defects by construction:
//   • [E21] red error before user input: there is NO validation banner on first render. Players are
//     seeded from a valid default, so the lobby is always startable. Errors appear only when an action
//     actually fails.
//   • corners are auto-assigned (`assignStartIndices`) and re-assigned whenever the player count
//     changes, so two players can never collide on load.
//
// The Start button is pinned bottom-right and never moves as settings change; the configuration scrolls
// behind it.
import type { App } from '../app';
import { LOBBY_COLORS, type LobbyPlayer } from '../state';
import { badge, button, el, iconEl, panel, rule, teamChip, tabs } from '../../ui/kit';
import { icon } from '../../ui/icons';

const FACTION_NAMES: Record<string, string> = {
  arcane: 'Arcane Dominion',
  obsidian: 'Obsidian Pact',
  verdant: 'Verdant Concord',
};

export function mountLobby(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--lobby');
  const registry = app.registry;
  let tab: 'map' | 'players' | 'rules' = 'map';
  let busy = false;

  const head = el('header', 'page-head');
  const titleBlock = el('div', 'col');
  titleBlock.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'Skirmish'));
  const headRight = el('div', 'row');
  const countBadge = badge('2 players');
  headRight.append(countBadge);
  head.append(titleBlock, el('div', 'spacer'), headRight);

  const grid = el('div', 'lobby');

  // ---- players panel (always visible: it is the thing people change most)
  const players = panel({ title: 'Players', accent: true, className: 'lobby__players' });
  const playerList = el('div', 'col lobby-players');
  players.body.append(playerList);

  const addRow = el('div', 'row lobby-add');
  const addAi = button({ variant: 'quiet', icon: 'train', label: 'Add AI', size: 'sm' });
  const removeLast = button({ variant: 'quiet', icon: 'close', label: 'Remove', size: 'sm' });
  addRow.append(addAi, removeLast);
  players.body.append(rule(), addRow);

  // ---- settings panel
  const settings = panel({ title: 'Match settings', className: 'lobby__settings' });
  const tabStripHost = el('div');
  const body = el('div', 'col lobby-settings');
  settings.body.append(tabStripHost, body);

  const foot = el('footer', 'lobby__foot');
  const back = button({ variant: 'quiet', label: 'Back', onClick: () => app.go('menu') });
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
  foot.append(back, el('div', 'spacer'), start);

  const errorBox = el('div', 'lobby-error');
  errorBox.dataset.testid = 'lobby-error';

  grid.append(players.root, settings.root);
  root.append(head, errorBox, grid, foot);

  // ───────────────────────────────────────────────────────────────────── error surface
  function showError(msg: string): void {
    errorBox.textContent = msg;
    errorBox.classList.add('is-on');
  }
  function clearError(): void {
    errorBox.textContent = '';
    errorBox.classList.remove('is-on');
  }

  // ───────────────────────────────────────────────────────────────────── render
  function renderPlayers(): void {
    const cfg = app.appState.lobby;
    playerList.replaceChildren();
    for (let i = 0; i < cfg.players.length; i++) {
      const p = cfg.players[i]!;
      const row = el('div', 'lobby-player');
      row.dataset.player = p.id;

      // Team colour as an edge bar only; all text stays achromatic.
      const chip = teamChip(p.name, colorName(p.color), p.controller === 'ai' ? p.aiDifficulty ?? 'ai' : 'you');
      row.append(chip);

      // Faction picker
      const fac = el('select', 'lobby-select');
      fac.dataset.testid = `faction-${p.id}`;
      for (const fid of registry.factions.keys()) {
        const o = el('option', undefined, FACTION_NAMES[fid] ?? fid);
        o.value = fid;
        if (fid === p.factionId) o.selected = true;
        fac.append(o);
      }
      fac.addEventListener('change', () => {
        p.factionId = fac.value;
        clearError();
      });
      row.append(fac);

      // Controller toggle: human/AI. The first player is always human — someone has to play.
      if (i > 0) {
        const ctrl = el('select', 'lobby-select lobby-select--ctrl');
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
          renderPlayers();
        });
        row.append(ctrl);

        if (p.controller === 'ai') {
          const diff = el('select', 'lobby-select lobby-select--diff');
          for (const d of ['easy', 'normal', 'hard'] as const) {
            const o = el('option', undefined, d[0]!.toUpperCase() + d.slice(1));
            o.value = d;
            if ((p.aiDifficulty ?? 'normal') === d) o.selected = true;
            diff.append(o);
          }
          diff.addEventListener('change', () => {
            p.aiDifficulty = diff.value as 'easy' | 'normal' | 'hard';
          });
          row.append(diff);
        }

        // Team picker for 3+ players.
        if (cfg.players.length > 2) {
          const team = el('select', 'lobby-select lobby-select--team');
          for (const t of [0, 1] as const) {
            const o = el('option', undefined, `Team ${t + 1}`);
            o.value = String(t);
            if (p.team === t) o.selected = true;
            team.append(o);
          }
          team.addEventListener('change', () => {
            p.team = Number(team.value) as 0 | 1;
            reassignColors();
            renderPlayers();
          });
          row.append(team);
        }
      }

      playerList.append(row);
    }
    countBadge.textContent = `${cfg.players.length} players`;
    addAi.disabled = cfg.players.length >= 4;
    removeLast.disabled = cfg.players.length <= 2;
    void icon;
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
    renderPlayers();
    clearError();
  }

  function removePlayer(): void {
    const cfg = app.appState.lobby;
    if (cfg.players.length <= 2) return;
    cfg.players.pop();
    reassignColors();
    normalizeTeams();
    renderPlayers();
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

  function renderTabs(): void {
    tabStripHost.replaceChildren(
      tabs(
        [
          { id: 'map', label: 'Map' },
          { id: 'players', label: 'Teams' },
          { id: 'rules', label: 'Rules' },
        ],
        tab,
        (id) => {
          tab = id as typeof tab;
          renderTabs();
          renderSettings();
        },
      ),
    );
  }

  function renderSettings(): void {
    body.replaceChildren();
    const cfg = app.appState.lobby;

    if (tab === 'map') {
      const list = el('div', 'lobby-maplist');
      for (const m of registry.maps.values()) {
        const on = m.id === cfg.mapId;
        const card = el('button', `lobby-mapcard${on ? ' is-on' : ''}`, undefined, { type: 'button' });
        card.dataset.map = m.id;
        card.append(
          el('span', 'lobby-mapcard__name', m.name),
          el('span', 'lobby-mapcard__note dim', `${m.maxPlayers} players · ${m.tileW}×${m.tileH}`),
        );
        if (on) card.append(badge('Selected', 'ok'));
        card.addEventListener('click', () => {
          cfg.mapId = m.id;
          renderSettings();
          clearError();
        });
        list.append(card);
      }
      body.append(el('span', 'eyebrow', 'Map'), list);

      // Warn (neutrally, not in red) when the player count exceeds what the map supports.
      const map = registry.map(cfg.mapId);
      if (map.maxPlayers < cfg.players.length) {
        body.append(el('p', 'lobby-hint', `${map.name} supports up to ${map.maxPlayers} players.`));
      }
      return;
    }

    if (tab === 'players') {
      body.append(
        el('span', 'eyebrow', 'Team assignment'),
        el('p', 'lobby-hint muted', 'Spawn corners are assigned automatically so no two players share one.'),
      );
      const teams = el('div', 'lobby-teams');
      for (const t of [0, 1] as const) {
        const col = el('div', 'lobby-team');
        col.append(el('span', 'eyebrow', `Team ${t + 1}`));
        for (const p of cfg.players.filter((x) => x.team === t)) {
          col.append(el('span', 'lobby-team__member', p.name));
        }
        teams.append(col);
      }
      body.append(teams);
      return;
    }

    const speedRow = el('div', 'row row--between');
    const speedVal = el('span', 'num', `${cfg.speed.toFixed(2)}×`);
    const speedBtns = el('div', 'row');
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
    speedRow.append(el('span', 'dim', 'Game speed'), speedBtns, speedVal);
    body.append(speedRow, rule());

    body.append(
      el('p', 'lobby-hint muted',
        'Sandbox mode is available from the main menu. It adds dev commands, unit spawning and free ' +
        'resources without changing the rules of a normal match.'),
    );
  }

  addAi.addEventListener('click', addPlayer);
  removeLast.addEventListener('click', removePlayer);

  renderTabs();
  renderPlayers();
  renderSettings();
  clearError();

  return {
    root,
    destroy: () => {
      // Nothing global to release: all listeners are on elements that are about to be removed.
    },
  };
}

/** Small helper so the lobby can show a faction emblem without new art. */
export function factionGlyph(factionId: string): string {
  const map: Record<string, string> = { arcane: 'crystal', obsidian: 'shield', verdant: 'research' };
  return icon((map[factionId] ?? 'flag') as never, { size: 16 });
}

void iconEl;
