import { describe, expect, it } from 'vitest';
import { missingStartHint } from '../src/lobby/start-hint';
import { defaultLobbyState } from '../src/lobby/build-config';
import {
  advanceMatchCoach,
  initialMatchCoachStep,
  lobbyCoachCopy,
  matchCoachCopy,
  skipMatchCoachStep,
  spellChipTitle,
  type MatchCoachFacts,
} from '../src/ui/coach/progress';

const idle: MatchCoachFacts = {
  hqSelected: false,
  placingBuilding: false,
  ownedNonHqBuilding: false,
  wispSelected: false,
  wispHasOrder: false,
};

describe('missing start hint', () => {
  it('explains a greyed Start when corners are empty', () => {
    const lobby = defaultLobbyState();
    const hint = missingStartHint(lobby.slots);
    expect(hint).toMatch(/start/i);
    expect(hint).toMatch(/map/i);
  });

  it('calls out the AI when only the AI is missing a corner', () => {
    const lobby = defaultLobbyState();
    lobby.slots[0]!.startIndex = 0;
    expect(missingStartHint(lobby.slots)).toMatch(/AI/i);
  });

  it('is silent when every active player has a corner', () => {
    const lobby = defaultLobbyState();
    lobby.slots[0]!.startIndex = 0;
    lobby.slots[1]!.startIndex = 3;
    expect(missingStartHint(lobby.slots)).toBeNull();
  });
});

describe('first-match coach steps', () => {
  it('starts on HQ and stays there until the player selects it', () => {
    expect(initialMatchCoachStep()).toBe('selectHq');
    expect(advanceMatchCoach('selectHq', idle)).toBe('selectHq');
    expect(matchCoachCopy('selectHq', idle)?.body).toMatch(/Sanctum/i);
  });

  it('advances to place-building after HQ is selected', () => {
    expect(advanceMatchCoach('selectHq', { ...idle, hqSelected: true })).toBe('placeBuilding');
  });

  it('does not treat picking a building as placing it', () => {
    expect(advanceMatchCoach('placeBuilding', { ...idle, hqSelected: true, placingBuilding: true })).toBe(
      'placeBuilding',
    );
    expect(matchCoachCopy('placeBuilding', { ...idle, placingBuilding: true })?.body).toMatch(/Green/i);
  });

  it('advances after a non-HQ building exists, then after a wisp order', () => {
    const afterBuild = advanceMatchCoach('selectHq', { ...idle, ownedNonHqBuilding: true });
    expect(afterBuild).toBe('moveWisp');
    expect(advanceMatchCoach(afterBuild, { ...idle, ownedNonHqBuilding: true, wispHasOrder: true })).toBe('radarWin');
  });

  it('does not auto-finish the radar / win tip', () => {
    expect(advanceMatchCoach('radarWin', { ...idle, ownedNonHqBuilding: true, wispHasOrder: true })).toBe('radarWin');
    const copy = matchCoachCopy('radarWin', idle);
    expect(copy?.body).toMatch(/Scrying Obelisk/);
    expect(copy?.body).toMatch(/Sanctum/);
    expect(copy?.anchor).toBe('map');
  });

  it('Got it walks forward; skip from radar finishes', () => {
    expect(skipMatchCoachStep('selectHq')).toBe('placeBuilding');
    expect(skipMatchCoachStep('radarWin')).toBe('done');
    expect(matchCoachCopy('done', idle)).toBeNull();
  });

  it('never goes backwards if the player deselects HQ', () => {
    const step = advanceMatchCoach('selectHq', { ...idle, hqSelected: true });
    expect(advanceMatchCoach(step, idle)).toBe('placeBuilding');
  });
});

describe('coach copy helpers', () => {
  it('builds a lobby coach card from the start-position hint', () => {
    const copy = lobbyCoachCopy('The AI needs a start too.');
    expect(copy?.title).toMatch(/start/i);
    expect(copy?.anchor).toBe('lobby');
    expect(lobbyCoachCopy(null)).toBeNull();
  });

  it('marks locked spells as unlocking later', () => {
    expect(spellChipTitle('Aegis Ward', false)).toBe('Aegis Ward — unlocks later');
    expect(spellChipTitle('Aegis Ward', true)).toBe('Aegis Ward');
    expect(spellChipTitle('Aegis Ward', true, true)).toBe('Aegis Ward — cooling down');
  });
});
