import { describe, expect, it } from 'vitest';
import { initMatch, spawnEntity, recomputePower } from '../src/sim/factory';
import { radarOfflineHint } from '../src/ui/radar-hint';
import { expectBuilding } from './entity-helpers';
import { getRegistry } from './helpers';

const reg = getRegistry();

describe('radar offline hint', () => {
  it('tells the player to build a Scrying Obelisk before radar exists', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    expect(radarOfflineHint(state, reg, human.id)).toBe(
      'Build a Scrying Obelisk (Advanced) to enable the minimap.',
    );
  });

  it('is silent once a powered radar building is online', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const human = state.players.find((p) => p.controller === 'human')!;
    const sanctum = [...state.entities.values()].find((e) => e.owner === human.id && e.defId === 'sanctum')!;
    spawnEntity(state, services, null, 'ley_conduit', human.id, sanctum.pos.x + 96, sanctum.pos.y);
    const radar = expectBuilding(
      spawnEntity(state, services, null, 'scrying_obelisk', human.id, sanctum.pos.x + 160, sanctum.pos.y),
    );
    radar.buildProgress = undefined;
    recomputePower(state, services);
    expect(radarOfflineHint(state, reg, human.id)).toBeNull();
  });
});
