import { createGaussian, createRandom } from '../../app/audio/synthesis/random';
import { keyedEnvelope } from '../../app/audio/synthesis/signal';
import { scheduleMorse, unitSeconds } from '../../app/decoders/morse/morse-timing';

/**
 * Realistic Morse test signals: noise at a given SNR, fading (QSB), clicks and bursts,
 * frequency drift, sloppy hand timing, weighting and Farnsworth spacing. Deterministic per seed.
 */
export interface ImpairedMorseOptions {
  readonly wpm: number;
  readonly farnsworthWpm?: number;
  readonly frequency?: number;
  readonly amplitude?: number;
  readonly sampleRate?: number;
  readonly seed?: number;
  /** SNR in dB, measured in a 500 Hz reference bandwidth (common for CW). Omit for no noise. */
  readonly snrDb?: number;
  readonly noise?: 'white' | 'pink';
  /** Slow fading: depth in dB and period in seconds. */
  readonly qsb?: { readonly depthDb: number; readonly periodSeconds: number };
  /** Frequency drift in Hz over the whole transmission (linear). */
  readonly driftHz?: number;
  /** Random variation of every element and gap length, ± fraction (e.g. 0.15). */
  readonly jitter?: number;
  /** Dah/dit ratio (standard 3). */
  readonly dahUnits?: number;
  /** Short broadband clicks per second (impulses). */
  readonly clicksPerSecond?: number;
  /** Short off-frequency tone bursts per second (≈ 4 ms). */
  readonly burstsPerSecond?: number;
  /** A burst of key-down at the decoder frequency lasting `ms` per second – worst case glitch. */
  readonly onFrequencyGlitchesPerSecond?: number;
  readonly leadIn?: number;
}

export interface ImpairedMorse {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly duration: number;
}

export function impairedMorse(text: string, o: ImpairedMorseOptions): ImpairedMorse {
  const sampleRate = o.sampleRate ?? 48000;
  const random = createRandom(o.seed ?? 1);
  const gauss = createGaussian(createRandom((o.seed ?? 1) * 7919));
  const amplitude = o.amplitude ?? 0.3;
  const f0 = o.frequency ?? 700;
  const unit = unitSeconds(o.wpm);

  // 1. timing with jitter: rebuild the schedule element by element
  const base = scheduleMorse(text, {
    wpm: o.wpm,
    farnsworthWpm: o.farnsworthWpm,
    dahUnits: o.dahUnits,
    leadIn: o.leadIn ?? 0.5,
  });
  const jitter = o.jitter ?? 0;
  const vary = (d: number) => d * (1 + jitter * (2 * random() - 1));
  const spans: { start: number; end: number }[] = [];
  let shift = 0;
  let prevEnd = base.elements[0]?.start ?? 0;
  for (const el of base.elements) {
    const gap = el.start - prevEnd;
    const start = prevEnd + shift + (spans.length ? vary(gap) : gap);
    const length = vary(el.end - el.start);
    spans.push({ start, end: start + length });
    prevEnd = el.end;
    shift = start + length - el.end;
  }
  const duration = (spans.at(-1)?.end ?? 0) + 7 * unit + 0.5;
  const n = Math.round(duration * sampleRate);
  const out = new Float32Array(n);

  // 2. keyed tone with drift and fading (phase-continuous)
  let phase = 0;
  const ramp = 0.004;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = f0 + (o.driftHz ?? 0) * (t / duration);
    phase += (2 * Math.PI * f) / sampleRate;
    const env = keyedEnvelope(spans, t, ramp);
    if (env === 0) continue;
    let gain = amplitude;
    if (o.qsb)
      gain *= Math.pow(
        10,
        (-o.qsb.depthDb / 20) * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / o.qsb.periodSeconds)),
      );
    out[i] = gain * env * Math.sin(phase);
  }

  // 3. noise at the requested SNR (500 Hz reference bandwidth around the tone)
  if (o.snrDb !== undefined) {
    const tonePower = (amplitude * amplitude) / 2;
    const sigma = Math.sqrt((tonePower / Math.pow(10, o.snrDb / 10)) * (sampleRate / 2 / 500));
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = gauss();
    let scale = sigma;
    if (o.noise === 'pink') {
      // Paul Kellet's pink filter; then scale so the power density *at the tone* equals that of
      // white noise with `sigma` – the SNR stays comparable, the noise elsewhere is louder.
      const white = noise.slice();
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = noise[i] ?? 0;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        noise[i] = b0 + b1 + b2 + w * 0.1848;
      }
      scale =
        sigma * Math.sqrt(bandPower(white, f0, sampleRate) / bandPower(noise, f0, sampleRate));
    }
    for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + scale * (noise[i] ?? 0);
  }

  // 4. impulsive interference
  const addEvents = (perSecond: number | undefined, render: (at: number) => void) => {
    if (!perSecond) return;
    const count = Math.round(perSecond * duration);
    for (let k = 0; k < count; k++) render(Math.floor(random() * n));
  };
  addEvents(o.clicksPerSecond, (at) => {
    const sign = random() < 0.5 ? -1 : 1;
    for (let i = 0; i < 24 && at + i < n; i++)
      out[at + i] = (out[at + i] ?? 0) + sign * 0.8 * Math.exp(-i / 4);
  });
  addEvents(o.burstsPerSecond, (at) => {
    const f = 300 + random() * 1200;
    const len = Math.round(0.004 * sampleRate);
    for (let i = 0; i < len && at + i < n; i++)
      out[at + i] = (out[at + i] ?? 0) + amplitude * Math.sin((2 * Math.PI * f * i) / sampleRate);
  });
  addEvents(o.onFrequencyGlitchesPerSecond, (at) => {
    const len = Math.round(0.005 * sampleRate);
    for (let i = 0; i < len && at + i < n; i++)
      out[at + i] =
        (out[at + i] ?? 0) + amplitude * Math.sin((2 * Math.PI * f0 * (at + i)) / sampleRate);
  });

  return { samples: out, sampleRate, duration };
}

/** Mean Goertzel power at `f` over 4096-sample blocks (relative measure). */
function bandPower(x: Float32Array, f: number, sampleRate: number): number {
  const block = 4096;
  const coeff = 2 * Math.cos((2 * Math.PI * f) / sampleRate);
  let total = 0;
  let blocks = 0;
  for (let start = 0; start + block <= x.length; start += block) {
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < block; i++) {
      const s0 = (x[start + i] ?? 0) + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    total += s1 * s1 + s2 * s2 - coeff * s1 * s2;
    blocks++;
  }
  return blocks ? total / blocks : 1;
}
