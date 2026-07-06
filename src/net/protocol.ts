// V2 multiplayer wire protocol (architected, not wired into V1 per the roadmap).
// The relay (Cloudflare Worker + Durable Object) forwards these messages; it never simulates.
import type { Command } from '../sim/types';

export type ClientMessage =
  | { t: 'join'; room: string; playerId: string }
  | { t: 'commands'; forTick: number; cmds: Command[] }
  | { t: 'checksum'; tick: number; hash: string };

export type ServerMessage =
  | { t: 'joined'; playerId: string; seed: number; startTick: number }
  | { t: 'tick'; tick: number; cmds: Command[] } // merged commands for a tick
  | { t: 'peerChecksum'; playerId: string; tick: number; hash: string }
  | { t: 'peerLeft'; playerId: string };

/** Ticks of input delay before a command is executed (lockstep buffering). */
export const INPUT_DELAY_TICKS = 3;
