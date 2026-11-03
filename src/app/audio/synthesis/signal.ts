import { createGaussian, createRandom } from './random';

/**
 * A synthetic signal: fills `out` with samples starting at absolute sample index `start`.
 * Must be deterministic for a given `(start, out.length, sampleRate)`.
 */
export type SignalGenerator = (out: Float32Array, start: number, sampleRate: number) => void;

/** A time span during which a tone is on (key down), in seconds. */
export interface KeyedSpan {
  readonly start: number;
  readonly end: number;
}

export interface ToneOptions {
  readonly frequency: number;
  readonly amplitude?: number;
  /** Phase-continuous tone shaped by key spans; omitted = continuous tone. */
  readonly spans?: readonly KeyedSpan[];
  /** Rise/fall time of the keying envelope in seconds (raised cosine). Default 5 ms. */
  readonly rampSeconds?: number;
  /** Seconds after which the pattern repeats (for looping demos). */
  readonly loopSeconds?: number;
}

/** Envelope (0..1) of a keyed signal at time t. Spans must be sorted and non-overlapping. */
export function keyedEnvelope(spans: readonly KeyedSpan[], t: number, ramp: number): number {
  // binary search the last span starting at or before t
  let lo = 0;
  let hi = spans.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((spans[mid]?.start ?? Infinity) <= t) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const span = spans[idx];
  if (!span) return 0;
  const { start, end } = span;
  if (t < start || t >= end + ramp) return 0;
  const shape = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  if (ramp <= 0) return t < end ? 1 : 0;
  const rise = shape((t - start) / ramp);
  const fall = t < end ? 1 : 1 - shape((t - end) / ramp);
  return Math.min(rise, fall);
}

export function tone(options: ToneOptions): SignalGenerator {
  const amplitude = options.amplitude ?? 0.5;
  const ramp = options.rampSeconds ?? 0.005;
  const { spans, loopSeconds, frequency } = options;
  return (out, start, sampleRate) => {
    const w = (2 * Math.PI * frequency) / sampleRate;
    for (let i = 0; i < out.length; i++) {
      const n = start + i;
      let t = n / sampleRate;
      if (loopSeconds) t %= loopSeconds;
      const env = spans ? keyedEnvelope(spans, t, ramp) : 1;
      out[i] = env === 0 ? 0 : amplitude * env * Math.sin(w * n);
    }
  };
}

/** Gaussian white noise with the given RMS. Deterministic for a seed when read sequentially. */
export function whiteNoise(rms: number, seed = 1): SignalGenerator {
  const gauss = createGaussian(createRandom(seed));
  return (out) => {
    for (let i = 0; i < out.length; i++) out[i] = rms * gauss();
  };
}

/** Sum of generators (scratch buffer is reused). */
export function mix(...generators: SignalGenerator[]): SignalGenerator {
  let scratch = new Float32Array(0);
  return (out, start, sampleRate) => {
    out.fill(0);
    if (scratch.length !== out.length) scratch = new Float32Array(out.length);
    for (const g of generators) {
      g(scratch, start, sampleRate);
      for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (scratch[i] ?? 0);
    }
  };
}

/** Renders `seconds` of a generator into one array (tests, export). */
export function render(
  generator: SignalGenerator,
  seconds: number,
  sampleRate: number,
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  generator(out, 0, sampleRate);
  return out;
}
