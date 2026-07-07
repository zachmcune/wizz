import type { MenuCategory } from '../../data/defs';
import { el } from './dom';

export interface CategoryChip {
  id: MenuCategory;
  label: string;
}

export class CategoryChips {
  readonly root = el('div', 'category-chips');
  private scroll = el('div', 'category-chips-scroll');
  private activeId: MenuCategory | null = null;
  private chips: CategoryChip[] = [];

  constructor(private onSelect: (id: MenuCategory) => void) {
    this.root.append(this.scroll);
  }

  setCategories(chips: CategoryChip[]): void {
    const key = chips.map((c) => c.id).join('|');
    const prev = this.chips.map((c) => c.id).join('|');
    this.chips = chips;
    if (key !== prev) this.render();
    else this.syncActive();
  }

  setActive(id: MenuCategory): void {
    this.activeId = id;
    this.syncActive();
  }

  private render(): void {
    this.scroll.innerHTML = '';
    for (const chip of this.chips) {
      const btn = el('button', 'category-chip');
      btn.type = 'button';
      btn.dataset.category = chip.id;
      btn.textContent = chip.label;
      btn.addEventListener('click', () => this.onSelect(chip.id));
      this.scroll.appendChild(btn);
    }
    this.syncActive();
  }

  private syncActive(): void {
    for (const btn of this.scroll.querySelectorAll<HTMLButtonElement>('.category-chip')) {
      btn.classList.toggle('active', btn.dataset.category === this.activeId);
    }
  }
}
