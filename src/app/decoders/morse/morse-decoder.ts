import { AudioFrame } from '../../audio/audio-frame';
import { DecoderEvent, SignalDecoder } from '../signal-decoder';
import { EnvelopeSmoother, MAX_SMOOTHING } from './envelope-smoother';
import {
  DEFAULT_KEYING_CONFIG,
  KeyingDetector,
  KeyingDetectorConfig,
  KeyingSegment,
} from './keying-detector';
import { RoomEqualizer } from './room-equalizer';
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

export interface RoomConfig {
  /**
   * Experimental: learn the room's complex response and detect the keying with it
   * (`RoomEqualizer`) – for Morse from a loudspeaker in a reverberant room. Off by default.
   */
  readonly roomEqualizer: boolean;
}

export type MorseDecoderConfig = ToneDetectorConfig &
  KeyingDetectorConfig &
  TimingDecoderConfig &
  RoomConfig;

export const DEFAULT_MORSE_CONFIG: MorseDecoderConfig = {
  ...DEFAULT_TONE_DETECTOR_CONFIG,
  ...DEFAULT_KEYING_CONFIG,
  ...DEFAULT_TIMING_CONFIG,
  roomEqualizer: false,
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
/** Envelope smoothing window in Morse units. */
const SMOOTHING_UNITS = 0.4;
/** Factor on `minSnr` for starting marks before the timing estimate is confident. */
const UNCONFIDENT_START_GATE = 1.2;
/**
 * No key-down within half a unit after a key-up, once the speed is known: the reverberant tail
 * swells again right after the direct sound stops. Not before – a prior far below the real speed
 * would swallow element gaps of fast CW.
 */
const REFRACTORY_UNITS = 0.5;
/** A level mark after a gap this long (prior units) is a character onset for the room equalizer. */
const ONSET_GAP_UNITS = 2;
/** The room equalizer takes over in a gap at least this long (units) … */
const HANDOVER_GAP_UNITS = 2;
/**
 * … and only in a room that shapes the tone noticeably (`RoomEqualizer.evidence`): without one its
 * short decisions are only noisier than the smoothed level.
 */
const HANDOVER_EVIDENCE = 0.15;
/** More than this is not a room but a broken model. */
const MAX_EVIDENCE = 1.2;
/**
 * Watchdogs while the equalizer decodes: this many level marks without a single equalizer
 * transition, or a key held down this many units (no Morse element is that long), mean its model
 * broke – back to the level detector, and learn the room again.
 */
const SILENT_LEVEL_MARKS = 4;
const MAX_MARK_UNITS = 6;
/** Back to the level detector (in a gap) when the room turns out to shape the tone less than this. */
const HANDBACK_EVIDENCE = 0.1;

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
  private readonly smoother = new EnvelopeSmoother();
  private readonly room = new RoomEqualizer();
  /** Segments come from the room equalizer (it took over in a character gap). */
  private roomActive = false;
  /** Level marks since the equalizer last reported a segment (watchdog). */
  private levelMarksUnheard = 0;
  private config = DEFAULT_MORSE_CONFIG;
  private out: MorseEvent[] = [];
  private timingOut: TimingEvent[] = [];
  private lastToneReport = -Infinity;
  private lastFrequency = 0;

  constructor(config: Partial<MorseDecoderConfig> = {}) {
    this.configure(config);
  }

  get configuration(): MorseDecoderConfig {
    return this.config;
  }

  configure(config: Partial<MorseDecoderConfig>): void {
    // switching the room mode starts it afresh; other settings keep a learned room
    const roomChanged =
      config.roomEqualizer !== undefined && config.roomEqualizer !== this.config.roomEqualizer;
    const toneChanged =
      config.frequency !== undefined ||
      config.minFrequency !== undefined ||
      config.maxFrequency !== undefined ||
      config.hopMs !== undefined;
    this.config = { ...this.config, ...config };
    if (toneChanged) this.tone.configure(this.config);
    if (roomChanged) this.resetRoom();
    this.keying.configure(this.config);
    this.timing.configure(this.config);
  }

  /** Provisional code of the character being keyed. */
  get pendingCode(): string {
    return this.timing.pendingCode;
  }

  /** The room equalizer detects the keying (room mode on, room learned, echo present). */
  get roomInUse(): boolean {
    return this.roomActive;
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
    this.smoother.reset();
    this.resetRoom();
    this.lastToneReport = -Infinity;
    this.lastFrequency = 0;
  }

  private readonly onHop = (hop: ToneHop): void => {
    if (hop.frequency !== this.lastFrequency) {
      // a mark spanning a tracker switch is the old signal (hum, a carrier) – not Morse
      if (this.lastFrequency !== 0) this.keying.restart(hop.time);
      this.lastFrequency = hop.frequency;
      this.resetRoom();
    }
    const hopSeconds = this.tone.hopSeconds;
    // smoothing window ≈ 0.4 unit – from a confident estimate only (a wrong early guess would
    // smear the very elements it is learned from), otherwise from the prior speed
    const unit = this.timing.isConfident ? this.timing.unitSeconds : 1.2 / this.config.initialWpm;
    this.smoother.setLength(
      Math.min(MAX_SMOOTHING, Math.max(1, (SMOOTHING_UNITS * unit) / hopSeconds)),
    );
    const envelope = this.smoother.push(hop.amplitude);
    this.keying.setEdgeGuard((this.smoother.length + 2) * hopSeconds);
    this.keying.setUnit(unit);
    this.keying.setRefractory(this.timing.isConfident ? REFRACTORY_UNITS * unit : 0);
    // stricter start until a transmission has been recognised: no Morse from noise alone
    this.keying.setStartGate(this.timing.isConfident ? 1 : UNCONFIDENT_START_GATE);
    this.keying.push(envelope, hop.time, hopSeconds, this.onLevelSegment);
    if (this.config.roomEqualizer) this.roomHop(hop, hopSeconds);
    const keyDown = this.roomActive ? this.room.isKeyDown : this.keying.isKeyDown;
    if (!keyDown) {
      const silence = this.roomActive
        ? hop.time - this.room.stateSince
        : this.keying.currentDuration;
      this.timingOut.length = 0;
      this.timing.idle(hop.time, silence, this.timingOut);
      for (const e of this.timingOut) this.out.push(e);
    }
    if (hop.time - this.lastToneReport >= TONE_REPORT_INTERVAL) {
      this.lastToneReport = hop.time;
      const levels = this.keying.levels;
      this.out.push({
        type: 'tone',
        timestamp: hop.time,
        frequency: hop.frequency,
        amplitude: envelope,
        noise: levels.noise,
        threshold: levels.threshold,
        keyDown,
      });
    }
  };

  /** Feeds the room equalizer; hands over to it in a character gap once it has learned the room. */
  private roomHop(hop: ToneHop, hopSeconds: number): void {
    // speed for learning the room: the level detector's if it is faster (a bad room makes it
    // collapse to a slow speed, never a fast one), else the prior
    const prior = 1.2 / this.config.initialWpm;
    const level = this.timing.isConfident ? this.timing.unitSeconds : prior;
    const segments = this.room.push(hop.re, hop.im, hop.time, hopSeconds, Math.min(prior, level));
    // the level detector's speed may have collapsed in a bad room – the gap is measured in the
    // equalizer's units, on both detectors
    const gap = HANDOVER_GAP_UNITS * this.room.unitSeconds;
    const inGap =
      !this.room.isKeyDown &&
      hop.time - this.room.stateSince >= gap &&
      !this.keying.isKeyDown &&
      this.keying.currentDuration >= gap;
    if (this.roomActive) {
      if (!this.room.isActive) {
        // the equalizer lost the room (it learns again); the level detector continues
        this.roomActive = false;
        return;
      }
      for (const s of segments) this.onSegment(s);
      if (segments.length) this.levelMarksUnheard = 0;
      const stuck =
        this.levelMarksUnheard >= SILENT_LEVEL_MARKS ||
        (this.room.isKeyDown &&
          hop.time - this.room.stateSince > MAX_MARK_UNITS * this.room.unitSeconds);
      if (stuck) {
        this.roomActive = false;
        this.room.relearn();
        return;
      }
      // a room that turned out not to shape the tone: the smoothed level is the better detector
      if (inGap && this.room.evidence < HANDBACK_EVIDENCE) this.roomActive = false;
      return;
    }
    const evidence = this.room.evidence;
    if (
      inGap &&
      this.room.isConfirmed &&
      evidence >= HANDOVER_EVIDENCE &&
      evidence <= MAX_EVIDENCE
    ) {
      this.room.startEmitting(hop.time - this.keying.currentDuration);
      this.roomActive = true;
      this.levelMarksUnheard = 0;
    }
  }

  private resetRoom(): void {
    this.room.reset();
    this.roomActive = false;
  }

  /** Segments of the level detector: to the timing decoder unless the room equalizer took over. */
  private readonly onLevelSegment = (segment: KeyingSegment): void => {
    if (
      this.config.roomEqualizer &&
      segment.state === 'space' &&
      segment.duration >= (ONSET_GAP_UNITS * 1.2) / this.config.initialWpm
    )
      this.room.onset(segment.start + segment.duration);
    if (this.roomActive) {
      if (segment.state === 'mark') this.levelMarksUnheard++;
    } else this.onSegment(segment);
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
