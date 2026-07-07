import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { buildMatchConfig, validateLobby, defaultLobbyState } from '../src/lobby/build-config';
import { getLobbyTemplates } from '../src/lobby/templates';
import { teamLabelToId, teamIdToLabel } from '../src/lobby/teams';
import { runHeadless } from '../src/sim/headless';
import { hashState } from '../src/sim/hash';

const reg = getRegistry();

describe('lobby config', () => {
  it('maps team labels to numeric ids', () => {
    expect(teamLabelToId('a')).toBe(0);
    expect(teamLabelToId('d')).toBe(3);
    expect(teamIdToLabel(2)).toBe('c');
  });

  it('builds a match config from lobby state', () => {
    const lobby = defaultLobbyState();
    lobby.slots[0]!.startIndex = 0;
    lobby.slots[1]!.startIndex = 3;
    const config = buildMatchConfig(lobby);
    expect(config.mapId).toBe('duel_glade');
    expect(config.players).toHaveLength(2);
    expect(config.players[0]).toMatchObject({ id: 'player0', controller: 'human', team: 0, startIndex: 0 });
    expect(config.players[1]).toMatchObject({ id: 'player1', controller: 'ai', team: 1, aiDifficulty: 'normal' });
  });

  it('excludes closed slots', () => {
    const lobby = defaultLobbyState();
    lobby.slots[0]!.startIndex = 0;
    lobby.slots[1]!.startIndex = 3;
    lobby.slots[2]!.kind = 'closed';
    lobby.slots[3]!.kind = 'closed';
    const config = buildMatchConfig(lobby);
    expect(config.players).toHaveLength(2);
  });

  it('validates solo lobby requirements', () => {
    const lobby = defaultLobbyState();
    lobby.slots[0]!.startIndex = 0;
    lobby.slots[1]!.startIndex = 3;
    const map = reg.map(lobby.mapId);
    expect(validateLobby(lobby, 'solo', map).valid).toBe(true);

    lobby.slots[0]!.startIndex = null;
    expect(validateLobby(lobby, 'solo', map).valid).toBe(false);

    lobby.slots[0]!.startIndex = 0;
    lobby.slots[0]!.kind = 'ai';
    expect(validateLobby(lobby, 'solo', map).valid).toBe(false);

    lobby.slots[0]!.kind = 'human';
    lobby.slots[1]!.startIndex = lobby.slots[0]!.startIndex;
    expect(validateLobby(lobby, 'solo', map).valid).toBe(false);
  });

  it('validates online host lobby', () => {
    const lobby = defaultLobbyState();
    lobby.slots[0]!.startIndex = 0;
    lobby.slots[1]!.kind = 'open';
    lobby.slots[1]!.startIndex = 3;
    lobby.slots[1]!.claimedBy = null;
    const map = reg.map(lobby.mapId);
    expect(validateLobby(lobby, 'host', map).valid).toBe(false);

    lobby.slots[1]!.claimedBy = 'guest-1';
    lobby.slots[1]!.ready = false;
    expect(validateLobby(lobby, 'host', map).valid).toBe(false);

    lobby.slots[1]!.ready = true;
    expect(validateLobby(lobby, 'host', map).valid).toBe(true);
  });

  it('builds a deterministic 4-player 2v2 AI match from lobby template', () => {
    const template = getLobbyTemplates(reg).find((t) => t.id === '2v2_ai');
    expect(template).toBeDefined();
    const lobby = template!.apply(reg);
    const config = buildMatchConfig(lobby);
    expect(config.players).toHaveLength(4);
    expect(config.players.filter((p) => p.team === 0)).toHaveLength(2);
    const a = hashState(runHeadless(reg, config, 400));
    const b = hashState(runHeadless(reg, config, 400));
    expect(a).toBe(b);
  });
});
