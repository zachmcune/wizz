/**
 * Lockstep relay core: room state, lobby sync, command merge, WebSocket handlers.
 * Shared by local dev (`server.mjs`) and production (`production.mjs`).
 */
import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const protocolConstants = JSON.parse(readFileSync(join(__dirname, '../protocol-constants.json'), 'utf8'));

const TICK_MS = protocolConstants.RELAY_TICK_MS;
const MATCH_LOAD_GRACE_MS = protocolConstants.MATCH_LOAD_GRACE_MS;
const LEAD_TICKS = protocolConstants.LEAD_TICKS;
const STALL_DROP_MS = protocolConstants.STALL_DROP_MS;
const REJOIN_GRACE_MS = 30 * 60 * 1000;
const WS_KEEPALIVE_MS = 30_000;

const DEFAULT_LOBBY = {
  mapId: 'duel_glade',
  factionId: 'arcane',
  deadSpectatorReveal: false,
  projectionMode: 'ortho',
  slots: [
    { id: 'player0', kind: 'human', team: 'a', color: '#4f9dff', startIndex: null, factionId: 'arcane', claimedBy: null, ready: false },
    { id: 'player1', kind: 'open', team: 'b', color: '#ff5d5d', startIndex: null, factionId: 'arcane', claimedBy: null, ready: false },
    { id: 'player2', kind: 'open', team: 'c', color: '#5dff8f', startIndex: null, factionId: 'arcane', claimedBy: null, ready: false },
    { id: 'player3', kind: 'open', team: 'd', color: '#ffd166', startIndex: null, factionId: 'arcane', claimedBy: null, ready: false },
  ],
};

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

function cloneLobby(state) {
  return JSON.parse(JSON.stringify(state));
}

function humanSlots(state) {
  return state.slots.filter((s) => s.kind === 'human' || s.kind === 'open');
}

function maxHumans(state) {
  return humanSlots(state).length;
}

function connectedHumans(room) {
  return [...room.clients.values()].filter((c) => c.slotId).length;
}

class Room {
  /** @param {string} id @param {Map<string, Room>} rooms */
  constructor(id, rooms) {
    this.id = id;
    this.rooms = rooms;
    this.seed = randomInt(1, 0xffffffff);
    /** @type {import('./relay-types').LobbyStateWire} */
    this.lobbyState = cloneLobby(DEFAULT_LOBBY);
    /** @type {import('ws').WebSocket | null} */
    this.hostWs = null;
    /** @type {Map<import('ws').WebSocket, { connId: string; slotId: string | null }>} */
    this.clients = new Map();
    /** @type {import('./relay-types').PendingCommand[]} */
    this.pending = [];
    this.tick = 0;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.interval = null;
    this.started = false;
    /** connId of the room host (stable across reconnects). */
    this.hostConnId = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.cleanupTimer = null;
    /** connIds waiting for the host to answer with a state snapshot. */
    this.snapshotRequesters = new Set();
  }

  /** @param {import('ws').WebSocket} ws @param {import('./relay-types').LobbyStateWire | undefined} initialLobby */
  addClient(ws, initialLobby) {
    if (this.started) {
      ws.send(JSON.stringify({ t: 'error', message: 'Match already started' }));
      ws.close();
      return null;
    }

    const connId = randomBytes(8).toString('hex');
    const isHost = this.clients.size === 0;
    let slotId = null;
    if (isHost) {
      this.hostWs = ws;
      this.hostConnId = connId;
      if (initialLobby) this.lobbyState = cloneLobby(initialLobby);
      const hostSlot = this.lobbyState.slots.find((s) => s.kind === 'human');
      if (hostSlot) {
        hostSlot.claimedBy = connId;
        hostSlot.ready = true;
        slotId = hostSlot.id;
      }
    }

    // lastAckTick: highest sim tick this client reports processed (-1 = none yet).
    // lastAckAtMs seeds to join time so a still-loading client counts as active
    // during the load grace instead of being treated as stalled.
    this.clients.set(ws, { connId, slotId, lastAckTick: -1, lastAckAtMs: Date.now() });

    const waiting = connectedHumans(this) < maxHumans(this.lobbyState);

    ws.send(
      JSON.stringify({
        t: 'joined',
        connId,
        playerId: slotId ?? connId,
        seed: this.seed,
        startTick: 0,
        isHost,
        lobbyState: this.lobbyState,
        waiting,
      }),
    );

    this.broadcastExcept(ws, { t: 'peerJoined', playerId: connId });
    this.broadcastWaiting();

    return connId;
  }

