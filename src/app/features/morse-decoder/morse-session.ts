import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { CaptureSession } from '../../core/capture/capture-session';
import { KeyingTimeline } from '../../decoders/morse/keying-timeline';
import { MorseDecoder, MorseEvent } from '../../decoders/morse/morse-decoder';
import { MorseSettings, morseSettingsStore, toDecoderConfig } from './morse-settings';

const MAX_TEXT = 20_000;

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

  readonly settings = signal<MorseSettings>(this.store.load());
  readonly text = signal('');
  /** Decoded codes, characters separated by spaces, words by " / ". */
  readonly morse = signal('');
  readonly pendingCode = signal('');
  readonly wpm = signal<number | null>(null);
  readonly frequency = signal<number | null>(null);
  readonly unknownCount = signal(0);
  readonly hasOutput = computed(() => this.text().length > 0 || this.morse().length > 0);
  readonly timeline = new KeyingTimeline();

  constructor() {
    this.decoder = new MorseDecoder(toDecoderConfig(this.settings()));
    const remove = this.capture.addConsumer((frame) => this.handle(this.decoder.process(frame)));
    inject(DestroyRef).onDestroy(remove);
  }

  updateSettings(patch: Partial<MorseSettings>): void {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    this.store.save(next);
    this.decoder.configure(toDecoderConfig(next));
  }

  /** Clears the output and the decoder's learned timing. */
  reset(): void {
    this.decoder.reset();
    this.timeline.clear();
    this.text.set('');
    this.morse.set('');
    this.pendingCode.set('');
    this.wpm.set(null);
    this.frequency.set(null);
    this.unknownCount.set(0);
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
          break;
        case 'word-gap':
          if ((this.text() + text).length > 0 && !(this.text() + text).endsWith(' ')) {
            text += ' ';
            morse += ' /';
          }
          break;
        case 'wpm':
          this.wpm.set(e.wpm);
          break;
        case 'segment':
          if (e.state === 'mark') this.timeline.addMark(e.start, e.start + e.duration);
          break;
        case 'tone':
          this.timeline.update(e.timestamp, e.keyDown, e.amplitude, e.threshold);
          if (e.keyDown) this.frequency.set(e.frequency);
          break;
      }
    }
    if (text) this.text.update((t) => (t + text).slice(-MAX_TEXT));
    if (morse) this.morse.update((m) => (m + morse).slice(-MAX_TEXT));
    this.pendingCode.set(this.decoder.pendingCode);
  }
}
