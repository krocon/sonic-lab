import { KeyedSpan, SignalGenerator, mix, tone } from '../../audio/synthesis/signal';

export const DTMF_ROWS = [697, 770, 852, 941] as const;
export const DTMF_COLUMNS = [1209, 1336, 1477, 1633] as const;
export const DTMF_KEYS = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
] as const;

export type DtmfKey = (typeof DTMF_KEYS)[number][number];

export function isDtmfKey(value: string): value is DtmfKey {
  return DTMF_KEYS.some((row) => (row as readonly string[]).includes(value));
}

/** Row and column frequency of a key. */
export function dtmfFrequencies(key: DtmfKey): { row: number; column: number } {
  for (let r = 0; r < 4; r++) {
    const c = (DTMF_KEYS[r] as readonly string[]).indexOf(key);
    if (c >= 0) return { row: DTMF_ROWS[r] as number, column: DTMF_COLUMNS[c] as number };
  }
  throw new RangeError(`not a DTMF key: ${key}`);
}

export interface DtmfSequenceOptions {
  readonly toneSeconds?: number;
  readonly pauseSeconds?: number;
  readonly leadIn?: number;
  /** Amplitude of the row (low-group) tone. */
  readonly amplitude?: number;
  /** Column level relative to row level in dB (positive = "reverse twist"). */
  readonly twistDb?: number;
  /** Relative frequency error applied to both tones, e.g. 0.015. */
  readonly frequencyError?: number;
}

/** Generator for a key sequence plus its total duration. Keys that are not DTMF are ignored. */
export function dtmfSequence(
  keys: string,
  o: DtmfSequenceOptions = {},
): { generator: SignalGenerator; duration: number } {
  const toneS = o.toneSeconds ?? 0.1;
  const pause = o.pauseSeconds ?? 0.1;
  const amp = o.amplitude ?? 0.3;
  const colAmp = amp * Math.pow(10, (o.twistDb ?? 0) / 20);
  const err = 1 + (o.frequencyError ?? 0);
  const spansByFreq = new Map<number, KeyedSpan[]>();
  let t = o.leadIn ?? 0.2;
  for (const k of keys) {
    if (!isDtmfKey(k)) continue;
    const { row, column } = dtmfFrequencies(k);
    for (const f of [row, column]) {
      const list = spansByFreq.get(f) ?? [];
      list.push({ start: t, end: t + toneS });
      spansByFreq.set(f, list);
    }
    t += toneS + pause;
  }
  const generators = [...spansByFreq].map(([f, spans]) =>
    tone({
      frequency: f * err,
      amplitude: (DTMF_ROWS as readonly number[]).includes(f) ? amp : colAmp,
      spans,
      rampSeconds: 0.002,
    }),
  );
  return {
    generator: generators.length ? mix(...generators) : (out) => out.fill(0),
    duration: t + 0.2,
  };
}