  /** @param {import('ws').WebSocket} ws @param {string} connId */
  rejoinClient(ws, connId) {
    if (!this.started) {
      ws.send(JSON.stringify({ t: 'error', message: 'Match not started' }));
      ws.close();
      return null;
    }
    const slot = this.lobbyState.slots.find((s) => s.claimedBy === connId);
    if (!slot) {
      ws.send(JSON.stringify({ t: 'error', message: 'No slot to rejoin' }));
      ws.close();
      return null;
    }

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const isHost = connId === this.hostConnId;
    if (isHost) this.hostWs = ws;

    this.clients.set(ws, { connId, slotId: slot.id, lastAckTick: -1, lastAckAtMs: Date.now() });

    ws.send(
      JSON.stringify({
        t: 'joined',
        connId,
        playerId: slot.id,
        seed: this.seed,
        startTick: this.tick,
        isHost,
        lobbyState: this.lobbyState,
        waiting: false,
      }),
    );

    this.broadcastExcept(ws, { t: 'peerJoined', playerId: connId });

    if (!this.interval) {
      const now = Date.now();
      for (const info of this.clients.values()) info.lastAckAtMs = now;
      this.interval = setInterval(() => this.tryAdvance(), TICK_MS);
    }

    return connId;
  }

  /** @param {import('ws').WebSocket} ws @param {import('./relay-types').LobbyStateWire} state */
  updateLobby(ws, state) {
    if (ws !== this.hostWs) {
      ws.send(JSON.stringify({ t: 'error', message: 'Only the host can update lobby settings' }));
      return;
    }
    const prevClaims = new Map(this.lobbyState.slots.map((s) => [s.id, s.claimedBy]));
    const prevReady = new Map(this.lobbyState.slots.map((s) => [s.id, s.ready]));
    this.lobbyState = cloneLobby(state);
    for (const slot of this.lobbyState.slots) {
      const prevClaim = prevClaims.get(slot.id);
      const prevRd = prevReady.get(slot.id);
      const claimable = slot.kind === 'human' || slot.kind === 'open';
      if (claimable && slot.claimedBy == null && prevClaim) {
        slot.claimedBy = prevClaim;
      }
      if (!claimable) {
        slot.claimedBy = null;
        slot.ready = false;
      } else if (prevRd !== undefined) {
        slot.ready = prevRd;
      }
    }
    const hostInfo = this.clients.get(this.hostWs);
    if (hostInfo) {
      const hostSlot = this.lobbyState.slots.find((s) => s.claimedBy === hostInfo.connId);
      if (hostSlot) hostSlot.ready = true;
    }
    this.broadcast({ t: 'lobbyState', state: this.lobbyState });
    this.broadcastWaiting();
  }

