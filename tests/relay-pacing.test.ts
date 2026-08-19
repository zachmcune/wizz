import { describe, it, expect } from 'vitest';
// The relay is plain JS shared by dev and production entry points.
import { Room } from '../relay/relay-app.mjs';
import { LEAD_TICKS, STALL_DROP_MS } from '../src/net/protocol';

interface FakeWs {
  readyState: number;
  sent: string[];
  send(data: string): void;
}

interface ClientInfo {
  connId: string;
  slotId: string | null;
  lastAckTick: number;
  lastAckAtMs: number;
}

interface RoomLike {
  tick: number;
  clients: Map<FakeWs, ClientInfo>;
  canAdvance(): boolean;
  tryAdvance(): void;
  receiveAck(ws: FakeWs, tick: number): void;
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
  };
}

function addSlotted(room: RoomLike, ws: FakeWs, connId: string, slotId: string): void {
  room.clients.set(ws, { connId, slotId, lastAckTick: -1, lastAckAtMs: Date.now() });
}

describe('relay peer-paced clock', () => {
  it('does not advance beyond LEAD_TICKS of the slowest (unacked) peer', () => {
    const room = makeRoom();
    const a = fakeWs();
    const b = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    addSlotted(room, b, 'b', 'player1');

    room.tick = 0;
    expect(room.canAdvance()).toBe(true);
    room.tick = LEAD_TICKS - 1; // still within lead of an unacked peer (lastAckTick -1)
    expect(room.canAdvance()).toBe(true);
    room.tick = LEAD_TICKS; // LEAD_TICKS > (-1) + LEAD_TICKS -> paused waiting for acks
    expect(room.canAdvance()).toBe(false);
  });

  it('resumes advancing once every peer acks progress', () => {
    const room = makeRoom();
    const a = fakeWs();
    const b = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    addSlotted(room, b, 'b', 'player1');

    room.tick = LEAD_TICKS;
    expect(room.canAdvance()).toBe(false);
    room.receiveAck(a, 5);
    expect(room.canAdvance()).toBe(false); // b still at -1 (the slowest)
    room.receiveAck(b, 5);
    expect(room.canAdvance()).toBe(true); // minAcked 5 -> tick <= 5 + LEAD_TICKS
  });

  it('excludes a peer that has been silent beyond STALL_DROP_MS', () => {
    const room = makeRoom();
    const a = fakeWs();
    const b = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    addSlotted(room, b, 'b', 'player1');

    room.receiveAck(a, 5);
    room.clients.get(b)!.lastAckAtMs = Date.now() - (STALL_DROP_MS + 1_000);

    room.tick = 5 + LEAD_TICKS; // only 'a' counts: tick == 5 + LEAD_TICKS
    expect(room.canAdvance()).toBe(true);
    room.tick = 5 + LEAD_TICKS + 1; // past a's lead -> paused
    expect(room.canAdvance()).toBe(false);
  });

  it('keeps a peer in the pacing set through an 8s wifi blip', () => {
    const room = makeRoom();
    const a = fakeWs();
    const b = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    addSlotted(room, b, 'b', 'player1');

    room.receiveAck(a, 5);
    room.receiveAck(b, 5);
    room.clients.get(b)!.lastAckAtMs = Date.now() - 8_000;

    room.tick = 5 + LEAD_TICKS + 1;
    expect(room.canAdvance()).toBe(false); // b still counts, so the clock waits
  });

  it('keeps the clock running when no peer is responsive (recovery)', () => {
    const room = makeRoom();
    const a = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    room.clients.get(a)!.lastAckAtMs = Date.now() - (STALL_DROP_MS + 1_000);
    room.tick = 999;
    expect(room.canAdvance()).toBe(true);
  });

  it('tryAdvance emits a tick and advances the clock when unblocked', () => {
    const room = makeRoom();
    const a = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    room.tick = 0;
    room.tryAdvance();
    expect(room.tick).toBe(1);
    const msgs = a.sent.map((d) => JSON.parse(d));
    expect(msgs.some((m) => m.t === 'tick' && m.tick === 0)).toBe(true);
  });

  it('tryAdvance is a no-op while paused for a lagging peer', () => {
    const room = makeRoom();
    const a = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    room.tick = LEAD_TICKS; // unacked peer -> paused
    room.tryAdvance();
    expect(room.tick).toBe(LEAD_TICKS);
    expect(a.sent).toHaveLength(0);
  });

  it('receiveAck records the highest processed tick and refreshes liveness', () => {
    const room = makeRoom();
    const a = fakeWs();
    addSlotted(room, a, 'a', 'player0');
    room.receiveAck(a, 10);
    expect(room.clients.get(a)!.lastAckTick).toBe(10);
    room.receiveAck(a, 5); // stale ack must not lower progress
    expect(room.clients.get(a)!.lastAckTick).toBe(10);
  });
});
