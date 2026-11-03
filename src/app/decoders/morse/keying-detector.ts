/**
 * Stage 3 of the Morse chain: turns per-hop tone amplitudes into key-down/key-up segments.
 *
 * - The noise floor is the running mean of the envelope while the key is up; the signal level is
 *   a peak follower (fast attack, slow release). A tone counts only if the signal level is at
 *   least `minSnr` × the noise mean – the Rayleigh-distributed envelope of pure noise practically
 *   never gets there, so noise alone produces no marks. The switching thresholds sit between noise
 *   and signal with hysteresis – independent of absolute volume.
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
  minSnr: 4,
  minAmplitude: 0.001,
  minElementMs: 10,
};

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

  configure(config: Partial<KeyingDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.noise = this.signal = 0;
    this.initialised = false;
    this.keyDown = false;
    this.stateStart = 0;
    this.pendingSince = -1;
    this.lastTime = 0;
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
      threshold: this.threshold(this.config.onRatio),
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
    const hopStart = time - hopSeconds;
    const usable =
      this.signal >= this.config.minAmplitude && this.signal >= this.config.minSnr * this.noise;
    const raw =
      usable &&
      amplitude >= this.threshold(this.keyDown ? this.config.offRatio : this.config.onRatio);

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
    this.stateStart = boundary;
    this.pendingSince = -1;
  }

  private threshold(ratio: number): number {
    return this.noise + ratio * (this.signal - this.noise);
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
    // Mean envelope of clear key-up hops: below the off-threshold and not right after a mark
    // (the analysis window smears the falling edge over ~2 hops). Otherwise only creep, which
    // still escapes a stuck carrier after ~10 s.
    const quiet =
      !this.keyDown &&
      this.lastTime - this.stateStart > 2.5 * dt &&
      a < this.threshold(this.config.offRatio);
    this.noise += (a - this.noise) * (quiet ? k(0.3) : a < this.noise ? k(0.3) : k(10));
    this.signal += (a - this.signal) * (a > this.signal ? k(0.01) : k(2));
    if (this.signal < this.noise) this.signal = this.noise;
  }
}
