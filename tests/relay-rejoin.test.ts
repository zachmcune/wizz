import { describe, it, expect } from 'vitest';
import { Room } from '../relay/relay-app.mjs';

interface FakeWs {
  readyState: number;
  sent: string[];
  send(data: string): void;
  close(): void;
}

interface ClientInfo {
  connId: string;
  slotId: string | null;
  lastAckTick: number;
  lastAckAtMs: number;
}

interface RoomLike {
  tick: number;
  started: boolean;
  hostConnId: string | null;
  lobbyState: { slots: Array<{ id: string; claimedBy: string | null; kind: string }> };
  clients: Map<FakeWs, ClientInfo>;
  addClient(ws: FakeWs, initialLobby?: unknown): string | null;
  rejoinClient(ws: FakeWs, connId: string): string | null;
  removeClient(ws: FakeWs): void;
  tryStartMatch(ws: FakeWs): void;
  claimSlot(ws: FakeWs, slotId: string, team: string, color: string, startIndex: number, factionId: string): void;
  setReady(ws: FakeWs, slotId: string, ready: boolean): void;
}

function makeRoom(): RoomLike {
  return new Room('R', new Map()) as unknown as RoomLike;
}

function fakeWs(): FakeWs {
  return {
    readyState: 1,
    sent: [],
    send(data: string) {
      this.sent.push(data);
    },
    close() {},
  };
}

function hostLobby() {
  return {
    mapId: 'duel_glade',
    factionId: 'arcane',
    slots: [
      { id: 'player0', kind: 'human', team: 'a', color: '#4f9dff', startIndex: 0, factionId: 'arcane', claimedBy: null, ready: true },
      { id: 'player1', kind: 'human', team: 'b', color: '#ff5d5d', startIndex: 1, factionId: 'arcane', claimedBy: null, ready: true },
    ],
  };
}

describe('relay rejoin', () => {
  it('keeps slot claims after disconnect during a started match', () => {
    const room = makeRoom();
    const host = fakeWs();
    const guest = fakeWs();
    room.addClient(host, hostLobby());
    room.addClient(guest);
    room.claimSlot(guest, 'player1', 'b', '#ff5d5d', 1, 'arcane');
    const guestConnId = room.clients.get(guest)!.connId;
    room.setReady(guest, 'player1', true);
    room.tryStartMatch(host);
    expect(room.started).toBe(true);

    room.removeClient(guest);
    expect(room.lobbyState.slots.find((s) => s.id === 'player1')!.claimedBy).toBe(guestConnId);
  });

  it('allows a disconnected player to rejoin the same slot', () => {
    const room = makeRoom();
    const host = fakeWs();
    const guest = fakeWs();
    room.addClient(host, hostLobby());
    room.addClient(guest);
    room.claimSlot(guest, 'player1', 'b', '#ff5d5d', 1, 'arcane');
    const guestConnId = room.clients.get(guest)!.connId;
    room.setReady(guest, 'player1', true);
    room.tryStartMatch(host);
    room.tick = 42;
    room.removeClient(guest);

    const rejoinWs = fakeWs();
    room.rejoinClient(rejoinWs, guestConnId);
    const rejoined = JSON.parse(rejoinWs.sent.at(-1)!);
    expect(rejoined.t).toBe('joined');
    expect(rejoined.playerId).toBe('player1');
    expect(rejoined.startTick).toBe(42);
    expect(room.clients.get(rejoinWs)?.slotId).toBe('player1');
  });
});
