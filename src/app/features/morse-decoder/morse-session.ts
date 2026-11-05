import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { CaptureSession } from '../../core/capture/capture-session';
import { KeyingTimeline } from '../../decoders/morse/keying-timeline';
import { MorseDecoder, MorseEvent } from '../../decoders/morse/morse-decoder';
import { MorseLog } from './morse-log';
import { MorseSettings, morseSettingsStore, toDecoderConfig } from './morse-settings';

const MAX_TEXT = 20_000;
/** Silence this long ends a log line (longer than any word gap, even at 5 WPM Farnsworth). */
const LOG_PAUSE_SECONDS = 6;
/** No frames for this long: capture was stopped – the next text starts a new log line. */
const CAPTURE_GAP_MS = 1000;

/**
 * Feature-level glue between the capture session and the framework-free {@link MorseDecoder}.
 * Decoding runs per audio frame without touching signals; only changed results are written
 * (a few times per second at most).
 */
@Injectable()
export class MorseSession {
  private readonly capture = inject(CaptureSession);
  private readonly store = morseSettingsStore();
  private readonly decoder: MorseDecoder;
  private lastFrameAt = -Infinity;
  readonly log = inject(MorseLog);

  readonly settings = signal<MorseSettings>(this.store.load());
  readonly text = signal('');
  /** Decoded codes, characters separated by spaces, words by " / ". */
  readonly morse = signal('');
  readonly pendingCode = signal('');
  readonly wpm = signal<number | null>(null);
  readonly frequency = signal<number | null>(null);
  readonly unknownCount = signal(0);
  /** Tone level above the noise floor while keyed, dB (null until a tone was heard). */
  readonly snrDb = signal<number | null>(null);
  /** Room mode has learned the room and detects the keying (see `MorseDecoder.roomInUse`). */
  readonly roomInUse = signal(false);
  readonly hasOutput = computed(() => this.text().length > 0 || this.morse().length > 0);
  readonly timeline = new KeyingTimeline();

  constructor() {
    this.decoder = new MorseDecoder(toDecoderConfig(this.settings()));
    const remove = this.capture.addConsumer((frame) => {
      const now = this.log.now().getTime();
      if (now - this.lastFrameAt > CAPTURE_GAP_MS) this.log.endLine();
      this.lastFrameAt = now;
      this.handle(this.decoder.process(frame));
    });
    inject(DestroyRef).onDestroy(remove);
  }

  updateSettings(patch: Partial<MorseSettings>): void {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    this.store.save(next);
    this.decoder.configure(toDecoderConfig(next));
    this.roomInUse.set(this.decoder.roomInUse);
  }

  /** Clears the output and the decoder's learned timing; the log keeps it, in a line of its own. */
  reset(): void {
    this.log.endLine();
    this.decoder.reset();
    this.timeline.clear();
    this.text.set('');
    this.morse.set('');
    this.pendingCode.set('');
    this.wpm.set(null);
    this.frequency.set(null);
    this.unknownCount.set(0);
    this.snrDb.set(null);
    this.roomInUse.set(false);
  }

  /** Exposed for tests: feed decoder events directly. */
  handle(events: readonly MorseEvent[]): void {
    let text = '';
    let morse = '';
    for (const e of events) {
      switch (e.type) {
        case 'character':
          text += e.text;
          morse += (morse || this.morse() ? ' ' : '') + e.code;
          if (!e.known) this.unknownCount.update((n) => n + 1);
          this.log.append(e.text, this.wpm());
          break;
        case 'word-gap':
          if ((this.text() + text).length > 0 && !(this.text() + text).endsWith(' ')) {
            text += ' ';
            morse += ' /';
          }
          this.log.space();
          break;
        case 'wpm':
          this.wpm.set(e.wpm);
          break;
        case 'segment':
          if (e.state === 'mark') this.timeline.addMark(e.start, e.start + e.duration);
          else if (e.duration >= LOG_PAUSE_SECONDS) this.log.endLine();
          break;
        case 'tone':
          this.timeline.update(e.timestamp, e.keyDown, e.amplitude, e.threshold);
          if (e.keyDown) {
            this.frequency.set(e.frequency);
            if (e.noise > 0) this.snrDb.set(Math.round(20 * Math.log10(e.amplitude / e.noise)));
          }
          break;
      }
    }
    if (text) this.text.update((t) => (t + text).slice(-MAX_TEXT));
    if (morse) this.morse.update((m) => (m + morse).slice(-MAX_TEXT));
    this.pendingCode.set(this.decoder.pendingCode);
    this.roomInUse.set(this.decoder.roomInUse);
  }
}
