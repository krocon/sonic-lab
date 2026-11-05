/**
 * Stage 1–2 of the Morse chain: a bank of Goertzel filters measures the tone amplitude.
 *
 * Each analysis window is two hops long and Hann-weighted; two staggered accumulator sets
 * produce one result per hop (50 % overlap). Compared with a single-hop rectangular window this
 * halves the bandwidth and lowers the sidelobes from −13 dB to −31 dB, while keeping the hop –
 * the time resolution of the keying detector – short.
 *
 * In auto mode the strongest bin in the search range is tracked; in manual mode the configured
 * frequency (± one bin) is used.
 */
export interface ToneDetectorConfig {
  /** `null` = automatic search in [minFrequency, maxFrequency]. */
  readonly frequency: number | null;
  readonly minFrequency: number;
  readonly maxFrequency: number;
  /** Hop length in ms. The analysis window is two hops; bandwidth ≈ 750 / hopMs Hz. */
  readonly hopMs: number;
}

export const DEFAULT_TONE_DETECTOR_CONFIG: ToneDetectorConfig = {
  frequency: null,
  minFrequency: 300,
  maxFrequency: 1500,
  hopMs: 6,
};

/** Spacing of the search bins, Hz. */
const BIN_SPACING = 50;
/** Coherent gain of the Hann window (mean of its coefficients). */
const HANN_GAIN = 0.5;
/** Time constant of the per-bin envelope statistics used to recognise keyed bins, s. */
const CV_SECONDS = 1.5;
/** Coefficient of variation above which a bin's envelope counts as keyed (noise ≈ 0.52). */
const KEYED_CV = 0.75;

export interface ToneHop {
  /** Amplitude of the tracked tone (sine amplitude, 0..1). */
  amplitude: number;
  /**
   * Complex amplitude of the tracked bin, phase referenced to the sample clock: a steady tone
   * exactly on the bin frequency keeps its phase from hop to hop, an offset of Δf turns it by
   * 2π·Δf per second. Its magnitude can be below `amplitude` (that takes the strongest neighbour).
   */
  re: number;
  im: number;
  /** Centre frequency of the tracked bin, Hz. */
  frequency: number;
  /** Time of the hop end, seconds (sample count based). */
  time: number;
}

export class ToneDetector {
  private config = DEFAULT_TONE_DETECTOR_CONFIG;
  private sampleRate = 0;
  private hop = 0;
  private windowLength = 0;
  private freqs = new Float64Array(0);
  private coeffs = new Float64Array(0);
  private cosW = new Float64Array(0);
  private sinW = new Float64Array(0);
  /** Goertzel state of the finished window per bin (for the complex result). */
  private last1 = new Float64Array(0);
  private last2 = new Float64Array(0);
  /** Two accumulator sets, interleaved: [set0 bins…, set1 bins…]. */
  private s1 = new Float64Array(0);
  private s2 = new Float64Array(0);
  private counts = [0, 0];
  private window = new Float64Array(0);
  private amps = new Float64Array(0);
  /** Per-bin running mean and mean square of the amplitude (auto mode). */
  private mean = new Float64Array(0);
  private meanSquare = new Float64Array(0);
  /** Slow average of each bin's amplitude while it is the strongest (auto mode). */
  private score = new Float64Array(0);
  private samples = 0;
  private tracked = 0;
  private readonly out: ToneHop = { amplitude: 0, re: 0, im: 0, frequency: 0, time: 0 };

  configure(config: Partial<ToneDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.sampleRate = 0; // rebuild on next frame
  }

  get hopSeconds(): number {
    return this.sampleRate ? this.hop / this.sampleRate : this.config.hopMs / 1000;
  }

  /** Frequency currently tracked, Hz (0 before the first hop). */
  get frequency(): number {
    return this.freqs[this.tracked] ?? 0;
  }

  reset(): void {
    this.sampleRate = 0;
    this.samples = 0;
  }

  /** Feeds samples; calls `onHop` once per completed hop. The hop object is reused. */
  process(samples: Float32Array, sampleRate: number, onHop: (hop: ToneHop) => void): void {
    if (sampleRate !== this.sampleRate) this.setup(sampleRate);
    const { coeffs, s1, s2, window, counts } = this;
    const bins = coeffs.length;
    const length = this.windowLength;
    for (const raw of samples) {
      for (let set = 0; set < 2; set++) {
        const count = counts[set] ?? 0;
        const x = raw * (window[count] ?? 0);
        const base = set * bins;
        for (let b = 0; b < bins; b++) {
          const i = base + b;
          const s0 = x + (coeffs[b] ?? 0) * (s1[i] ?? 0) - (s2[i] ?? 0);
          s2[i] = s1[i] ?? 0;
          s1[i] = s0;
        }
        counts[set] = count + 1;
      }
      this.samples++;
      for (let set = 0; set < 2; set++) {
        if (counts[set] === length) {
          counts[set] = 0;
          this.finishWindow(set, onHop);
        }
      }
    }
  }

