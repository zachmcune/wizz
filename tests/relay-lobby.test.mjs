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
  const info = room.clients.get(ws);
  const assigned = info?.slotId;
  if (assigned !== slotId) {
    room.claimSlot(ws, slotId, 'b', '#ff5d5d', startIndex, 'arcane');
  } else if (startIndex !== null && startIndex !== undefined) {
    room.claimSlot(ws, slotId, 'b', '#ff5d5d', startIndex, 'arcane');
  }
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

  it('auto-assigns an unused starting position when a guest joins', () => {
    const rooms = new Map();
    const room = new Room('SPAWN', rooms);
    const lobby = cloneLobby(DEFAULT_LOBBY);
    lobby.slots[0].startIndex = 0;
    const host = mockWs();
    const guest = mockWs();

    room.addClient(host, lobby);
    room.addClient(guest, undefined);

    expect(room.lobbyState.slots[0].startIndex).toBe(0);
    expect(room.lobbyState.slots[1].startIndex).toBe(1);
  });

  it('reassigns starting position when the slot preset conflicts', () => {
    const rooms = new Map();
    const room = new Room('CONFLICT', rooms);
    const lobby = lobbyWithSlots(3);
    lobby.slots[1].startIndex = 0;
    const host = mockWs();
    const guest = mockWs();

    room.addClient(host, lobby);
    room.addClient(guest, undefined);

    expect(room.lobbyState.slots[0].startIndex).toBe(0);
    expect(room.lobbyState.slots[1].startIndex).toBe(1);
  });

  it('auto-assigns guests to the next open slot on join', () => {
    const rooms = new Map();
    const room = new Room('AUTO', rooms);
    const lobby = lobbyWithSlots(3);
    const host = mockWs();
    const guest = mockWs();

    room.addClient(host, lobby);
    const guestConnId = room.addClient(guest, undefined);

    expect(guestConnId).toBeTruthy();
    expect(guest.sent[0].playerId).toBe('player1');
    expect(room.clients.get(guest).slotId).toBe('player1');
    expect(room.lobbyState.slots[1].claimedBy).toBe(guestConnId);
    expect(room.lobbyState.slots[1].kind).toBe('human');
  });

  it('rejects join when the lobby is full', () => {
    const rooms = new Map();
    const room = new Room('FULL', rooms);
    const lobby = lobbyWithSlots(2);
    const host = mockWs();
    const guest1 = mockWs();
    const guest2 = mockWs();

    room.addClient(host, lobby);
    room.addClient(guest1, undefined);
    const extraConnId = room.addClient(guest2, undefined);

    expect(extraConnId).toBeNull();
    expect(guest2.sent.some((m) => m.t === 'error' && m.message.includes('full'))).toBe(true);
  });

  it('clears a previous slot when a guest claims a different one', () => {
    const rooms = new Map();
    const room = new Room('SWAP', rooms);
    const lobby = lobbyWithSlots(3);
    const host = mockWs();
    const guest = mockWs();

    room.addClient(host, lobby);
    room.addClient(guest, undefined);
    expect(room.clients.get(guest).slotId).toBe('player1');

    room.claimSlot(guest, 'player2', 'c', '#5dff8f', 2, 'arcane');
    expect(room.clients.get(guest).slotId).toBe('player2');
    expect(room.lobbyState.slots[1].claimedBy).toBeNull();
    expect(room.lobbyState.slots[1].kind).toBe('open');
    expect(room.lobbyState.slots[2].claimedBy).toBe(room.clients.get(guest).connId);
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

  it('clears guest claims when host closes or AI-fills a slot', () => {
    const rooms = new Map();
    const room = new Room('KICK', rooms);
    const lobby = lobbyWithSlots(2);
    const host = mockWs();
    const guest = mockWs();

    room.addClient(host, lobby);
    room.addClient(guest, undefined);
    claimGuest(room, guest, 'player1', 1);

    const closed = cloneLobby(room.lobbyState);
    closed.slots[1].kind = 'closed';
    closed.slots[1].claimedBy = null;
    closed.slots[1].ready = false;
    closed.slots[1].startIndex = null;
    room.updateLobby(host, closed);

    expect(room.lobbyState.slots[1].kind).toBe('closed');
    expect(room.lobbyState.slots[1].claimedBy).toBeNull();
    expect(room.lobbyState.slots[1].ready).toBe(false);

    const reopened = cloneLobby(DEFAULT_LOBBY);
    for (let i = 0; i < 2; i++) reopened.slots[i].startIndex = i;
    room.updateLobby(host, reopened);
    claimGuest(room, guest, 'player1', 1);

    const ai = cloneLobby(room.lobbyState);
    ai.slots[1].kind = 'ai';
    ai.slots[1].claimedBy = null;
    ai.slots[1].ready = false;
    room.updateLobby(host, ai);

    expect(room.lobbyState.slots[1].kind).toBe('ai');
    expect(room.lobbyState.slots[1].claimedBy).toBeNull();
  });
});
