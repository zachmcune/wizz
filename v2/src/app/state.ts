// APP STATE — the single source of truth for which screen is showing and what it is showing.
//
// The app is a small state machine, not a stack of pages:
//
//   menu ──> lobby ──> match ⇄ pause ──> results ──> menu
//            └──> settings
//            └──> gallery
//            └──> sandbox ──> match (sandbox mode)
//
// Each screen is a pure function of `AppState` plus the live `MatchSession`. Screens never mutate the
// DOM outside their own root, and they never talk to each other directly — they emit intents that the
// router handles. That keeps the HUD, which updates every frame, from having any opinion about
// navigation.
import type { GameState } from '../sim/types';
import type { SimServices } from '../sim/context';
import type { Registry } from '../data/registry';

export type ScreenId = 'menu' | 'lobby' | 'settings' | 'match' | 'pause' | 'results' | 'sandbox' | 'gallery';

export type Density = 'compact' | 'regular' | 'roomy';

/** One configured participant, as chosen in the lobby. */
export interface LobbyPlayer {
  id: string;
  name: string;
  /** Human players are controlled by touch/mouse; AI by the Phase 5 planners. */
  controller: 'human' | 'ai';
  team: 0 | 1;
  color: string;
  factionId: string;
  /** Spawn corner, auto-assigned by the lobby. */
  startIndex: number;
  aiDifficulty?: 'easy' | 'normal' | 'hard';
}

export interface LobbyConfig {
  mapId: string;
  players: LobbyPlayer[];
  /** 0.5x .. 2x. Applied by the loop, not the sim, so determinism is unaffected. */
  speed: number;
  sandbox: boolean;
}

/** A live match: the sim state, its services, and the renderer bound to it. */
export interface MatchSession {
  state: GameState;
  services: SimServices;
  registry: Registry;
  config: LobbyConfig;
  /** Wall-clock ms accumulated by the fixed-step loop. */
  accumulator: number;
  endedAtTick: number | null;
}

export interface AppState {
  screen: ScreenId;
  /** Screen to return to when leaving settings. */
  returnTo: ScreenId;
  lobby: LobbyConfig;
  session: MatchSession | null;
  density: Density;
  /** Selected entity ids, owned by the HUD. */
  selection: Set<number>;
  /** Build placement mode: the building def waiting for a board click. */
  placing: string | null;
  /** Which command panel is open on a selected building. */
  panel: 'none' | 'build' | 'train' | 'research';
  /** Research tree overlay. */
  researchOpen: boolean;
  /** Sandbox tab index. */
  sandboxTab: number;
  /** Last error surfaced to the player, cleared on the next action. */
  notice: { kind: 'info' | 'warn' | 'bad'; text: string } | null;
}

/** The eight canonical team colours from the sim's palette, in lobby order. */
export const LOBBY_COLORS = [
  { color: '#4f9dff', name: 'Blue' },
  { color: '#ff5d5d', name: 'Red' },
  { color: '#5cff8a', name: 'Green' },
  { color: '#ffd166', name: 'Gold' },
] as const;

/** Default 1v1 lobby: the exact shape v1 shipped, minus its red-error-on-load bug. */
export function defaultLobby(registry: Registry): LobbyConfig {
  const mapId = registry.maps.has('duel_glade') ? 'duel_glade' : [...registry.maps.keys()][0]!;
  const factionIds = [...registry.factions.keys()];
  return {
    mapId,
    players: [
      { id: 'player0', name: 'You', controller: 'human', team: 0, color: LOBBY_COLORS[0].color, factionId: factionIds[0] ?? 'arcane', startIndex: 0 },
      { id: 'player1', name: 'Rival', controller: 'ai', team: 1, color: LOBBY_COLORS[1].color, factionId: factionIds[0] ?? 'arcane', startIndex: 1, aiDifficulty: 'normal' },
    ],
    speed: 1,
    sandbox: false,
  };
}

export function createAppState(registry: Registry, density: Density): AppState {
  return {
    // `?screen=` drives the initial screen so the proof harness can open any screen directly. It is
    // also how a reload preserves where the player was.
    screen: initialScreen(),
    returnTo: 'menu',
    lobby: defaultLobby(registry),
    session: null,
    density,
    selection: new Set(),
    placing: null,
    panel: 'none',
    researchOpen: false,
    sandboxTab: 0,
    notice: null,
  };
}

const SCREENS: readonly ScreenId[] = ['menu', 'lobby', 'settings', 'match', 'pause', 'results', 'sandbox', 'gallery'];

function initialScreen(): ScreenId {
  if (typeof window === 'undefined') return 'menu';
  const q = new URLSearchParams(window.location.search).get('screen');
  return q && (SCREENS as readonly string[]).includes(q) ? (q as ScreenId) : 'menu';
}

/**
 * Auto-assign spawn corners so no two players share one.
 *
 * The v1 lobby left corners to the player and then complained in red when they collided on load. v2
 * assigns them, sorted so team 0 and team 1 are placed opposite each other where the map allows.
 */
export function assignStartIndices(players: LobbyPlayer[], cornerCount: number): LobbyPlayer[] {
  const used = new Set<number>();
  return players.map((p, i) => {
    let idx = i % Math.max(1, cornerCount);
    let guard = 0;
    while (used.has(idx) && guard < cornerCount * 2) {
      idx = (idx + 1) % Math.max(1, cornerCount);
      guard++;
    }
    used.add(idx);
    return { ...p, startIndex: idx };
  });
}
