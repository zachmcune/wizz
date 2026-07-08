// Hosts a Simulation and exposes it via the message protocol. Pure logic (no Worker/DOM
// globals) so it is unit-testable in Node and reuses the exact same deterministic sim.
import type { Registry } from '../../data/registry';
import type { AiHook } from '../step';
import type { Command, GameState, GameEvent } from '../types';
import { initMatch } from '../factory';
import { Simulation } from '../simulation';
import { packState, unpackState, type TransferState } from '../state-transfer';
import { NavGrid } from '../nav-grid';
import { createServices } from '../context';
import { rebuildBuildingNav } from '../building-nav';
import { hashState } from '../hash';

export interface LockstepEntry {
  tick: number;
  cmds: Command[];
}

export interface LockstepBatchResult {
  state: TransferState;
  events: GameEvent[];
  lastTick: number;
  checksums: { tick: number; hash: string }[];
}

export class SimHost {
  private sim: Simulation | null = null;

  constructor(
    private registry: Registry,
    private defaultAiHook?: AiHook,
  ) {}

  initMatch(matchId: string): TransferState {
    const config = this.registry.match(matchId);
    const { state, services } = initMatch(this.registry, config);
    this.sim = new Simulation(state, services, this.defaultAiHook);
    return packState(state);
  }

  initState(transfer: TransferState): TransferState {
    const state = unpackState(transfer);
    const map = this.registry.map(state.mapId);
    const nav = new NavGrid(map);
    const services = createServices(this.registry, nav);
    rebuildBuildingNav(state, services, this.registry);
    this.sim = new Simulation(state, services, this.defaultAiHook);
    return packState(state);
  }

  enqueue(cmds: Command[]): void {
    this.sim?.enqueueNow(cmds);
  }

  setAi(enabled: boolean): void {
    this.sim?.setAiEnabled(enabled);
  }

  /** Advance one tick; returns packed state + events for that tick. */
  step(): { state: TransferState; events: GameEvent[] } {
    if (!this.sim) throw new Error('SimHost not initialized');
    const res = this.sim.step();
    return { state: packState(this.sim.state), events: res.events };
  }

  /**
   * Process a batch of confirmed lockstep ticks in order. Each entry's commands are
   * enqueued for that tick, then the sim steps. Only entries whose tick matches the
   * sim's current tick are applied (guards against gaps/duplicates). Returns the final
   * state once so the main thread mirrors it, plus checksums for desync detection.
   */
  stepLockstepBatch(entries: LockstepEntry[], checksumEvery: number): LockstepBatchResult {
    if (!this.sim) throw new Error('SimHost not initialized');
    const events: GameEvent[] = [];
    const checksums: { tick: number; hash: string }[] = [];
    let lastTick = this.sim.state.tick;
    for (const entry of entries) {
      if (entry.tick !== this.sim.state.tick) continue;
      if (entry.cmds.length) this.sim.enqueue(entry.tick, entry.cmds);
      const res = this.sim.step();
      for (const ev of res.events) events.push(ev);
      lastTick = entry.tick;
      if (checksumEvery > 0 && entry.tick > 0 && entry.tick % checksumEvery === 0) {
        checksums.push({ tick: entry.tick, hash: hashState(this.sim.state) });
      }
    }
    return { state: packState(this.sim.state), events, lastTick, checksums };
  }

  snapshot(): TransferState {
    if (!this.sim) throw new Error('SimHost not initialized');
    return packState(this.sim.state);
  }

  applySnapshot(transfer: TransferState): TransferState {
    return this.initState(transfer);
  }

  get state(): GameState {
    if (!this.sim) throw new Error('SimHost not initialized');
    return this.sim.state;
  }
}
