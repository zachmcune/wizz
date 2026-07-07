// Shared relay types (referenced from relay/server.mjs JSDoc).
import type { Command, PlayerId } from '../src/sim/types';

export interface PendingCommand {
  playerId: PlayerId;
  forTick: number;
  cmds: Command[];
}
