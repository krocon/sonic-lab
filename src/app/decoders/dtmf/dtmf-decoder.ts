import { AudioFrame } from '../../audio/audio-frame';
import { Biquad } from '../../audio/dsp/biquad';
import { DecoderEvent, SignalDecoder } from '../signal-decoder';
import { DTMF_COLUMNS, DTMF_KEYS, DTMF_ROWS, DtmfKey } from './dtmf-tones';

/**
 * DTMF decoder (ITU-T Q.23/Q.24 tolerances).
 *
 * Input is low-passed (4th-order Butterworth, 3.2 kHz – flat across the DTMF band) and decimated
 * to ≈ 8 kHz. Every 10 ms a 30 ms window is analysed with a
 * Goertzel bank (three staggered accumulator sets). Each of the 8 tones is measured on a fine grid
 * (−4 % … +4 %) so its actual frequency can be estimated. A window is a valid key when
 * - one row and one column tone dominate their group by `groupSeparationDb`,
 * - both frequencies are within `maxFrequencyError` of nominal (±1.5 % accepted, ±3.5 % rejected),
 * - twist is within limits (row stronger ≤ 8 dB "normal", column stronger ≤ 4 dB "reverse"),
 * - the two tones carry at least `minToneEnergyRatio` of the window's energy (rejects speech,
 *   music and noise), and the level exceeds `minLevelDb`.
 * A key goes down once `confirmWindows` valid windows reach ≥ 60 % of the press's peak level (a
 * plateau of ≈ 40 ms; partially filled windows at the edges do not count, so short blips are
 * rejected) and up after two invalid windows.
 */
export interface DtmfConfig {
  readonly minLevelDb: number;
  readonly maxNormalTwistDb: number;
  readonly maxReverseTwistDb: number;
  readonly groupSeparationDb: number;
  readonly maxFrequencyError: number;
  readonly minToneEnergyRatio: number;
  readonly confirmWindows: number;
}

export const DEFAULT_DTMF_CONFIG: DtmfConfig = {
  minLevelDb: -45,
  maxNormalTwistDb: 8,
  maxReverseTwistDb: 4,
  groupSeparationDb: 8,
  maxFrequencyError: 0.025,
  minToneEnergyRatio: 0.6,
  confirmWindows: 3,
};

export type DtmfEvent =
  | (DecoderEvent & { readonly type: 'key-down'; readonly key: DtmfKey })
  | (DecoderEvent & { readonly type: 'key-up'; readonly key: DtmfKey; readonly duration: number })
  | (DecoderEvent & {
      readonly type: 'levels';
      /** Amplitude of the 4 row and 4 column tones, dBFS. */
      readonly rows: readonly number[];
      readonly columns: readonly number[];
    });

const NOMINAL = [...DTMF_ROWS, ...DTMF_COLUMNS];
/** Fine grid around each nominal frequency (relative offsets). */
const GRID = [-0.04, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04];
const CENTER = GRID.indexOf(0);
const WINDOW_SECONDS = 0.03;
const HOP_SECONDS = 0.01;
const SETS = 3;
const MIN_DB = -100;
/** Fraction of a press's peak level a window needs to count towards the confirmation. */
const PLATEAU = 0.6;

const toDb = (a: number) => (a > 0 ? Math.max(MIN_DB, 20 * Math.log10(a)) : MIN_DB);

export class DtmfDecoder implements SignalDecoder<DtmfConfig, DtmfEvent> {
  readonly id = 'dtmf';
  readonly name = 'DTMF decoder';
  private config = DEFAULT_DTMF_CONFIG;
  private inputRate = 0;
  private factor = 1;
  private rate = 8000;
  private n = 240;
  private hop = 80;
  private window = new Float64Array(0);
  private coeffs = new Float64Array(0);
  private s1 = new Float64Array(0);
  private s2 = new Float64Array(0);
  private counts = new Int32Array(SETS);
  private energy = new Float64Array(SETS);
  private amp = new Float64Array(0);
  // anti-alias low-pass + decimation
  private filters: [Biquad, Biquad] | null = null;
  private phase = 0;
  private samples = 0;
  // debounce state
  private current: DtmfKey | null = null;
  private since = 0;
  private candidate: DtmfKey | null = null;
  /** Levels of the candidate's valid windows so far. */
  private candidateLevels: number[] = [];
  private invalidCount = 0;
  private out: DtmfEvent[] = [];
  /** Weaker of the two tone amplitudes in the last valid window. */
  private level = 0;