  /** @param {import('ws').WebSocket} ws @param {string} slotId @param {string} team @param {string} color @param {number} startIndex @param {string} factionId */
  claimSlot(ws, slotId, team, color, startIndex, factionId) {
    const info = this.clients.get(ws);
    if (!info) return;
    const slot = this.lobbyState.slots.find((s) => s.id === slotId);
    if (!slot || (slot.kind !== 'human' && slot.kind !== 'open')) {
      ws.send(JSON.stringify({ t: 'error', message: 'Slot is not available' }));
      return;
    }
    if (slot.claimedBy && slot.claimedBy !== info.connId) {
      ws.send(JSON.stringify({ t: 'error', message: 'Slot already claimed' }));
      return;
    }
    const cornerTaken =
      startIndex !== null &&
      startIndex !== undefined &&
      this.lobbyState.slots.some(
        (s) => s.id !== slotId && s.kind !== 'closed' && s.startIndex === startIndex,
      );
    if (cornerTaken) {
      ws.send(JSON.stringify({ t: 'error', message: 'Corner already taken' }));
      return;
    }

    if (slot.kind === 'open') slot.kind = 'human';
    slot.claimedBy = info.connId;
    slot.team = team;
    slot.color = color;
    slot.startIndex = startIndex;
    slot.factionId = factionId;
    slot.ready = false;
    info.slotId = slotId;

    ws.send(JSON.stringify({ t: 'joined', connId: info.connId, playerId: slotId, seed: this.seed, startTick: 0, isHost: ws === this.hostWs, lobbyState: this.lobbyState, waiting: true }));

    this.broadcast({ t: 'lobbyState', state: this.lobbyState });
    this.broadcastWaiting();
  }

  /** @param {import('ws').WebSocket} ws @param {string} slotId @param {boolean} ready */
  setReady(ws, slotId, ready) {
    const info = this.clients.get(ws);
    if (!info) return;
    const slot = this.lobbyState.slots.find((s) => s.id === slotId);
    if (!slot || slot.claimedBy !== info.connId) {
      ws.send(JSON.stringify({ t: 'error', message: 'Cannot ready an unclaimed slot' }));
      return;
    }
    slot.ready = ready;
    this.broadcast({ t: 'lobbyState', state: this.lobbyState });
    this.broadcastWaiting();
  }

  /** @param {import('ws').WebSocket} ws */
  tryStartMatch(ws) {
    if (ws !== this.hostWs) {
      ws.send(JSON.stringify({ t: 'error', message: 'Only the host can start the match' }));
      return;
    }
    const active = this.lobbyState.slots.filter((s) => s.kind !== 'closed');
    const corners = new Set();
    for (const slot of active) {
      if (slot.startIndex === null || slot.startIndex === undefined) {
        ws.send(JSON.stringify({ t: 'error', message: 'Each player must choose a starting position' }));
        return;
      }
      if (corners.has(slot.startIndex)) {
        ws.send(JSON.stringify({ t: 'error', message: 'Each player needs a unique starting position' }));
        return;
      }
      corners.add(slot.startIndex);
    }

    const needed = humanSlots(this.lobbyState);
    for (const slot of needed) {
      if (!slot.claimedBy) {
        ws.send(JSON.stringify({ t: 'error', message: 'Not all player slots are claimed' }));
        return;
      }
      if (!slot.ready) {
        ws.send(JSON.stringify({ t: 'error', message: 'Not all players are ready' }));
        return;
      }
    }
    if (this.clients.size < needed.length) {
      ws.send(JSON.stringify({ t: 'error', message: 'Waiting for all players to join' }));
      return;
    }

    for (const [clientWs, info] of this.clients) {
      if (!info.slotId) {
        ws.send(JSON.stringify({ t: 'error', message: 'A connected player has not claimed a slot' }));
        return;
      }
      void clientWs;
    }

    this.started = true;
    for (const slot of this.lobbyState.slots) {
      if (slot.kind === 'open') slot.kind = 'human';
    }

    this.broadcast({ t: 'matchStart', startTick: 0, seed: this.seed, state: this.lobbyState });
    if (this.interval) return;
    setTimeout(() => {
      if (this.clients.size === 0) return;
      // Measure the stall window from when ticking begins, not from join time.
      const now = Date.now();
      for (const info of this.clients.values()) info.lastAckAtMs = now;
      this.interval = setInterval(() => this.tryAdvance(), TICK_MS);
    }, MATCH_LOAD_GRACE_MS);
  }

