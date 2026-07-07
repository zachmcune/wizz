// Online multiplayer lobby: waiting room before the relay starts the match.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface OnlineLobbyOptions {
  room: string;
  onCancel?: () => void;
}

export class OnlineLobby {
  readonly root = el('div', 'menu-screen lobby-screen');
  private statusEl = el('p', 'lobby-status', 'Connecting to relay…');
  private roomEl = el('div', 'lobby-room');
  private errorEl = el('p', 'lobby-error');
  private cancelBtn = el('button', 'btn', 'Cancel');

  constructor(opts: OnlineLobbyOptions) {
    const title = el('h1', 'menu-title', 'Online 1v1');
    const sub = el('p', 'menu-sub', 'Share the room code with your opponent.');
    this.roomEl.append(
      el('span', 'lobby-label', 'Room code'),
      el('strong', 'lobby-code', opts.room),
    );
    this.errorEl.style.display = 'none';
    this.cancelBtn.addEventListener('click', () => opts.onCancel?.());
    this.root.append(title, sub, this.roomEl, this.statusEl, this.errorEl, this.cancelBtn);
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  setPlayerCount(count: number, max: number): void {
    this.setStatus(count >= max ? 'Opponent found — starting match…' : `Waiting for opponent (${count}/${max})…`);
  }

  setError(text: string): void {
    this.errorEl.textContent = text;
    this.errorEl.style.display = 'block';
    this.setStatus('Could not join room');
  }

  destroy(): void {
    this.root.remove();
  }
}

export class JoinOnlineForm {
  readonly root = el('div', 'menu-screen join-screen');
  private input = el('input', 'lobby-input') as HTMLInputElement;
  private errorEl = el('p', 'lobby-error');
  onJoin: ((room: string) => void) | null = null;
  onBack: (() => void) | null = null;

  constructor() {
    const title = el('h1', 'menu-title', 'Join Room');
    const sub = el('p', 'menu-sub', 'Enter the 6-character room code.');
    this.input.maxLength = 8;
    this.input.autocomplete = 'off';
    this.input.autocapitalize = 'characters';
    this.input.placeholder = 'ABC123';
    this.errorEl.style.display = 'none';

    const joinBtn = el('button', 'btn big', 'Join');
    joinBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });

    const back = el('button', 'btn', 'Back');
    back.addEventListener('click', () => this.onBack?.());

    this.root.append(title, sub, this.input, this.errorEl, joinBtn, back);
  }

  private submit(): void {
    const code = this.input.value.trim().toUpperCase();
    if (code.length < 4) {
      this.showError('Enter a valid room code');
      return;
    }
    this.onJoin?.(code);
  }

  showError(text: string): void {
    this.errorEl.textContent = text;
    this.errorEl.style.display = 'block';
  }

  destroy(): void {
    this.root.remove();
  }
}
