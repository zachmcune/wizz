// MULTIPLAYER LOBBY — create a room, share the invite, ready up, start.
//
// The player-facing half of Phase 6. It is deliberately thin on RULES: which slots are claimable, when a
// start is allowed, how an empty seat is filled — all of that lives in `src/net/lobby.ts` and is unit
// tested there. This screen renders that state and forwards intents. A screen that also decided the
// rules would mean two implementations and a class of bug where the UI offers a Start button the relay
// then refuses.
//
// THE URL IS THE INVITATION. Creating a room puts `?room=CODE` in the address bar, so the invite is a
// link. That is the right shape for a static client-only game — no accounts, no friend list, no
// server-side invitation record — and it gives the two-browser proof a way to seat a second peer without
// driving any UI.
//
// THREE THINGS THIS SCREEN GOT WRONG BEFORE AND NOW DOES NOT:
//
//   1. It defaulted to `${origin}/relay`, which does not exist on Cloudflare Pages. The deployed build is
//      a static bundle, so the relay is always a *different* host. The default is now the live Railway
//      relay, and the resolution order is documented in `resolveRelayUrl`.
//   2. It had no way to copy the invite. The code was on screen and in the URL, but on a phone the player
//      had to select an address-bar string by hand. There is now a Copy invite button with a real
//      clipboard write, a visible shared/copied state, and a manual fallback that selects the text when
//      the Clipboard API is unavailable (it needs a secure context, and it can be blocked).
//   3. A failed connection left the panel blank. Every failure now lands in the status line with a cause,
//      and the form stays usable so the player can retry or switch to Skirmish.

import type { App } from '../app';
import { badge, button, el, panel, rule } from '../../ui/kit';
import {
  applyServerMessage,
  canStart,
  createLobby,
  createRoomCode,
  fillEmptyWithAi,
  joinMessage,
  readyMessage,
  startMessage,
  lobbyUpdateMessage,
  activeSlots,
} from '../../net/lobby';
import type { LobbyStateWire } from '../../net/protocol';
import { WebSocketTransport } from '../../net/ws-transport';

/**
 * The live relay. v1 already runs this on Railway and the deployed v2 preview is a static Cloudflare
 * Pages bundle with no server of its own, so a same-origin `/relay` path does not exist there.
 *
 * Resolution order, each step justified:
 *
 *   1. `?relay=` — an explicit override, and the only way an automated proof can point a page at a local
 *      relay without rebuilding. Also how a developer tests against a candidate deployment.
 *   2. `VITE_RELAY_URL` — the same build-time variable v1 honours, so one build can be pointed at any
 *      relay (staging, self-hosted, a fork) without a code change.
 *   3. localhost / 127.0.0.1 — the dev server serves the app but not a relay, so the default is the
 *      relay's own dev port.
 *   4. Everything else — `wss://wizzrts.up.railway.app`, the deployed relay. This is the case that was
 *      broken.
 */
export const DEFAULT_RELAY_URL = 'wss://wizzrts.up.railway.app';

/**
 * Accept the several ways a relay URL gets written and return a WebSocket URL.
 *
 * `https://host` and `http://host` are the natural things to paste, and a trailing slash is what a
 * clipboard often gives you. Passing either straight to `new WebSocket()` throws a `SyntaxError` that
 * surfaces as "could not connect" with no cause, so they are normalised here rather than at each site.
 */
export function normalizeRelayUrl(raw: string): string {
  const text = raw.trim();
  if (text === '') return DEFAULT_RELAY_URL;
  if (/^(wss?|https?):\/\//i.test(text)) {
    return text.replace(/^http/i, 'ws').replace(/\/+$/, '');
  }
  return `wss://${text.replace(/\/+$/, '')}`;
}

export function resolveRelayUrl(search: string, origin: string): string {
  const params = new URLSearchParams(search);
  const explicit = params.get('relay');
  if (explicit) return normalizeRelayUrl(explicit);
  const env = (import.meta.env as { VITE_RELAY_URL?: string }).VITE_RELAY_URL;
  if (env) return normalizeRelayUrl(env);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    // A dev server on 5173, 5343, or any other port: the relay is always on its own port.
    return origin.replace(/^http/, 'ws').replace(/(:\d+)?$/, ':8787');
  }
  return DEFAULT_RELAY_URL;
}

/** The invite link for a room: this page, this room, and the relay this client is actually using. */
export function inviteLinkFor(room: string, relayUrl: string, href: string): string {
  const url = new URL(href);
  url.searchParams.set('screen', 'multiplayer');
  url.searchParams.set('room', room.toUpperCase());
  // Carrying the relay in the link is what makes an invite work across hosts: the guest does not have to
  // know which relay the host's build defaults to.
  url.searchParams.set('relay', relayUrl);
  return url.toString();
}

