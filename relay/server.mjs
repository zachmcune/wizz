#!/usr/bin/env node
/**
 * Local/dev lockstep relay. Merges per-tick commands and broadcasts at 20 Hz.
 * Run: npm run relay
 */
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';

const TICK_MS = 50;
const PORT = Number(process.env.PORT ?? 8787);
const PLAYER_SLOTS = ['player0', 'player1'];

/** @param {import('./relay-types').PendingCommand[]} pending @param {number} tick */
function mergePending(pending, tick) {
  /** @type {Map<string, import('../src/sim/types').Command[]>} */
  const byPlayer = new Map();
  for (const p of pending) {
    if (p.forTick !== tick) continue;
    const list = byPlayer.get(p.playerId) ?? [];
    list.push(...p.cmds);
    byPlayer.set(p.playerId, list);
  }
  const merged = [];
  for (const pid of [...byPlayer.keys()].sort()) {
    merged.push(...byPlayer.get(pid));
  }
  return merged;
}

class Room {
  /** @param {string} id @param {string} matchId */
  constructor(id, matchId) {
    this.id = id;
    this.matchId = matchId;
    this.seed = randomInt(1, 0xffffffff);
    /** @type {Map<import('ws').WebSocket, { playerId: string }>} */
    this.clients = new Map();
    /** @type {import('./relay-types').PendingCommand[]} */
    this.pending = [];
    this.tick = 0;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.interval = null;
    this.maxPlayers = 2;
  }

  /** @param {import('ws').WebSocket} ws */
  addClient(ws) {
    const taken = new Set([...this.clients.values()].map((c) => c.playerId));
    const playerId = PLAYER_SLOTS.find((s) => !taken.has(s));
    if (!playerId) {
      ws.send(JSON.stringify({ t: 'error', message: 'Room is full' }));
      ws.close();
      return null;
    }

    this.clients.set(ws, { playerId });
    const waiting = this.clients.size < this.maxPlayers;

    ws.send(
      JSON.stringify({
        t: 'joined',
        playerId,
        seed: this.seed,
        startTick: 0,
        waiting,
      }),
    );

    for (const [other, info] of this.clients) {
      if (other !== ws) {
        other.send(JSON.stringify({ t: 'peerJoined', playerId }));
      }
    }

    this.broadcast({ t: 'waiting', playerCount: this.clients.size, maxPlayers: this.maxPlayers });

    if (!waiting) this.startMatch();
    return playerId;
  }

  startMatch() {
    this.broadcast({ t: 'matchStart', startTick: 0 });
    if (this.interval) return;
    this.interval = setInterval(() => this.advance(), TICK_MS);
  }

  advance() {
    const merged = mergePending(this.pending, this.tick);
    this.pending = this.pending.filter((p) => p.forTick !== this.tick);
    const msg = JSON.stringify({ t: 'tick', tick: this.tick, cmds: merged });
    for (const ws of this.clients.keys()) {
      if (ws.readyState === 1) ws.send(msg);
    }
    this.tick++;
  }

  /** @param {import('ws').WebSocket} ws @param {number} forTick @param {import('../src/sim/types').Command[]} cmds */
  receiveCommands(ws, forTick, cmds) {
    const info = this.clients.get(ws);
    if (!info || !cmds?.length) return;
    this.pending.push({ playerId: info.playerId, forTick, cmds });
  }

  /** @param {import('ws').WebSocket} ws @param {number} tick @param {string} hash */
  receiveChecksum(ws, tick, hash) {
    const info = this.clients.get(ws);
    if (!info) return;
    for (const [other] of this.clients) {
      if (other !== ws) {
        other.send(JSON.stringify({ t: 'peerChecksum', playerId: info.playerId, tick, hash }));
      }
    }
  }

  /** @param {import('ws').WebSocket} ws */
  removeClient(ws) {
    const info = this.clients.get(ws);
    this.clients.delete(ws);
    if (info) this.broadcast({ t: 'peerLeft', playerId: info.playerId });
    if (this.clients.size === 0) {
      if (this.interval) clearInterval(this.interval);
      rooms.delete(this.id);
    }
  }

  /** @param {Record<string, unknown>} msg */
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients.keys()) {
      if (ws.readyState === 1) ws.send(data);
    }
  }
}

/** @type {Map<string, Room>} */
const rooms = new Map();

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  /** @type {Room | null} */
  let room = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    if (msg.t === 'join') {
      const roomId = String(msg.room ?? '').toUpperCase();
      const matchId = String(msg.matchId ?? 'skirmish_1v1_online');
      if (!roomId) {
        ws.send(JSON.stringify({ t: 'error', message: 'Room code required' }));
        return;
      }
      if (!rooms.has(roomId)) rooms.set(roomId, new Room(roomId, matchId));
      room = rooms.get(roomId);
      room.addClient(ws);
      return;
    }

    if (!room) return;
    if (msg.t === 'commands') room.receiveCommands(ws, msg.forTick, msg.cmds);
    else if (msg.t === 'checksum') room.receiveChecksum(ws, msg.tick, msg.hash);
  });

  ws.on('close', () => room?.removeClient(ws));
});

server.listen(PORT, () => {
  console.log(`[relay] lockstep relay listening on :${PORT}`);
});
