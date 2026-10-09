/**
 * Render on demand.
 *
 * A requestAnimationFrame loop that runs only while something can change:
 *   active    scroll/pointer/resize in the last few seconds, or the story is
 *             still catching up → render every frame;
 *   ambient   nothing happening for IDLE_AFTER s → render every other frame
 *             (breathing and blinking still look fine at 30 fps);
 *   asleep    nothing for SLEEP_AFTER s → stop the loop entirely; the canvas
 *             keeps its last image. Any input wakes it.
 * Hidden tabs get no rAF callbacks at all, so they cost nothing.
 */
export type FrameCallback = (dt: number, now: number) => boolean;

const IDLE_AFTER = 6;
const SLEEP_AFTER = 24;

export class FrameScheduler {
  private raf = 0;
  private last = 0;
  private quiet = 0;
  private odd = false;
  private running = false;
  state: 'active' | 'ambient' | 'asleep' = 'asleep';
  /** Disable sleeping (tests, recordings). */
  neverSleep = false;

  constructor(private readonly callback: FrameCallback) {}

  /** Call on any input. Restarts the loop if it was asleep. */
  wake(): void {
    this.quiet = 0;
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      this.state = 'active';
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.quiet += dt;
    this.state = this.quiet > IDLE_AFTER ? 'ambient' : 'active';
    this.odd = !this.odd;
    let busy = false;
    if (this.state === 'active' || this.odd) busy = this.callback(this.state === 'ambient' ? dt * 2 : dt, now);
    if (busy) this.quiet = 0;
    if (!this.neverSleep && this.quiet > SLEEP_AFTER) {
      this.running = false;
      this.state = 'asleep';
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.state = 'asleep';
  }
}
