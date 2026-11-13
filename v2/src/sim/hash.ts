// State hashing for lockstep desync detection and replay verification.
//
// Requirements that shaped this:
//   • Must be CHEAP — called every ACK window on every peer while the match runs.
//   • Must be ORDER-INDEPENDENT over entities, so it does not depend on slot layout or on a
//     compaction happening to fall on the same tick (v1 sorted entities to get this; we fold
//     per-slot hashes with a commutative combiner instead, which is cheaper and equally strong).
//   • Must be SENSITIVE to anything that affects gameplay, including RNG stream positions,
//     because a diverged RNG is a desync even if positions have not diverged yet.
//
// The mix is 32-bit FNV-1a over quantised values. Quantisation matters: raw floats would make the
// hash hypersensitive to irrelevant last-bit differences from a different JS engine's Math.pow.

import type { GameState } from './types';
import { KIND_RESOURCE_NODE, KIND_UNIT } from './entity-store';

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;

function mix(h: number, v: number): number {
  let x = h ^ (v | 0);
  x = Math.imul(x, FNV_PRIME);
  return x >>> 0;
}

function mixString(h: number, s: string): number {
  let x = h;
  for (let i = 0; i < s.length; i++) x = mix(x, s.charCodeAt(i));
  return x;
}

/** Quantise a float to a stable integer. 1/1024 world units is far below any gameplay threshold. */
export function q(v: number): number {
  return Math.round(v * 1024) | 0;
}

/** Order-independent fold of a per-item hash (sum mod 2^32). */
function fold(h: number, itemHash: number): number {
  return (h + itemHash) >>> 0;
}

function hashEntitySlot(state: GameState, i: number): number {
  const e = state.entities;
  let h = FNV_OFFSET;
  h = mix(h, e.id[i]!);
  h = mix(h, e.kind[i]!);
  h = mix(h, e.ownerIndex[i]!);
  h = mix(h, e.state[i]!);
  h = mix(h, e.stance[i]!);
  h = mix(h, q(e.posX[i]!));
  h = mix(h, q(e.posY[i]!));
  h = mix(h, q(e.facing[i]!));
  h = mix(h, Math.round(e.hp[i]! * 64));
  h = mixString(h, e.extras[i]!.defId);
  if (e.kind[i] === KIND_RESOURCE_NODE) h = mix(h, Math.round(e.amount[i]! * 64));
  if (e.kind[i] === KIND_UNIT) {
    // Orders matter: two units in the same place with different orders are different states.
    const orders = e.extras[i]!.orders as { type?: string }[];
    for (const o of orders) h = mixString(h, o.type ?? '?');
  }
  return h >>> 0;
}

/** Full state hash. Deterministic and order-independent over entities. */
export function hashState(state: GameState): string {
  let h = FNV_OFFSET;
  h = mix(h, state.tick);
  h = mix(h, state.seed);
  h = mixString(h, state.mapId);
  h = mix(h, state.ended ? 1 : 0);
  h = mix(h, state.winnerTeam ?? -1);

  for (const p of state.players) {
    h = mixString(h, p.id);
    h = mix(h, Math.round(p.mana * 64));
    h = mix(h, p.power);
    h = mix(h, p.powerUsed);
    h = mix(h, p.defeated ? 1 : 0);
    for (const t of p.unlockedTech) h = mixString(h, t);
    for (const r of p.completedResearch) h = mixString(h, r);
  }

  // RNG positions are part of the state: a peer that has drawn a different number of values has
  // already diverged even if the visible board has not caught up yet.
  for (const stream of Object.keys(state.rng).sort()) {
    h = mixString(h, stream);
    h = mix(h, state.rng[stream]! | 0);
  }

  let entityFold = 0;
  for (let i = 0; i < state.entities.count; i++) {
    if (state.entities.dead[i]) continue;
    entityFold = fold(entityFold, hashEntitySlot(state, i));
  }
  h = mix(h, entityFold);

  h = mix(h, state.entities.liveCount());
  h = mix(h, state.beams.length);

  return (h >>> 0).toString(16).padStart(8, '0');
}
