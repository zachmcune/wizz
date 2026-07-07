// Lobby state types for pre-match setup (solo and online).
export type TeamLabel = 'a' | 'b' | 'c' | 'd';
export type SlotKind = 'closed' | 'human' | 'ai' | 'open';
export type SlotId = 'player0' | 'player1' | 'player2' | 'player3';
export type CornerIndex = 0 | 1 | 2 | 3;
export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface LobbySlot {
  id: SlotId;
  kind: SlotKind;
  team: TeamLabel;
  color: string;
  startIndex: CornerIndex;
  factionId: string;
  aiDifficulty?: AiDifficulty;
  claimedBy?: string | null;
  ready?: boolean;
}

export interface LobbyState {
  mapId: string;
  factionId: string;
  slots: LobbySlot[];
  seed?: number;
}

export type LobbyMode = 'solo' | 'host' | 'guest';

export const DEFAULT_COLORS = ['#4f9dff', '#ff5d5d', '#5dff8f', '#ffd166'] as const;

export const CORNER_LABELS = ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'] as const;
