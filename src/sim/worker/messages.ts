// Message protocol between the main thread and the simulation Web Worker.
import type { Command, GameEvent } from '../types';
import type { TransferState } from '../state-transfer';
import type { TransferDelta } from '../sync-delta';

export type { TransferState } from '../state-transfer';
export type { TransferDelta } from '../sync-delta';

/** A confirmed lockstep tick: commands merged by the relay to apply at `tick`. */
export interface LockstepEntry {
  tick: number;
  cmds: Command[];
}

export type ToWorker =
  | { type: 'initMatch'; matchId: string }
  | { type: 'initState'; state: TransferState }
  | { type: 'step' }
  | { type: 'command'; cmds: Command[] }
  | { type: 'setAi'; enabled: boolean }
  /** Process a batch of confirmed lockstep ticks in order (off the main thread). */
  | { type: 'lockstepBatch'; entries: LockstepEntry[]; checksumEvery: number }
  /** Apply an authoritative snapshot (resync a peer that fell behind). */
  | { type: 'applySnapshot'; state: TransferState }
  /** Ask the worker to serialize its current state (host answering a resync). */
  | { type: 'requestSnapshot' };

export type FromWorker =
  | { type: 'ready'; state: TransferState }
  | { type: 'tick'; state?: TransferState; delta?: TransferDelta; events: GameEvent[] }
  /** Result of a `lockstepBatch`: final state, accumulated events, and checksums. */
  | {
      type: 'lockstepResult';
      state: TransferState;
      events: GameEvent[];
      lastTick: number;
      checksums: { tick: number; hash: string }[];
    }
  /** Serialized state produced for a snapshot/resync. */
  | { type: 'snapshot'; state: TransferState };
