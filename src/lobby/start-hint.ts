import type { LobbySlot } from './types';

/** Why Custom Game Start is greyed when someone still needs a corner. */
export function missingStartHint(slots: readonly LobbySlot[]): string | null {
  const missing = slots.filter((s) => s.kind !== 'closed' && s.startIndex === null);
  if (missing.length === 0) return null;
  const onlyHuman = missing.every((s) => s.kind === 'human');
  const onlyAi = missing.every((s) => s.kind === 'ai');
  if (onlyHuman && missing.length === 1) {
    return 'Pick your start: tap a number on the map. Start stays grey until you do.';
  }
  if (onlyAi) {
    return 'The AI needs a start too. Tap the AI slot, then tap a number on the map.';
  }
  return 'Every player needs a start corner. Tap a slot, then tap a number on the map. Start stays grey until then.';
}
