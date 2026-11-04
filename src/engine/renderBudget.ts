/** Sustained frame-time feedback, with fast reductions and slow recovery to avoid oscillation. */
export class RenderBudget {
  private elapsed = 0;
  private frames = 0;
  private slow = 0;
  private fast = 0;
  private warmup = 2;
  dpr: number;
  readonly min: number;
  readonly max: number;

  constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
    this.dpr = max;
  }

  resetSamples(dpr = this.dpr) {
    this.dpr = dpr;
    this.elapsed = this.frames = this.slow = this.fast = 0;
    this.warmup = 2;
  }

  /** Returns a new DPR only when a sustained change warrants reallocating the drawing buffer. */
  sample(dt: number): number | undefined {
    // Ignore long interruptions; keep ordinary slow frames so heavy scenes still scale down.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) {
      this.resetSamples();
      return;
    }
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < 1) return;
    const fps = this.frames / this.elapsed;
    this.elapsed = this.frames = 0;
    this.slow = fps < 50 ? this.slow + 1 : 0;
    this.fast = fps > 57 ? this.fast + 1 : 0;
    let next = this.dpr;
    if (this.slow >= 2) next = Math.max(this.min, this.dpr - (fps < 30 ? 0.15 : 0.05));
    else if (this.fast >= 5) next = Math.min(this.max, this.dpr + 0.05);
    next = Math.round(next * 100) / 100;
    if (next === this.dpr) return;
    this.slow = this.fast = 0;
    this.dpr = next;
    return next;
  }
}