  /**
   * Peer-paced clock: advance only while the relay is within LEAD_TICKS of the
   * slowest responsive peer. Returns false when the clock is intentionally paused
   * waiting for a lagging peer (which bounds cross-client drift to LEAD_TICKS).
   */
  canAdvance() {
    const now = Date.now();
    let minAcked = Infinity;
    let active = 0;
    for (const info of this.clients.values()) {
      if (!info.slotId) continue;
      if (now - info.lastAckAtMs > STALL_DROP_MS) continue; // stalled peer: excluded from pacing
      active++;
      if (info.lastAckTick < minAcked) minAcked = info.lastAckTick;
    }
    // No responsive peers: keep the clock running so the room can recover instead of
    // deadlocking; returning peers resync via a state snapshot.
    if (active === 0) return true;
    return this.tick <= minAcked + LEAD_TICKS;
  }

  tryAdvance() {
    if (!this.canAdvance()) return;
    this.advance();
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

  /** @param {import('ws').WebSocket} ws @param {number} tick */
  receiveAck(ws, tick) {
    const info = this.clients.get(ws);
    if (!info || !info.slotId) return;
    if (typeof tick !== 'number' || !Number.isFinite(tick)) return;
    if (tick > info.lastAckTick) info.lastAckTick = tick;
    info.lastAckAtMs = Date.now();
  }

  /** @param {import('ws').WebSocket} ws @param {number} forTick @param {import('../src/sim/types').Command[]} cmds */
  receiveCommands(ws, forTick, cmds) {
    const info = this.clients.get(ws);
    if (!info || !info.slotId || !cmds?.length) return;
    const effective = forTick < this.tick ? this.tick : forTick;
    this.pending.push({ playerId: info.slotId, forTick: effective, cmds });
  }

  /**
   * A peer that fell too far behind asks the host for an authoritative snapshot.
   * The relay forwards the request to the host and remembers who to reply to.
   * @param {import('ws').WebSocket} ws
   */
  requestSnapshot(ws) {
    const info = this.clients.get(ws);
    if (!info) return;
    if (!this.hostWs || this.hostWs.readyState !== 1) return;
    this.snapshotRequesters.add(info.connId);
    this.hostWs.send(JSON.stringify({ t: 'snapshotRequest', forConnId: info.connId }));
  }

  /**
   * The host answers a snapshot request with a serialized sim state. The relay
   * forwards it to every pending requester and treats delivery as progress so the
   * paced clock does not stall on the peer that was catching up.
   * @param {import('ws').WebSocket} ws @param {number} fromTick @param {unknown} state
   */
  receiveSnapshot(ws, fromTick, state) {
    if (ws !== this.hostWs) return;
    if (this.snapshotRequesters.size === 0) return;
    const msg = JSON.stringify({ t: 'snapshot', fromTick, state });
    const now = Date.now();
    for (const [clientWs, info] of this.clients) {
      if (!this.snapshotRequesters.has(info.connId)) continue;
      if (clientWs.readyState === 1) clientWs.send(msg);
      if (typeof fromTick === 'number') info.lastAckTick = Math.max(info.lastAckTick, fromTick);
      info.lastAckAtMs = now;
    }
    this.snapshotRequesters.clear();
  }

  /** @param {import('ws').WebSocket} ws @param {number} tick @param {string} hash */
  receiveChecksum(ws, tick, hash) {
    const info = this.clients.get(ws);
    if (!info || !info.slotId) return;
    for (const [other] of this.clients) {
      if (other !== ws) {
        other.send(JSON.stringify({ t: 'peerChecksum', playerId: info.slotId, tick, hash }));
      }
    }
  }

  /** @param {import('ws').WebSocket} ws */
  removeClient(ws) {
    const info = this.clients.get(ws);
    this.clients.delete(ws);
    if (info) {
      this.snapshotRequesters.delete(info.connId);
      if (!this.started) {
        for (const slot of this.lobbyState.slots) {
          if (slot.claimedBy === info.connId) {
            slot.claimedBy = null;
            slot.ready = false;
            if (slot.kind === 'human' && ws !== this.hostWs) slot.kind = 'open';
          }
        }
        this.broadcast({ t: 'peerLeft', playerId: info.connId });
        this.broadcast({ t: 'lobbyState', state: this.lobbyState });
        this.broadcastWaiting();
      } else {
        this.broadcast({ t: 'peerDisconnected', playerId: info.connId });
      }
    }
    if (ws === this.hostWs) this.hostWs = null;
    if (this.clients.size === 0) {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      if (!this.started) {
        this.rooms.delete(this.id);
      } else if (!this.cleanupTimer) {
        this.cleanupTimer = setTimeout(() => {
          if (this.clients.size === 0) this.rooms.delete(this.id);
        }, REJOIN_GRACE_MS);
      }
    }
  }

  broadcastWaiting() {
    const max = maxHumans(this.lobbyState);
    const count = this.clients.size;
    this.broadcast({ t: 'waiting', playerCount: count, maxPlayers: max });
  }

  /** @param {Record<string, unknown>} msg */
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients.keys()) {
      if (ws.readyState === 1) ws.send(data);
    }
  }

  /** @param {import('ws').WebSocket} except @param {Record<string, unknown>} msg */
  broadcastExcept(except, msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients.keys()) {
      if (ws !== except && ws.readyState === 1) ws.send(data);
    }
  }
}