  private finishWindow(set: number, onHop: (hop: ToneHop) => void): void {
    const { coeffs, s1, s2, score, amps } = this;
    const bins = coeffs.length;
    const base = set * bins;
    const norm = this.windowLength * HANN_GAIN;
    let best = 0;
    let bestAmp = -1;
    for (let b = 0; b < bins; b++) {
      const a1 = s1[base + b] ?? 0;
      const a2 = s2[base + b] ?? 0;
      const power = a1 * a1 + a2 * a2 - (coeffs[b] ?? 0) * a1 * a2;
      const amp = (2 * Math.sqrt(Math.max(0, power))) / norm;
      amps[b] = amp;
      this.last1[b] = a1;
      this.last2[b] = a2;
      if (amp > bestAmp) {
        bestAmp = amp;
        best = b;
      }
      s1[base + b] = 0;
      s2[base + b] = 0;
    }

    if (this.config.frequency === null) {
      best = this.keyedCandidate(best);
      for (let b = 0; b < bins; b++)
        score[b] = (score[b] ?? 0) * 0.995 + (b === best ? (amps[b] ?? 0) : 0);
      if ((score[best] ?? 0) > 1.5 * (score[this.tracked] ?? 0)) this.tracked = best;
    }
    // tolerate small drift: strongest of the tracked bin and its neighbours
    let trackedAmp = 0;
    for (let b = Math.max(0, this.tracked - 1); b <= Math.min(bins - 1, this.tracked + 1); b++) {
      trackedAmp = Math.max(trackedAmp, amps[b] ?? 0);
    }
    this.out.amplitude = trackedAmp;
    // the phase always from the tracked bin: switching to a neighbour would make it jump
    this.complexAmplitude(this.tracked, norm);
    this.out.frequency = this.freqs[this.tracked] ?? 0;
    this.out.time = this.samples / this.sampleRate;
    onHop(this.out);
  }

  /**
   * Complex result of bin `b` for the window that just ended: y = s1 − e^(−iω)·s2 is the DFT
   * relative to the window's last sample; e^(−iω·n) with n = that sample's index refers it to the
   * sample clock.
   */
  private complexAmplitude(b: number, norm: number): void {
    const a1 = this.last1[b] ?? 0;
    const a2 = this.last2[b] ?? 0;
    const yRe = a1 - (this.cosW[b] ?? 0) * a2;
    const yIm = (this.sinW[b] ?? 0) * a2;
    const cycles = ((this.freqs[b] ?? 0) * (this.samples - 1)) / this.sampleRate;
    const phase = -2 * Math.PI * (cycles - Math.floor(cycles));
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    this.out.re = (2 * (yRe * c - yIm * s)) / norm;
    this.out.im = (2 * (yRe * s + yIm * c)) / norm;
  }

  /**
   * Prefers bins whose envelope looks keyed. The coefficient of variation (std/mean) of a keyed
   * tone's envelope is ≈ 1 (on/off), that of stationary noise ≈ 0.52 (Rayleigh) – independent of
   * level, so loud coloured noise does not attract the tracker. Among keyed-looking bins the one
   * with the largest mean wins (leakage into neighbours is keyed too, but weaker).
   */
  private keyedCandidate(fallback: number): number {
    const { amps, mean, meanSquare } = this;
    const k = 1 - Math.exp(-this.hop / this.sampleRate / CV_SECONDS);
    let best = -1;
    let bestMean = 0;
    for (let b = 0; b < amps.length; b++) {
      const a = amps[b] ?? 0;
      mean[b] = (mean[b] ?? 0) + (a - (mean[b] ?? 0)) * k;
      meanSquare[b] = (meanSquare[b] ?? 0) + (a * a - (meanSquare[b] ?? 0)) * k;
    }
    for (let b = 0; b < amps.length; b++) {
      const m = mean[b] ?? 0;
      if (m <= 0 || m <= bestMean) continue;
      // only spectral peaks: the skirts of a tone whose gaps are filled by reverberation can look
      // more keyed than the tone itself, but they are never louder than their inner neighbour
      if (m < (mean[b - 1] ?? 0) || m < (mean[b + 1] ?? 0)) continue;
      const cv = Math.sqrt(Math.max(0, (meanSquare[b] ?? 0) / (m * m) - 1));
      if (cv > KEYED_CV) {
        bestMean = m;
        best = b;
      }
    }
    return best < 0 ? fallback : best;
  }

  private setup(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.hop = Math.max(16, Math.round((this.config.hopMs / 1000) * sampleRate));
    this.windowLength = 2 * this.hop;
    const n = this.windowLength;
    this.window = Float64Array.from(
      { length: n },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n),
    );
    const { frequency, minFrequency, maxFrequency } = this.config;
    const freqs: number[] = [];
    if (frequency === null) {
      for (let f = minFrequency; f <= maxFrequency; f += BIN_SPACING) freqs.push(f);
    } else {
      freqs.push(frequency - BIN_SPACING, frequency, frequency + BIN_SPACING);
    }
    const nyquist = sampleRate / 2;
    this.freqs = Float64Array.from(freqs.filter((f) => f > 0 && f < nyquist));
    this.coeffs = this.freqs.map((f) => 2 * Math.cos((2 * Math.PI * f) / sampleRate));
    this.cosW = this.freqs.map((f) => Math.cos((2 * Math.PI * f) / sampleRate));
    this.sinW = this.freqs.map((f) => Math.sin((2 * Math.PI * f) / sampleRate));
    const bins = this.freqs.length;
    this.last1 = new Float64Array(bins);
    this.last2 = new Float64Array(bins);
    this.s1 = new Float64Array(2 * bins);
    this.s2 = new Float64Array(2 * bins);
    // the second set starts half a window later; its first result covers only one hop of data
    this.counts = [0, this.hop];
    this.score = new Float64Array(bins);
    this.mean = new Float64Array(bins);
    this.meanSquare = new Float64Array(bins);
    this.amps = new Float64Array(bins);
    this.tracked = frequency === null ? 0 : Math.min(1, bins - 1);
  }
}
