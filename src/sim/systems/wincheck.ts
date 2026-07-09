// Match ends when only one team still has an HQ (Sanctum). Losing your HQ eliminates you.
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { hasHQ } from '../queries';
import { purgePlayer } from '../factory';
import { sandboxDisableWinCheck } from '../sandbox-flags';

export function winCheckSystem(state: GameState, ctx: StepContext): void {
  if (state.ended || sandboxDisableWinCheck(state)) return;
  for (const p of state.players) {
    if (p.defeated) continue;
    if (hasHQ(state, p.id)) continue;
    p.defeated = true;
    ctx.events.push({ type: 'playerDefeated', playerId: p.id });
    purgePlayer(state, ctx.services, p.id);
  }
  const aliveTeams = new Set<number>();
  for (const p of state.players) if (!p.defeated) aliveTeams.add(p.team);
  if (aliveTeams.size <= 1) {
    state.ended = true;
    state.winnerTeam = aliveTeams.size === 1 ? [...aliveTeams][0]! : -1;
    ctx.events.push({ type: 'matchEnded', winnerTeam: state.winnerTeam });
  }
}
