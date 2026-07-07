// Message protocol between the main thread and the simulation Web Worker.
import type { Command, GameEvent } from '../types';
import type { TransferState } from '../state-transfer';

export type { TransferState } from '../state-transfer';

export type ToWorker =
  | { type: 'initMatch'; matchId: string }
  | { type: 'initState'; state: TransferState }
  | { type: 'step' }
  | { type: 'command'; cmds: Command[] }
  | { type: 'setAi'; enabled: boolean };

export type FromWorker =
  | { type: 'ready'; state: TransferState }
  | { type: 'tick'; state: TransferState; events: GameEvent[] };
