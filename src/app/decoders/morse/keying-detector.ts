/**
 * Stage 3 of the Morse chain: turns per-hop tone amplitudes into key-down/key-up segments.
 *
 * - The noise floor is the running mean of the settled key-up envelope; the signal level is
 *   a peak follower (fast attack, slow release). A tone counts only if the signal level is at
 *   least `minSnr` × the noise mean – the Rayleigh-distributed envelope of pure noise practically
 *   never gets there, so noise alone produces no marks. The switching thresholds sit between noise
 *   and signal with hysteresis – independent of absolute volume.
 * - Local edges, for element gaps that do not fall back to the noise floor (speaker ringing,
 *   room reverberation): a mark also ends when the level drops 6 dB below its running peak, and
 *   in the tail after such a key-up only a fresh 8 dB rise starts the next mark.
 * - A state change must persist for `minElementMs` before it is accepted (glitch filter); the
 *   segment boundary is placed where the change started, so durations stay accurate.
 */
export interface KeyingDetectorConfig {
  /** Fraction between noise floor and signal level that switches to key-down. */
  readonly onRatio: number;
  /** Fraction that switches back to key-up (< onRatio = hysteresis). */
  readonly offRatio: number;
  /** Minimum ratio signal level / mean noise envelope (linear amplitude) before anything counts as a tone. */
  readonly minSnr: number;
  /** Absolute minimum tone amplitude (≈ −60 dBFS) to ignore digital silence and hum. */
  readonly minAmplitude: number;
  /** Shorter marks/spaces are treated as glitches. */
  readonly minElementMs: number;
}

export const DEFAULT_KEYING_CONFIG: KeyingDetectorConfig = {
  onRatio: 0.5,
  offRatio: 0.3,
  minSnr: 2.5,
  minAmplitude: 0.001,
  minElementMs: 10,
};

/** Key-up when the level falls this far below the running mark peak (−6 dB). */
const DROP = Math.pow(10, -6 / 20);
/** Key-down on a rise of this much above the gap minimum (+8 dB) … */
const RISE = Math.pow(10, 8 / 20);
/** … if the level is within 10 dB of recent marks. */
const NEAR = Math.pow(10, -10 / 20);
/**
 * … or on a fast rise of 4 dB within about one settling time (smoothing + analysis window), above
 * the noise-relative on-threshold: the direct sound of the next element arriving on a tail that has
 * not decayed yet. The room's build-up after it is slow, and the valley creeps up meanwhile – the
 * 8 dB rise alone came too late (dahs read as dits) or not at all (lost elements).
 */
const FAST_RISE = Math.pow(10, 4 / 20);
/** Earliest fast-rise key-down after a key-up, in units. */
const FAST_RISE_AFTER_UNITS = 0.5;
/** Hops of level history kept for the fast-rise test. */
const RISE_HISTORY = 24;
/** Time constant of the mark peak's decay, in units. */
const PEAK_UNITS = 2;
const VALLEY_SECONDS = 0.5;
const RECENT_SECONDS = 2;

export interface KeyingSegment {
  readonly state: 'mark' | 'space';
  /** Start time, seconds. */
  readonly start: number;
  readonly duration: number;
}

export interface KeyingLevels {
  readonly noise: number;
  readonly signal: number;
  readonly threshold: number;
}

export class KeyingDetector {
  private config = DEFAULT_KEYING_CONFIG;
  private noise = 0;
  private signal = 0;
  private initialised = false;
  private keyDown = false;
  /** Start of the current (accepted) state. */
  private stateStart = 0;
  /** Time the raw input first disagreed with the accepted state, or -1. */
  private pendingSince = -1;
  private lastTime = 0;
  /** Time after a state change during which the envelope is still settling (smoothing, window). */
  private edgeGuard = 0;

  /** Running peak of the current mark (follows slow decay, not sharp drops). */
  private markPeak = 0;
  /** Lowest level since the last key-up (rises slowly). */
  private valley = 0;
  /** Key is up, but the level has not yet fallen below the noise-relative off-threshold. */
  private tail = false;
  /** Level of recent marks; decays towards the noise floor while nothing is keyed. */
  private recentMark = 0;
  /** Current Morse unit estimate, s – sets how fast the mark peak may follow a decaying tone. */
  private unit = 0.06;
  /** Recent levels (ring buffer) for the fast-rise test. */
  private readonly history = new Float64Array(RISE_HISTORY);
  private historyIndex = 0;
  private historyFilled = 0;
  private hopSeconds = 0.006;

