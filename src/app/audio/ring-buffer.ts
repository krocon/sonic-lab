/**
 * Fixed-size circular buffer of samples. Writers append, readers copy the latest N samples.
 * No allocation after construction.
 */
export class RingBuffer {
  private readonly data: Float32Array;
  private writeIndex = 0;
  private filled = 0;
  /** Total samples ever written; lets readers detect new data cheaply. */
  private written = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be > 0');
    this.data = new Float32Array(capacity);
  }

  get size(): number {
    return this.filled;
  }

  get totalWritten(): number {
    return this.written;
  }

  write(samples: ArrayLike<number>): void {
    const n = samples.length;
    const start = n > this.capacity ? n - this.capacity : 0;
    for (let i = start; i < n; i++) {
      this.data[this.writeIndex] = samples[i] ?? 0;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
    }
    this.filled = Math.min(this.capacity, this.filled + (n - start));
    this.written += n;
  }

  /**
   * Copies the most recent `out.length` samples (oldest first) into `out`.
   * Missing history is filled with zeros at the start. Returns the number of real samples.
   */
  readLatest(out: Float32Array): number {
    const n = Math.min(out.length, this.filled);
    const pad = out.length - n;
    out.fill(0, 0, pad);
    let idx = (this.writeIndex - n + this.capacity) % this.capacity;
    for (let i = 0; i < n; i++) {
      out[pad + i] = this.data[idx] ?? 0;
      idx = (idx + 1) % this.capacity;
    }
    return n;
  }

  clear(): void {
    this.data.fill(0);
    this.writeIndex = 0;
    this.filled = 0;
    this.written = 0;
  }
}
