// Fixed-timestep driver. Steps the sim at a fixed rate; rendering interpolates between ticks.
// Uses wall-clock ONLY here (outside the sim) to decide how many ticks to run.
import { TICK_MS } from './constants';

export type StepFn = () => boolean;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private rafId = 0;
  private running = false;
  private paused = false;
  private timeScale = 1;
  private maxCatchUp = 5;

  constructor(
    private step: StepFn,
    private render: RenderFn,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      let delta = now - this.last;
      this.last = now;
      if (!this.paused) {
        if (delta > TICK_MS * 60) delta = TICK_MS;
        this.accumulator += delta * this.timeScale;
        let steps = 0;
        while (this.accumulator >= TICK_MS && steps < this.maxCatchUp) {
          if (!this.step()) break;
          this.accumulator -= TICK_MS;
          steps++;
        }
        if (steps === this.maxCatchUp) this.accumulator = 0;
      }
      this.render(this.accumulator / TICK_MS);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.accumulator = 0;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.05, Math.min(8, scale));
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  /** Run one sim step immediately (used when paused in sandbox). */
  stepOnce(step: StepFn): void {
    step();
    this.accumulator = 0;
  }
}
