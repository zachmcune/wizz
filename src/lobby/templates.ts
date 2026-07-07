import type { Registry } from '../data/registry';
import { teamIdToLabel } from './teams';
import type { LobbyState, LobbySlot } from './types';
import { defaultLobbyState } from './build-config';

export interface LobbyTemplate {
  id: string;
  name: string;
  apply: (registry: Registry) => LobbyState;
}

function fromMatch(registry: Registry, matchId: string): LobbyState {
  const match = registry.match(matchId);
  const base = defaultLobbyState(match.mapId);
  const slots: LobbySlot[] = ['player0', 'player1', 'player2', 'player3'].map((id, i) => {
    const cfg = match.players.find((p) => p.id === id);
    if (!cfg) {
      return { ...base.slots[i]!, kind: 'closed' as const };
    }
    return {
      id: id as LobbySlot['id'],
      kind: cfg.controller === 'ai' ? 'ai' : 'human',
      team: teamIdToLabel(cfg.team),
      color: cfg.color,
      startIndex: cfg.startIndex as LobbySlot['startIndex'],
      factionId: cfg.factionId ?? base.factionId,
      aiDifficulty: cfg.aiDifficulty,
      claimedBy: cfg.controller === 'human' ? 'local' : null,
    };
  });
  return { mapId: match.mapId, factionId: base.factionId, slots, seed: match.seed };
}

export function getLobbyTemplates(registry: Registry): LobbyTemplate[] {
  return [
    { id: 'skirmish_1v1', name: '1v1 vs AI', apply: () => fromMatch(registry, 'skirmish_1v1') },
    { id: 'ffa_4', name: 'FFA (4)', apply: () => fromMatch(registry, 'ffa_4') },
    {
      id: '2v2_ai',
      name: '2v2 AI',
      apply: () => ({
        mapId: 'duel_glade',
        factionId: 'arcane',
        seed: 999,
        slots: [
          { id: 'player0', kind: 'ai', team: 'a', color: '#4f9dff', startIndex: 0, factionId: 'arcane', aiDifficulty: 'hard', claimedBy: null },
          { id: 'player1', kind: 'ai', team: 'a', color: '#5dff8f', startIndex: 1, factionId: 'arcane', aiDifficulty: 'normal', claimedBy: null },
          { id: 'player2', kind: 'ai', team: 'b', color: '#ff5d5d', startIndex: 2, factionId: 'arcane', aiDifficulty: 'hard', claimedBy: null },
          { id: 'player3', kind: 'ai', team: 'b', color: '#ffd166', startIndex: 3, factionId: 'arcane', aiDifficulty: 'normal', claimedBy: null },
        ],
      }),
    },
  ];
}
