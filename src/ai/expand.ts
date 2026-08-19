// Waystone expansion: plant camps on far mana nodes, then econ + turrets to hold them.
import { TILE } from '../core/constants';
import { getMorph, getProductionQueue, hasMorph } from '../sim/capabilities';
import { isAlive, isEnemy, ownedBy } from '../sim/queries';
import { buildingHasPower } from '../sim/power';
import { len } from '../sim/math';
import type { BuildingEntity, UnitEntity } from '../sim/entity-types';
import {
  constructionYards,
  findDeploySpot,
  findPlacement,
  remainingMana,
} from './shared';
import { LATE_GAME_TICK } from './difficulty';
import type { AiDecisionContext, AiStrategyConfig } from './strategies/types';

const HOME_NODE_RADIUS = 460;
const CAMP_CLAIM_RADIUS = 420;
const ENEMY_KEEP_OUT = 520;
const DEPLOY_ARRIVE = 96;
const EXPAND_ARMY_FACTOR = 0.45;

export function decideExpansion(
  ctx: AiDecisionContext,
  config: AiStrategyConfig,
  home: BuildingEntity,
  armySize: number,
): void {
  const { state, services, player: p, difficulty: diff, profile, cmds } = ctx;
  if (profile.expandCamps <= 0) return;
  if (state.tick >= LATE_GAME_TICK) return;

  const camps = constructionYards(state, p.id).filter((b) => b.defId === config.production.expandBuilding);
  const wagons = ownedBy(state, p.id).filter(
    (e): e is UnitEntity => e.kind === 'unit' && e.defId === config.production.expandUnit && isAlive(e),
  );
  const claimed = camps.length + wagons.length;
  const want = profile.expandCamps;
  const forge = ownedBy(state, p.id).find(
    (e) => e.kind === 'building' && e.defId === config.production.siegeBuilding && e.buildProgress === undefined,
  );

  if (
    claimed < want &&
    armySize >= Math.floor(diff.armyThreshold * EXPAND_ARMY_FACTOR) &&
    forge &&
    forge.kind === 'building' &&
    buildingHasPower(state, services.registry, forge)
  ) {
    const udef = services.registry.units.get(config.production.expandUnit);
    const q = getProductionQueue(forge)?.length ?? 0;
    if (udef && q === 0 && remainingMana(ctx) >= udef.cost && udef.requires.every((r) => p.unlockedTech.includes(r))) {
      cmds.push({ type: 'produce', playerId: p.id, buildingId: forge.id, defId: config.production.expandUnit });
    }
  }

  for (const wagon of wagons.sort((a, b) => a.id - b.id)) {
    if (hasMorph(wagon) && getMorph(wagon)?.action === 'deploy') continue;
    if (wagon.orders.length > 0 || wagon.state !== 'idle') continue;
    const node = pickExpansionNode(ctx, home, config.production.expandBuilding);
    if (!node) continue;
    const spot = findDeploySpot(state, services, node.pos.x, node.pos.y, config.production.expandBuilding);
    if (!spot) continue;
    if (len(wagon.pos.x - spot.x, wagon.pos.y - spot.y) <= DEPLOY_ARRIVE) {
      cmds.push({ type: 'deploy', playerId: p.id, entityId: wagon.id, x: spot.x, y: spot.y });
    } else {
      cmds.push({ type: 'move', playerId: p.id, entityIds: [wagon.id], x: spot.x, y: spot.y });
    }
  }

  for (const camp of camps.sort((a, b) => a.id - b.id)) {
    developExpansion(ctx, config, camp);
  }
}

function developExpansion(ctx: AiDecisionContext, config: AiStrategyConfig, camp: BuildingEntity): void {
  const { state, services, player: p, cmds } = ctx;
  const near = (defId: string, radius: number) =>
    ownedBy(state, p.id).some(
      (e) => e.kind === 'building' && e.defId === defId && e.state !== 'dead' && len(e.pos.x - camp.pos.x, e.pos.y - camp.pos.y) <= radius,
    );

  const tryBuild = (defId: string): boolean => {
    const bdef = services.registry.buildings.get(defId);
    if (!bdef || !bdef.requires.every((r) => p.unlockedTech.includes(r))) return false;
    if (remainingMana(ctx) < bdef.cost) return false;
    const spot = findPlacement(state, services, p.id, camp.pos.x, camp.pos.y, defId);
    if (!spot) return false;
    cmds.push({ type: 'build', playerId: p.id, defId, x: spot.x, y: spot.y });
    return true;
  };

  if (!near(config.production.harvesterBuilding, CAMP_CLAIM_RADIUS + 80)) {
    tryBuild(config.production.harvesterBuilding);
    return;
  }
  if (!near('ley_conduit', CAMP_CLAIM_RADIUS + 80)) {
    tryBuild('ley_conduit');
    return;
  }
  if (!near(config.turret.defId, CAMP_CLAIM_RADIUS + 80)) {
    tryBuild(config.turret.defId);
    return;
  }
  if (!near(config.combat.garrisonBuilding, CAMP_CLAIM_RADIUS + 80)) {
    tryBuild(config.combat.garrisonBuilding);
  }
}

function pickExpansionNode(ctx: AiDecisionContext, home: BuildingEntity, campDefId: string) {
  const { state, player: p } = ctx;
  const camps = constructionYards(state, p.id);
  const enemyHq = [...state.entities.values()]
    .filter((e) => e.kind === 'building' && e.defId === 'sanctum' && isAlive(e) && isEnemy(state, p.id, e.owner))
    .sort((a, b) => a.id - b.id)[0];

  let best = null as { pos: { x: number; y: number } } | null;
  let bestScore = Infinity;
  for (const n of [...state.entities.values()].sort((a, b) => a.id - b.id)) {
    if (n.kind !== 'resource_node' || n.amount <= 0) continue;
    const homeD = len(n.pos.x - home.pos.x, n.pos.y - home.pos.y);
    if (homeD < HOME_NODE_RADIUS + TILE * 4) continue;
    if (enemyHq && len(n.pos.x - enemyHq.pos.x, n.pos.y - enemyHq.pos.y) < ENEMY_KEEP_OUT) continue;
    if (camps.some((c) => c.defId === campDefId && len(n.pos.x - c.pos.x, n.pos.y - c.pos.y) < CAMP_CLAIM_RADIUS)) {
      continue;
    }
    const enemyD = enemyHq ? len(n.pos.x - enemyHq.pos.x, n.pos.y - enemyHq.pos.y) : 2000;
    const score = homeD + Math.max(0, 900 - enemyD);
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}
