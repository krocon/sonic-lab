/** A key-down interval relative to the start of playback, seconds. */
export interface KeyedInterval {
  readonly start: number;
  readonly end: number;
}

export interface KeyedToneOptions {
  readonly frequency: number;
  /** Linear gain 0..1 (capped at 0.8 to protect ears and speakers). */
  readonly volume: number;
  /** Rise/fall time, s. */
  readonly rampSeconds?: number;
}

export const MAX_VOLUME = 0.8;
const START_DELAY = 0.06;

/**
 * Plays keyed tones with sample-accurate timing: every edge is scheduled on the AudioContext clock
 * (no setTimeout), each with a short linear ramp so there are no key clicks. Framework-free.
 */
export class KeyedTonePlayer {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private startTime = 0;
  private finish: (() => void) | null = null;

  constructor(private readonly createContext: () => AudioContext) {}

  get playing(): boolean {
    return this.context !== null;
  }

  /** Seconds since the first element was scheduled, or null when idle. */
  get position(): number | null {
    return this.context ? Math.max(0, this.context.currentTime - this.startTime) : null;
  }

  /** Starts playback (call from a user gesture – autoplay policy). Resolves when finished or stopped. */
  async play(
    intervals: readonly KeyedInterval[],
    duration: number,
    options: KeyedToneOptions,
  ): Promise<void> {
    await this.stop();
    const ctx = this.createContext();
    this.context = ctx;
    await ctx.resume();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = options.frequency;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    this.oscillator = osc;
    this.gain = gain;

    const volume = Math.min(MAX_VOLUME, Math.max(0, options.volume));
    const ramp = options.rampSeconds ?? 0.005;
    const t0 = ctx.currentTime + START_DELAY;
    this.startTime = t0;
    const g = gain.gain;
    g.setValueAtTime(0, t0);
    for (const { start, end } of intervals) {
      const s = t0 + start;
      const e = t0 + Math.max(end, start + ramp);
      g.setValueAtTime(0, s);
      g.linearRampToValueAtTime(volume, s + ramp);
      g.setValueAtTime(volume, e);
      g.linearRampToValueAtTime(0, e + ramp);
    }
    const done = new Promise<void>((resolve) => (this.finish = resolve));
    osc.onended = () => void this.stop();
    osc.start(t0);
    osc.stop(t0 + duration + ramp);
    return done;
  }

  /** Stops immediately with a short fade (no click) and releases the audio device. */
  async stop(): Promise<void> {
    const ctx = this.context;
    if (!ctx) return;
    this.context = null;
    const now = ctx.currentTime;
    try {
      this.gain?.gain.cancelScheduledValues(now);
      this.gain?.gain.setTargetAtTime(0, now, 0.005);
      if (this.oscillator) this.oscillator.onended = null;
      this.oscillator?.stop(now + 0.03);
    } catch {
      // already stopped
    }
    this.oscillator = null;
    this.gain = null;
    const finish = this.finish;
    this.finish = null;
    try {
      await ctx.close();
    } catch {
      // closing twice is fine
    }
    finish?.();
  }
}
