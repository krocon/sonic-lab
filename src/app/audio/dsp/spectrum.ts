import { MIN_DBFS } from '../level';
import { FFT } from './fft';
import { WindowKind, coherentGain, makeWindow } from './window';

export interface SpectrumOptions {
  /** FFT size (power of two, 512–16384). */
  readonly size: number;
  readonly window: WindowKind;
  /** Fraction of overlap between successive frames (0–0.875). */
  readonly overlap: number;
  /** Exponential averaging factor per frame: 0 = none, 0.9 = heavy. */
  readonly averaging: number;
}

export const DEFAULT_SPECTRUM_OPTIONS: SpectrumOptions = {
  size: 4096,
  window: 'hann',
  overlap: 0.5,
  averaging: 0.6,
};

/**
 * Streaming magnitude spectrum in dBFS (a full-scale sine reads 0 dB). Framework-free; feed
 * samples, read `db` / `peakHold` (reused arrays) when `version` changes.
 */
export class SpectrumAnalyzer {
  readonly options: SpectrumOptions;
  readonly db: Float32Array;
  readonly peakHold: Float32Array;
  /** Increments with every computed frame. */
  version = 0;
  sampleRate = 48000;

  private readonly fft: FFT;
  private readonly window: Float64Array;
  private readonly gain: number;
  private readonly buffer: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly power: Float64Array;
  private fill = 0;
  private readonly hop: number;

  constructor(options: Partial<SpectrumOptions> = {}) {
    this.options = { ...DEFAULT_SPECTRUM_OPTIONS, ...options };
    const n = this.options.size;
    this.fft = new FFT(n);
    this.window = makeWindow(this.options.window, n);
    this.gain = coherentGain(this.window);
    this.buffer = new Float64Array(n);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.power = new Float64Array(n / 2 + 1);
    this.db = new Float32Array(n / 2 + 1).fill(MIN_DBFS);
    this.peakHold = new Float32Array(n / 2 + 1).fill(MIN_DBFS);
    this.hop = Math.max(
      1,
      Math.round(n * (1 - Math.min(0.875, Math.max(0, this.options.overlap)))),
    );
  }

  get bins(): number {
    return this.db.length;
  }

  binFrequency(bin: number): number {
    return (bin * this.sampleRate) / this.options.size;
  }

  process(samples: Float32Array, sampleRate: number): void {
    this.sampleRate = sampleRate;
    const n = this.options.size;
    for (const s of samples) {
      this.buffer[this.fill++] = s;
      if (this.fill === n) {
        this.compute();
        this.buffer.copyWithin(0, this.hop);
        this.fill = n - this.hop;
      }
    }
  }

  resetPeaks(): void {
    this.peakHold.fill(MIN_DBFS);
  }

  private compute(): void {
    const { re, im, window, power, db, peakHold } = this;
    const n = this.options.size;
    for (let i = 0; i < n; i++) {
      re[i] = (this.buffer[i] ?? 0) * (window[i] ?? 0);
      im[i] = 0;
    }
    this.fft.transform(re, im);
    const scale = 2 / (n * this.gain);
    const a = this.version === 0 ? 0 : this.options.averaging;
    for (let k = 0; k < power.length; k++) {
      const mag = Math.hypot(re[k] ?? 0, im[k] ?? 0) * (k === 0 || k === n / 2 ? scale / 2 : scale);
      const p = mag * mag;
      const avg = a * (power[k] ?? 0) + (1 - a) * p;
      power[k] = avg;
      const d = avg > 0 ? Math.max(MIN_DBFS, 10 * Math.log10(avg)) : MIN_DBFS;
      db[k] = d;
      if (d > (peakHold[k] ?? MIN_DBFS)) peakHold[k] = d;
    }
    this.version++;
  }
}

export interface Peak {
  readonly frequency: number;
  readonly db: number;
}

/**
 * Strongest peak between `minHz` and `maxHz`, refined by parabolic interpolation of the dB values
 * of the peak bin and its neighbours (accuracy ≈ 1 % of the bin width for Hann windows).
 */
export function findPeak(analyzer: SpectrumAnalyzer, minHz = 20, maxHz = Infinity): Peak | null {
  const { db } = analyzer;
  const binHz = analyzer.sampleRate / analyzer.options.size;
  const lo = Math.max(1, Math.ceil(minHz / binHz));
  const hi = Math.min(db.length - 2, Math.floor(maxHz / binHz));
  let best = -1;
  let bestDb = -Infinity;
  for (let k = lo; k <= hi; k++) {
    const v = db[k] ?? MIN_DBFS;
    if (v > bestDb) {
      bestDb = v;
      best = k;
    }
  }
  if (best < 0 || bestDb <= MIN_DBFS + 1) return null;
  return refine(db, best, binHz);
}

/** All local maxima at least `minDb` high and `separationHz` apart, strongest first. */
export function findPeaks(
  analyzer: SpectrumAnalyzer,
  minDb: number,
  count: number,
  separationHz = 50,
): Peak[] {
  const { db } = analyzer;
  const binHz = analyzer.sampleRate / analyzer.options.size;
  const peaks: Peak[] = [];
  for (let k = 1; k < db.length - 1; k++) {
    const v = db[k] ?? MIN_DBFS;
    if (v >= minDb && v > (db[k - 1] ?? MIN_DBFS) && v >= (db[k + 1] ?? MIN_DBFS))
      peaks.push(refine(db, k, binHz));
  }
  peaks.sort((a, b) => b.db - a.db);
  const chosen: Peak[] = [];
  for (const p of peaks) {
    if (chosen.every((c) => Math.abs(c.frequency - p.frequency) >= separationHz)) chosen.push(p);
    if (chosen.length === count) break;
  }
  return chosen;
}

function refine(db: Float32Array, k: number, binHz: number): Peak {
  const a = db[k - 1] ?? MIN_DBFS;
  const b = db[k] ?? MIN_DBFS;
  const c = db[k + 1] ?? MIN_DBFS;
  const denom = a - 2 * b + c;
  const offset = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
  return { frequency: (k + offset) * binHz, db: b - 0.25 * (a - c) * offset };
}
