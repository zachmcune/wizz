import { el } from '../../ui/dom';
import type { Registry } from '../../data/registry';
import type { SandboxController } from '../sandbox-controller';
import {
  executeCommandLine,
  getCommands,
  getFavorites,
  getHistory,
  searchCommands,
  toggleFavorite,
  type SandboxContext,
} from '../command-registry';

export class CommandPalette {
  readonly root = el('div', 'sandbox-palette');
  private backdrop = el('div', 'sandbox-palette-backdrop');
  private input = el('input', 'sandbox-palette-input') as HTMLInputElement;
  private results = el('div', 'sandbox-palette-results');
  private errorEl = el('div', 'sandbox-palette-error');
  private visible = false;
  private ctx: SandboxContext;
  private histIdx = -1;

  constructor(
    controller: SandboxController,
    registry: Registry,
    humanId: string,
    private onClose: () => void,
  ) {
    this.ctx = { controller, registry, humanId };
    this.input.placeholder = 'Search commands… (e.g. spawn archer 5)';
    this.input.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.backdrop.addEventListener('click', () => this.hide());
    const panel = el('div', 'sandbox-palette-panel');
    panel.append(this.input, this.errorEl, this.results);
    this.root.append(this.backdrop, panel);
    this.root.style.display = 'none';
    this.input.addEventListener('input', () => this.renderResults());
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'flex';
    this.errorEl.textContent = '';
    this.input.value = '';
    this.histIdx = -1;
    this.renderResults();
    this.input.focus();
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
    for (const cmd of cmds.slice(0, 12)) {
      const row = el('button', 'sandbox-palette-row');
      row.type = 'button';
      const star = favs.includes(cmd.id) ? '★ ' : '';
      row.textContent = `${star}[${cmd.category}] ${cmd.id} — ${cmd.description}`;
      row.addEventListener('click', () => {
        this.input.value = cmd.id;
        this.input.focus();
      });
      row.addEventListener('dblclick', () => {
        toggleFavorite(cmd.id);
        this.renderResults();
      });
      this.results.appendChild(row);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
