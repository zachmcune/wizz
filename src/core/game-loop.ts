// Fixed-timestep driver. Steps the sim at a fixed rate; rendering interpolates between ticks.
// Uses wall-clock ONLY here (outside the sim) to decide how many ticks to run.
import { TICK_MS } from './constants';

export type StepFn = () => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private rafId = 0;
  private running = false;
  private maxCatchUp = 5; // avoid spiral-of-death after tab suspends

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
      if (delta > TICK_MS * 60) delta = TICK_MS; // huge gaps (backgrounded): skip ahead
      this.accumulator += delta;
      let steps = 0;
      while (this.accumulator >= TICK_MS && steps < this.maxCatchUp) {
        this.step();
        this.accumulator -= TICK_MS;
        steps++;
      }
      if (steps === this.maxCatchUp) this.accumulator = 0;
      this.render(this.accumulator / TICK_MS);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
