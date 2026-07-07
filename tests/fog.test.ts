import { describe, it, expect } from 'vitest';
import { TILE } from '../src/core/constants';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity, recomputePower } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { isVisibleTo, radarActive, isTileFogged, listBuildingGhosts } from '../src/sim/fog';
import { ownedBy } from '../src/sim/queries';
import { isPowerShort } from '../src/sim/power';
import { visibilitySystem } from '../src/sim/systems/visibility';

const reg = getRegistry();

describe('fog of war', () => {
  it('fogs tiles outside current sight but keeps the full map drawable', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    const explored = human.explored.filter((v) => v === 1).length;
    const visible = human.visible.filter((v) => v === 1).length;
    const total = human.explored.length;
    expect(explored).toBeGreaterThan(0);
    expect(explored).toBeLessThan(total);
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(total);
    const fogged = human.visible.findIndex((v, i) => v === 0 && isTileFogged(human, i, false));
    expect(fogged).toBeGreaterThanOrEqual(0);
  });

  it('always shows mana nodes through fog', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    const farNode = [...state.entities.values()].find(
      (e) => e.kind === 'resource_node' && human.explored[Math.floor(e.pos.y / TILE) * services.nav.w + Math.floor(e.pos.x / TILE)] === 0,
    );
    expect(farNode).toBeTruthy();
    expect(isVisibleTo(state, human.id, farNode!, services.nav)).toBe(true);
  });

  it('powered radar is active when the grid has enough power', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const human = state.players.find((p) => p.controller === 'human')!;
    human.unlockedTech.push('attunement_spire', 'ley_conduit');
    human.mana = 8000;

    const sanctum = [...state.entities.values()].find((e) => e.owner === human.id && e.defId === 'sanctum')!;
    sim.enqueueNow([{ type: 'build', playerId: human.id, defId: 'ley_conduit', x: sanctum.pos.x + 96, y: sanctum.pos.y }]);
    sim.step();
    for (let i = 0; i < 200; i++) sim.step();
    sim.enqueueNow([{ type: 'build', playerId: human.id, defId: 'scrying_obelisk', x: sanctum.pos.x + 160, y: sanctum.pos.y }]);
    for (let i = 0; i < 200; i++) sim.step();

    expect(ownedBy(state, human.id).some((e) => e.defId === 'scrying_obelisk')).toBe(true);
    expect(isPowerShort(state, human.id)).toBe(false);
    expect(radarActive(state, reg, human.id)).toBe(true);
  });

  it('hides enemy units outside vision', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    const enemy = state.players.find((p) => p.id !== human.id)!;
    const farEnemy = [...state.entities.values()].find((e) => e.owner === enemy.id && e.kind === 'unit');
    expect(farEnemy).toBeTruthy();
    expect(isVisibleTo(state, human.id, farEnemy!, services.nav)).toBe(false);
  });

  it('keeps a frozen ghost of scouted enemy buildings out of sight', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    const enemy = state.players.find((p) => p.id !== human.id)!;
    const enemySanctum = [...state.entities.values()].find((e) => e.owner === enemy.id && e.defId === 'sanctum')!;
    expect(enemySanctum).toBeTruthy();

    const humanWisp = [...state.entities.values()].find((e) => e.owner === human.id && e.defId === 'wisp')!;
    humanWisp!.pos.x = enemySanctum!.pos.x;
    humanWisp!.pos.y = enemySanctum!.pos.y;
    visibilitySystem(state, { services, events: [] });

    expect(human.knownBuildings[enemySanctum!.id]).toBeTruthy();
    const snapshotHp = human.knownBuildings[enemySanctum!.id]!.hp;

    enemySanctum!.hp = Math.max(1, enemySanctum!.hp - 500);
    humanWisp!.pos.x = 0;
    humanWisp!.pos.y = 0;
    visibilitySystem(state, { services, events: [] });

    expect(human.knownBuildings[enemySanctum!.id]!.hp).toBe(snapshotHp);
    expect(listBuildingGhosts(state, reg, human.id, services.nav).some((g) => g.id === enemySanctum!.id)).toBe(true);
    expect(isVisibleTo(state, human.id, enemySanctum!, services.nav)).toBe(false);
  });
});

describe('power disables consumers', () => {
  it('radar building is offline when it is the newest consumer under deficit', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.id === 'player0')!;
    const sanctum = ownedBy(state, human.id).find((e) => e.defId === 'sanctum')!;
    spawnEntity(state, services, null, 'summoning_circle', human.id, sanctum!.pos.x + 160, sanctum!.pos.y);
    spawnEntity(state, services, null, 'scrying_obelisk', human.id, sanctum!.pos.x + 96, sanctum!.pos.y);
    recomputePower(state, services);
    visibilitySystem(state, { services, events: [] });
    expect(isPowerShort(state, human.id)).toBe(true);
    expect(radarActive(state, reg, human.id)).toBe(false);
  });
});
