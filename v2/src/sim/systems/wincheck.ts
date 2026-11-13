// Win check: a player is defeated only when they have no HQ left.
//
// Kept exactly as v1, per Zachary's decision to reject the "bankruptcy elimination" rule. Matches
// must still terminate, but that is fixed in the AI (plan §5.5) rather than by adding an
// elimination rule here.

import type { StepContext } from '../context';
import type { GameState } from '../types';
import { hasHQ } from '../queries';

export function winCheckSystem(state: GameState, ctx: StepContext): void {
  if (state.ended) return;

  const store = state.entities;
  for (const player of state.players) {
    if (player.defeated) continue;
    if (hasHQ(state, player.id)) continue;
    player.defeated = true;
    ctx.events.push({ type: 'playerDefeated', playerId: player.id });
    // Remove their remaining property so it does not linger as phantom targets.
    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot]) continue;
      if (store.ownerId(store.ownerIndex[slot]!) !== player.id) continue;
      if (store.kind[slot] === 3) continue; // resource nodes are neutral
      store.kill(slot);
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