  constructor(config: Partial<DtmfConfig> = {}) {
    this.configure(config);
  }

  configure(config: Partial<DtmfConfig>): void {
    this.config = { ...this.config, ...config };
  }

  get pressed(): DtmfKey | null {
    return this.current;
  }

  reset(): void {
    this.inputRate = 0;
    this.current = this.candidate = null;
    this.candidateLevels = [];
    this.invalidCount = 0;
  }

  process(frame: AudioFrame): DtmfEvent[] {
    if (frame.sampleRate !== this.inputRate) this.setup(frame.sampleRate);
    this.out = [];
    const f = this.filters;
    for (const x of frame.samples) {
      const y = f ? f[1].process(f[0].process(x)) : x;
      if (++this.phase < this.factor) continue;
      this.phase = 0;
      this.feed(y);
    }
    return this.out;
  }

  /** Decodes a complete recording into the key string (tests, files). */
  decodeAll(samples: Float32Array, sampleRate: number): string {
    let keys = '';
    const all = new Float32Array(samples.length + Math.round(sampleRate * 0.2));
    all.set(samples);
    for (let i = 0; i < all.length; i += 1024) {
      for (const e of this.process({
        samples: all.subarray(i, i + 1024),
        sampleRate,
        timestamp: i / sampleRate,
      })) {
        if (e.type === 'key-down') keys += e.key;
      }
    }
    return keys;
  }

