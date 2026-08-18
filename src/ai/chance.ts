// Deterministic 0–1 rolls for AI “sloppy” play. Does not touch GameState.rngState.
export function roll(tick: number, playerId: string, key: string, chance: number): boolean {
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  let h = 2166136261;
  const s = `${tick}|${playerId}|${key}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296 < chance;
}
