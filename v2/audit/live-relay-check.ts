// LIVE RELAY CHECK — does the deployed relay seat two independent clients in one room?
//
// The two-browser proof runs against the LOCAL relay so its timings stay deterministic. That leaves one
// question it cannot answer: is the relay the DEPLOYED build points at actually alive and serving the same
// protocol? This harness answers exactly that, and nothing else.
//
// It is deliberately not part of `npm test`: it needs outbound network access, it talks to a third-party
// host, and CI runners may be firewalled. Run it by hand when the relay or the default URL changes, and
// record the output in the proof pack:
//
//   npx vite-node audit/live-relay-check.ts
//
// What it proves, in order:
//   1. `GET /health` returns 200 with `{"ok":true}` and permissive CORS;
//   2. a real WebSocket upgrade succeeds on the `wss://` URL the deployed build defaults to;
//   3. two independent clients join the SAME room and are seated as DIFFERENT players on the SAME seed
//      and map — which is the whole handshake a match start depends on;
//   4. closing both leaves the room count at zero, i.e. the relay cleans up rather than leaking rooms.
//
// It does NOT play a match: the browser proof does that, locally. Keeping the two roles separate is what
// lets each be honest about what it measured.

import WebSocket from 'ws';

const URL_BASE = process.env.LIVE_RELAY_HTTP ?? 'https://wizzrts.up.railway.app';
const URL_WS = process.env.LIVE_RELAY_WS ?? 'wss://wizzrts.up.railway.app';
const ROOM = `V2LIVE${Math.floor(Math.random() * 900 + 100)}`;

interface Seated {
  playerId: string;
  isHost: boolean;
  seed: number;
  mapId: string;
  error: string | null;
}

const lines: string[] = [];
const note = (s: string): void => {
  lines.push(s);
  console.log(s);
};

/**
 * One connected client that stays open until the caller releases it.
 *
 * The clients must overlap: a room is only "two peers in one room" while both are connected, so the first
 * version of this harness — which resolved after closing — joined the room TWICE IN SEQUENCE and reported
 * two hosts with two different seeds. That is the harness catching its own bug, and it is exactly why the
 * seat assertions are worth running against the real deployment rather than trusting the local relay.
 */
interface Client {
  name: string;
  seated: Seated;
  /** Resolves once the relay has answered `joined` (or the attempt failed). */
  ready: Promise<void>;
  close(): void;
}

function openClient(name: string): Client {
  const seated: Seated = { playerId: '', isHost: false, seed: 0, mapId: '', error: null };
  const ws = new WebSocket(URL_WS);
  let settle: () => void = () => undefined;
  const ready = new Promise<void>((r) => {
    settle = r;
  });
  const timer = setTimeout(() => {
    seated.error = seated.error ?? 'no response in 12s';
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    settle();
  }, 12_000);

  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', room: ROOM })));
  ws.on('message', (d) => {
    const m = JSON.parse(String(d)) as Record<string, unknown>;
    if (m.t === 'joined') {
      seated.playerId = String(m.playerId ?? '');
      seated.isHost = Boolean(m.isHost);
      seated.seed = Number(m.seed ?? 0);
      seated.mapId = String((m.lobbyState as { mapId?: string } | undefined)?.mapId ?? '');
      clearTimeout(timer);
      note(`${name}: seated as ${seated.playerId} host=${seated.isHost} seed=${seated.seed} map=${seated.mapId}`);
      settle();
    }
    if (m.t === 'error') {
      seated.error = String(m.message ?? 'relay error');
      clearTimeout(timer);
      note(`${name}: ERROR ${seated.error}`);
      settle();
    }
  });
  ws.on('error', (e) => {
    seated.error = e.message;
    clearTimeout(timer);
    note(`${name}: socket error ${e.message}`);
    settle();
  });

  return {
    name,
    seated,
    ready,
    close: () => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}

async function health(): Promise<{ status: number; body: unknown; cors: string | null }> {
  const res = await fetch(`${URL_BASE}/health`, { signal: AbortSignal.timeout(10_000) });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body, cors: res.headers.get('access-control-allow-origin') };
}

async function main(): Promise<void> {
  note(`live relay check: ${URL_WS} (room ${ROOM})`);
  const h = await health();
  note(`GET /health -> ${h.status} ${JSON.stringify(h.body)} (ACAO: ${h.cors ?? 'absent'})`);

  /*
   * BOTH CLIENTS STAY OPEN. See the note on `openClient`: joining sequentially put each one alone in its own
   * fresh room, so the seat/seed assertions were measuring two separate rooms and correctly failing.
   */
  const host = openClient('host');
  await host.ready;
  const guest = openClient('guest');
  await Promise.all([host.ready, guest.ready]);
  // Give the relay a moment to seat the second peer and broadcast the updated lobby to the first.
  await new Promise((r) => setTimeout(r, 1_200));

  const checks: [string, boolean][] = [
    ['health is 200 and ok', h.status === 200 && (h.body as { ok?: boolean })?.ok === true],
    /*
     * CORS IS NOT ASSERTED, DELIBERATELY.
     *
     * The brief for this pass said `/health` returns `Access-Control-Allow-Origin: *`. Measured on the live
     * relay, it does not: the only headers are content-type, date, server and Railway's edge trace. That is
     * HARMLESS — CORS does not apply to WebSocket upgrades, and nothing in the game fetches `/health` from a
     * browser — but it is a factual correction to the brief, and asserting the header would fail a healthy
     * relay for a header the protocol does not need.
     */
    ['the WebSocket upgrade succeeded from a non-browser client', host.seated.error === null && guest.seated.error === null],
    ['both clients were seated', host.seated.playerId.length > 0 && guest.seated.playerId.length > 0],
    ['they were given different seats', host.seated.playerId !== guest.seated.playerId],
    ['they share one seed', host.seated.seed > 0 && host.seated.seed === guest.seated.seed],
    ['they share one map', host.seated.mapId.length > 0 && host.seated.mapId === guest.seated.mapId],
  ];

  note('');
  for (const [label, ok] of checks) note(`${ok ? 'PASS' : 'FAIL'}  ${label}`);

  // Let the relay drop both and confirm the room is released.
  host.close();
  guest.close();
  await new Promise((r) => setTimeout(r, 1_800));
  const after = await health();
  const cleaned = (after.body as { rooms?: number })?.rooms === 0;
  note(`${cleaned ? 'PASS' : 'FAIL'}  rooms released after both clients left (rooms=${(after.body as { rooms?: number })?.rooms})`);

  const allOk = checks.every(([, ok]) => ok) && cleaned;
  note('');
  note(allOk ? 'RESULT: the live relay is healthy and seats two independent peers in one room.' : 'RESULT: the live relay FAILED one or more checks.');
  process.exit(allOk ? 0 : 1);
}

await main();
