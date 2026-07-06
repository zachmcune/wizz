// Hosts a Simulation and exposes it via the message protocol. Pure logic (no Worker/DOM
// globals) so it is unit-testable in Node and reuses the exact same deterministic sim -
// meaning worker and single-thread runs produce identical state hashes by construction.
import type { Registry } from '../../data/registry';
import type { Command, GameState, GameEvent } from '../types';
import { initMatch } from '../factory';
import { Simulation } from '../simulation';
import type { StateSnapshot } from './messages';

export class SimHost {
  private sim: Simulation | null = null;

  constructor(private registry: Registry) {}

  initMatch(matchId: string): StateSnapshot {
    const config = this.registry.match(matchId);
    const { state, services } = initMatch(this.registry, config);
    this.sim = new Simulation(state, services);
    return snapshotOf(state);
  }

  enqueue(cmds: Command[]): void {
    this.sim?.enqueueNow(cmds);
  }

  setAi(enabled: boolean): void {
    if (this.sim) this.sim.aiEnabled = enabled;
  }

  /** Advance one tick; returns the snapshot + events for that tick. */
  step(): { snapshot: StateSnapshot; events: GameEvent[] } {
    if (!this.sim) throw new Error('SimHost not initialized');
    const res = this.sim.step();
    return { snapshot: snapshotOf(this.sim.state), events: res.events };
  }

  get state(): GameState {
    if (!this.sim) throw new Error('SimHost not initialized');
    return this.sim.state;
  }
}

export function snapshotOf(state: GameState): StateSnapshot {
  const entities = [];
  for (const e of state.entities.values()) {
    entities.push({
      id: e.id,
      defId: e.defId,
      owner: e.owner,
      kind: e.kind,
      x: e.pos.x,
      y: e.pos.y,
      facing: e.facing,
      hp: e.hp,
      maxHp: e.maxHp,
      radius: e.radius,
      state: e.state,
      carry: e.carry,
      buildProgress: e.buildProgress,
      amount: e.amount,
      productionQueueLength: e.productionQueue?.length,
    });
  }
  return {
    tick: state.tick,
    mapId: state.mapId,
    ended: state.ended,
    winnerTeam: state.winnerTeam,
    players: state.players.map((p) => ({
      id: p.id,
      team: p.team,
      color: p.color,
      mana: p.mana,
      power: p.power,
      powerUsed: p.powerUsed,
      unlockedTech: [...p.unlockedTech],
      spellCooldowns: { ...p.spellCooldowns },
      defeated: p.defeated,
    })),
    entities,
  };
}
