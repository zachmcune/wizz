// Hosts a Simulation and exposes it via the message protocol. Pure logic (no Worker/DOM
// globals) so it is unit-testable in Node and reuses the exact same deterministic sim.
import type { Registry } from '../../data/registry';
import type { Command, GameState, GameEvent } from '../types';
import { initMatch } from '../factory';
import { Simulation } from '../simulation';
import { packState, unpackState, type TransferState } from '../state-transfer';
import { NavGrid } from '../nav-grid';
import { createServices } from '../context';
import { rebuildBuildingNav } from '../building-nav';

export class SimHost {
  private sim: Simulation | null = null;

  constructor(private registry: Registry) {}

  initMatch(matchId: string): TransferState {
    const config = this.registry.match(matchId);
    const { state, services } = initMatch(this.registry, config);
    this.sim = new Simulation(state, services);
    return packState(state);
  }

  initState(transfer: TransferState): TransferState {
    const state = unpackState(transfer);
    const map = this.registry.map(state.mapId);
    const nav = new NavGrid(map);
    const services = createServices(this.registry, nav);
    rebuildBuildingNav(state, services, this.registry);
    this.sim = new Simulation(state, services);
    return packState(state);
  }

  enqueue(cmds: Command[]): void {
    this.sim?.enqueueNow(cmds);
  }

  setAi(enabled: boolean): void {
    if (this.sim) this.sim.aiEnabled = enabled;
  }

  /** Advance one tick; returns packed state + events for that tick. */
  step(): { state: TransferState; events: GameEvent[] } {
    if (!this.sim) throw new Error('SimHost not initialized');
    const res = this.sim.step();
    return { state: packState(this.sim.state), events: res.events };
  }

  get state(): GameState {
    if (!this.sim) throw new Error('SimHost not initialized');
    return this.sim.state;
  }
}
