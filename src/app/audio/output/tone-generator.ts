import { createGaussian, createRandom } from '../synthesis/random';

export type GeneratorWaveform =
  | 'sine'
  | 'square'
  | 'triangle'
  | 'sawtooth'
  | 'white-noise'
  | 'pink-noise'
  | 'sweep-linear'
  | 'sweep-log'
  | 'two-tone'
  | 'dtmf';

export interface GeneratorSettings {
  readonly waveform: GeneratorWaveform;
  /** Hz – tone frequency, first tone of two-tone, sweep start. */
  readonly frequency: number;
  /** Hz – second tone of two-tone, sweep end. */
  readonly frequency2: number;
  readonly sweepSeconds: number;
  /** Peak level in dBFS (capped at {@link MAX_LEVEL_DB}). */
  readonly levelDb: number;
  /** −1 (left) … +1 (right). */
  readonly balance: number;
  /** Row/column frequencies for the DTMF waveform. */
  readonly dtmf: { readonly row: number; readonly column: number };
}

export const MAX_LEVEL_DB = -3;
export const MIN_LEVEL_DB = -60;
const FADE = 0.02;
const NOISE_SECONDS = 2;

export function levelToGain(db: number): number {
  return Math.pow(10, Math.max(MIN_LEVEL_DB, Math.min(MAX_LEVEL_DB, db)) / 20);
}

/** Two seconds of seeded noise; pink via Paul Kellet's filter, normalised to the same peak. */
export function noiseBuffer(kind: 'white' | 'pink', length: number, seed = 1): Float32Array {
  const g = createGaussian(createRandom(seed));
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const w = g();
    let v = w;
    if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      v = b0 + b1 + b2 + w * 0.1848;
    }
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < length; i++) out[i] = (out[i] ?? 0) / (peak || 1);
  return out;
}

/**
 * Test-signal generator on the Web Audio graph: sources → gain (level, 20 ms fades) → stereo
 * panner → output. Framework-free; the context factory is injected so tests can use a fake.
 */
export class ToneGenerator {
  private context: AudioContext | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private gain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private running: GeneratorSettings | null = null;
  private ended: (() => void) | null = null;

  constructor(private readonly createContext: () => AudioContext) {}

  get playing(): boolean {
    return this.context !== null;
  }

  /** Starts (or restarts) the signal. Call from a user gesture. Resolves when playback has started. */
  async start(settings: GeneratorSettings, onEnded?: () => void): Promise<void> {
    // a restart is not an end: the previous callback must not report "stopped"
    this.ended = null;
    await this.stop();
    const ctx = this.createContext();
    this.context = ctx;
    this.ended = onEnded ?? null;
    await ctx.resume();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(levelToGain(settings.levelDb), now + FADE);
    let output: AudioNode = gain;
    if (typeof ctx.createStereoPanner === 'function') {
      this.panner = ctx.createStereoPanner();
      this.panner.pan.value = Math.max(-1, Math.min(1, settings.balance));
      gain.connect(this.panner);
      output = this.panner;
    }
    output.connect(ctx.destination);
    this.gain = gain;
    this.sources = this.createSources(ctx, settings, gain, now);
    this.running = settings;
  }

  /** Applies level and balance changes smoothly; other changes need a restart. */
  update(settings: GeneratorSettings): boolean {
    const ctx = this.context;
    const prev = this.running;
    if (!ctx || !prev) return false;
    const sameSignal =
      prev.waveform === settings.waveform &&
      prev.dtmf.row === settings.dtmf.row &&
      prev.dtmf.column === settings.dtmf.column &&
      prev.frequency2 === settings.frequency2 &&
      prev.sweepSeconds === settings.sweepSeconds &&
      (!settings.waveform.startsWith('sweep') || prev.frequency === settings.frequency);
    if (!sameSignal) return false;
    const now = ctx.currentTime;
    this.gain?.gain.setTargetAtTime(levelToGain(settings.levelDb), now, 0.02);
    this.panner?.pan.setTargetAtTime(Math.max(-1, Math.min(1, settings.balance)), now, 0.02);
    if (prev.frequency !== settings.frequency && !settings.waveform.includes('noise')) {
      const osc = this.sources[0] as OscillatorNode | undefined;
      osc?.frequency?.setTargetAtTime(settings.frequency, now, 0.01);
    }
    this.running = settings;
    return true;
  }

  async stop(): Promise<void> {
    const ctx = this.context;
    if (!ctx) return;
    this.context = null;
    this.running = null;
    const now = ctx.currentTime;
    try {
      this.gain?.gain.cancelScheduledValues(now);
      this.gain?.gain.setTargetAtTime(0, now, FADE / 3);
      for (const s of this.sources) {
        s.onended = null;
        s.stop(now + FADE * 2);
      }
    } catch {
      // already stopped
    }
    this.sources = [];
    this.gain = null;
    this.panner = null;
    const ended = this.ended;
    this.ended = null;
    // let the fade finish before closing the device
    await new Promise((r) => setTimeout(r, FADE * 2000));
    try {
      await ctx.close();
    } catch {
      // closed already
    }
    ended?.();
  }

  private createSources(
    ctx: AudioContext,
    s: GeneratorSettings,
    out: AudioNode,
    now: number,
  ): AudioScheduledSourceNode[] {
    const osc = (type: OscillatorType, f: number, amp = 1) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      if (amp === 1) {
        o.connect(out);
      } else {
        const g = ctx.createGain();
        g.gain.value = amp;
        o.connect(g).connect(out);
      }
      return o;
    };
    let sources: AudioScheduledSourceNode[];
    switch (s.waveform) {
      case 'sine':
      case 'square':
      case 'triangle':
      case 'sawtooth':
        sources = [osc(s.waveform, s.frequency)];
        break;
      case 'two-tone':
        sources = [osc('sine', s.frequency, 0.5), osc('sine', s.frequency2, 0.5)];
        break;
      case 'dtmf':
        sources = [osc('sine', s.dtmf.row, 0.5), osc('sine', s.dtmf.column, 0.5)];
        break;
      case 'sweep-linear':
      case 'sweep-log': {
        const o = osc('sine', s.frequency);
        const end = now + Math.max(0.1, s.sweepSeconds);
        o.frequency.setValueAtTime(s.frequency, now);
        if (s.waveform === 'sweep-log')
          o.frequency.exponentialRampToValueAtTime(Math.max(1, s.frequency2), end);
        else o.frequency.linearRampToValueAtTime(s.frequency2, end);
        o.onended = () => void this.stop();
        o.start(now);
        o.stop(end);
        return [o];
      }
      case 'white-noise':
      case 'pink-noise': {
        const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        buffer.copyToChannel(
          noiseBuffer(
            s.waveform === 'pink-noise' ? 'pink' : 'white',
            length,
          ) as Float32Array<ArrayBuffer>,
          0,
        );
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(out);
        sources = [src];
        break;
      }
    }
    for (const src of sources) src.start(now);
    return sources;
  }
}
