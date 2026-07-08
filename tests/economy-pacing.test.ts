import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { registryForPacing } from '../src/data/economy-pacing';
import { initMatch } from '../src/sim/factory';

const reg = getRegistry();

describe('economy pacing', () => {
  it('standard pacing keeps data-driven balance values', () => {
    const paced = registryForPacing(reg, 'standard');
    expect(paced.balance.startingMana).toBe(900);
    expect(paced.balance.siphonPerSecond).toBe(16);
    expect(paced.balance.manaNodeCapacity).toBe(12000);
    expect(paced.unit('wisp').cost).toBe(200);
    expect(paced.unit('wisp').carry).toBe(75);
    expect(paced.building('attunement_spire').cost).toBe(750);
  });

  it('tight pacing applies balance, cost, and carry overrides', () => {
    const paced = registryForPacing(reg, 'tight');
    expect(paced.balance.startingMana).toBe(600);
    expect(paced.balance.siphonPerSecond).toBe(12);
    expect(paced.balance.manaNodeCapacity).toBe(8000);
    expect(paced.balance.conjureManaAmount).toBe(4);
    expect(paced.balance.conjureManaIntervalSeconds).toBe(4);
    expect(paced.balance.ai.hard.wispTarget).toBe(3);
    expect(paced.balance.ai.normal.wispTarget).toBe(2);
    expect(paced.unit('wisp').cost).toBe(300);
    expect(paced.unit('wisp').carry).toBe(60);
    expect(paced.building('attunement_spire').cost).toBe(1125);
    expect(paced.building('ley_conduit').cost).toBe(300);
    expect(paced.building('stone_wall').cost).toBe(40);
  });

  it('initMatch uses paced starting mana and node cap', () => {
    const base = initMatch(reg, {
      mapId: 'duel_glade',
      seed: 1,
      players: [
        { id: 'player0', controller: 'human', team: 0, color: '#fff', startIndex: 0 },
        { id: 'player1', controller: 'ai', team: 1, color: '#000', startIndex: 1, aiDifficulty: 'normal' },
      ],
      economyPacing: 'tight',
    });
    expect(base.state.players[0]!.mana).toBe(600);
    const nodes = [...base.state.entities.values()].filter((e) => e.kind === 'resource_node');
    const maxNode = Math.max(...nodes.map((n) => n.amountMax ?? n.amount ?? 0));
    expect(maxNode).toBe(8000);
  });
});
