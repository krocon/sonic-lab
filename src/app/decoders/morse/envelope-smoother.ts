/**
 * Moving average of the tone envelope over a window matched to the Morse unit (≈ 0.4 dit).
 * Averaging N hops reduces the noise fluctuation of the envelope while barely blurring elements
 * that are ≥ 2N hops long. Both edges are delayed equally, so durations are preserved.
 *
 * The last {@link MAX_SMOOTHING} values are always kept, so changing the window length (when the
 * speed estimate changes) is seamless.
 */
export const MAX_SMOOTHING = 16;

export class EnvelopeSmoother {
  private readonly history = new Float64Array(MAX_SMOOTHING);
  private index = 0;
  private filled = 0;
  private n = 1;
  private target = 1;

  get length(): number {
    return this.n;
  }

  /** Sets the target window length; the actual length moves there by one hop per push (no jumps). */
  setLength(length: number): void {
    this.target = Math.min(MAX_SMOOTHING, Math.max(1, Math.round(length)));
  }

  push(value: number): number {
    if (this.n !== this.target) this.n += this.n < this.target ? 1 : -1;
    this.history[this.index] = value;
    this.index = (this.index + 1) % MAX_SMOOTHING;
    if (this.filled < MAX_SMOOTHING) this.filled++;
    const count = Math.min(this.n, this.filled);
    let sum = 0;
    for (let i = 1; i <= count; i++)
      sum += this.history[(this.index - i + MAX_SMOOTHING) % MAX_SMOOTHING] ?? 0;
    return sum / count;
  }

  reset(): void {
    this.history.fill(0);
    this.index = 0;
    this.filled = 0;
  }
}
