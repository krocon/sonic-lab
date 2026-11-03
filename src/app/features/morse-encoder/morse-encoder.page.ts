import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { KeyedTonePlayer, MAX_VOLUME } from '../../audio/output/keyed-tone-player';
import { StatusMessage } from '../../core/status/status-message';
import { MorseToken } from '../../decoders/morse/morse-alphabet';
import { scheduleMorse } from '../../decoders/morse/morse-timing';
import { Icon } from '../../shared/icon/icon';
import { StatusBanner } from '../../shared/status/status-banner';
import { animationLoop } from '../../shared/visualization/animation-loop';
import { EncoderSettings, encoderSettingsStore } from './encoder-settings';

/** Factory for the playback context; tests replace it. */
export const createAudioContext = {
  create: (): AudioContext => new AudioContext({ latencyHint: 'interactive' }),
};

/** Text → Morse code with live preview and audible playback. */
@Component({
  selector: 'app-morse-encoder-page',
  imports: [Icon, StatusBanner],
  templateUrl: './morse-encoder.page.html',
  styleUrl: './morse-encoder.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorseEncoderPage {
  private readonly store = encoderSettingsStore();
  private readonly player = new KeyedTonePlayer(() => createAudioContext.create());
  protected readonly settings = signal<EncoderSettings>(this.store.load());
  protected readonly maxVolume = MAX_VOLUME;
  protected readonly playing = signal(false);
  /** Index of the token currently sounding, or -1. */
  protected readonly current = signal(-1);
  protected readonly status = signal<StatusMessage | null>(null);

  protected readonly schedule = computed(() => {
    const s = this.settings();
    return scheduleMorse(s.text, { wpm: s.wpm, farnsworthWpm: s.farnsworthWpm, leadIn: 0 });
  });
  protected readonly tokens = computed<readonly MorseToken[]>(() => this.schedule().tokens);
  protected readonly unsupported = computed(() =>
    [...new Set(this.tokens().flatMap((t) => (t.kind === 'unsupported' ? [t.text] : [])))].join(
      ' ',
    ),
  );
  /** Codes separated by spaces, words by " / " – what Copy puts on the clipboard. */
  protected readonly code = computed(() =>
    this.tokens()
      .map((t) => (t.kind === 'char' ? t.code : t.kind === 'word-gap' ? '/' : ''))
      .filter(Boolean)
      .join(' ')
      .replace(/( \/)+$/, ''),
  );
  protected readonly duration = computed(() => this.schedule().duration);

  constructor() {
    const doc = inject(DOCUMENT);
    animationLoop(() => {
      const position = this.player.position;
      if (position === null) return;
      const el = this.schedule().elements.find(
        (e) => position >= e.start && position < e.end + 0.15,
      );
      this.current.set(el ? el.token : -1);
    });
    inject(DestroyRef).onDestroy(() => void this.player.stop());
    doc.defaultView?.addEventListener('pagehide', () => void this.player.stop());
  }

  protected update(patch: Partial<EncoderSettings>): void {
    const previous = this.settings();
    const next: { -readonly [K in keyof EncoderSettings]: EncoderSettings[K] } = {
      ...previous,
      ...patch,
    };
    // Farnsworth "off" (equal to the character speed) follows speed changes; it never exceeds it
    if (patch.wpm !== undefined && previous.farnsworthWpm === previous.wpm)
      next.farnsworthWpm = next.wpm;
    next.farnsworthWpm = Math.min(next.farnsworthWpm, next.wpm);
    this.settings.set(next);
    this.store.save(next);
  }

  protected async play(): Promise<void> {
    if (this.playing()) {
      await this.player.stop();
      return;
    }
    const s = this.settings();
    const schedule = this.schedule();
    if (schedule.elements.length === 0) return;
    this.playing.set(true);
    this.status.set(null);
    try {
      await this.player.play(schedule.elements, schedule.duration, {
        frequency: s.frequency,
        volume: s.volume,
      });
    } catch {
      this.status.set({
        tone: 'danger',
        text: 'Audio output is not available.',
        hint: 'Check the output device and try again.',
      });
    } finally {
      this.playing.set(false);
      this.current.set(-1);
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
      this.status.set({ tone: 'success', text: 'Morse code copied to the clipboard.' });
    } catch {
      this.status.set({
        tone: 'danger',
        text: 'Copying failed.',
        hint: 'Select the code and copy it manually.',
      });
    }
  }

  protected num(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
