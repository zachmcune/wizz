// RESULTS — who won, why, and what to do next. Reads the real end state from the session.
import type { App } from '../app';
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

  const head = el('header', 'results-head');
  head.append(
    el('span', 'eyebrow', 'Match complete'),
    el('h1', `display results-title${iWon ? ' is-win' : ''}`, winnerTeam === null ? 'Draw' : iWon ? 'Victory' : 'Defeat'),
    el('p', 'results-sub muted',
      winnerTeam === null      ? 'Both sides were spent at the same moment.'
        : iWon
          ? 'The ley-line is yours.'
          : 'Your rival holds the field.'),
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
      nameCell.append(bar, el('span', undefined, p.id === ctrl?.me ? `${p.id} (you)` : p.id));
      row.append(
        nameCell,
        el('span', 'dim', p.factionId ?? '—'),
        el('span', 'num', String(units)),
        el('span', 'num dim', String(Math.max(0, units))),
        el('span', `badge${p.team === winnerTeam ? ' badge--ok' : ''}`, p.team === winnerTeam ? 'Winner' : 'Defeated'),
      );
      table.append(row);
    }
  }
  board.body.append(table);

  // ---- stats
  const stats = panel({ title: 'Match stats' });
  const t = ctrl ? ctrl.elapsedSeconds : 0;
  stats.body.append(
    statRow('Duration', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`),
    statRow('Ticks simulated', String(st?.tick ?? 0)),
    statRow('Peak entities', String(st ? st.entities.count : 0)),
    rule(),
    el('span', 'eyebrow', 'Map'),
    el('span', 'muted', st?.mapId ?? '—'),
  );

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

function statRow(label: string, value: string): HTMLElement {
  const r = el('div', 'row row--between');
  r.append(el('span', 'dim', label), el('span', 'num', value));
  return r;
}

void gauge;
