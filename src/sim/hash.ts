// Stable hash of gameplay-relevant state. Two runs with identical inputs must match.
// Used by the headless determinism/replay tests and lockstep desync detection.
import type { GameState } from './types';

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

export function hashState(state: GameState): string {
  const parts: string[] = [
    `t${state.tick}`,
    `rng${state.rngState}`,
    `w${state.winnerTeam}`,
    `e${state.ended ? 1 : 0}`,
  ];
  for (const p of [...state.players].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    parts.push(`P${p.id}:${r(p.mana)}:${p.defeated ? 1 : 0}:${p.power}/${p.powerUsed}`);
  }
  const ids = [...state.entities.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const e = state.entities.get(id)!;
    const flags = [
      e.channeling ? 'C' : '',
      e.repairing ? 'R' : '',
      e.buildProgress !== undefined ? `B${r(e.buildProgress)}` : '',
      e.morphProgress !== undefined ? `M${r(e.morphProgress)}` : '',
    ].join('');
    parts.push(
      `E${id}:${e.defId}:${e.owner}:${r(e.pos.x)},${r(e.pos.y)}:${r(e.hp)}:${e.state}:${r(e.carry ?? 0)}:${r(e.amount ?? 0)}:${e.channelTicks ?? 0}:${flags}`,
    );
  }
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
