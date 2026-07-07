import { el } from './dom';

export class Collapsible {
  readonly root = el('div', 'panel');
  readonly body = el('div', 'panel-body');
  private head = el('button', 'panel-head');
  private chevron = el('span', 'panel-chevron', '▾');
  private titleEl = el('span', 'panel-title');
  open = true;

  constructor(title: string, startOpen = true, private headClick?: () => void) {
    this.open = startOpen;
    this.titleEl.textContent = title;
    this.head.append(this.chevron, this.titleEl);
    this.head.addEventListener('click', () => {
      if (this.headClick) this.headClick();
      else this.setOpen(!this.open);
    });
    this.root.append(this.head, this.body);
    this.sync();
  }

  setOpen(v: boolean): void {
    this.open = v;
    this.sync();
  }

  setTitle(title: string): void {
    this.titleEl.textContent = title;
  }

  private sync(): void {
    this.root.classList.toggle('collapsed', !this.open);
    this.chevron.textContent = this.open ? '▾' : '▸';
  }
}
