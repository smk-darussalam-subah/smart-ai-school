export const ASSESSMENT_AUTOSAVE_INTERVAL_MS = 5_000;

/**
 * Coalesce automatic network saves without delaying every time an answer changes.
 * Device persistence is deliberately outside this window and remains immediate.
 * Actual sends call markStarted(), so slow acknowledgements do not add another
 * full interval. Manual save/final submit can bypass or cancel the pending timer.
 */
export class AssessmentAutosaveWindow {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private lastStartedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly intervalMs = ASSESSMENT_AUTOSAVE_INTERVAL_MS,
    private readonly now: () => number = () => performance.now(),
  ) {}

  schedule(run: () => void): void {
    if (this.timer !== null) return;
    this.arm(run, this.intervalMs);
  }

  retry(run: () => void, delayMs: number): () => void {
    this.cancel();
    return this.arm(run, delayMs);
  }

  markStarted(): void {
    this.lastStartedAt = this.now();
  }

  cancel(): void {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(run: () => void, delayMs: number): () => void {
    const generation = ++this.generation;
    const dueAt = this.now() + Math.max(0, delayMs);
    const tick = () => {
      if (generation !== this.generation) return;
      const remaining = Math.max(dueAt, this.lastStartedAt + this.intervalMs) - this.now();
      if (remaining > 0) {
        this.timer = setTimeout(tick, remaining);
        return;
      }
      this.timer = null;
      run();
    };
    const wait = Math.max(dueAt, this.lastStartedAt + this.intervalMs) - this.now();
    this.timer = setTimeout(tick, Math.max(0, wait));
    return () => {
      if (generation === this.generation) this.cancel();
    };
  }
}
