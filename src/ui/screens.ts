// Out-of-match screens (main menu). Plain DOM. Chooses a match config and starts the game.
import { el } from './dom';

export interface MenuOptions {
  onCustomGame: () => void;
  onCreateOnline: () => void;
  onJoinOnline: () => void;
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

    const custom = el('button', 'btn big', 'Custom Game');
    custom.addEventListener('click', () => opts.onCustomGame());

    const onlineLabel = el('p', 'menu-section', 'Multiplayer');
    const createOnline = el('button', 'btn big online-btn', 'Create Online');
    createOnline.addEventListener('click', () => opts.onCreateOnline());
    const joinOnline = el('button', 'btn big online-btn', 'Join Online');
    joinOnline.addEventListener('click', () => opts.onJoinOnline());

    list.append(custom, onlineLabel, createOnline, joinOnline);
    this.root.append(title, sub, list);
  }

  destroy(): void {
    this.root.remove();
  }
}
