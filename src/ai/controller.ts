// Deterministic layered AI. One decision pass per AI player, throttled by tick.
// It ONLY emits Commands (same as a human) - never mutates sim state directly.
import { TILE } from '../core/constants';
import { buildingPlacementSpacing } from '../core/placement-spacing';
import type { SimServices } from '../sim/context';
import type { GameState, Command, Entity, EntityId, Player, PlayerId } from '../sim/types';
import { isHarvester, isCombatUnit, type BuildingEntity } from '../sim/types';
import type { ResourceNodeEntity, UnitEntity } from '../sim/entity-types';
import { ownedBy, buildingsOf, isEnemy, isAlive } from '../sim/queries';
import { isPowerShort, buildingHasPower } from '../sim/power';
import { canBuildNearBase } from '../sim/build-zone';
import { footprintOverlapsNode } from '../sim/resource-nodes';
import { distSq, len } from '../sim/math';
import type { AiParams } from '../data/defs';

const BUILD_ORDER = ['attunement_spire', 'ley_conduit', 'resonance_vault', 'scrying_obelisk', 'summoning_circle', 'golem_forge', 'arcane_nexus', 'astral_spire'];
const DEFEND_RADIUS = 280;

export function aiStep(state: GameState, services: SimServices): Command[] {
  const cmds: Command[] = [];
  let idx = 0;
  for (const p of state.players) {
    const playerIndex = idx++;
    if (p.controller !== 'ai' || p.defeated) continue;
    const diff = services.registry.balance.ai[p.aiDifficulty ?? 'normal'];
    if ((state.tick + playerIndex) % diff.interval !== 0) continue;
    decideForPlayer(state, services, p, diff, cmds);
  }
  return cmds;
}

function hasBuilding(state: GameState, owner: PlayerId, defId: string): boolean {
  return ownedBy(state, owner).some((e) => e.kind === 'building' && e.defId === defId && e.state !== 'dead');
}

function findSanctum(state: GameState, owner: PlayerId): BuildingEntity | null {
  return buildingsOf(state, owner).find((b) => b.defId === 'sanctum') ?? null;
}

function findEnemySanctum(state: GameState, owner: PlayerId): BuildingEntity | null {
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind === 'building' && e.defId === 'sanctum' && isAlive(e) && isEnemy(state, owner, e.owner)) {
      return e;
    }
  }
  return null;
}

function findPlacement(
  state: GameState,
  services: SimServices,
  owner: PlayerId,
  cx: number,
  cy: number,
  defId: string,
): { x: number; y: number } | null {
  const nav = services.nav;
  const def = services.registry.buildings.get(defId);
  if (!def) return null;
  const footprint = def.footprint;
  const spacing = buildingPlacementSpacing(def);
  const ctx = Math.floor(cx / TILE);
  const cty = Math.floor(cy / TILE);
  for (let ring = 2; ring <= 10; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const tx = ctx + dx;
        const ty = cty + dy;
        if (
          nav.canPlace(tx, ty, footprint, spacing) &&
          !footprintOverlapsNode(state, tx, ty, footprint) &&
          canBuildNearBase(state, services, owner, tx, ty, footprint)
        ) {
          return { x: (tx + footprint / 2) * TILE, y: (ty + footprint / 2) * TILE };
        }
      }
    }
  }
  return null;
}

function idleCombat(combat: UnitEntity[]): EntityId[] {
  return combat.filter((e) => isAlive(e) && e.orders.length === 0 && e.state === 'idle').map((e) => e.id);
}

