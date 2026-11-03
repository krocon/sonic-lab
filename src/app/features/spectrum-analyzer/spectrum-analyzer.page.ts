import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Peak, SpectrumAnalyzer, findPeak } from '../../audio/dsp/spectrum';
import { WindowKind } from '../../audio/dsp/window';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoAnalysisSignal } from '../../core/capture/demo-signal';
import { PanelOption, attachPanel, panelAction, panelChoice } from '../../core/panel/front-panel';
import { SettingsStore, isRecord, read } from '../../core/settings/settings-store';
import { SpectrogramCanvas } from '../../shared/visualization/spectrogram-canvas';
import { SpectrumCanvas } from '../../shared/visualization/spectrum-canvas';

export const FFT_SIZES = [1024, 2048, 4096, 8192, 16384] as const;
const AVERAGING = { off: 0, low: 0.5, medium: 0.75, high: 0.9 } as const;
type Averaging = keyof typeof AVERAGING;

const SIZE_KEYS: readonly PanelOption<number>[] = FFT_SIZES.map((s) => ({
  value: s,
  label: String(s),
}));
const WINDOW_KEYS: readonly PanelOption<WindowKind>[] = [
  { value: 'hann', label: 'HANN' },
  { value: 'blackman-harris', label: 'B-HARRIS' },
];
const AXIS_KEYS: readonly PanelOption<boolean>[] = [
  { value: true, label: 'LOG' },
  { value: false, label: 'LINEAR' },
];
const AVERAGING_KEYS: readonly PanelOption<Averaging>[] = [
  { value: 'off', label: 'OFF' },
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
];
const ON_OFF: readonly PanelOption<boolean>[] = [
  { value: false, label: 'OFF' },
  { value: true, label: 'ON' },
];

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
  imports: [SpectrumCanvas, SpectrogramCanvas],
  providers: [provideAudioCapture({ demo: demoAnalysisSignal })],
  templateUrl: './spectrum-analyzer.page.html',
  styles: `
    .screen {
      grid-template-rows: auto minmax(0, 1fr) minmax(0, 1.1fr);
      gap: clamp(8px, 2cqh, 18px);
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
  protected readonly averagingLabel = () =>
    AVERAGING_KEYS.find((a) => a.value === this.settings().averaging)?.label ?? '';
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
    const settings = this.settings;
    attachPanel({
      softkeys: [
        panelChoice({
          label: 'FFT',
          name: 'FFT size',
          options: SIZE_KEYS,
          value: () => settings().size,
          set: (size) => this.update({ size }),
        }),
        panelChoice({
          label: 'WINDOW',
          name: 'Window',
          options: WINDOW_KEYS,
          value: () => settings().window,
          set: (window) => this.update({ window }),
        }),
        panelChoice({
          label: 'AXIS',
          name: 'Frequency axis',
          options: AXIS_KEYS,
          value: () => settings().log,
          set: (log) => this.update({ log }),
        }),
        panelChoice({
          label: 'AVG',
          name: 'Averaging',
          options: AVERAGING_KEYS,
          value: () => settings().averaging,
          set: (averaging) => this.update({ averaging }),
        }),
        panelChoice({
          label: 'PEAK HOLD',
          name: 'Peak hold',
          options: ON_OFF,
          value: () => settings().peakHold,
          set: (peakHold) => this.update({ peakHold }),
        }),
        panelAction({
          label: 'CLR PEAKS',
          name: 'Reset peaks',
          run: () => this.resetPeaks(),
          disabled: () => !settings().peakHold,
        }),
      ],
      capture: this.session,
    });
  }

  protected resolution(): string {
    const a = this.analyzer();
    return (a.sampleRate / a.options.size).toFixed(1);
  }

  protected windowMs(): string {
    const a = this.analyzer();
    return ((a.options.size / a.sampleRate) * 1000).toFixed(0);
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

  private create(s: SpectrumSettings): SpectrumAnalyzer {
    return new SpectrumAnalyzer({
      size: s.size,
      window: s.window,
      averaging: AVERAGING[s.averaging],
      overlap: 0.75,
    });
  }
}
