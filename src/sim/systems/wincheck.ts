// Marks players with no buildings as defeated; ends the match when one team remains.
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { buildingsOf } from '../queries';

export function winCheckSystem(state: GameState, ctx: StepContext): void {
  if (state.ended) return;
  for (const p of state.players) {
    if (p.defeated) continue;
    if (buildingsOf(state, p.id).length === 0) {
      p.defeated = true;
      ctx.events.push({ type: 'playerDefeated', playerId: p.id });
      // A defeated player's remaining units/projectiles become inert (removed).
      const toRemove: number[] = [];
      for (const [id, e] of state.entities) {
        if (e.owner === p.id && e.kind !== 'building' && e.kind !== 'resource_node') toRemove.push(id);
      }
      for (const id of toRemove.sort((a, b) => a - b)) state.entities.delete(id);
    }
  }
  const aliveTeams = new Set<number>();
  for (const p of state.players) if (!p.defeated) aliveTeams.add(p.team);
  if (aliveTeams.size <= 1) {
    state.ended = true;
    state.winnerTeam = aliveTeams.size === 1 ? [...aliveTeams][0]! : -1;
    ctx.events.push({ type: 'matchEnded', winnerTeam: state.winnerTeam });
  }
}
