import { AudioFrame } from '../../audio/audio-frame';
import { DecoderEvent, SignalDecoder } from '../signal-decoder';
import {
  DEFAULT_KEYING_CONFIG,
  KeyingDetector,
  KeyingDetectorConfig,
  KeyingSegment,
} from './keying-detector';
import {
  DEFAULT_TIMING_CONFIG,
  TimingDecoder,
  TimingDecoderConfig,
  TimingEvent,
} from './timing-decoder';
import {
  DEFAULT_TONE_DETECTOR_CONFIG,
  ToneDetector,
  ToneDetectorConfig,
  ToneHop,
} from './tone-detector';

export type MorseDecoderConfig = ToneDetectorConfig & KeyingDetectorConfig & TimingDecoderConfig;

export const DEFAULT_MORSE_CONFIG: MorseDecoderConfig = {
  ...DEFAULT_TONE_DETECTOR_CONFIG,
  ...DEFAULT_KEYING_CONFIG,
  ...DEFAULT_TIMING_CONFIG,
};

export type MorseEvent =
  | TimingEvent
  | (DecoderEvent & {
      readonly type: 'segment';
      readonly state: 'mark' | 'space';
      readonly start: number;
      readonly duration: number;
    })
  | (DecoderEvent & {
      readonly type: 'tone';
      /** Tracked frequency, Hz. */
      readonly frequency: number;
      readonly amplitude: number;
      readonly noise: number;
      readonly threshold: number;
      readonly keyDown: boolean;
    });

const TONE_REPORT_INTERVAL = 0.05; // s

/**
 * Morse decoder: ToneDetector (Goertzel) → KeyingDetector (adaptive threshold, hysteresis,
 * glitch filter) → TimingDecoder (adaptive unit, dit/dah, gaps, alphabet).
 * Framework-free; the time base is the sample count, not wall-clock time.
 */
export class MorseDecoder implements SignalDecoder<MorseDecoderConfig, MorseEvent> {
  readonly id = 'morse';
  readonly name = 'Morse decoder';
  private readonly tone = new ToneDetector();
  private readonly keying = new KeyingDetector();
  private readonly timing = new TimingDecoder();
  private config = DEFAULT_MORSE_CONFIG;
  private out: MorseEvent[] = [];
  private timingOut: TimingEvent[] = [];
  private lastToneReport = -Infinity;

  constructor(config: Partial<MorseDecoderConfig> = {}) {
    this.configure(config);
  }

  get configuration(): MorseDecoderConfig {
    return this.config;
  }

  configure(config: Partial<MorseDecoderConfig>): void {
    const toneChanged =
      config.frequency !== undefined ||
      config.minFrequency !== undefined ||
      config.maxFrequency !== undefined ||
      config.hopMs !== undefined;
    this.config = { ...this.config, ...config };
    if (toneChanged) this.tone.configure(this.config);
    this.keying.configure(this.config);
    this.timing.configure(this.config);
  }

  /** Provisional code of the character being keyed. */
  get pendingCode(): string {
    return this.timing.pendingCode;
  }

  get wpm(): number | null {
    return this.timing.isConfident ? 1.2 / this.timing.unitSeconds : null;
  }

  process(frame: AudioFrame): MorseEvent[] {
    this.out = [];
    this.tone.process(frame.samples, frame.sampleRate, this.onHop);
    return this.out;
  }

  /** Decodes a complete recording (tests, files). Appends trailing silence so the last word is flushed. */
  decodeAll(samples: Float32Array, sampleRate: number, blockSize = 1024): MorseEvent[] {
    const events: MorseEvent[] = [];
    const tail = new Float32Array(Math.round(sampleRate * (this.config.flushAfter + 0.5)));
    const all = new Float32Array(samples.length + tail.length);
    all.set(samples);
    for (let i = 0; i < all.length; i += blockSize) {
      events.push(
        ...this.process({
          samples: all.subarray(i, i + blockSize),
          sampleRate,
          timestamp: i / sampleRate,
        }),
      );
    }
    return events;
  }

  reset(): void {
    this.tone.reset();
    this.keying.reset();
    this.timing.reset();
    this.lastToneReport = -Infinity;
  }

  private readonly onHop = (hop: ToneHop): void => {
    const hopSeconds = this.tone.hopSeconds;
    this.keying.push(hop.amplitude, hop.time, hopSeconds, this.onSegment);
    if (!this.keying.isKeyDown) {
      this.timingOut.length = 0;
      this.timing.idle(hop.time, this.keying.currentDuration, this.timingOut);
      for (const e of this.timingOut) this.out.push(e);
    }
    if (hop.time - this.lastToneReport >= TONE_REPORT_INTERVAL) {
      this.lastToneReport = hop.time;
      const levels = this.keying.levels;
      this.out.push({
        type: 'tone',
        timestamp: hop.time,
        frequency: hop.frequency,
        amplitude: hop.amplitude,
        noise: levels.noise,
        threshold: levels.threshold,
        keyDown: this.keying.isKeyDown,
      });
    }
  };

  private readonly onSegment = (segment: KeyingSegment): void => {
    this.out.push({ type: 'segment', timestamp: segment.start, ...segment });
    this.timingOut.length = 0;
    this.timing.push(segment, this.timingOut);
    for (const e of this.timingOut) this.out.push(e);
  };
}

/** Joins decoder events into text (word gaps become spaces). */
export function eventsToText(events: readonly MorseEvent[]): string {
  let text = '';
  for (const e of events) {
    if (e.type === 'character') text += e.text;
    else if (e.type === 'word-gap' && text && !text.endsWith(' ')) text += ' ';
  }
  return text.trim();
}
