// Headless lockstep runner for integration tests and multiplayer verification.
import type { Registry } from '../data/registry';
import type { Command, GameState, PlayerId } from '../sim/types';
import { initMatch } from '../sim/factory';
import { Simulation } from '../sim/simulation';
import { hashState } from '../sim/hash';
import { LockstepClient } from './lockstep';
import { CHECKSUM_INTERVAL_TICKS } from './protocol';
import { InMemoryRelay, type InMemoryRelayRoom } from './in-memory-relay';

export { CHECKSUM_INTERVAL_TICKS };

export interface LockstepPeerOptions {
  registry: Registry;
  matchId: string;
  playerIds: PlayerId[];
  ticks: number;
  seed?: number;
  aiEnabled?: boolean;
  /** Called each tick before the relay advances; submit at the current sim tick (input delay applied). */
  onTick?: (tick: number, submit: (playerId: PlayerId, cmds: Command[]) => void) => void;
  checksumEvery?: number;
}

export interface LockstepPeerResult {
  states: GameState[];
  hash: string;
  desyncAt: number | null;
}

function createRoom(registry: Registry, matchId: string, playerIds: PlayerId[], seed?: number): InMemoryRelayRoom {
  const config = registry.match(matchId);
  const relay = new InMemoryRelay();
  return relay.createRoom(matchId, seed ?? config.seed, playerIds);
}

function createPeers(
  registry: Registry,
  matchId: string,
  playerIds: PlayerId[],
  aiEnabled: boolean,
  room: InMemoryRelayRoom,
): { clients: LockstepClient[]; sims: Simulation[] } {
  const config = registry.match(matchId);
  const clients = playerIds.map((id) => new LockstepClient(room.connect(id)));
  const sims = playerIds.map(() => {
    const matchConfig = { ...config, seed: room.seed };
    const { state, services } = initMatch(registry, matchConfig);
    const sim = new Simulation(state, services);
    sim.aiEnabled = aiEnabled;
    return sim;
  });
  return { clients, sims };
}

/** Run N peers through an in-memory relay and return final states. Throws on hash mismatch. */
export function runLockstepPeers(opts: LockstepPeerOptions): LockstepPeerResult {
  const room = createRoom(opts.registry, opts.matchId, opts.playerIds, opts.seed);
  const aiEnabled = opts.aiEnabled ?? false;
  const { clients, sims } = createPeers(opts.registry, opts.matchId, opts.playerIds, aiEnabled, room);
  const checksumEvery = opts.checksumEvery ?? CHECKSUM_INTERVAL_TICKS;
  let desyncAt: number | null = null;

  for (let tick = 0; tick < opts.ticks; tick++) {
    opts.onTick?.(tick, (playerId, cmds) => {
      const idx = opts.playerIds.indexOf(playerId);
      if (idx >= 0) clients[idx]!.submitLocal(tick, cmds);
    });

    const merged = room.advanceTick(tick);
    for (let i = 0; i < sims.length; i++) {
      const confirmed = clients[i]!.commandsForTick(tick);
      const cmds = confirmed ?? merged;
      sims[i]!.enqueue(tick, cmds);
      sims[i]!.step();
    }

    if (tick > 0 && tick % checksumEvery === 0) {
      const hashes = sims.map((sim) => hashState(sim.state));
      const reference = hashes[0]!;
      for (let i = 1; i < hashes.length; i++) {
        if (hashes[i] !== reference) {
          desyncAt = tick;
          throw new Error(`Lockstep desync at tick ${tick}: ${opts.playerIds[0]}=${reference} ${opts.playerIds[i]}=${hashes[i]}`);
        }
      }
      for (let i = 0; i < clients.length; i++) {
        const bad = clients[i]!.detectDesync(tick, hashes[i]!);
        if (bad.length && desyncAt === null) desyncAt = tick;
      }
    }
  }

  const states = sims.map((sim) => sim.state);
  const hash = hashState(states[0]!);
  for (let i = 1; i < states.length; i++) {
    if (hashState(states[i]!) !== hash) {
      throw new Error(`Final hash mismatch between ${opts.playerIds[0]} and ${opts.playerIds[i]}`);
    }
  }

  return { states, hash, desyncAt };
}