/**
 * Attach lockstep relay WebSocket handling to an existing HTTP server.
 * @param {import('node:http').Server} server
 */
export { Room, DEFAULT_LOBBY };

export function attachRelay(server) {
  /** @type {Map<string, Room>} */
  const rooms = new Map();

  const wss = new WebSocketServer({ server });

  const keepalive = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, WS_KEEPALIVE_MS);
  keepalive.unref();

  wss.on('connection', (ws) => {
    /** @type {Room | null} */
    let room = null;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      if (msg.t === 'join') {
        const roomId = String(msg.room ?? '').toUpperCase();
        if (!roomId) {
          ws.send(JSON.stringify({ t: 'error', message: 'Room code required' }));
          return;
        }
        if (!rooms.has(roomId)) rooms.set(roomId, new Room(roomId, rooms));
        room = rooms.get(roomId);
        room.addClient(ws, msg.lobbyState);
        return;
      }

      if (msg.t === 'rejoin') {
        const roomId = String(msg.room ?? '').toUpperCase();
        const connId = String(msg.connId ?? '');
        if (!roomId || !connId) {
          ws.send(JSON.stringify({ t: 'error', message: 'Room and connection id required' }));
          return;
        }
        room = rooms.get(roomId) ?? null;
        if (!room) {
          ws.send(JSON.stringify({ t: 'error', message: 'Room not found' }));
          ws.close();
          return;
        }
        room.rejoinClient(ws, connId);
        return;
      }

      if (!room) return;
      if (msg.t === 'lobbyUpdate') room.updateLobby(ws, msg.state);
      else if (msg.t === 'claimSlot') room.claimSlot(ws, msg.slotId, msg.team, msg.color, msg.startIndex, msg.factionId);
      else if (msg.t === 'slotReady') room.setReady(ws, msg.slotId, msg.ready);
      else if (msg.t === 'startMatch') room.tryStartMatch(ws);
      else if (msg.t === 'commands') room.receiveCommands(ws, msg.forTick, msg.cmds);
      else if (msg.t === 'checksum') room.receiveChecksum(ws, msg.tick, msg.hash);
      else if (msg.t === 'ack') room.receiveAck(ws, msg.tick);
      else if (msg.t === 'snapshotRequest') room.requestSnapshot(ws);
      else if (msg.t === 'snapshot') room.receiveSnapshot(ws, msg.tick, msg.state);
    });

    ws.on('close', () => room?.removeClient(ws));
  });

  return {
    get roomCount() {
      return rooms.size;
    },
  };
}
