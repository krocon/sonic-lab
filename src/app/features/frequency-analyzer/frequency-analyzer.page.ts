import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { frequencyToNote } from '../../audio/dsp/note';
import { SpectrumAnalyzer, findPeak } from '../../audio/dsp/spectrum';
import { TimeSeries } from '../../audio/time-series';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoAnalysisSignal } from '../../core/capture/demo-signal';
import { CaptureControls } from '../../shared/capture/capture-controls';
import { HistoryCanvas } from '../../shared/visualization/history-canvas';

/** Below this level the input counts as silence and no frequency is shown. */
const GATE_DB = -60;
const UPDATE_SECONDS = 0.1;

/** Dominant frequency with note name, stability and a 10-second history. */
@Component({
  selector: 'app-frequency-analyzer-page',
  imports: [CaptureControls, HistoryCanvas],
  providers: [provideAudioCapture({ demo: demoAnalysisSignal })],
  template: `
    <div class="module-page">
      <header>
        <p class="eyebrow">Analyze</p>
        <h1>Frequency Analyzer</h1>
      </header>
      <section class="panel" aria-label="Capture controls"><app-capture-controls /></section>
      <section class="panel" aria-labelledby="freq-title">
        <h2 id="freq-title" class="visually-hidden">Dominant frequency</h2>
        <p class="big" aria-live="polite">
          <span class="value">{{ frequencyText() }}</span
          ><span class="unit">Hz</span>
        </p>
        <dl class="readouts">
          <div class="readout">
            <dt>Note</dt>
            <dd>{{ noteText() }}</dd>
          </div>
          <div class="readout">
            <dt>Level</dt>
            <dd>{{ level() === null ? '–' : level()!.toFixed(1) + ' dBFS' }}</dd>
          </div>
          <div class="readout">
            <dt>Stability (1 s)</dt>
            <dd>{{ stability() === null ? '–' : '± ' + stability()!.toFixed(2) + ' Hz' }}</dd>
          </div>
        </dl>
        <app-history-canvas
          class="chart history"
          [series]="history"
          [seconds]="10"
          [min]="50"
          [max]="5000"
          [log]="true"
          unit=" Hz"
          label="Frequency over the last 10 seconds"
        />
      </section>
    </div>
  `,
  styles: `
    .big {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      margin: 0;
      font-family: var(--font-mono);
    }
    .big .value {
      font-size: clamp(2.5rem, 8vw, 5rem);
      font-weight: var(--weight-bold);
      color: var(--color-accent-strong);
    }
    .big .unit {
      font-size: var(--text-xl);
      color: var(--color-text-muted);
    }
    .history {
      height: 12rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrequencyAnalyzerPage {
  protected readonly session = inject(CaptureSession);
  /** 8192 points: ≈ 5.9 Hz bins at 48 kHz, interpolated to well below 1 Hz. */
  private readonly analyzer = new SpectrumAnalyzer({ size: 8192, averaging: 0.3, overlap: 0.75 });
  protected readonly history = new TimeSeries(600);
  protected readonly frequency = signal<number | null>(null);
  protected readonly level = signal<number | null>(null);
  protected readonly stability = signal<number | null>(null);
  protected readonly frequencyText = computed(() =>
    this.frequency() === null ? '–' : this.frequency()!.toFixed(1),
  );
  protected readonly noteText = computed(() => {
    const note = frequencyToNote(this.frequency() ?? 0);
    return note ? `${note.name} ${note.cents >= 0 ? '+' : ''}${note.cents} ct` : '–';
  });
  private lastUpdate = -Infinity;

  constructor() {
    this.session.addConsumer((frame) => {
      this.analyzer.process(frame.samples, frame.sampleRate);
      const t = frame.timestamp;
      if (t - this.lastUpdate < UPDATE_SECONDS) return;
      this.lastUpdate = t;
      const peak = findPeak(this.analyzer, 30, 15000);
      const audible = peak !== null && peak.db > GATE_DB;
      this.history.push(t, audible ? peak.frequency : NaN);
      this.frequency.set(audible ? Math.round(peak.frequency * 10) / 10 : null);
      this.level.set(audible ? peak.db : null);
      const stats = this.history.stats(t - 1);
      this.stability.set(audible && stats.n >= 5 ? stats.std : null);
    });
  }
}
