import type { MatchConfig } from '../sim/types';
import type { MapData } from '../data/defs';
import { teamLabelToId } from './teams';
import type { LobbyMode, LobbySlot, LobbyState } from './types';

export interface LobbyValidation {
  valid: boolean;
  errors: string[];
}

function activeSlots(slots: LobbySlot[]): LobbySlot[] {
  return slots.filter((s) => s.kind !== 'closed');
}

export function validateLobby(state: LobbyState, mode: LobbyMode, map: MapData, localId?: string): LobbyValidation {
  const errors: string[] = [];
  const active = activeSlots(state.slots);

  if (active.length < 2) {
    errors.push('At least 2 player slots must be active');
  }

  if (active.length > map.maxPlayers) {
    errors.push(`This map supports at most ${map.maxPlayers} players`);
  }

  const corners = new Set<number>();
  for (const slot of active) {
    if (slot.startIndex === null) {
      errors.push('Each active player must choose a starting position');
      break;
    }
    if (corners.has(slot.startIndex)) {
      errors.push('Each active player needs a unique starting position');
      break;
    }
    corners.add(slot.startIndex);
  }

  if (mode === 'solo') {
    const hasHuman = active.some((s) => s.kind === 'human');
    if (!hasHuman) errors.push('At least one slot must be Human');
  } else {
    const needsClaim = state.slots.filter((s) => s.kind === 'human' || s.kind === 'open');
    for (const slot of needsClaim) {
      if (!slot.claimedBy) {
        errors.push(`Slot ${slot.id} is not claimed yet`);
      }
    }
    if (mode === 'host') {
      const unready = needsClaim.filter((s) => s.claimedBy && !s.ready);
      if (unready.length > 0) {
        errors.push('Waiting for all players to ready up');
      }
    }
    if (mode === 'guest' && localId) {
      const mine = state.slots.find((s) => s.id === localId);
      if (mine && !mine.ready) {
        errors.push('Mark yourself ready before starting');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildMatchConfig(state: LobbyState): MatchConfig {
  const players = activeSlots(state.slots).map((slot) => {
    if (slot.startIndex === null) throw new Error(`Slot ${slot.id} has no starting position`);
    return {
      id: slot.id,
      controller: slot.kind === 'ai' ? ('ai' as const) : ('human' as const),
      team: teamLabelToId(slot.team),
      color: slot.color,
      startIndex: slot.startIndex,
      factionId: slot.factionId,
      ...(slot.kind === 'ai' ? { aiDifficulty: slot.aiDifficulty ?? 'normal' } : {}),
    };
  });

  return {
    mapId: state.mapId,
    seed: state.seed ?? 0,
    players,
    deadSpectatorReveal: state.deadSpectatorReveal ?? false,
  };
}

export function defaultLobbyState(mapId = 'duel_glade', factionId = 'arcane'): LobbyState {
  return {
    mapId,
    factionId,
    slots: [
      { id: 'player0', kind: 'human', team: 'a', color: '#4f9dff', startIndex: null, factionId, claimedBy: 'local', ready: true },
      { id: 'player1', kind: 'ai', team: 'b', color: '#ff5d5d', startIndex: null, factionId, aiDifficulty: 'normal' },
      { id: 'player2', kind: 'closed', team: 'c', color: '#5dff8f', startIndex: null, factionId },
      { id: 'player3', kind: 'closed', team: 'd', color: '#ffd166', startIndex: null, factionId },
    ],
  };
}

/** Default lobby for online host: one human slot plus three open guest slots. */
export function defaultOnlineLobbyState(mapId = 'duel_glade', factionId = 'arcane'): LobbyState {
  return {
    mapId,
    factionId,
    slots: [
      { id: 'player0', kind: 'human', team: 'a', color: '#4f9dff', startIndex: null, factionId, claimedBy: null, ready: false },
      { id: 'player1', kind: 'open', team: 'b', color: '#ff5d5d', startIndex: null, factionId, claimedBy: null, ready: false },
      { id: 'player2', kind: 'open', team: 'c', color: '#5dff8f', startIndex: null, factionId, claimedBy: null, ready: false },
      { id: 'player3', kind: 'open', team: 'd', color: '#ffd166', startIndex: null, factionId, claimedBy: null, ready: false },
    ],
  };
}