function decideForPlayer(state: GameState, services: SimServices, p: Player, diff: AiParams, cmds: Command[]): void {
  const reg = services.registry;
  const sanctum = findSanctum(state, p.id);
  if (!sanctum) return;
  const own = ownedBy(state, p.id);
  const wisps = own.filter(isHarvester);
  const combat = own.filter(isCombatUnit);

  if (p.unlockedTech.includes('astral_spire')) {
    const beam = state.beams.find((b) => b.owner === p.id);
    const cd = p.spellCooldowns['astral_lance'] ?? 0;
    const target = findEnemySanctum(state, p.id) ?? nearestEnemyBuilding(state, p.id, sanctum.pos);
    if (target) {
      if (beam && beam.state === 'firing') {
        cmds.push({ type: 'steerSuperweapon', playerId: p.id, x: target.pos.x, y: target.pos.y });
      } else if (!beam && cd === 0) {
        cmds.push({ type: 'castSpell', playerId: p.id, spellId: 'astral_lance', x: target.pos.x, y: target.pos.y });
      }
    }
  }

  for (const w of wisps) {
    if (w.orders.length === 0 && w.state === 'idle') {
      const node = nearestNode(state, w);
      if (node) cmds.push({ type: 'harvest', playerId: p.id, entityIds: [w.id], nodeId: node.id });
    }
  }

  if (isPowerShort(state, p.id)) {
    const leyDef = reg.buildings.get('ley_conduit');
    if (leyDef && p.unlockedTech.includes('sanctum') && p.mana >= leyDef.cost) {
      const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, 'ley_conduit');
      if (spot) {
        cmds.push({ type: 'build', playerId: p.id, defId: 'ley_conduit', x: spot.x, y: spot.y });
        return;
      }
    }
  }

  for (const defId of BUILD_ORDER) {
    if (hasBuilding(state, p.id, defId)) continue;
    const bdef = reg.buildings.get(defId);
    if (!bdef) continue;
    if (!bdef.requires.every((r) => p.unlockedTech.includes(r))) break;
    if (p.mana < bdef.cost) return;
    const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, defId);
    if (spot) {
      cmds.push({ type: 'build', playerId: p.id, defId, x: spot.x, y: spot.y });
      return;
    }
  }

  const spire = buildingsOf(state, p.id).find((b) => b.defId === 'attunement_spire' && b.buildProgress === undefined);
  if (spire && buildingHasPower(state, reg, spire) && wisps.length < diff.wispTarget) {
    const q = spire.productionQueue?.length ?? 0;
    const wdef = reg.units.get('wisp');
    if (q === 0 && wdef && p.mana >= wdef.cost) {
      cmds.push({ type: 'produce', playerId: p.id, buildingId: spire.id, defId: 'wisp' });
    }
  }

  produceArmy(state, services, p, diff, cmds);

  const turretDef = reg.buildings.get('ward_turret');
  if (
    turretDef &&
    !hasBuilding(state, p.id, 'ward_turret') &&
    hasBuilding(state, p.id, 'golem_forge') &&
    combat.length >= Math.floor(diff.armyThreshold * 0.5) &&
    p.mana >= turretDef.cost * 2
  ) {
    const spot = findPlacement(state, services, p.id, sanctum.pos.x, sanctum.pos.y, 'ward_turret');
    if (spot) {
      cmds.push({ type: 'build', playerId: p.id, defId: 'ward_turret', x: spot.x, y: spot.y });
      return;
    }
  }

  let attackPool = idleCombat(combat);
  const minPush = Math.max(4, Math.floor(diff.armyThreshold * 0.5));
  if (combat.length < minPush && attackPool.length < 4) return;

  const threats = enemiesNear(state, p.id, sanctum.pos.x, sanctum.pos.y, DEFEND_RADIUS);
  if (threats.length > 0 && attackPool.length >= 4) {
    const defendCount = Math.min(Math.floor(attackPool.length * 0.35), Math.max(2, threats.length + 1));
    const defenders = attackPool.slice(0, defendCount);
    attackPool = attackPool.slice(defendCount);
    cmds.push({ type: 'attack', playerId: p.id, entityIds: defenders, targetId: threats[0]!.id });
  }

  if (attackPool.length < Math.floor(minPush / 2)) return;

  const enemyHq = findEnemySanctum(state, p.id);
  const siegeIdle = combat.filter((e) => e.defId === 'siege_behemoth' && e.orders.length === 0).map((e) => e.id);
  const siegeReady = siegeIdle.filter((id) => attackPool.includes(id));
  if (enemyHq && siegeReady.length > 0) {
    const push = [...new Set([...siegeReady, ...attackPool])].slice(0, Math.max(siegeReady.length + 3, minPush));
    cmds.push({ type: 'attackMove', playerId: p.id, entityIds: push, x: enemyHq.pos.x, y: enemyHq.pos.y });
    return;
  }

  const target = pickAttackTarget(state, p.id, sanctum.pos);
  if (target) {
    cmds.push({ type: 'attackMove', playerId: p.id, entityIds: attackPool, x: target.pos.x, y: target.pos.y });
  }
}

