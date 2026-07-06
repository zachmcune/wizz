// Deterministic layered AI. One decision pass per AI player, throttled by tick.
// It ONLY emits Commands (same as a human) - never mutates sim state directly.
import { TILE } from '../core/constants';
import type { SimServices } from '../sim/context';
import type { GameState, Command, Entity, Player, PlayerId } from '../sim/types';
import { ownedBy, buildingsOf, isEnemy, isAlive } from '../sim/queries';
import { len } from '../sim/math';

interface Difficulty {
  interval: number;
  wispTarget: number;
  armyThreshold: number;
}

const DIFFS: Record<string, Difficulty> = {
  easy: { interval: 20, wispTarget: 3, armyThreshold: 8 },
  normal: { interval: 15, wispTarget: 4, armyThreshold: 12 },
  hard: { interval: 10, wispTarget: 5, armyThreshold: 16 },
};

// Ordered tech/economy build goals the AI works through.
const BUILD_ORDER = ['attunement_spire', 'ley_conduit', 'summoning_circle', 'golem_forge', 'arcane_nexus'];

export function aiStep(state: GameState, services: SimServices): Command[] {
  const cmds: Command[] = [];
  let idx = 0;
  for (const p of state.players) {
    const playerIndex = idx++;
    if (p.controller !== 'ai' || p.defeated) continue;
    const diff = DIFFS[p.aiDifficulty ?? 'normal']!;
    // stagger players so they don't all act on the same tick
    if ((state.tick + playerIndex) % diff.interval !== 0) continue;
    decideForPlayer(state, services, p, diff, cmds);
  }
  return cmds;
}

function hasBuilding(state: GameState, owner: PlayerId, defId: string): boolean {
  return ownedBy(state, owner).some((e) => e.kind === 'building' && e.defId === defId && e.state !== 'dead');
}

function findSanctum(state: GameState, owner: PlayerId): Entity | null {
  return buildingsOf(state, owner).find((b) => b.defId === 'sanctum') ?? null;
}

function findPlacement(services: SimServices, cx: number, cy: number, footprint: number): { x: number; y: number } | null {
  const nav = services.nav;
  const ctx = Math.floor(cx / TILE);
  const cty = Math.floor(cy / TILE);
  for (let ring = 2; ring <= 10; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const tx = ctx + dx;
        const ty = cty + dy;
        if (nav.canPlace(tx, ty, footprint)) {
          return { x: (tx + footprint / 2) * TILE, y: (ty + footprint / 2) * TILE };
        }
      }
    }
  }
  return null;
}

function decideForPlayer(state: GameState, services: SimServices, p: Player, diff: Difficulty, cmds: Command[]): void {
  const reg = services.registry;
  const sanctum = findSanctum(state, p.id);
  if (!sanctum) return;
  const own = ownedBy(state, p.id);
  const wisps = own.filter((e) => e.kind === 'unit' && e.carryMax !== undefined);
  const combat = own.filter((e) => e.kind === 'unit' && e.carryMax === undefined);

  // 1) Economy: keep wisps harvesting.
  for (const w of wisps) {
    if (w.orders.length === 0 && w.state === 'idle') {
      const node = nearestNode(state, w);
      if (node) cmds.push({ type: 'harvest', playerId: p.id, entityIds: [w.id], nodeId: node.id });
    }
  }

  // 2) Build the next economy/tech structure we can afford and don't yet have.
  for (const defId of BUILD_ORDER) {
    if (hasBuilding(state, p.id, defId)) continue;
    const bdef = reg.buildings.get(defId);
    if (!bdef) continue;
    if (!bdef.requires.every((r) => p.unlockedTech.includes(r))) break;
    if (p.mana < bdef.cost) return; // save up; don't skip ahead
    const spot = findPlacement(services, sanctum.pos.x, sanctum.pos.y, bdef.footprint);
    if (spot) cmds.push({ type: 'build', playerId: p.id, defId, x: spot.x, y: spot.y });
    return; // one build goal at a time
  }

  // 3) Train more wisps if below target.
  const spire = buildingsOf(state, p.id).find((b) => b.defId === 'attunement_spire' && b.buildProgress === undefined);
  if (spire && wisps.length < diff.wispTarget) {
    const q = spire.productionQueue?.length ?? 0;
    const wdef = reg.units.get('wisp');
    if (q === 0 && wdef && p.mana >= wdef.cost) {
      cmds.push({ type: 'produce', playerId: p.id, buildingId: spire.id, defId: 'wisp' });
    }
  }

  // 4) Military production from available producers.
  produceArmy(state, services, p, cmds);

  // 5) Attack when the army is big enough: send idle combat units at the nearest enemy building.
  if (combat.length >= diff.armyThreshold) {
    const target = nearestEnemyBuilding(state, p.id, sanctum.pos);
    if (target) {
      const idleIds = combat.filter((e) => e.orders.length === 0 && e.state === 'idle').map((e) => e.id);
      if (idleIds.length >= Math.floor(diff.armyThreshold / 2)) {
        cmds.push({ type: 'attackMove', playerId: p.id, entityIds: idleIds, x: target.pos.x, y: target.pos.y });
      }
    }
  }
}

function produceArmy(state: GameState, services: SimServices, p: Player, cmds: Command[]): void {
  const reg = services.registry;
  const circle = buildingsOf(state, p.id).find((b) => b.defId === 'summoning_circle' && b.buildProgress === undefined);
  const forge = buildingsOf(state, p.id).find((b) => b.defId === 'golem_forge' && b.buildProgress === undefined);
  const pick = (building: Entity | undefined, options: string[]) => {
    if (!building) return;
    const q = building.productionQueue?.length ?? 0;
    if (q >= 2) return;
    // rotate choice deterministically by tick
    const choice = options[(state.tick / 5) % options.length | 0]!;
    const udef = reg.units.get(choice);
    if (udef && p.mana >= udef.cost && udef.requires.every((r) => p.unlockedTech.includes(r))) {
      cmds.push({ type: 'produce', playerId: p.id, buildingId: building.id, defId: choice });
    }
  };
  pick(circle, ['imp_swarmling', 'arcane_archer', 'rift_familiar']);
  pick(forge, ['stone_golem', 'siege_behemoth']);
}

function nearestNode(state: GameState, e: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const n of state.entities.values()) {
    if (n.kind !== 'resource_node' || (n.amount ?? 0) <= 0) continue;
    const d = len(n.pos.x - e.pos.x, n.pos.y - e.pos.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function nearestEnemyBuilding(state: GameState, owner: PlayerId, from: { x: number; y: number }): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  const ids = [...state.entities.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const e = state.entities.get(id)!;
    if (e.kind !== 'building' || !isAlive(e) || !isEnemy(state, owner, e.owner)) continue;
    const d = len(e.pos.x - from.x, e.pos.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
