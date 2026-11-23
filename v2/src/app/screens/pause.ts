// PAUSE — a command console over the frozen match, not a separate page.
//
// The match stays rendered behind it, dimmed by a hard ink plate, so the player keeps their spatial
// context: a full screen replacement at pause is disorienting in an RTS. The panel is the same
// Obsidian & Brass plate as everything else, with the match's own numbers on it so the screen reports
// where the game stands rather than being a lone Resume button on an empty field.
//
// Actions are ordered by what a phone player actually wants, with Resume the single primary and Quit at
// the bottom behind the danger treatment. Restart and Settings are secondary plates, never competing
// with Resume for the eye.

import type { App } from '../app';
import { button, el, panel, rule } from '../../ui/kit';
import { iconEl } from '../../ui/kit';
import { KIND_BUILDING, KIND_UNIT } from '../../sim/entity-store';

export function mountPause(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--overlay');
  const ctrl = app.session;
  if (ctrl) ctrl.setPaused(true);

  const card = panel({ title: 'Command paused', accent: true, className: 'pause-card' });
  card.root.dataset.testid = 'pause-card';

  const t = ctrl ? ctrl.elapsedSeconds : 0;
  const st = ctrl?.state;
  const me = st?.players.find((p) => p.controller === 'human');

  // ---- readout: the state of the battle, not decoration
  const stats = el('div', 'pause-stats');
  const stat = (label: string, value: string, testid?: string): HTMLElement => {
    const row = el('div', 'pause-stat');
    const val = el('span', 'pause-stat__value num', value);
    if (testid) row.dataset.testid = testid;
    row.append(el('span', 'pause-stat__label', label), val);
    return row;
  };
  let units = 0;
  let buildings = 0;
  if (st) {
    const myIndex = st.players.findIndex((p) => p.controller === 'human');
    for (let i = 0; i < st.entities.count; i++) {
      if (st.entities.dead[i] || st.entities.ownerIndex[i] !== myIndex) continue;
      if (st.entities.kind[i] === KIND_UNIT) units++;
      else if (st.entities.kind[i] === KIND_BUILDING) buildings++;
    }
  }
  stats.append(
    stat('Match time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 'pause-time'),
    stat('Mana', me ? String(Math.round(me.mana)) : '—', 'pause-mana'),
    stat('Units', String(units)),
    stat('Structures', String(buildings)),
  );
  card.body.append(stats, rule());

  // ---- the actions. Resume is the only primary.
  const actions = el('div', 'pause-actions');
  const resume = button({
    variant: 'primary',
    size: 'lg',
    icon: 'move',
    label: 'RESUME',
    block: true,
    onClick: () => app.resume(),
  });
  resume.dataset.testid = 'pause-resume';
  resume.classList.add('pause-action');

  const row2 = el('div', 'pause-row');
  const restart = button({
    size: 'lg',
    icon: 'research',
    label: 'Restart',
    block: true,
    onClick: () => app.restart(),
  });
  restart.dataset.testid = 'pause-restart';
  const settings = button({
    size: 'lg',
    icon: 'gear',
    label: 'Settings',
    block: true,
    onClick: () => app.go('settings'),
  });
  settings.dataset.testid = 'pause-settings';
  row2.append(restart, settings);

  const quit = button({
    variant: 'danger',
    size: 'lg',
    icon: 'close',
    label: 'Quit to menu',
    block: true,
    onClick: () => app.quitToMenu(),
  });
  quit.dataset.testid = 'pause-quit';

  actions.append(resume, row2, quit);
  card.body.append(actions);

  // A footer note that names the real controls, because a paused screen is where a player looks for them.
  const note = el('p', 'pause-note dim');
  note.append(
    iconEl('move', 12),
    el('span', undefined, 'Touch: tap to select, drag to pan, pinch to zoom. Keyboard: WASD pan, +/− zoom, Esc pause.'),
  );
  card.body.append(note);

  root.append(card.root);

  return {
    root,
    destroy: () => {
      // Do not auto-resume: leaving pause via Settings should keep the match frozen.
    },
  };
}
