import type { LobbyState } from '../lobby/types';
import type { LobbyStateWire } from './protocol';

import type { ProjectionMode } from '../core/projection';

function wireProjectionMode(mode: LobbyStateWire['projectionMode']): ProjectionMode {
  return mode === 'oblique' ? 'oblique' : 'ortho';
}

export function lobbyStateToWire(state: LobbyState): LobbyStateWire {
  return {
    mapId: state.mapId,
    factionId: state.factionId,
    deadSpectatorReveal: state.deadSpectatorReveal ?? false,
    projectionMode: state.projectionMode ?? 'ortho',
    slots: state.slots.map((s) => ({
      id: s.id,
      kind: s.kind,
      team: s.team,
      color: s.color,
      startIndex: s.startIndex ?? null,
      factionId: s.factionId,
      aiDifficulty: s.aiDifficulty,
      claimedBy: s.claimedBy ?? null,
      ready: s.ready ?? false,
    })),
  };
}

export function lobbyStateFromWire(wire: LobbyStateWire): LobbyState {
  return {
    mapId: wire.mapId,
    factionId: wire.factionId,
    deadSpectatorReveal: wire.deadSpectatorReveal ?? false,
    projectionMode: wireProjectionMode(wire.projectionMode),
    slots: wire.slots.map((s) => ({
      id: s.id as LobbyState['slots'][number]['id'],
      kind: s.kind,
      team: s.team as LobbyState['slots'][number]['team'],
      color: s.color,
      startIndex: s.startIndex ?? null,
      factionId: s.factionId,
      aiDifficulty: s.aiDifficulty,
      claimedBy: s.claimedBy ?? null,
      ready: s.ready ?? false,
    })),
  };
}
