import type { ResearchEffect } from '../data/defs';
import type { Player } from './types';

export function hasResearch(player: Pick<Player, 'completedResearch'>, researchId: string): boolean {
  return player.completedResearch.includes(researchId);
}

export function applyResearchOperation(base: number, operation: ResearchEffect['operation'], value: number): number {
  return operation === 'add' ? base + value : base * value;
}
