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
import { attachPanel, panelAction, panelValue } from '../../core/panel/front-panel';
import { StatusMessage } from '../../core/status/status-message';
import { MorseToken } from '../../decoders/morse/morse-alphabet';
import { scheduleMorse } from '../../decoders/morse/morse-timing';
import { animationLoop } from '../../shared/visualization/animation-loop';
import { EncoderSettings, encoderSettingsStore } from './encoder-settings';

/** Factory for the playback context; tests replace it. */
export const createAudioContext = {
  create: (): AudioContext => new AudioContext({ latencyHint: 'interactive' }),
};

/** Letters behind the digit keys (multi-tap, as on a phone keypad). */
export const MULTI_TAP: Readonly<Record<string, string>> = {
  '1': '.,?/',
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': ' ',
};
/** Pressing the same key again within this time picks its next letter. */
const MULTI_TAP_MS = 1000;
const MAX_TEXT = 2000;

/** Text → Morse code with live preview and audible playback. */
@Component({
  selector: 'app-morse-encoder-page',
  templateUrl: './morse-encoder.page.html',
  styleUrl: './morse-encoder.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorseEncoderPage {
  private readonly store = encoderSettingsStore();
  private readonly player = new KeyedTonePlayer(() => createAudioContext.create());
  protected readonly settings = signal<EncoderSettings>(this.store.load());
  /** Farnsworth spacing is off while it equals the character speed. */
  protected readonly farnsworthText = (v: number) =>
    v >= this.settings().wpm ? 'off' : `${v} WPM`;
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
  private tap = { key: '', index: 0, at: 0 };

  constructor() {
    const settings = this.settings;
    const speed = panelValue({
      label: 'SPEED',
      name: 'Speed',
      value: () => settings().wpm,
      set: (wpm) => this.update({ wpm }),
      scale: () => ({ min: 5, max: 50, step: 1, log: false }),
      format: (v) => `${v} WPM`,
    });
    const tone = panelValue({
      label: 'TONE',
      name: 'Tone',
      value: () => settings().frequency,
      set: (frequency) => this.update({ frequency }),
      scale: () => ({ min: 300, max: 1500, step: 10, log: false }),
      format: (v) => `${v} Hz`,
    });
    const volume = panelValue({
      label: 'VOLUME',
      name: 'Volume',
      value: () => settings().volume,
      set: (volume) => this.update({ volume }),
      scale: () => ({ min: 0, max: MAX_VOLUME, step: 0.01, log: false }),
      format: (v) => `${Math.round(v * 100)} %`,
    });
    attachPanel({
      softkeys: [
        speed,
        panelValue({
          label: 'FARNS',
          name: 'Farnsworth speed',
          value: () => settings().farnsworthWpm,
          set: (farnsworthWpm) => this.update({ farnsworthWpm }),
          scale: () => ({ min: 3, max: settings().wpm, step: 1, log: false }),
          format: this.farnsworthText,
        }),
        tone,
        volume,
        panelAction({
          label: 'CLEAR',
          name: 'Clear text',
          run: () => this.update({ text: '' }),
          disabled: () => !settings().text,
        }),
      ],
      knobs: [tone, speed, volume],
      multi: speed,
      play: {
        name: 'Play',
        run: () => this.play(),
        active: this.playing,
        disabled: () => this.playing() || !this.code(),
      },
      stop: { name: 'Stop', run: () => this.stop(), disabled: () => !this.playing() },
      copy: { name: 'Copy code', run: () => this.copy(), disabled: () => !this.code() },
      digit: (d) => this.type(d),
      clear: () => this.update({ text: settings().text.slice(0, -1) }),
      state: () => ({ text: this.playing() ? 'Playing' : 'Ready', live: this.playing() }),
      message: () => {
        const status = this.status();
        if (status) return status;
        const unsupported = this.unsupported();
        return unsupported
          ? { tone: 'warning', text: `Not encodable, skipped: ${unsupported}` }
          : null;
      },
    });

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

  protected async stop(): Promise<void> {
    await this.player.stop();
  }

  protected async play(): Promise<void> {
    if (this.playing()) return;
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

  protected text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  /** Digit keys type letters: the same key again within a second picks the next letter. */
  protected type(digit: string): void {
    const letters = MULTI_TAP[digit];
    if (!letters) return;
    const now = Date.now();
    const text = this.settings().text;
    if (digit === this.tap.key && now - this.tap.at < MULTI_TAP_MS && letters.length > 1) {
      const index = (this.tap.index + 1) % letters.length;
      this.update({ text: text.slice(0, -1) + letters[index] });
      this.tap = { key: digit, index, at: now };
    } else {
      this.update({ text: (text + letters[0]).slice(0, MAX_TEXT) });
      this.tap = { key: digit, index: 0, at: now };
    }
  }
}