  private setup(inputRate: number): void {
    this.inputRate = inputRate;
    this.factor = Math.max(1, Math.floor(inputRate / 8000));
    this.rate = inputRate / this.factor;
    this.filters =
      this.factor === 1 ? null : Biquad.butterworth4(Math.min(3200, this.rate * 0.4), inputRate);
    this.n = Math.round(this.rate * WINDOW_SECONDS);
    this.hop = Math.round(this.rate * HOP_SECONDS);
    this.window = Float64Array.from(
      { length: this.n },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / this.n),
    );
    const freqs: number[] = [];
    for (const f of NOMINAL) for (const g of GRID) freqs.push(f * (1 + g));
    this.coeffs = Float64Array.from(freqs, (f) => 2 * Math.cos((2 * Math.PI * f) / this.rate));
    const bins = freqs.length;
    this.s1 = new Float64Array(SETS * bins);
    this.s2 = new Float64Array(SETS * bins);
    this.amp = new Float64Array(bins);
    this.counts = Int32Array.from({ length: SETS }, (_, s) => -s * this.hop); // staggered starts
    this.energy = new Float64Array(SETS);
    this.phase = 0;
    this.samples = 0;
  }

  private feed(x: number): void {
    this.samples++;
    const bins = this.coeffs.length;
    for (let set = 0; set < SETS; set++) {
      const count = this.counts[set] ?? 0;
      if (count < 0) {
        this.counts[set] = count + 1;
        continue;
      }
      const v = x * (this.window[count] ?? 0);
      this.energy[set] = (this.energy[set] ?? 0) + v * v;
      const base = set * bins;
      for (let b = 0; b < bins; b++) {
        const i = base + b;
        const s0 = v + (this.coeffs[b] ?? 0) * (this.s1[i] ?? 0) - (this.s2[i] ?? 0);
        this.s2[i] = this.s1[i] ?? 0;
        this.s1[i] = s0;
      }
      if (count + 1 === this.n) {
        this.finish(set);
        this.counts[set] = 0;
      } else {
        this.counts[set] = count + 1;
      }
    }
  }

  private finish(set: number): void {
    const bins = this.coeffs.length;
    const base = set * bins;
    const norm = this.n * 0.5; // Hann coherent gain
    for (let b = 0; b < bins; b++) {
      const a1 = this.s1[base + b] ?? 0;
      const a2 = this.s2[base + b] ?? 0;
      this.amp[b] =
        (2 * Math.sqrt(Math.max(0, a1 * a1 + a2 * a2 - (this.coeffs[b] ?? 0) * a1 * a2))) / norm;
      this.s1[base + b] = 0;
      this.s2[base + b] = 0;
    }
    // Hann window energy normalisation: mean of w² = 3/8
    const rms2 = (this.energy[set] ?? 0) / (this.n * 0.375);
    this.energy[set] = 0;
    const time = (this.samples * this.factor) / this.inputRate;
    const key = this.classify(rms2);
    this.decide(key, this.level, time);
  }

  /** Amplitude of tone `t` (0–7) at its nominal frequency. */
  private nominal(t: number): number {
    return this.amp[t * GRID.length + CENTER] ?? 0;
  }

  /** Peak amplitude and relative frequency error of tone `t` (0–7) from the fine grid. */
  private tone(t: number): { amp: number; error: number } {
    const g = GRID.length;
    let best = 0;
    for (let k = 1; k < g; k++)
      if ((this.amp[t * g + k] ?? 0) > (this.amp[t * g + best] ?? 0)) best = k;
    const a = this.amp[t * g + best - 1] ?? 0;
    const b = this.amp[t * g + best] ?? 0;
    const c = this.amp[t * g + best + 1] ?? 0;
    let offset = 0;
    if (best > 0 && best < g - 1) {
      const da = toDb(a);
      const db = toDb(b);
      const dc = toDb(c);
      const denom = da - 2 * db + dc;
      offset = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (da - dc)) / denom));
    }
    const step = (GRID[1] ?? 0) - (GRID[0] ?? 0);
    return { amp: b, error: (GRID[best] ?? 0) + offset * step };
  }

  private classify(rms2: number): DtmfKey | null {
    const tones = NOMINAL.map((_, t) => this.tone(t));
    const rows = tones.slice(0, 4);
    const cols = tones.slice(4);
    this.out.push({
      type: 'levels',
      timestamp: 0,
      rows: rows.map((r) => toDb(r.amp)),
      columns: cols.map((c) => toDb(c.amp)),
    });
    // strongest tone of a group (at its estimated frequency) vs. the others at their nominal
    // frequency – the outer grid points of a neighbour lie inside the main lobe of a detuned tone
    const pick = (group: { amp: number; error: number }[], offset: number) => {
      let index = 0;
      for (let i = 1; i < group.length; i++)
        if ((group[i]?.amp ?? 0) > (group[index]?.amp ?? 0)) index = i;
      let second = 0;
      for (let i = 0; i < group.length; i++)
        if (i !== index) second = Math.max(second, this.nominal(offset + i));
      return { index, first: group[index], second: { amp: second, error: 0 } };
    };
    const r = pick(rows, 0);
    const c = pick(cols, 4);
    if (!r.first || !c.first) return null;
    const cfg = this.config;
    const rowDb = toDb(r.first.amp);
    const colDb = toDb(c.first.amp);
    if (Math.min(rowDb, colDb) < cfg.minLevelDb) return null;
    const twist = colDb - rowDb;
    if (twist > cfg.maxReverseTwistDb || -twist > cfg.maxNormalTwistDb) return null;
    if (
      rowDb - toDb(r.second.amp) < cfg.groupSeparationDb ||
      colDb - toDb(c.second.amp) < cfg.groupSeparationDb
    )
      return null;
    if (
      Math.abs(r.first.error) > cfg.maxFrequencyError ||
      Math.abs(c.first.error) > cfg.maxFrequencyError
    )
      return null;
    const toneEnergy = (r.first.amp ** 2 + c.first.amp ** 2) / 2;
    if (rms2 <= 0 || toneEnergy / rms2 < cfg.minToneEnergyRatio) return null;
    this.level = Math.min(r.first.amp, c.first.amp);
    return DTMF_KEYS[r.index]?.[c.index] ?? null;
  }

  private decide(key: DtmfKey | null, level: number, time: number): void {
    if (key !== null && key === this.current) {
      this.invalidCount = 0;
      return;
    }
    if (this.current !== null) {
      // two invalid (or different) windows end the press
      if (++this.invalidCount < 2) return;
      this.out.push({
        type: 'key-up',
        timestamp: time,
        key: this.current,
        duration: time - this.since,
      });
      this.current = null;
      this.invalidCount = 0;
    }
    if (key === null) {
      this.candidate = null;
      this.candidateLevels = [];
      return;
    }
    if (key !== this.candidate) {
      this.candidate = key;
      this.candidateLevels = [];
    }
    this.candidateLevels.push(level);
    const peak = Math.max(...this.candidateLevels);
    const plateau = this.candidateLevels.filter((l) => l >= PLATEAU * peak).length;
    if (plateau >= this.config.confirmWindows) {
      this.current = key;
      this.since = time - (this.candidateLevels.length - 1) * HOP_SECONDS - WINDOW_SECONDS;
      this.out.push({ type: 'key-down', timestamp: this.since, key });
      this.candidate = null;
      this.candidateLevels = [];
    }
  }
}
