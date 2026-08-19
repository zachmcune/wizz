// First-match teaching coach: pure step machine + copy. UI-only; never touches the sim.

export type MatchCoachStep = 'selectHq' | 'placeBuilding' | 'moveWisp' | 'radarWin' | 'done';

export type CoachAnchor = 'cmd' | 'map' | 'lobby';

export interface MatchCoachFacts {
  hqSelected: boolean;
  placingBuilding: boolean;
  ownedNonHqBuilding: boolean;
  wispSelected: boolean;
  wispHasOrder: boolean;
}

export interface CoachCopy {
  title: string;
  body: string;
  anchor: CoachAnchor;
}

export const MATCH_COACH_STEPS: readonly MatchCoachStep[] = [
  'selectHq',
  'placeBuilding',
  'moveWisp',
  'radarWin',
];

const STEP_AFTER: Record<MatchCoachStep, MatchCoachStep> = {
  selectHq: 'placeBuilding',
  placeBuilding: 'moveWisp',
  moveWisp: 'radarWin',
  radarWin: 'done',
  done: 'done',
};

export function initialMatchCoachStep(): MatchCoachStep {
  return 'selectHq';
}

export function skipMatchCoachStep(step: MatchCoachStep): MatchCoachStep {
  return STEP_AFTER[step];
}

function satisfied(step: MatchCoachStep, facts: MatchCoachFacts): boolean {
  switch (step) {
    case 'selectHq':
      return facts.hqSelected || facts.placingBuilding || facts.ownedNonHqBuilding;
    case 'placeBuilding':
      return facts.ownedNonHqBuilding;
    case 'moveWisp':
      return facts.wispHasOrder;
    case 'radarWin':
    case 'done':
      return false;
  }
}

/** Advance while the player has actually done the current thing. Never goes backwards. */
export function advanceMatchCoach(step: MatchCoachStep, facts: MatchCoachFacts): MatchCoachStep {
  let current = step;
  for (let i = 0; i < MATCH_COACH_STEPS.length; i++) {
    if (current === 'done' || !satisfied(current, facts)) break;
    current = STEP_AFTER[current];
  }
  return current;
}

export function matchCoachCopy(step: MatchCoachStep, facts: MatchCoachFacts): CoachCopy | null {
  switch (step) {
    case 'selectHq':
      return {
        title: 'Your HQ',
        body: 'Tap your Sanctum (the big purple building) to open Build.',
        anchor: 'cmd',
      };
    case 'placeBuilding':
      return {
        title: 'Build something',
        body: facts.placingBuilding
          ? 'Green tiles can hold it. Not-green means too far or blocked. Tap a green tile to place.'
          : 'Tap Attunement Spire in Build, then tap a green tile to place it.',
        anchor: 'cmd',
      };
    case 'moveWisp':
      return {
        title: 'Move a wisp',
        body: facts.wispSelected
          ? 'Tap the ground to move. Wisps harvest the teal mana cubes.'
          : 'Tap a wisp, then tap the ground to move. Wisps harvest the teal mana cubes.',
        anchor: 'cmd',
      };
    case 'radarWin':
      return {
        title: 'Radar & winning',
        body: 'Radar turns on when you build a Scrying Obelisk (needs Attunement Spire + Ley Conduit). Win by destroying the enemy Sanctum.',
        anchor: 'map',
      };
    case 'done':
      return null;
  }
}

export function lobbyCoachCopy(startHint: string | null): CoachCopy | null {
  if (!startHint) return null;
  return {
    title: 'Pick a start',
    body: startHint,
    anchor: 'lobby',
  };
}

export function spellChipTitle(name: string, unlocked: boolean, coolingDown = false): string {
  if (!unlocked) return `${name} — unlocks later`;
  if (coolingDown) return `${name} — cooling down`;
  return name;
}

export const RADAR_OFFLINE_TITLE = 'Radar off';
export const RADAR_OFFLINE_CANVAS_LINES = ['Radar', 'off'] as const;
export const RADAR_OFFLINE_HOW =
  'Build a Scrying Obelisk to turn this on. Needs Attunement Spire + Ley Conduit.';
