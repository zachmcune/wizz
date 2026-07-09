import { el } from '../../ui/dom';
import type { Registry } from '../../data/registry';
import type { SandboxController } from '../sandbox-controller';
import {
  executeCommandLine,
  getCommands,
  getFavorites,
  getHistory,
  parseCommandLine,
  searchCommands,
  toggleFavorite,
  type SandboxContext,
} from '../command-registry';
import { isTouchPrimaryDevice } from './touch';

export class CommandPalette {
  readonly root = el('div', 'sandbox-palette');
  private backdrop = el('div', 'sandbox-palette-backdrop');
  private panel = el('div', 'sandbox-palette-panel');
  private input = el('input', 'sandbox-palette-input') as HTMLInputElement;
  private results = el('div', 'sandbox-palette-results');
  private errorEl = el('div', 'sandbox-palette-error');
  private runBtn = el('button', 'btn sandbox-action sandbox-palette-run', 'Run');
  private visible = false;
  private ctx: SandboxContext;
  private histIdx = -1;
  private readonly touchMode: boolean;

  constructor(
    controller: SandboxController,
    registry: Registry,
    humanId: string,
    private onClose: () => void,
  ) {
    this.touchMode = isTouchPrimaryDevice();
    if (this.touchMode) this.root.classList.add('touch');

    this.ctx = { controller, registry, humanId };
    this.input.placeholder = this.touchMode ? 'Search commands…' : 'Search commands… (e.g. spawn imp_swarmling 5)';
    this.input.autocomplete = 'off';
    this.input.autocapitalize = 'off';
    this.input.spellcheck = false;
    this.input.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.backdrop.addEventListener('click', () => this.hide());

    this.runBtn.type = 'button';
    this.runBtn.addEventListener('click', () => this.run(this.input.value));

    const closeBtn = el('button', 'btn sandbox-btn-icon sandbox-palette-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close command palette');
    closeBtn.addEventListener('click', () => this.hide());

    const head = el('div', 'sandbox-palette-head');
    head.append(closeBtn, el('span', 'sandbox-palette-title', 'Commands'));

    const actions = el('div', 'sandbox-palette-actions');
    actions.append(this.runBtn);

    this.panel.append(head, this.input, this.errorEl, this.results, actions);
    this.root.append(this.backdrop, this.panel);
    this.root.style.display = 'none';
    this.input.addEventListener('input', () => this.renderResults());
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }

  setHumanId(humanId: string): void {
    this.ctx.humanId = humanId;
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'flex';
    this.errorEl.textContent = '';
    this.input.value = '';
    this.histIdx = -1;
    this.renderResults();
    this.input.focus({ preventScroll: true });
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.onClose();
  }

  isVisible(): boolean {
    return this.visible;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.run(this.input.value);
      return;
    }
    if (this.touchMode) return;
    const hist = getHistory();
    if (e.key === 'ArrowUp' && hist.length) {
      e.preventDefault();
      this.histIdx = Math.min(hist.length - 1, this.histIdx + 1);
      this.input.value = hist[this.histIdx] ?? '';
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.histIdx = Math.max(-1, this.histIdx - 1);
      this.input.value = this.histIdx < 0 ? '' : (hist[this.histIdx] ?? '');
    }
  }

  private run(line: string): void {
    const res = executeCommandLine(this.ctx, line);
    if (!res.ok) {
      this.errorEl.textContent = res.error;
      return;
    }
    this.errorEl.textContent = '';
    this.hide();
  }

  private renderResults(): void {
    this.results.replaceChildren();
    const q = this.input.value.trim();
    const favs = getFavorites();
    const cmds = q ? searchCommands(q) : getCommands();
    for (const cmd of cmds.slice(0, 14)) {
      const row = el('button', 'sandbox-palette-row');
      row.type = 'button';
      const star = favs.includes(cmd.id) ? '★ ' : '';
      row.textContent = `${star}${cmd.id} — ${cmd.description}`;

      row.addEventListener('click', () => {
        if (this.touchMode) {
          const line = q ? this.input.value.trim() : cmd.id;
          const parsed = parseCommandLine(line);
          if (parsed.ok) {
            this.run(line);
          } else {
            this.input.value = cmd.id + (cmd.params.length ? ' ' : '');
            this.errorEl.textContent = parsed.error;
            this.input.focus({ preventScroll: true });
          }
          return;
        }
        this.input.value = cmd.id;
        this.input.focus();
      });

      if (!this.touchMode) {
        row.addEventListener('dblclick', () => {
          toggleFavorite(cmd.id);
          this.renderResults();
        });
      } else {
        let pressTimer = 0;
        row.addEventListener('pointerdown', () => {
          pressTimer = window.setTimeout(() => {
            toggleFavorite(cmd.id);
            this.renderResults();
          }, 550);
        });
        row.addEventListener('pointerup', () => clearTimeout(pressTimer));
        row.addEventListener('pointercancel', () => clearTimeout(pressTimer));
      }

      this.results.appendChild(row);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
