import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { RingBuffer } from '../../audio/ring-buffer';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { StatusMessage } from '../../core/status/status-message';
import { CaptureControls } from '../../shared/capture/capture-controls';
import { Icon } from '../../shared/icon/icon';
import { StatusBanner } from '../../shared/status/status-banner';
import { KeyingTimelineCanvas } from '../../shared/visualization/keying-timeline-canvas';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';
import { WaveformCanvas } from '../../shared/visualization/waveform-canvas';
import { MorseSession } from './morse-session';
import { FREQUENCY_RANGE, SENSITIVITIES, Sensitivity } from './morse-settings';

/** Morse decoder workspace: capture, live signal, detection settings and decoded output. */
@Component({
  selector: 'app-morse-decoder-page',
  imports: [
    Icon,
    CaptureControls,
    WaveformCanvas,
    LevelMeterBar,
    KeyingTimelineCanvas,
    StatusBanner,
  ],
  providers: [provideAudioCapture(), MorseSession],
  templateUrl: './morse-decoder.page.html',
  styleUrl: './morse-decoder.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorseDecoderPage {
  protected readonly session = inject(CaptureSession);
  protected readonly morse = inject(MorseSession);
  /** ~1.4 s of history at 48 kHz for the scope. */
  protected readonly scope = new RingBuffer(65536);
  protected readonly meter = new LevelMeter();
  protected readonly range = FREQUENCY_RANGE;
  protected readonly sensitivities = SENSITIVITIES;
  protected readonly copyStatus = signal<StatusMessage | null>(null);

  protected readonly wpmLabel = computed(() => {
    const wpm = this.morse.wpm();
    return wpm === null ? '–' : String(wpm);
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

  protected setMode(mode: string): void {
    this.morse.updateSettings({ frequencyMode: mode === 'manual' ? 'manual' : 'auto' });
  }

  protected setFrequency(value: string): void {
    this.morse.updateSettings({ frequency: Number(value) });
  }

  protected setSensitivity(value: string): void {
    if ((SENSITIVITIES as readonly string[]).includes(value))
      this.morse.updateSettings({ sensitivity: value as Sensitivity });
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

  protected reset(): void {
    this.morse.reset();
    this.copyStatus.set(null);
  }
}
