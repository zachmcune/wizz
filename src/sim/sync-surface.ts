// Authoritative sync surface: single source for hash, transfer, and snapshot serialization.
// All gameplay-relevant fields must be registered here. Fog tiles are per-viewer presentation
// and are intentionally excluded from the hash (lockstep peers may diverge on fog masks).
import type { Entity, GameState, Player, SuperweaponBeam } from './types';

export const SYNC_SURFACE_VERSION = 1;

export interface TransferState {
  syncVersion: number;
  tick: number;
  rngState: number;
  players: GameState['players'];
  relations: GameState['relations'];
  entities: Entity[];
  nextEntityId: number;
  mapId: string;
  winnerTeam: GameState['winnerTeam'];
  ended: boolean;
  beams: GameState['beams'];
  oneSuperweaponPerPlayer: boolean;
  sandbox?: GameState['sandbox'];
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function hashPlayer(p: Player): string {
  const spellCd = Object.entries(p.spellCooldowns)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  return [
    `P${p.id}`,
    r(p.mana),
    p.defeated ? 1 : 0,
    `${p.power}/${p.powerUsed}`,
    `T${[...p.unlockedTech].sort().join(',')}`,
    `R${[...p.completedResearch].sort().join(',')}`,
    `S${spellCd}`,
  ].join(':');
}

function hashOrders(e: Entity): string {
  if (e.kind === 'resource_node' || e.kind === 'projectile') return '';
  return e.orders.map((o) => {
    if (o.type === 'attack') return `a${o.targetId}`;
    if (o.type === 'harvest') return `h${o.nodeId}`;
    if (o.type === 'garrison') return `g${o.buildingId}`;
    if (o.type === 'move' || o.type === 'attackMove') return `m${r(o.x)},${r(o.y)}`;
    if (o.type === 'moveInOrder') return `i${r(o.x)},${r(o.y)}:${r(o.groupSpeed)}`;
    return o.type;
  }).join(';');
}

function hashCooldowns(e: Entity): string {
  if (e.kind === 'resource_node') return '';
  const parts = Object.entries(e.cooldowns)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`);
  return parts.join(',');
}

function hashEntityFlags(e: Entity): string {
  return [
    e.kind === 'unit' && e.channeling ? 'C' : '',
    e.kind === 'building' && e.repairing ? 'R' : '',
    e.kind === 'building' && e.buildProgress !== undefined ? `BP${r(e.buildProgress)}` : '',
    (e.kind === 'unit' || e.kind === 'building') && e.morphProgress !== undefined ? `M${r(e.morphProgress)}` : '',
    e.kind === 'building' && e.chargingAttack
      ? `Q${e.chargingAttack.targetId}:${e.chargingAttack.remainingTicks}`
      : '',
    e.kind === 'building' && e.beamAttack
      ? `BM${e.beamAttack.targetId}:${r(e.beamAttack.facing)}:${e.beamAttack.ticksSinceDamage}`
      : '',
    (e.kind === 'unit' || e.kind === 'building') && e.frostExposure ? `F${e.frostExposure}` : '',
    (e.kind === 'unit' || e.kind === 'building') && e.burnLinger ? `L${e.burnLinger.remaining}` : '',
    e.kind !== 'resource_node' ? `ST${e.stance}` : '',
    e.kind === 'unit' && e.targetId !== undefined ? `TG${e.targetId}` : '',
  ].join('');
}

function hashEntity(state: GameState, e: Entity): string {
  const stateStr = e.kind === 'resource_node' ? 'node' : e.state;
  const carryStr = e.kind === 'unit' ? r(e.carry ?? 0) : 0;
  const amountStr = e.kind === 'resource_node' ? r(e.amount) : 0;
  const channelStr = e.kind === 'unit' ? (e.channelTicks ?? 0) : 0;
  const buffsStr =
    e.kind === 'resource_node'
      ? ''
      : e.buffs
          .filter((b) => b.expiresTick > state.tick)
          .map((b) =>
            b.kind === 'slow'
              ? `${b.kind}:${b.expiresTick}:${b.moveFactor}:${b.attackCooldownFactor}`
              : `${b.kind}:${b.expiresTick}`,
          )
          .sort()
          .join(',');
  const prodStr =
    e.kind === 'building'
      ? `PQ${(e.productionQueue ?? []).map((q) => `${q.defId}:${r(q.progress)}/${q.required}`).join(',')}`
      : '';
  const garrisonStr =
    e.kind === 'building'
      ? `G${[...(e.garrisonedIds ?? [])].sort((a, b) => a - b).join(',')}/X${[...(e.garrisonReservedIds ?? [])]
          .sort((a, b) => a - b)
          .join(',')}/RQ${(e.researchQueue ?? []).map((q) => `${q.defId}:${r(q.progress)}/${q.required}`).join(',')}`
      : e.kind === 'unit'
        ? `GI${e.garrisonedIn ?? 0}`
        : '';
  const facingStr = e.kind !== 'resource_node' ? r(e.facing) : 0;
  return [
    `E${e.id}`,
    e.defId,
    e.owner,
    `${r(e.pos.x)},${r(e.pos.y)}`,
    r(e.hp),
    stateStr,
    carryStr,
    amountStr,
    channelStr,
    facingStr,
    hashEntityFlags(e),
    hashOrders(e),
    hashCooldowns(e),
    buffsStr,
    prodStr,
    garrisonStr,
  ].join(':');
}

function hashBeam(b: SuperweaponBeam): string {
  return `SW${b.id}:${b.owner}:${r(b.pos.x)},${r(b.pos.y)}:${b.state}:${b.fireTick}:${b.expiresTick}:${r(b.dir.x)},${r(b.dir.y)}`;
}

/** Stable digest of authoritative gameplay state for determinism and lockstep checks. */
export function hashAuthoritativeState(state: GameState): string {
  const parts: string[] = [
    `v${SYNC_SURFACE_VERSION}`,
    `t${state.tick}`,
    `rng${state.rngState}`,
    `w${state.winnerTeam}`,
    `e${state.ended ? 1 : 0}`,
    `o${state.oneSuperweaponPerPlayer ? 1 : 0}`,
  ];
  for (const p of [...state.players].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    parts.push(hashPlayer(p));
  }
  const ids = [...state.entities.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    parts.push(hashEntity(state, state.entities.get(id)!));
  }
  for (const b of state.beams) {
    parts.push(hashBeam(b));
  }
  if (state.sandbox) {
    parts.push(`SB${state.sandbox.settings.economy.infiniteMana ? 1 : 0}:${state.sandbox.settings.economy.infinitePower ? 1 : 0}`);
  }
  return hashString(parts.join('|'));
}

export function packAuthoritativeState(state: GameState): TransferState {
  const entities = [...state.entities.values()].sort((a, b) => a.id - b.id);
  return {
    syncVersion: SYNC_SURFACE_VERSION,
    tick: state.tick,
    rngState: state.rngState,
    players: state.players,
    relations: state.relations,
    entities,
    nextEntityId: state.nextEntityId,
    mapId: state.mapId,
    winnerTeam: state.winnerTeam,
    ended: state.ended,
    beams: state.beams,
    oneSuperweaponPerPlayer: state.oneSuperweaponPerPlayer,
    sandbox: state.sandbox,
  };
}

export function unpackAuthoritativeState(t: TransferState): GameState {
  return {
    tick: t.tick,
    rngState: t.rngState,
    players: t.players,
    relations: t.relations,
    entities: new Map(t.entities.map((e) => [e.id, e])),
    nextEntityId: t.nextEntityId,
    mapId: t.mapId,
    winnerTeam: t.winnerTeam,
    ended: t.ended,
    beams: t.beams ?? [],
    oneSuperweaponPerPlayer: t.oneSuperweaponPerPlayer ?? true,
    sandbox: t.sandbox,
  };
}

/** In-place update of a mirror GameState from worker/snapshot output. */
export function applyAuthoritativeState(target: GameState, t: TransferState): void {
  target.tick = t.tick;
  target.rngState = t.rngState;
  target.players = t.players;
  target.relations = t.relations;
  target.entities = new Map(t.entities.map((e) => [e.id, e]));
  target.nextEntityId = t.nextEntityId;
  target.mapId = t.mapId;
  target.winnerTeam = t.winnerTeam;
  target.ended = t.ended;
  target.beams = t.beams ?? [];
  target.oneSuperweaponPerPlayer = t.oneSuperweaponPerPlayer ?? true;
  target.sandbox = t.sandbox;
}
