// Serialize GameState for worker postMessage (structured-clone friendly).
export type { TransferState } from './sync-surface';
export {
  packAuthoritativeState as packState,
  unpackAuthoritativeState as unpackState,
  applyAuthoritativeState as applyTransferState,
} from './sync-surface';
export { applyWorkerSync, type TransferDelta } from './sync-delta';
