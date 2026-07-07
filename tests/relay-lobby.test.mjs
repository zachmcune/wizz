import { describe, it, expect } from 'vitest';
import { Room, DEFAULT_LOBBY } from '../relay/relay-app.mjs';

function mockWs() {
  const sent = [];
  return {
    sent,
    readyState: 1,
    send(data) {
      sent.push(JSON.parse(data));
    },
    close() {},
  };
}

function cloneLobby(state) {
  return JSON.parse(JSON.stringify(state));
}

function lobbyWithSlots(openCount) {
  const state = cloneLobby(DEFAULT_LOBBY);
  for (let i = 1; i < 4; i++) {
    state.slots[i].kind = i < openCount ? 'open' : 'closed';
    state.slots[i].claimedBy = null;
    state.slots[i].ready = false;
    if (state.slots[i].kind === 'closed') state.slots[i].startIndex = null;
  }
  for (let i = 0; i < openCount; i++) {
    state.slots[i].startIndex = i;
  }
  return state;
}

function claimGuest(room, ws, slotId, startIndex) {
  room.claimSlot(ws, slotId, 'b', '#ff5d5d', startIndex, 'arcane');
  room.setReady(ws, slotId, true);
}

describe('relay lobby', () => {
  it('assigns host slotId on join', () => {
    const rooms = new Map();
    const room = new Room('TEST', rooms);
    const host = mockWs();
    const connId = room.addClient(host, cloneLobby(DEFAULT_LOBBY));
    expect(connId).toBeTruthy();
    expect(host.sent[0].playerId).toBe('player0');
    expect(room.clients.get(host).slotId).toBe('player0');
  });

  it('starts a 3-player match when all slots are claimed and ready', () => {
    const rooms = new Map();
    const room = new Room('THREE', rooms);
    const lobby = lobbyWithSlots(3);
    const host = mockWs();
    const guest1 = mockWs();
    const guest2 = mockWs();

    room.addClient(host, lobby);
    room.addClient(guest1, undefined);
    room.addClient(guest2, undefined);

    claimGuest(room, guest1, 'player1', 1);
    claimGuest(room, guest2, 'player2', 2);
    room.setReady(host, 'player0', true);

    room.tryStartMatch(host);
    expect(host.sent.some((m) => m.t === 'error')).toBe(false);
    expect(room.started).toBe(true);
    expect(host.sent.some((m) => m.t === 'matchStart')).toBe(true);
  });

  it('starts a 4-player match when all slots are claimed and ready', () => {
    const rooms = new Map();
    const room = new Room('FOUR', rooms);
    const lobby = lobbyWithSlots(4);
    const host = mockWs();
    const guests = [mockWs(), mockWs(), mockWs()];

    room.addClient(host, lobby);
    for (const guest of guests) room.addClient(guest, undefined);

    claimGuest(room, guests[0], 'player1', 1);
    claimGuest(room, guests[1], 'player2', 2);
    claimGuest(room, guests[2], 'player3', 3);
    room.setReady(host, 'player0', true);

    room.tryStartMatch(host);
    expect(host.sent.some((m) => m.t === 'error')).toBe(false);
    expect(room.started).toBe(true);
  });

  it('rejects start when starting positions are missing', () => {
    const rooms = new Map();
    const room = new Room('BAD', rooms);
    const lobby = lobbyWithSlots(2);
    lobby.slots[0].startIndex = null;
    const host = mockWs();
    const guest = mockWs();

    room.addClient(host, lobby);
    room.addClient(guest, undefined);
    room.claimSlot(guest, 'player1', 'b', '#ff5d5d', null, 'arcane');
    room.setReady(guest, 'player1', true);
    room.setReady(host, 'player0', true);

    room.tryStartMatch(host);
    expect(host.sent.some((m) => m.t === 'error' && m.message.includes('starting position'))).toBe(true);
    expect(room.started).toBe(false);
  });
});
