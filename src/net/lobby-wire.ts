import type { LobbyState } from '../lobby/types';
import type { LobbyStateWire } from './protocol';

export function lobbyStateToWire(state: LobbyState): LobbyStateWire {
  return {
    mapId: state.mapId,
    factionId: state.factionId,
    deadSpectatorReveal: state.deadSpectatorReveal ?? false,
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
