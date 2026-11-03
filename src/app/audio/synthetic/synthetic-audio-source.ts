import { AudioFrame } from '../audio-frame';
import {
  AudioFrameListener,
  AudioInputDevice,
  AudioSource,
  AudioSourceState,
  AudioStateListener,
} from '../audio-source';
import { SignalGenerator } from '../synthesis/signal';

/** Clock abstraction so tests can drive the source without timers. */
export interface SyntheticClock {
  now(): number; // milliseconds
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const realClock: SyntheticClock = {
  now: () => performance.now(),
  setInterval: (cb, ms) => setInterval(cb, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export interface SyntheticSourceOptions {
  /** Creates a fresh generator per start, so every run is reproducible. */
  readonly generator: () => SignalGenerator;
  readonly sampleRate?: number;
  readonly blockSize?: number;
  readonly label?: string;
  /** `null` = no real-time pacing; frames are produced only via {@link SyntheticAudioSource.pump}. */
  readonly clock?: SyntheticClock | null;
}

/**
 * Deterministic {@link AudioSource} without Web Audio: for tests and the "demo signal" input.
 * Emits blocks in real time (paced by the clock) or on demand via `pump()`.
 */
export class SyntheticAudioSource implements AudioSource {
  readonly sampleRate: number;
  readonly blockSize: number;
  private currentState: AudioSourceState = { status: 'idle' };
  private readonly frameListeners = new Set<AudioFrameListener>();
  private readonly stateListeners = new Set<AudioStateListener>();
  private generator: SignalGenerator | null = null;
  private readonly buffer: Float32Array;
  private sampleIndex = 0;
  private timer: unknown = null;
  private startedAt = 0;
  private readonly clock: SyntheticClock | null;

  constructor(private readonly options: SyntheticSourceOptions) {
    this.sampleRate = options.sampleRate ?? 48000;
    this.blockSize = options.blockSize ?? 1024;
    this.buffer = new Float32Array(this.blockSize);
    this.clock = options.clock === undefined ? realClock : options.clock;
  }

  get state(): AudioSourceState {
    return this.currentState;
  }

  async listDevices(): Promise<AudioInputDevice[]> {
    return [{ id: 'synthetic', label: this.options.label ?? 'Synthetic signal' }];
  }

  async start(deviceId?: string): Promise<void> {
    if (this.currentState.status === 'running') return;
    this.generator = this.options.generator();
    this.sampleIndex = 0;
    this.setState({ status: 'running', deviceId, sampleRate: this.sampleRate });
    const clock = this.clock;
    if (clock) {
      this.startedAt = clock.now();
      const blockMs = (this.blockSize / this.sampleRate) * 1000;
      this.timer = clock.setInterval(() => this.catchUp(), Math.max(10, blockMs / 2));
    }
  }

  async stop(): Promise<void> {
    if (this.timer !== null) this.clock?.clearInterval(this.timer);
    this.timer = null;
    this.generator = null;
    if (this.currentState.status === 'running') this.setState({ status: 'stopped' });
  }

  /** Emits `blocks` blocks immediately (only while running). */
  pump(blocks = 1): void {
    const generator = this.generator;
    if (!generator) return;
    const frame: { samples: Float32Array; sampleRate: number; timestamp: number } = {
      samples: this.buffer,
      sampleRate: this.sampleRate,
      timestamp: 0,
    };
    for (let b = 0; b < blocks; b++) {
      generator(this.buffer, this.sampleIndex, this.sampleRate);
      frame.timestamp = this.sampleIndex / this.sampleRate;
      this.sampleIndex += this.blockSize;
      for (const l of this.frameListeners) l(frame as AudioFrame);
    }
  }

  subscribe(listener: AudioFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onStateChange(listener: AudioStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private catchUp(): void {
    if (!this.clock) return;
    const due = Math.floor(
      (((this.clock.now() - this.startedAt) / 1000) * this.sampleRate) / this.blockSize,
    );
    const emitted = this.sampleIndex / this.blockSize;
    // after a throttled background tab, skip ahead instead of flooding consumers
    const missing = due - emitted;
    if (missing > 50) this.sampleIndex = (due - 1) * this.blockSize;
    this.pump(Math.min(missing, 50));
  }

  private setState(state: AudioSourceState): void {
    this.currentState = state;
    for (const l of this.stateListeners) l(state);
  }
}
