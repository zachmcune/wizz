// MULTIPLAYER LOBBY SCREEN — create a room, join with a code, and start a lockstep match.
//
// This is the player-facing half of Phase 6. It is deliberately thin: every rule (which slots are claimable,
// when a start is allowed, how an empty seat is filled) lives in `src/net/lobby.ts` and is unit-tested there, so
// this screen only renders that state and forwards intents. A screen that also decided the rules would mean two
// implementations and a class of bug where the UI offers a Start button the relay then refuses.
//
// THE URL IS THE INVITATION. Creating a room puts `?room=CODE` in the address bar, so copying the link is the
// whole join flow — no account, no friend list, no server-side invitation record. That is the right shape for a
// static client-only game, and it also gives the Playwright proof a way to open a second browser context into the
// same room without driving any UI.
//
// CONNECTION IS EXPLICIT, NOT IMPLICIT. The relay URL is resolved from the page origin by default (the deployed
// project serves the relay on the same host, and `/v2/` deployment is what `scripts/build-v2.mjs` sets up), with a
// `?relay=` override for local development. Failing to connect shows a message and leaves the lobby usable rather
// than silently doing nothing.
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

/** Where the relay lives. Same origin by default; `?relay=ws://host:8787` for local dev. */
export function resolveRelayUrl(search: string, origin: string): string {
  const params = new URLSearchParams(search);
  const explicit = params.get('relay');
  if (explicit) return explicit;
  // The dev server serves the app but not a relay, so the local default is the relay's own port.
  if (/localhost|127\.0\.0\.1/.test(origin)) return origin.replace(/^http/, 'ws').replace(/:\d+$/, ':8787');
  return `${origin.replace(/^http/, 'ws')}/relay`;
}