  /** Multiplies `minSnr` for starting a mark; the decoder raises it until a transmission is recognised. */
  private startGate = 1;
  /** No key-down this long after a key-up (s). */
  private refractory = 0;

  setStartGate(factor: number): void {
    this.startGate = factor;
  }

  /** Current unit estimate (s); the local edge detection scales its time constants with it. */
  setUnit(seconds: number): void {
    this.unit = seconds;
  }

  /**
   * No key-down for this long after a key-up (s). A reverberant tail swells again right after the
   * direct sound stops (early reflections) – the next element cannot follow that early.
   */
  setRefractory(seconds: number): void {
    this.refractory = seconds;
  }

  /** Sets how long after a key-up the envelope is still decaying (excluded from the noise floor). */
  setEdgeGuard(seconds: number): void {
    this.edgeGuard = seconds;
  }

  configure(config: Partial<KeyingDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * The measured tone changed (tracker switched to another frequency): whatever was keyed so far
   * belonged to a different signal. A running mark is dropped, not reported; levels are kept.
   */
  restart(time: number): void {
    this.keyDown = false;
    this.stateStart = time;
    this.pendingSince = -1;
    this.markPeak = this.valley = 0;
    this.tail = false;
  }

  reset(): void {
    this.noise = this.signal = 0;
    this.initialised = false;
    this.keyDown = false;
    this.stateStart = 0;
    this.pendingSince = -1;
    this.lastTime = 0;
    this.markPeak = this.valley = this.recentMark = 0;
    this.tail = false;
    this.historyIndex = this.historyFilled = 0;
  }

  get isKeyDown(): boolean {
    return this.keyDown;
  }

  /** Duration of the current state up to the last hop, seconds. */
  get currentDuration(): number {
    return this.lastTime - this.stateStart;
  }

  get levels(): KeyingLevels {
    return {
      noise: this.noise,
      signal: this.signal,
      threshold: this.onThreshold(),
    };
  }

  /**
   * Processes one hop. `time` is the end of the hop, `hopSeconds` its length.
   * Calls `onSegment` when a mark or space has ended.
   */
  push(
    amplitude: number,
    time: number,
    hopSeconds: number,
    onSegment: (s: KeyingSegment) => void,
  ): void {
    this.track(amplitude, hopSeconds);
    this.lastTime = time;
    this.hopSeconds = hopSeconds;
    const hopStart = time - hopSeconds;
    // The SNR gate decides whether a mark may *start*; an ongoing mark ends only at the off-threshold.
    const usable =
      this.keyDown ||
      (this.signal >= this.config.minAmplitude &&
        this.signal >= this.startGate * this.config.minSnr * this.noise);
    const raw = usable && (this.keyDown ? this.holdsMark(amplitude) : this.startsMark(amplitude));
    this.trackLocal(amplitude, hopSeconds);
    this.remember(amplitude);

    if (raw === this.keyDown) {
      this.pendingSince = -1;
      return;
    }
    if (this.pendingSince < 0) this.pendingSince = hopStart;
    if (time - this.pendingSince + 1e-9 < this.config.minElementMs / 1000) return;

    const boundary = this.pendingSince;
    if (boundary > this.stateStart) {
      onSegment({
        state: this.keyDown ? 'mark' : 'space',
        start: this.stateStart,
        duration: boundary - this.stateStart,
      });
    }
    this.keyDown = raw;
    this.tail = !raw && amplitude >= this.threshold(this.config.offRatio);
    this.stateStart = boundary;
    this.pendingSince = -1;
  }

  /**
   * Key stays down while the level is above the noise-relative off-threshold *and* has not
   * dropped sharply below the running peak of this mark. The second condition finds element gaps
   * that do not fall back to the noise floor (reverberation, ringing speakers, AGC).
   */
  private holdsMark(a: number): boolean {
    return a >= this.threshold(this.config.offRatio) && a >= this.markPeak * DROP;
  }

  /**
   * Key goes down above the noise-relative on-threshold, but not within the refractory time after
   * a key-up. Right after a mark that ended by the relative drop, the decaying tail
   * (reverberation) can still exceed that threshold or even swell again – there only a rise out
   * of the gap minimum, close to the level of recent marks, starts a new one: 8 dB above the
   * valley, or 4 dB within one settling time.
   */
  private startsMark(a: number): boolean {
    if (this.lastTime - this.stateStart < this.refractory) return false;
    if (this.tail) {
      if (a < this.recentMark * NEAR) return false;
      if (a >= this.valley * RISE) return true;
      // the fast rise only from half a unit on (also before the decoder sets a refractory time):
      // earlier, a 4 dB rise is the tail swelling, not the next element
      return (
        this.lastTime - this.stateStart >= FAST_RISE_AFTER_UNITS * this.unit &&
        a >= this.onThreshold() &&
        a >= this.recentMinimum() * FAST_RISE
      );
    }
    return a >= this.onThreshold();
  }

  /** Lowest level of the last settling time (smoothing + analysis window), at least two hops. */
  private recentMinimum(): number {
    const hops = Math.min(
      this.historyFilled,
      Math.max(2, Math.round(this.edgeGuard / this.hopSeconds)),
      RISE_HISTORY,
    );
    let min = Infinity;
    for (let i = 1; i <= hops; i++) {
      const v = this.history[(this.historyIndex - i + RISE_HISTORY) % RISE_HISTORY] ?? 0;
      if (v < min) min = v;
    }
    return min;
  }

  private remember(a: number): void {
    this.history[this.historyIndex] = a;
    this.historyIndex = (this.historyIndex + 1) % RISE_HISTORY;
    if (this.historyFilled < RISE_HISTORY) this.historyFilled++;
  }

  private trackLocal(a: number, dt: number): void {
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    if (this.keyDown) {
      // fast attack; follows a slowly decaying tone (QSB, ringing) but not a sharp drop
      this.markPeak =
        a > this.markPeak ? a : this.markPeak + (a - this.markPeak) * k(PEAK_UNITS * this.unit);
      this.recentMark = Math.max(this.recentMark, this.markPeak);
      this.valley = a;
    } else {
      this.valley = a < this.valley ? a : this.valley + (a - this.valley) * k(VALLEY_SECONDS);
      if (a < this.threshold(this.config.offRatio)) this.tail = false;
      this.markPeak = a;
      // without marks the reference fades towards the noise floor (a weaker station may follow)
      this.recentMark += (this.noise - this.recentMark) * k(RECENT_SECONDS);
    }
  }

  private threshold(ratio: number): number {
    return this.noise + ratio * (this.signal - this.noise);
  }

  /** Key-down threshold: between noise and signal, but never closer than 0.8·minSnr to the noise mean. */
  private onThreshold(): number {
    return Math.max(
      this.threshold(this.config.onRatio),
      0.8 * this.startGate * this.config.minSnr * this.noise,
    );
  }

  private track(a: number, dt: number): void {
    if (!this.initialised) {
      this.noise = a;
      this.signal = a;
      this.initialised = true;
      return;
    }
    // time constants in seconds, converted to per-hop smoothing factors
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    const settled = this.lastTime - this.stateStart > Math.max(2.5 * dt, this.edgeGuard);

    // Noise: mean envelope of settled key-up hops below the key-up threshold – not right after a
    // mark (the analysis window and the smoothing smear the falling edge), and without hops above
    // the threshold (missed parts of a weak tone are not noise). During key-down the floor
    // only falls; after 2 s of continuous key-down (a carrier, not Morse) it rises slowly.
    const quiet = !this.keyDown && settled && a < this.threshold(this.config.offRatio);
    const carrier = this.keyDown && this.lastTime - this.stateStart > 2;
    this.noise += (a - this.noise) * (quiet || a < this.noise ? k(0.3) : carrier ? k(3) : 0);

    // Signal: fast attack; during a settled mark it also follows the tone down (fading/QSB), while
    // the key is up it releases slowly.
    const release = this.keyDown && settled ? k(0.15) : k(1.5);
    this.signal += (a - this.signal) * (a > this.signal ? k(0.01) : release);
    if (this.signal < this.noise) this.signal = this.noise;
  }
}
