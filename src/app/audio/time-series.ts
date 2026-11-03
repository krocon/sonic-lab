/** Bounded history of (time, value) pairs for trend displays. NaN marks "no value". */
export class TimeSeries {
  private readonly times: Float64Array;
  private readonly values: Float64Array;
  private start = 0;
  private count = 0;
  version = 0;

  constructor(readonly capacity: number) {
    this.times = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(time: number, value: number): void {
    const i = (this.start + this.count) % this.capacity;
    this.times[i] = time;
    this.values[i] = value;
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
    this.version++;
  }

  /** Visits points oldest → newest. */
  forEach(fn: (time: number, value: number) => void): void {
    for (let k = 0; k < this.count; k++) {
      const i = (this.start + k) % this.capacity;
      fn(this.times[i] ?? 0, this.values[i] ?? 0);
    }
  }

  get last(): { time: number; value: number } | null {
    if (!this.count) return null;
    const i = (this.start + this.count - 1) % this.capacity;
    return { time: this.times[i] ?? 0, value: this.values[i] ?? 0 };
  }

  /** Mean and standard deviation of the finite values newer than `since`. */
  stats(since: number): { mean: number; std: number; n: number } {
    let n = 0;
    let sum = 0;
    let sq = 0;
    this.forEach((t, v) => {
      if (t >= since && Number.isFinite(v)) {
        n++;
        sum += v;
        sq += v * v;
      }
    });
    const mean = n ? sum / n : NaN;
    return { mean, std: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : NaN, n };
  }

  clear(): void {
    this.start = this.count = 0;
    this.version++;
  }
}
