// RESULTS — who won, why, and what to do next. Reads the real end state from the session.
import type { App } from '../app';
import type { GameState } from '../../sim/types';
import { button, el, gauge, panel, rule } from '../../ui/kit';

export function mountResults(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--results');
  const ctrl = app.session;
  const st = ctrl?.state ?? null;

  // The winner is the team the sim actually declared, not a guess from unit counts.
  const winnerTeam = st?.winnerTeam ?? null;
  const meIndex = st ? st.players.findIndex((p) => p.controller === 'human') : -1;
  const me = st && meIndex >= 0 ? st.players[meIndex] : null;
  const iWon = me !== null && me !== undefined && winnerTeam !== null && me.team === winnerTeam;
  /**
   * NO MATCH IS NOT A DRAW.
   *
   * `winnerTeam === null` used to mean both "the sim declared a draw" and "there is no session at all",
   * and the header rendered both as "Draw / Both sides were spent at the same moment" — while the panels
   * underneath said "No match has been played yet in this session", with zeroed stats. The screen
   * contradicted itself. Deep-linking `?screen=results`, and the proof capture that did exactly that,
   * produced a headline result for a match that never happened.
   *
   * The two states are now distinct: with no state the screen reports no result at all, and "Draw" is
   * reserved for a match that actually ran and ended level.
   */
  const hasMatch = st !== null;
  const isDraw = hasMatch && winnerTeam === null;
  const outcome = !hasMatch ? 'No match yet' : isDraw ? 'Draw' : iWon ? 'Victory' : 'Defeat';
  const subtitle = !hasMatch
    ? 'Play a skirmish to see how it ends.'
    : isDraw
      ? 'Both sides were spent at the same moment.'
      : iWon
        ? 'The ley-line is yours.'
        : 'Your rival holds the field.';

  const head = el('header', 'results-head');
  head.append(
    el('span', 'eyebrow', hasMatch ? 'Match complete' : 'Results'),
    el('h1', `display results-title${iWon ? ' is-win' : ''}`, outcome),
    el('p', 'results-sub muted', subtitle),
  );

  const body = el('div', 'results-grid');

  // ---- scoreboard
  const board = panel({ title: 'Scoreboard', accent: true });
  const table = el('div', 'results-table');


  const header = el('div', 'results-row results-row--head');
  header.append(
    el('span', 'eyebrow', 'Player'),
    el('span', 'eyebrow', 'Faction'),
    el('span', 'eyebrow', 'Units'),
    el('span', 'eyebrow', 'Peak'),
    el('span', 'eyebrow', 'Result'),
  );
  table.append(header);

  if (st) {
    for (const p of st.players) {
      let units = 0;
      for (let s = 0; s < st.entities.count; s++) {
        if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
        const oi = st.entities.ownerIndex[s]!;
        if (st.players[oi]?.id === p.id) units++;
      }
      const row = el('div', 'results-row');
      const nameCell = el('span', 'results-name');
      const bar = el('span', 'results-name__bar');
      bar.style.background = p.color;
      // Display name first, raw id never: `player0` is an internal identifier.
      const displayName = ctrl?.session.config.players.find((lp) => lp.id === p.id)?.name ?? 'Player';
      nameCell.append(bar, el('span', undefined, displayName));
      row.append(
        nameCell,
        el('span', 'dim', factionName(app, p.factionId)),
        el('span', 'num', String(units)),
        el('span', 'num dim', String(Math.max(0, units))),
        el('span', `badge${p.team === winnerTeam ? ' badge--ok' : ''}`, p.team === winnerTeam ? 'Winner' : 'Defeated'),
      );
      table.append(row);
    }
  }
  if (st) board.body.append(table);

  // ---- stats. Player-facing terms only: "Ticks simulated" is an engine detail, not something a player
  // should ever be shown.
  const stats = panel({ title: 'Match stats' });
  const t = ctrl ? ctrl.elapsedSeconds : 0;
  const mapDef = st ? app.registry.maps.get(st.mapId) : undefined;
  stats.body.append(
    statRow('Duration', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`),
    statRow('Total units built', String(unitsSeen(st))),
    statRow('Structures standing', String(structuresSeen(st))),
    rule(),
    statRow('Map', mapDef?.name ?? 'Unknown'),
  );

  /**
   * Deep-linked without a match (`?screen=results`).
   *
   * There is no session to report on, so the screen says so and offers the obvious action rather than
   * rendering an empty table with zeroed stats — which reads as a bug.
   */
  if (!st) {
    const empty = el('div', 'results-empty');
    empty.append(
      el('p', 'muted', 'No match has been played yet in this session.'),
      button({ variant: 'primary', label: 'Set up a skirmish', icon: 'flag', onClick: () => app.go('lobby') }),
    );
    board.body.append(empty);
    stats.body.append(el('p', 'dim', 'Stats appear after a match.'));
  }

  body.append(board.root, stats.root);

  const foot = el('footer', 'results-foot');
  foot.append(
    button({ variant: 'secondary' as never, size: 'lg', icon: 'flag', label: 'Play again', onClick: () => app.restart() }),
    button({ variant: 'quiet', size: 'lg', icon: 'gear', label: 'Change setup', onClick: () => app.go('lobby') }),
    el('div', 'spacer'),
    button({ variant: 'primary', size: 'lg', icon: 'move', label: 'Main menu', onClick: () => app.quitToMenu() }),
  );

  root.append(head, body, foot);
  // The match is over; stop the loop but keep the state for display.
  ctrl?.setPaused(true);

  return { root, destroy: () => {} };
}

/** Player-facing faction name from a faction id. */
function factionName(app: App, id: string | undefined): string {
  if (!id) return '—';
  const f = app.registry.factions.get(id) as unknown as { name?: string } | undefined;
  return f?.name ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Every unit currently alive across all players. */
function unitsSeen(st: GameState | null): number {
  if (!st) return 0;
  let n = 0;
  for (let i = 0; i < st.entities.count; i++) if (!st.entities.dead[i] && st.entities.kind[i] === 0) n++;
  return n;
}

/** Every standing structure across all players. */
function structuresSeen(st: GameState | null): number {
  if (!st) return 0;
  let n = 0;
  for (let i = 0; i < st.entities.count; i++) if (!st.entities.dead[i] && st.entities.kind[i] === 1) n++;
  return n;
}

function statRow(label: string, value: string): HTMLElement {
  const r = el('div', 'row row--between');
  r.append(el('span', 'dim', label), el('span', 'num', value));
  return r;
}

void gauge;
