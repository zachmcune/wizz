// Match stepping drivers — isolate solo, lockstep, and sandbox frame policies from Game.
import type { SimController } from './sim-controller';

export interface MatchDriver {
  /** Fixed-timestep sim advance (non-lockstep modes). */
  stepFixed(): boolean;
  /** Per-frame work (lockstep drain, stall hints). */
  onFrame(hudHint: (msg: string) => void): void;
  readonly usesLockstep: boolean;
}

export class SoloMatchDriver implements MatchDriver {
  readonly usesLockstep = false;
  constructor(private simCtrl: SimController) {}
  stepFixed(): boolean {
    return this.simCtrl.stepFixed();
  }
  onFrame(): void {}
}

export class LockstepMatchDriver implements MatchDriver {
  readonly usesLockstep = true;
  constructor(private simCtrl: SimController) {}
  stepFixed(): boolean {
    return false;
  }
  onFrame(hudHint: (msg: string) => void): void {
    this.simCtrl.drainLockstep(hudHint);
  }
}

export class SandboxMatchDriver implements MatchDriver {
  readonly usesLockstep = false;
  constructor(private simCtrl: SimController) {}
  stepFixed(): boolean {
    return this.simCtrl.stepFixed();
  }
  onFrame(): void {}
}

export function createMatchDriver(simCtrl: SimController, opts: { lockstep: boolean; sandbox: boolean }): MatchDriver {
  if (opts.lockstep) return new LockstepMatchDriver(simCtrl);
  if (opts.sandbox) return new SandboxMatchDriver(simCtrl);
  return new SoloMatchDriver(simCtrl);
}
