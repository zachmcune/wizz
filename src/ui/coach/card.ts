import { el } from '../dom';
import type { CoachCopy } from './progress';

/** Small contextual teaching card. Not a full-screen modal. */
export class CoachCard {
  readonly root = el('div', 'coach-card');
  private titleEl = el('h2', 'coach-title');
  private bodyEl = el('p', 'coach-body');
  private skipBtn = el('button', 'btn coach-skip', 'Skip tutorial');
  private gotItBtn = el('button', 'btn confirm coach-got-it', 'Got it');

  onSkip: (() => void) | null = null;
  onGotIt: (() => void) | null = null;

  constructor() {
    this.skipBtn.type = 'button';
    this.gotItBtn.type = 'button';
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSkip?.();
    });
    this.gotItBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onGotIt?.();
    });
    const actions = el('div', 'coach-actions');
    actions.append(this.skipBtn, this.gotItBtn);
    this.root.append(this.titleEl, this.bodyEl, actions);
    this.root.dataset.testid = 'coach-card';
    this.hide();
  }

  show(copy: CoachCopy): void {
    this.titleEl.textContent = copy.title;
    this.bodyEl.textContent = copy.body;
    this.root.dataset.anchor = copy.anchor;
    this.root.classList.toggle('coach-card--cmd', copy.anchor === 'cmd');
    this.root.classList.toggle('coach-card--map', copy.anchor === 'map');
    this.root.classList.toggle('coach-card--lobby', copy.anchor === 'lobby');
    this.root.style.display = 'flex';
    this.root.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.root.style.display = 'none';
    this.root.setAttribute('aria-hidden', 'true');
    delete this.root.dataset.anchor;
  }

  isVisible(): boolean {
    return this.root.style.display !== 'none';
  }
}
