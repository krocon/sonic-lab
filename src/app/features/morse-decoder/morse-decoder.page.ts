import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { RingBuffer } from '../../audio/ring-buffer';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { StatusMessage } from '../../core/status/status-message';
import { CaptureControls } from '../../shared/capture/capture-controls';
import { KeyOption, KeySelector } from '../../shared/controls/key-selector';
import { Knob } from '../../shared/controls/knob';
import { Icon } from '../../shared/icon/icon';
import { StatusBanner } from '../../shared/status/status-banner';
import { KeyingTimelineCanvas } from '../../shared/visualization/keying-timeline-canvas';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';
import { WaveformCanvas } from '../../shared/visualization/waveform-canvas';
import { MorseSession } from './morse-session';
import { FREQUENCY_RANGE, MorseSettings, Sensitivity } from './morse-settings';

const MODES: readonly KeyOption<MorseSettings['frequencyMode']>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Fixed' },
];

const SENSITIVITY_KEYS: readonly KeyOption<Sensitivity>[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** Morse decoder workspace: capture, live signal, detection settings and decoded output. */
@Component({
  selector: 'app-morse-decoder-page',
  imports: [
    Icon,
    CaptureControls,
    KeySelector,
    Knob,
    WaveformCanvas,
    LevelMeterBar,
    KeyingTimelineCanvas,
    StatusBanner,
  ],
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
  protected readonly range = FREQUENCY_RANGE;
  protected readonly modes = MODES;
  protected readonly sensitivities = SENSITIVITY_KEYS;
  protected readonly copyStatus = signal<StatusMessage | null>(null);

  protected readonly wpmLabel = computed(() => {
    const wpm = this.morse.wpm();
    return wpm === null ? '–' : String(wpm);
  });
  protected readonly snrLabel = computed(() => {
    const snr = this.morse.snrDb();
    return snr === null ? '–' : `${snr} dB`;
  });
  protected readonly frequencyLabel = computed(() => {
    const s = this.morse.settings();
    if (s.frequencyMode === 'manual') return `${s.frequency} Hz`;
    const f = this.morse.frequency();
    return f === null ? 'auto' : `auto · ${f} Hz`;
  });

  constructor() {
    this.session.addConsumer((frame) => {
      this.scope.write(frame.samples);
      this.meter.process(frame.samples, frame.sampleRate);
    });
  }

  protected setMode(mode: MorseSettings['frequencyMode']): void {
    this.morse.updateSettings({ frequencyMode: mode });
  }

  protected setFrequency(frequency: number): void {
    this.morse.updateSettings({ frequency });
  }

  protected setInitialWpm(initialWpm: number): void {
    this.morse.updateSettings({ initialWpm });
  }

  protected setSensitivity(sensitivity: Sensitivity): void {
    this.morse.updateSettings({ sensitivity });
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
