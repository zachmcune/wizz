// Record and replay command streams for desync debugging and multiplayer verification.
import type { Command } from './types';

export const REPLAY_VERSION = 1;

export interface Replay {
  version: typeof REPLAY_VERSION;
  matchId: string;
  commandsByTick: Record<number, Command[]>;
}

export class ReplayRecorder {
  private commands: Record<number, Command[]> = {};

  /** Record commands issued for a tick (call when enqueuing). */
  record(tick: number, cmds: Command[]): void {
    if (!cmds.length) return;
    const list = this.commands[tick] ?? [];
    list.push(...cmds);
    this.commands[tick] = list;
  }

  toReplay(matchId: string): Replay {
    return { version: REPLAY_VERSION, matchId, commandsByTick: { ...this.commands } };
  }

  clear(): void {
    this.commands = {};
  }
}

export function replayFromScripted(matchId: string, scripted: Record<number, Command[]>): Replay {
  return { version: REPLAY_VERSION, matchId, commandsByTick: scripted };
}

export function replayFromMatch(matchId: string, commandsByTick: Record<number, Command[]>): Replay {
  return { version: REPLAY_VERSION, matchId, commandsByTick };
}

export function serializeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

export function parseReplay(json: string): Replay {
  const replay = JSON.parse(json) as Replay;
  if (replay.version !== REPLAY_VERSION) {
    throw new Error(`Unsupported replay version ${replay.version}`);
  }
  return replay;
}
