import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { RingBuffer } from '../../audio/ring-buffer';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import {
  PanelOption,
  attachPanel,
  panelAction,
  panelChoice,
  panelValue,
} from '../../core/panel/front-panel';
import { StatusMessage } from '../../core/status/status-message';
import { KeyingTimelineCanvas } from '../../shared/visualization/keying-timeline-canvas';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';
import { WaveformCanvas } from '../../shared/visualization/waveform-canvas';
import { MorseSession } from './morse-session';
import { FREQUENCY_RANGE, MorseSettings, Sensitivity } from './morse-settings';

const MODES: readonly PanelOption<MorseSettings['frequencyMode']>[] = [
  { value: 'auto', label: 'AUTO' },
  { value: 'manual', label: 'FIXED' },
];

const SENSITIVITIES: readonly PanelOption<Sensitivity>[] = [
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
];

/** Morse decoder: live signal, key-down timeline and decoded output on the display. */
@Component({
  selector: 'app-morse-decoder-page',
  imports: [WaveformCanvas, LevelMeterBar, KeyingTimelineCanvas],
  providers: [provideAudioCapture(), MorseSession],
  templateUrl: './morse-decoder.page.html',
  styleUrl: './morse-decoder.page.css',
  host: { '(document:keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorseDecoderPage {
  protected readonly session = inject(CaptureSession);
  protected readonly morse = inject(MorseSession);
  /** ~1.4 s of history at 48 kHz for the scope. */
  protected readonly scope = new RingBuffer(65536);
  protected readonly meter = new LevelMeter();
  protected readonly copyStatus = signal<StatusMessage | null>(null);

  protected readonly wpmText = computed(() => {
    const wpm = this.morse.wpm();
    return wpm === null ? '–' : String(wpm);
  });
  protected readonly snrText = computed(() => {
    const snr = this.morse.snrDb();
    return snr === null ? '–' : String(snr);
  });
  protected readonly toneText = computed(() => {
    const s = this.morse.settings();
    if (s.frequencyMode === 'manual') return String(s.frequency);
    const f = this.morse.frequency();
    return f === null ? '–' : String(f);
  });

  constructor() {
    this.session.addConsumer((frame) => {
      this.scope.write(frame.samples);
      this.meter.process(frame.samples, frame.sampleRate);
    });

    const settings = this.morse.settings;
    const update = (patch: Partial<MorseSettings>) => this.morse.updateSettings(patch);
    const tone = panelValue({
      label: 'FIXED',
      name: 'Fixed tone',
      value: () => settings().frequency,
      // turning to a frequency means listening for exactly that tone
      set: (frequency) => update({ frequency, frequencyMode: 'manual' }),
      scale: () => ({ ...FREQUENCY_RANGE, log: false }),
      format: (v) => `${v} Hz`,
    });
    const speed = panelValue({
      label: 'START',
      name: 'Start speed',
      value: () => settings().initialWpm,
      set: (initialWpm) => update({ initialWpm }),
      scale: () => ({ min: 5, max: 50, step: 1, log: false }),
      format: (v) => `${v} WPM`,
    });
    attachPanel({
      softkeys: [
        panelChoice({
          label: 'TONE',
          name: 'Tone frequency',
          options: MODES,
          value: () => settings().frequencyMode,
          set: (frequencyMode) => update({ frequencyMode }),
        }),
        tone,
        panelChoice({
          label: 'SENS',
          name: 'Sensitivity',
          options: SENSITIVITIES,
          value: () => settings().sensitivity,
          set: (sensitivity) => update({ sensitivity }),
        }),
        speed,
        panelAction({
          label: 'RESET',
          name: 'Reset',
          run: () => this.reset(),
          disabled: () => !this.morse.hasOutput(),
        }),
      ],
      knobs: [tone, speed, null],
      multi: tone,
      capture: this.session,
      copy: { name: 'Copy text', run: () => this.copy(), disabled: () => !this.morse.text() },
      message: () => {
        const unknown = this.morse.unknownCount();
        return (
          this.copyStatus() ??
          (unknown > 0
            ? {
                tone: 'neutral',
                text: `� marks ${unknown} sequence(s) that are not valid Morse characters.`,
              }
            : null)
        );
      },
    });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.morse.text().trim());
      this.copyStatus.set({ tone: 'success', text: 'Text copied to the clipboard.' });
    } catch {
      this.copyStatus.set({
        tone: 'danger',
        text: 'Copying failed.',
        hint: 'Select the text and copy it manually.',
      });
    }
    setTimeout(() => this.copyStatus.set(null), 3000);
  }

  /** Space = start/stop, Ctrl/⌘+K = reset – unless the user is typing or on a control. */
  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest(
      'input, select, textarea, button, a, [role="slider"], [contenteditable]',
    );
    if (event.key === ' ' && !interactive && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      void this.session.toggle();
    } else if (
      event.key.toLowerCase() === 'k' &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      this.reset();
    }
  }

  protected reset(): void {
    this.morse.reset();
    this.copyStatus.set(null);
  }
}
