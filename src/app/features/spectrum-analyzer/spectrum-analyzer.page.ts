import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Peak, SpectrumAnalyzer, findPeak } from '../../audio/dsp/spectrum';
import { WindowKind } from '../../audio/dsp/window';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoAnalysisSignal } from '../../core/capture/demo-signal';
import { SettingsStore, isRecord, read } from '../../core/settings/settings-store';
import { CaptureControls } from '../../shared/capture/capture-controls';
import { SpectrogramCanvas } from '../../shared/visualization/spectrogram-canvas';
import { SpectrumCanvas } from '../../shared/visualization/spectrum-canvas';

export const FFT_SIZES = [1024, 2048, 4096, 8192, 16384] as const;
const AVERAGING = { off: 0, low: 0.5, medium: 0.75, high: 0.9 } as const;
type Averaging = keyof typeof AVERAGING;

interface SpectrumSettings {
  readonly size: number;
  readonly window: WindowKind;
  readonly log: boolean;
  readonly averaging: Averaging;
  readonly peakHold: boolean;
}

const store = () =>
  new SettingsStore<SpectrumSettings>({
    key: 'audiolab.spectrum',
    version: 1,
    defaults: { size: 4096, window: 'hann', log: true, averaging: 'medium', peakHold: false },
    validate: (raw) =>
      isRecord(raw)
        ? {
            size: (FFT_SIZES as readonly number[]).includes(read.number(raw, 'size', 4096))
              ? read.number(raw, 'size', 4096)
              : 4096,
            window: read.oneOf(raw, 'window', ['hann', 'blackman-harris'] as const, 'hann'),
            log: read.boolean(raw, 'log', true),
            averaging: read.oneOf(
              raw,
              'averaging',
              ['off', 'low', 'medium', 'high'] as const,
              'medium',
            ),
            peakHold: read.boolean(raw, 'peakHold', false),
          }
        : null,
  });

/** FFT spectrum and spectrogram of the live input. */
@Component({
  selector: 'app-spectrum-analyzer-page',
  imports: [CaptureControls, SpectrumCanvas, SpectrogramCanvas],
  providers: [provideAudioCapture({ demo: demoAnalysisSignal })],
  templateUrl: './spectrum-analyzer.page.html',
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 16rem;
      gap: var(--space-4);
    }
    .spectrum {
      height: 18rem;
    }
    .spectrogram {
      height: 12rem;
    }
    .small {
      font-size: var(--text-sm);
    }
    @media (max-width: 960px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpectrumAnalyzerPage {
  protected readonly session = inject(CaptureSession);
  private readonly settingsStore = store();
  protected readonly settings = signal(this.settingsStore.load());
  protected readonly analyzer = signal(this.create(this.settings()));
  protected readonly peak = signal<Peak | null>(null);
  protected readonly sizes = FFT_SIZES;
  private lastPeakVersion = 0;

  constructor() {
    this.session.addConsumer((frame) => {
      const a = this.analyzer();
      a.process(frame.samples, frame.sampleRate);
      if (a.version - this.lastPeakVersion >= 4) {
        this.lastPeakVersion = a.version;
        this.peak.set(findPeak(a, 20, 20000));
      }
    });
  }

  protected resolution(): string {
    const a = this.analyzer();
    return `${(a.sampleRate / a.options.size).toFixed(1)} Hz/bin · ${((a.options.size / a.sampleRate) * 1000).toFixed(0)} ms window`;
  }

  protected update(patch: Partial<SpectrumSettings>): void {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    this.settingsStore.save(next);
    if (patch.size !== undefined || patch.window !== undefined || patch.averaging !== undefined) {
      this.analyzer.set(this.create(next));
      this.lastPeakVersion = 0;
    }
  }

  protected resetPeaks(): void {
    this.analyzer().resetPeaks();
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected asAveraging(v: string): Averaging {
    return v in AVERAGING ? (v as Averaging) : 'medium';
  }

  private create(s: SpectrumSettings): SpectrumAnalyzer {
    return new SpectrumAnalyzer({
      size: s.size,
      window: s.window,
      averaging: AVERAGING[s.averaging],
      overlap: 0.75,
    });
  }
}