function produceArmy(state: GameState, services: SimServices, p: Player, diff: AiParams, cmds: Command[]): void {
  const reg = services.registry;
  const circle = buildingsOf(state, p.id).find((b) => b.defId === 'summoning_circle' && b.buildProgress === undefined);
  const forge = buildingsOf(state, p.id).find((b) => b.defId === 'golem_forge' && b.buildProgress === undefined);
  const combat = ownedBy(state, p.id).filter(isCombatUnit);

  const tryProduce = (building: BuildingEntity | undefined, defId: string): boolean => {
    if (!building || !buildingHasPower(state, reg, building)) return false;
    if ((building.productionQueue?.length ?? 0) >= 2) return false;
    const udef = reg.units.get(defId);
    if (!udef || p.mana < udef.cost) return false;
    if (!udef.requires.every((r) => p.unlockedTech.includes(r))) return false;
    cmds.push({ type: 'produce', playerId: p.id, buildingId: building.id, defId });
    return true;
  };

  if (circle) {
    const phase = Math.floor(state.tick / 40) % 3;
    const order =
      phase === 0
        ? ['imp_swarmling', 'arcane_archer']
        : phase === 1
          ? ['arcane_archer', 'imp_swarmling']
          : ['arcane_archer', 'rift_familiar'];
    for (const uid of order) {
      if (tryProduce(circle, uid)) break;
    }
  }

  if (forge && combat.length >= Math.floor(diff.armyThreshold * 0.35)) {
    if (!tryProduce(forge, 'siege_behemoth')) tryProduce(forge, 'stone_golem');
  }
}

function pickAttackTarget(state: GameState, owner: PlayerId, from: { x: number; y: number }): BuildingEntity | null {
  const enemyHq = findEnemySanctum(state, owner);
  if (enemyHq) return enemyHq;
  return nearestEnemyBuilding(state, owner, from);
}

function enemiesNear(state: GameState, owner: PlayerId, x: number, y: number, radius: number): Entity[] {
  const r2 = radius * radius;
  const out: Entity[] = [];
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind !== 'unit' || !isAlive(e) || !isEnemy(state, owner, e.owner)) continue;
    if (distSq(e.pos.x, e.pos.y, x, y) <= r2) out.push(e);
  }
  return out;
}

function nearestNode(state: GameState, e: UnitEntity): ResourceNodeEntity | null {
  let best: ResourceNodeEntity | null = null;
  let bestD = Infinity;
  for (const n of state.entities.values()) {
    if (n.kind !== 'resource_node' || n.amount <= 0) continue;
    const d = len(n.pos.x - e.pos.x, n.pos.y - e.pos.y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function nearestEnemyBuilding(state: GameState, owner: PlayerId, from: { x: number; y: number }): BuildingEntity | null {
  let best: BuildingEntity | null = null;
  let bestScore = Infinity;
  for (const id of [...state.entities.keys()].sort((a, b) => a - b)) {
    const e = state.entities.get(id)!;
    if (e.kind !== 'building' || !isAlive(e) || !isEnemy(state, owner, e.owner)) continue;
    const d = len(e.pos.x - from.x, e.pos.y - from.y);
    let bias = 0;
    if (e.defId === 'sanctum' || e.defId === 'waystone_camp') bias = -1200;
    else if (e.defId === 'attunement_spire') bias = -800;
    else if (e.defId === 'summoning_circle' || e.defId === 'golem_forge') bias = -400;
    const score = d + bias;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}
