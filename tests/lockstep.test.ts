import { describe, it, expect } from 'vitest';
import { LockstepClient, type Transport } from '../src/net/lockstep';
import { INPUT_DELAY_TICKS } from '../src/net/protocol';
import type { Command } from '../src/sim/types';

class FakeTransport implements Transport {
  sent: { forTick: number; cmds: Command[] }[] = [];
  checksums: { tick: number; hash: string }[] = [];
  private tickCb: ((tick: number, cmds: Command[]) => void) | null = null;
  private peerCb: ((playerId: string, tick: number, hash: string) => void) | null = null;

  send(forTick: number, cmds: Command[]): void {
    this.sent.push({ forTick, cmds });
  }
  reportChecksum(tick: number, hash: string): void {
    this.checksums.push({ tick, hash });
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