export function mountMultiplayer(app: App): { root: HTMLElement; destroy: () => void } {
  const root = el('div', 'screen screen--lobby');
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

  const head = el('header', 'page-head');
  const titleBlock = el('div', 'col');
  titleBlock.append(el('span', 'eyebrow', 'Arcane Dominion'), el('h1', 'display page-head__title', 'Multiplayer'));
  const headRight = el('div', 'row');
  headRight.append(badge('2–4 players'));
  head.append(titleBlock, el('div', 'spacer'), headRight);

  const body = el('div', 'col mp-body');
  const statusLine = el('p', 'lobby-hint');
  statusLine.dataset.testid = 'mp-status';
  const panels = el('div', 'mp-panels');
  body.append(statusLine, panels);

  const foot = el('footer', 'lobby__foot');
  const back = button({ variant: 'quiet', label: 'Back', onClick: () => shutdown(() => app.go('menu')) });
  foot.append(back, el('div', 'spacer'));

  root.append(head, body, foot);

  // ─────────────────────────────────────────────────────────────── rendering
  function render(): void {
    statusLine.textContent = fatal || status;
    statusLine.classList.toggle('is-error', fatal.length > 0);
    panels.replaceChildren();

    if (!lobby) {
      panels.append(connectPanel());
      return;
    }
    panels.append(roomPanel());
  }

  function connectPanel(): HTMLElement {
    const p = panel({ title: presetRoom ? `Join ${presetRoom}` : 'Create or join', accent: true });
    const col = el('div', 'col');

    if (!presetRoom) {
      const createRow = el('div', 'row');
      const create = button({
        variant: 'primary',
        label: 'Create a room',
        onClick: () => {
          // A code generated locally, then published with the first join — the relay makes the first joiner
          // the host and adopts the lobby it sends.
          const code = createRoomCode(() => Math.random());
          const initial = createLobby({ mapId: 'duel_glade', slots: 2 });
          connect(code, initial);
        },
      });
      create.dataset.testid = 'mp-create';
      createRow.append(create);
      col.append(createRow, rule());
    }

    const joinRow = el('div', 'row');
    const input = el('input', 'lobby-select');
    input.dataset.testid = 'mp-code';
    input.placeholder = 'Room code';
    input.value = presetRoom;
    input.maxLength = 8;
    const join = button({
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
    col.append(joinRow);

    p.body.append(col);
    return p.root;
  }

  function roomPanel(): HTMLElement {
    const p = panel({ title: `Room ${room}`, accent: true });
    const col = el('div', 'col');

    const players = el('div', 'col lobby-players');
    for (const slot of activeSlots(lobby!)) {
      const row = el('div', 'lobby-player');
      row.dataset.slot = slot.id;
      const badgeText =
        slot.kind === 'ai'
          ? `AI ${slot.aiDifficulty ?? 'normal'}`
          : slot.kind === 'open'
            ? 'Open'
            : slot.claimedBy === connId
              ? 'You'
              : slot.claimedBy
                ? 'Connected'
                : 'Waiting';
      row.append(el('span', 'mp-slot', `${slot.id} · corner ${slot.startIndex ?? '—'}`), badge(badgeText, slot.ready ? 'ok' : undefined));
      players.append(row);
    }
    col.append(players, rule());

    const check = canStart(lobby!);
    const actions = el('div', 'row wrap');

    if (isHost) {
      actions.append(
        button({
          label: 'Fill empty with AI',
          onClick: () => {
            if (!lobby) return;
            lobby = fillEmptyWithAi(lobby, 'normal');
            transport?.sendRaw(lobbyUpdateMessage(lobby));
            status = 'Empty seats filled with AI.';
            render();
          },
        }),
      );
      const start = button({
        variant: 'primary',
        label: 'Start match',
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
       * ENABLE IT BASED ON THE REAL PREDICATE, and let the relay be the final authority.
       *
       * This used to read `start.disabled = !check.ok && activeSlots(...).every(s => s.claimedBy)`, which disabled
       * the button in exactly the common case it was meant to allow: two humans seated and ready makes `check.ok`
       * TRUE, so `!check.ok` is false and the expression becomes false && true -> disabled. The net effect was a
       * Start button that went DEAD as soon as the second player joined, which the two-browser proof caught as a
       * five-minute hang on a click that could never fire.
       *
       * The correct rule is simply "the lobby says it can start". A refusal from the relay still surfaces through
       * `applyServerMessage`, so a stale local view cannot silently mislead the host.
       */
      start.disabled = !check.ok;
      actions.append(start);
    } else {
      actions.append(
        button({
          label: 'Ready',
          onClick: () => {
            if (!mySlotId) return;
            transport?.sendRaw(readyMessage(mySlotId, true));
          },
        }),
      );
    }
    col.append(actions);

    if (!check.ok) col.append(el('p', 'lobby-hint muted', check.reason));
    p.body.append(col);
    return p.root;
  }

  // ─────────────────────────────────────────────────────────────── connection
  function connect(code: string, initial?: LobbyStateWire): void {
    fatal = '';
    room = code;
    status = `Connecting to ${resolveRelayUrl(window.location.search, window.location.origin)}…`;
    render();

    const url = resolveRelayUrl(window.location.search, window.location.origin);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      fatal = `Could not open a connection to the relay (${String(err)}). Playing offline is available from Skirmish.`;
      render();
      return;
    }

    transport = new WebSocketTransport(socket);
    // The URL carries the room so the link is the invitation.
    const next = new URL(window.location.href);
    next.searchParams.set('room', code);
    window.history.replaceState(null, '', next.toString());

    socket.addEventListener('open', () => {
      transport?.sendRaw(joinMessage(code, initial));
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
            relayUrl: url,
            connId: connId ?? '',
            playerId: mySlotId ?? '',
            seed: Number(msg.seed ?? 0),
            startTick,
            lobby: lobby!,
          });
          return;
        }
        status = isHost ? 'Room created. Share the code.' : 'Joined. Waiting for the host.';
        render();
        return;
      }

      if (msg.t === 'matchStart') {
        const seed = Number(msg.seed ?? 0);
        const startTick = Number(msg.startTick ?? 0);
        app.startMultiplayerMatch({
          room,
          relayUrl: url,
          connId: connId ?? '',
          playerId: mySlotId ?? '',
          seed,
          startTick,
          lobby: (msg.state as LobbyStateWire | undefined) ?? lobby!,
        });
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
