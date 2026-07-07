/**
 * Lockstep relay core: room state, lobby sync, command merge, WebSocket handlers.
 * Shared by local dev (`server.mjs`) and production (`production.mjs`).
 */
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';

const TICK_MS = 50;
const MATCH_LOAD_GRACE_MS = 2500;
const WS_KEEPALIVE_MS = 30_000;

const DEFAULT_LOBBY = {
  mapId: 'duel_glade',
  factionId: 'arcane',
  slots: [
    { id: 'player0', kind: 'human', team: 'a', color: '#4f9dff', startIndex: 0, factionId: 'arcane', claimedBy: null, ready: false },
    { id: 'player1', kind: 'open', team: 'b', color: '#ff5d5d', startIndex: 3, factionId: 'arcane', claimedBy: null, ready: false },
    { id: 'player2', kind: 'closed', team: 'c', color: '#5dff8f', startIndex: 2, factionId: 'arcane', claimedBy: null, ready: false },
    { id: 'player3', kind: 'closed', team: 'd', color: '#ffd166', startIndex: 1, factionId: 'arcane', claimedBy: null, ready: false },
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
    if (isHost) {
      this.hostWs = ws;
      if (initialLobby) this.lobbyState = cloneLobby(initialLobby);
      const hostSlot = this.lobbyState.slots.find((s) => s.kind === 'human');
      if (hostSlot) {
        hostSlot.claimedBy = connId;
        hostSlot.ready = true;
      }
    }

    this.clients.set(ws, { connId, slotId: null });

    const waiting = connectedHumans(this) < maxHumans(this.lobbyState);

    ws.send(
      JSON.stringify({
        t: 'joined',
        connId,
        playerId: connId,
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
      if (prevClaims.has(slot.id) && slot.claimedBy == null) {
        slot.claimedBy = prevClaims.get(slot.id) ?? null;
      }
      if (prevReady.has(slot.id)) slot.ready = prevReady.get(slot.id) ?? false;
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
    const cornerTaken = this.lobbyState.slots.some(
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
      this.interval = setInterval(() => this.advance(), TICK_MS);
    }, MATCH_LOAD_GRACE_MS);
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
    if (!info || !info.slotId || !cmds?.length) return;
    const effective = forTick < this.tick ? this.tick : forTick;
    this.pending.push({ playerId: info.slotId, forTick: effective, cmds });
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
    }
    if (ws === this.hostWs) this.hostWs = null;
    if (this.clients.size === 0) {
      if (this.interval) clearInterval(this.interval);
      this.rooms.delete(this.id);
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

      if (!room) return;
      if (msg.t === 'lobbyUpdate') room.updateLobby(ws, msg.state);
      else if (msg.t === 'claimSlot') room.claimSlot(ws, msg.slotId, msg.team, msg.color, msg.startIndex, msg.factionId);
      else if (msg.t === 'slotReady') room.setReady(ws, msg.slotId, msg.ready);
      else if (msg.t === 'startMatch') room.tryStartMatch(ws);
      else if (msg.t === 'commands') room.receiveCommands(ws, msg.forTick, msg.cmds);
      else if (msg.t === 'checksum') room.receiveChecksum(ws, msg.tick, msg.hash);
    });

    ws.on('close', () => room?.removeClient(ws));
  });

  return {
    get roomCount() {
      return rooms.size;
    },
  };
}
