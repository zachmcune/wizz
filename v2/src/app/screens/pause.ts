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
  card.body.append(
    el('p', 'pause-meta muted', `Match time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`),
    rule(),
  );

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
