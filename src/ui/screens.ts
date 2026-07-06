// Out-of-match screens (main menu). Plain DOM. Chooses a match config and starts the game.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface MenuOptions {
  onStart: (matchId: string) => void;
  onContinue: (() => void) | null;
}

export class MainMenu {
  root = el('div', 'menu-screen');

  constructor(opts: MenuOptions) {
    const title = el('h1', 'menu-title', 'Arcane Dominion');
    const sub = el('p', 'menu-sub', 'Rival archmages. Summoned armies. One victor.');
    const list = el('div', 'menu-list');

    if (opts.onContinue) {
      const cont = el('button', 'btn big', 'Continue');
      cont.addEventListener('click', () => opts.onContinue?.());
      list.appendChild(cont);
    }

    const skirmish = el('button', 'btn big', 'Skirmish (1v1)');
    skirmish.addEventListener('click', () => opts.onStart('skirmish_1v1'));
    const ffa = el('button', 'btn big', 'Free-For-All (4)');
    ffa.addEventListener('click', () => opts.onStart('ffa_4'));

    list.append(skirmish, ffa);
    this.root.append(title, sub, list);
  }

  destroy(): void {
    this.root.remove();
  }
}
