/** Smallest level reported, in dBFS (silence). */
export const MIN_DBFS = -100;

export function toDbfs(linear: number): number {
  return linear > 0 ? Math.max(MIN_DBFS, 20 * Math.log10(linear)) : MIN_DBFS;
}

export interface LevelReading {
  /** RMS of the last block, dBFS. */
  readonly rmsDb: number;
  /** Absolute peak of the last block, dBFS. */
  readonly peakDb: number;
  /** Held peak (decays after `holdSeconds`), dBFS. */
  readonly peakHoldDb: number;
  /** True if any sample reached full scale (|x| ≥ 0.999). */
  readonly clipped: boolean;
}

/**
 * Block-wise level meter with peak hold. Framework-free; feed it frames, read `reading`.
 */
export class LevelMeter {
  private rms = 0;
  private peak = 0;
  private hold = 0;
  private holdAge = 0;
  private clip = false;
  private readonly mutable = {
    rmsDb: MIN_DBFS,
    peakDb: MIN_DBFS,
    peakHoldDb: MIN_DBFS,
    clipped: false,
  };

  constructor(
    private readonly holdSeconds = 1.5,
    private readonly decayDbPerSecond = 20,
  ) {}

  process(samples: Float32Array, sampleRate: number): void {
    let sum = 0;
    let peak = 0;
    for (const s of samples) {
      sum += s * s;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
    }
    this.rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
    this.peak = peak;
    this.clip = peak >= 0.999;
    const dt = samples.length / sampleRate;
    if (peak >= this.hold) {
      this.hold = peak;
      this.holdAge = 0;
    } else {
      this.holdAge += dt;
      if (this.holdAge > this.holdSeconds) {
        this.hold *= Math.pow(10, (-this.decayDbPerSecond * dt) / 20);
      }
    }
  }

  /** Current values. The returned object is reused – read, don't store. */
  get reading(): LevelReading {
    this.mutable.rmsDb = toDbfs(this.rms);
    this.mutable.peakDb = toDbfs(this.peak);
    this.mutable.peakHoldDb = toDbfs(this.hold);
    this.mutable.clipped = this.clip;
    return this.mutable;
  }

  reset(): void {
    this.rms = this.peak = this.hold = this.holdAge = 0;
    this.clip = false;
  }
}
