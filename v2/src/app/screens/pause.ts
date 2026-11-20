// PAUSE — an overlay over the frozen match, not a separate page.
//
// Kept deliberately small: resume, restart, settings, surrender. The match stays rendered behind it, so
// the player keeps their spatial context — a full screen replacement at pause is disorienting in an RTS.
import type { App } from '../app';
import { button, el, panel, rule } from '../../ui/kit';

export function mountPause(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--overlay');
  const ctrl = app.session;
  if (ctrl) ctrl.setPaused(true);

  const card = panel({ title: 'Paused', accent: true, className: 'pause-card' });
  const t = ctrl ? ctrl.elapsedSeconds : 0;

  // A pause screen should tell you where you are, not just offer a Resume button. These read live state.
  const st = ctrl?.state;
  const me = st?.players.find((p) => p.controller === 'human');
  const stats = el('div', 'pause-stats');
  const stat = (label: string, value: string): HTMLElement => {
    const row = el('div', 'pause-stat');
    row.append(el('span', 'pause-stat__label', label), el('span', 'pause-stat__value num', value));
    return row;
  };
  let units = 0;
  let buildings = 0;
  if (st) {
    const myIndex = st.players.findIndex((p) => p.controller === 'human');
    for (let i = 0; i < st.entities.count; i++) {
      if (st.entities.dead[i] || st.entities.ownerIndex[i] !== myIndex) continue;
      if (st.entities.kind[i] === 0) units++;
      else buildings++;
    }
  }
  stats.append(
    stat('Match time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`),
    stat('Mana', me ? String(Math.round(me.mana)) : '—'),
    stat('Units', String(units)),
    stat('Structures', String(buildings)),
  );
  card.body.append(stats, rule());

  const actions = el('div', 'col pause-actions');
  actions.append(
    button({ variant: 'primary', size: 'lg', icon: 'move', label: 'Resume', block: true, onClick: () => app.resume() }),
    button({ size: 'lg', icon: 'research', label: 'Restart', block: true, onClick: () => app.restart() }),
    button({ size: 'lg', icon: 'gear', label: 'Settings', block: true, onClick: () => app.go('settings') }),
    button({ variant: 'danger', size: 'lg', icon: 'close', label: 'Quit to menu', block: true, onClick: () => app.quitToMenu() }),
  );
  card.body.append(actions);
  root.append(card.root);

  return {
    root,
    destroy: () => {
      // Do not auto-resume: leaving pause via Settings should keep the match frozen.
    },
  };
}