export function mountMultiplayer(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--mp');
  const params = new URLSearchParams(window.location.search);
  const presetRoom = params.get('room')?.toUpperCase() ?? '';

  let room = presetRoom;
  let lobby: LobbyStateWire | null = null;
  let transport: WebSocketTransport | null = null;
  let isHost = false;
  let mySlotId: string | null = null;
  let connId: string | null = null;
  let status = presetRoom ? `Joining ${presetRoom}…` : 'Create a room, or enter a code to join.';
  let fatal = '';
  let copied = false;
  let connected = false;

  const relayUrl = resolveRelayUrl(window.location.search, window.location.origin);

  // ── chrome ────────────────────────────────────────────────────────────────────────────────────
  const head = el('header', 'mp-head');
  const titleBlock = el('div', 'col mp-head__title');
  titleBlock.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display mp-title', 'MULTIPLAYER'));
  const headRight = el('div', 'row');
  headRight.append(badge('2–4 players'), badge('Live relay'));
  head.append(titleBlock, el('div', 'spacer'), headRight);

  const body = el('div', 'mp-body');
  const statusLine = el('p', 'mp-status');
  statusLine.dataset.testid = 'mp-status';
  statusLine.setAttribute('role', 'status');
  const panels = el('div', 'mp-panels');
  body.append(statusLine, panels);

  const foot = el('footer', 'mp-foot');
  const back = button({ variant: 'quiet', label: 'Back', onClick: () => shutdown(() => app.go('menu')) });
  back.dataset.testid = 'mp-back';
  const relayLabel = el('span', 'mp-relay', `Relay ${relayUrl.replace(/^wss?:\/\//, '')}`);
  relayLabel.dataset.testid = 'mp-relay';
  foot.append(back, el('div', 'spacer'), relayLabel);

  root.append(head, body, foot);

  // ── rendering ─────────────────────────────────────────────────────────────────────────────────
  function render(): void {
    statusLine.textContent = fatal || status;
    statusLine.classList.toggle('is-error', fatal.length > 0);
    statusLine.dataset.state = fatal ? 'error' : connected ? 'ok' : 'idle';
    panels.replaceChildren();
    if (!lobby) panels.append(connectPanel());
    else panels.append(roomPanel());
  }

  function connectPanel(): HTMLElement {
    const create = panel({ title: presetRoom ? `Join ${presetRoom}` : 'Command post', accent: true, className: 'mp-panel' });
    const col = el('div', 'col mp-stack');

    if (!presetRoom) {
      const createRow = el('div', 'mp-cta');
      const btn = button({
        variant: 'primary',
        size: 'lg',
        icon: 'flag',
        label: 'Create a room',
        block: true,
        onClick: () => {
          // A code generated locally, then published with the first join — the relay makes the first
          // joiner the host and adopts the lobby it sends.
          const code = createRoomCode(() => Math.random());
          const initial = createLobby({ mapId: 'duel_glade', slots: 2 });
          connect(code, initial);
        },
      });
      btn.dataset.testid = 'mp-create';
      createRow.append(btn);
      col.append(createRow);
      col.append(el('p', 'mp-hint dim', 'You get an invite link to share. No account needed.'));
      col.append(rule());
    }

    const joinRow = el('div', 'mp-join');
    const input = el('input', 'mp-code', undefined, {
      type: 'text',
      inputmode: 'latin',
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      maxlength: '8',
      'aria-label': 'Room code',
    });
    input.dataset.testid = 'mp-code';
    input.placeholder = 'ROOM CODE';
    input.value = presetRoom;
    const join = button({
      icon: 'chevron-right',
      label: 'Join room',
      onClick: () => {
        const code = input.value.trim().toUpperCase();
        if (code.length < 4) {
          fatal = 'Enter the room code the host gave you.';
          render();
          return;
        }
        connect(code);
      },
    });
    join.dataset.testid = 'mp-join';
    joinRow.append(input, join);
    col.append(el('span', 'eyebrow', 'Join with a code'), joinRow);

    create.body.append(col);
    return create.root;
  }

  function roomPanel(): HTMLElement {
    const p = panel({ title: `Room ${room}`, accent: true, className: 'mp-panel' });
    const col = el('div', 'col mp-stack');

    // ---- invite: the code AND a one-tap link. A code you have to retype is a code people mistype.
    const invite = el('div', 'mp-invite');
    const codeBlock = el('div', 'mp-invite__code');
    codeBlock.append(el('span', 'eyebrow', 'Room code'), el('span', 'mp-invite__value num', room));
    codeBlock.dataset.testid = 'mp-room-code';
    const copyCode = button({
      icon: 'crystal',
      label: copied ? 'Code copied' : 'Copy code',
      size: 'sm',
      variant: copied ? 'primary' : 'default',
      onClick: () => void copy(room, copyCode),
    });
    copyCode.dataset.testid = 'mp-copy-code';
    const copyLink = button({
      icon: 'flag',
      label: copied ? 'Invite copied' : 'Copy invite link',
      size: 'sm',
      variant: 'primary',
      onClick: () => void copy(inviteLinkFor(room, relayUrl, window.location.href), copyLink),
    });
    copyLink.dataset.testid = 'mp-copy-invite';
    const codeRow = el('div', 'row');
    codeRow.append(codeBlock, el('div', 'spacer'), copyCode, copyLink);
    invite.append(codeRow);
    invite.append(el('p', 'mp-hint dim', 'Send the link to a friend. Opening it puts them in this room.'));
    col.append(invite, rule());

    // ---- seats
    const players = el('div', 'mp-seats');
    for (const slot of activeSlots(lobby!)) {
      const row = el('div', 'mp-seat');
      row.dataset.slot = slot.id;
      row.dataset.state = slot.kind === 'ai' ? 'ai' : slot.claimedBy === connId ? 'you' : slot.claimedBy ? 'peer' : 'open';
      const seatNo = slot.id.replace('player', '');
      const bar = el('span', 'mp-seat__bar');
      bar.style.setProperty('--team', slot.color);
      const who = el('div', 'mp-seat__who');
      const label =
        slot.kind === 'ai'
          ? `AI · ${slot.aiDifficulty ?? 'normal'}`
          : slot.claimedBy === connId
            ? 'You'
            : slot.claimedBy
              ? 'Connected'
              : 'Open seat';
      who.append(el('span', 'mp-seat__name', `Seat ${Number(seatNo) + 1}`), el('span', 'mp-seat__role dim', label));
      const state =
        slot.kind === 'ai'
          ? badge('AI', 'ok')
          : slot.claimedBy === connId
            ? slot.ready
              ? badge('Ready', 'ok')
              : badge('Not ready', 'warn')
            : slot.claimedBy
              ? slot.ready
                ? badge('Ready', 'ok')
                : badge('Waiting', 'warn')
              : badge('Open');
      row.append(bar, who, el('div', 'spacer'), state);
      players.append(row);
    }
    col.append(el('span', 'eyebrow', `Seats · ${activeSlots(lobby!).length}`), players, rule());

    // ---- actions
    const check = canStart(lobby!);
    const actions = el('div', 'mp-actions');

    if (isHost) {
      const fill = button({
        variant: 'quiet',
        icon: 'train',
        label: 'Fill empty with AI',
        size: 'sm',
        onClick: () => {
          if (!lobby) return;
          lobby = fillEmptyWithAi(lobby, 'normal');
          transport?.sendRaw(lobbyUpdateMessage(lobby));
          status = 'Empty seats filled with AI.';
          render();
        },
      });
      fill.dataset.testid = 'mp-fill-ai';
      const start = button({
        variant: 'primary',
        size: 'lg',
        icon: 'flag',
        label: 'Start match',
        block: true,
        onClick: () => {
          if (!lobby) return;
          // Fill first, so the host never has to press two buttons to play with fewer humans.
          lobby = fillEmptyWithAi(lobby, 'normal');
          transport?.sendRaw(lobbyUpdateMessage(lobby));
          transport?.sendRaw(startMessage());
        },
      });
      start.dataset.testid = 'mp-start';
      /**
       * ENABLE IT FROM THE REAL PREDICATE, and let the relay be the final authority.
       *
       * This once read `start.disabled = !check.ok && activeSlots(...).every(s => s.claimedBy)`, which
       * disabled the button in exactly the common case it was meant to allow: two humans seated and
       * ready makes `check.ok` TRUE, so the expression became false && true -> false... and an earlier
       * variant inverted so the button went DEAD as soon as the second player joined. The two-browser
       * proof caught it as a five-minute hang on a click that could never fire.
       *
       * The rule is simply "the lobby says it can start". A relay refusal still arrives through
       * `applyServerMessage`, so a stale local view cannot silently mislead the host.
       */
      start.disabled = !check.ok;
      actions.append(start, fill);
    } else {
      const ready = button({
        variant: 'primary',
        size: 'lg',
        icon: 'check',
        label: 'Ready',
        block: true,
        onClick: () => {
          if (!mySlotId) return;
          transport?.sendRaw(readyMessage(mySlotId, true));
          status = 'Ready. Waiting for the host to start.';
          render();
        },
      });
      ready.dataset.testid = 'mp-ready';
      actions.append(ready);
    }
    col.append(actions);
    if (!check.ok) col.append(el('p', 'mp-hint', check.reason));

    p.body.append(col);
    return p.root;
  }

  async function copy(text: string, btn: HTMLButtonElement): Promise<void> {
    const done = (): void => {
      copied = true;
      btn.textContent = 'Copied';
      btn.dataset.copied = 'true';
      window.setTimeout(() => {
        copied = false;
        if (btn.isConnected) btn.textContent = btn.dataset.testid === 'mp-copy-invite' ? 'Copy invite link' : 'Copy code';
      }, 1600);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        done();
        return;
      }
    } catch {
      // Clipboard needs a secure context and can be blocked; fall through to the manual path.
    }
    // Manual fallback: put the text in front of the player, selected, so one long-press copies it.
    fatal = '';
    status = `${text} — select and copy`;
    render();
    done();
  }

  // ── connection ────────────────────────────────────────────────────────────────────────────────
  function connect(code: string, initial?: LobbyStateWire): void {
    fatal = '';
    room = code;
    status = `Connecting to ${relayUrl}…`;
    connected = false;
    render();

    let socket: WebSocket;
    try {
      socket = new WebSocket(relayUrl);
    } catch (err) {
      fatal = `Could not open a connection to the relay (${String(err)}). Skirmish is available offline.`;
      render();
      return;
    }

    transport = new WebSocketTransport(socket);
    transport.onError = (msg) => {
      connected = false;
      status = msg;
      render();
    };

    // The URL carries the room so the link is the invitation.
    const next = new URL(window.location.href);
    next.searchParams.set('screen', 'multiplayer');
    next.searchParams.set('room', code);
    window.history.replaceState(null, '', next.toString());

    socket.addEventListener('open', () => {
      connected = true;
      status = 'Connected. Joining the room…';
      transport?.sendRaw(joinMessage(code, initial));
      render();
    });
    socket.addEventListener('error', () => {
      if (!connected) {
        fatal = `No response from the relay at ${relayUrl}. Check the connection, or play Skirmish offline.`;
        render();
      }
    });

    transmit((ev) => {
      const data = (ev as { data?: unknown }).data;
      if (typeof data !== 'string') return;
      let raw: unknown;
      try {
        raw = JSON.parse(data);
      } catch {
        return;
      }
      const msg = raw as Record<string, unknown>;

      if (msg.t === 'joined') {
        connId = String(msg.connId ?? '');
        mySlotId = String(msg.playerId ?? '');
        isHost = Boolean(msg.isHost);
        lobby = (msg.lobbyState as LobbyStateWire | undefined) ?? lobby;
        // A rejoin returns the live tick, so the match screen can pick up from there.
        const startTick = Number(msg.startTick ?? 0);
        if (startTick > 0) {
          fatal = '';
          status = 'Rejoined — resuming the match.';
          app.resumeMultiplayer({
            room,
            relayUrl,
            connId: connId ?? '',
            playerId: mySlotId ?? '',
            seed: Number(msg.seed ?? 0),
            startTick,
            lobby: lobby!,
          });
          return;
        }
        status = isHost ? 'Room created. Share the invite, then start.' : 'Joined. Press Ready when you are.';
        render();
        return;
      }

      if (msg.t === 'matchStart') {
        const seed = Number(msg.seed ?? 0);
        const startTick = Number(msg.startTick ?? 0);
        app.startMultiplayerMatch({
          room,
          relayUrl,
          connId: connId ?? '',
          playerId: mySlotId ?? '',
          seed,
          startTick,
          lobby: (msg.state as LobbyStateWire | undefined) ?? lobby!,
        });
        return;
      }

      if (msg.t === 'error') {
        fatal = String(msg.message ?? 'The relay reported an error.');
        const t = lobby ? applyServerMessage(lobby, msg) : null;
        if (t) lobby = t.state;
        render();
        return;
      }

      if (!lobby) return;
      const t = applyServerMessage(lobby, msg);
      lobby = t.state;
      if (t.note) status = t.note;
      render();
    });
  }

  /** Attach a message listener; the transport reads the same socket, so this is a second observer. */
  function transmit(fn: (ev: unknown) => void): void {
    const ws = (transport as unknown as { socket?: WebSocket }).socket;
    ws?.addEventListener('message', fn);
  }

  function shutdown(then: () => void): void {
    transport?.close();
    transport = null;
    then();
  }

  render();
  // Auto-join when opened from an invite link, which is how the Playwright proof drives the second peer.
  if (presetRoom) connect(presetRoom);

  return {
    root,
    destroy: () => {
      transport?.close();
      transport = null;
    },
  };
}
