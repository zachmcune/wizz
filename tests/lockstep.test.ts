import { describe, it, expect } from 'vitest';
import { LockstepClient, type Transport } from '../src/net/lockstep';
import { ACK_EVERY_TICKS, INPUT_DELAY_TICKS } from '../src/net/protocol';
import type { Command } from '../src/sim/types';

class FakeTransport implements Transport {
  sent: { forTick: number; cmds: Command[] }[] = [];
  checksums: { tick: number; hash: string }[] = [];
  acks: number[] = [];
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;

  send(forTick: number, cmds: Command[]): void {
    this.sent.push({ forTick, cmds });
  }
  reportChecksum(tick: number, hash: string): void {
    this.checksums.push({ tick, hash });
  }
  ackTick(tick: number): void {
    this.acks.push(tick);
  }
  onTickCommands(cb: (tick: number, cmds: Command[]) => void): void {
    this.tickCb = cb;
  }
  onPeerChecksum(cb: (playerId: string, tick: number, hash: string) => void): void {
    this.peerCb = cb;
  }
  emitTick(tick: number, cmds: Command[]): void {
    this.tickCb?.(tick, cmds);
  }
  emitPeerChecksum(playerId: string, tick: number, hash: string): void {
    this.peerCb?.(playerId, tick, hash);
  }
}

describe('lockstep scaffolding (V2)', () => {
  it('applies input delay to locally submitted commands', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    c.submitLocal(100, [{ type: 'stop', playerId: 'player0', entityIds: [1] }]);
    expect(t.sent[0]!.forTick).toBe(100 + INPUT_DELAY_TICKS);
  });

  it('schedules ahead of relay head so late packets are not dropped', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    t.emitTick(109, []);
    c.submitLocal(100, [{ type: 'stop', playerId: 'player0', entityIds: [1] }]);
    expect(t.sent[0]!.forTick).toBe(110 + INPUT_DELAY_TICKS);
  });

  it('surfaces confirmed per-tick commands from the relay', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    const cmds: Command[] = [{ type: 'stop', playerId: 'player1', entityIds: [2] }];
    t.emitTick(42, cmds);
    expect(c.commandsForTick(42)).toEqual(cmds);
  });

  it('fills missing tick numbers with empty command lists', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    t.emitTick(0, []);
    t.emitTick(3, [{ type: 'stop', playerId: 'player0', entityIds: [1] }]);
    expect(c.isTickReady(1)).toBe(true);
    expect(c.isTickReady(2)).toBe(true);
    expect(c.commandsForTick(1)).toEqual([]);
    expect(c.commandsForTick(2)).toEqual([]);
    expect(c.commandsForTick(3)).toHaveLength(1);
  });

  it('throttles processed-tick acks to at most one per ACK_EVERY_TICKS', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    // First ack always fires; subsequent acks only after ACK_EVERY_TICKS of progress.
    c.ackProcessed(0);
    c.ackProcessed(ACK_EVERY_TICKS - 1);
    expect(t.acks).toEqual([0]);
    c.ackProcessed(ACK_EVERY_TICKS);
    expect(t.acks).toEqual([0, ACK_EVERY_TICKS]);
  });

  it('never acks a tick lower than one already acked', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    c.ackNow(100);
    c.ackProcessed(50);
    expect(t.acks).toEqual([100]);
  });

  it('ackNow bypasses throttling for snapshot jumps', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    c.ackNow(500);
    c.ackNow(505);
    expect(t.acks).toEqual([500, 505]);
  });

  it('reports backlog relative to the confirmed relay head', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    t.emitTick(30, []);
    expect(c.lastConfirmedTick()).toBe(30);
    expect(c.backlog(10)).toBe(21); // ticks 10..30 inclusive
    expect(c.backlog(31)).toBe(0);
  });

  it('detects a desynced peer via mismatched checksums', () => {
    const t = new FakeTransport();
    const c = new LockstepClient(t);
    t.emitPeerChecksum('player1', 10, 'AAAA');
    t.emitPeerChecksum('player2', 10, 'BBBB');
    const bad = c.detectDesync(10, 'AAAA');
    expect(bad).toContain('player2');
    expect(bad).not.toContain('player1');
  });
});
