import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { SpectrumAnalyzer, findPeak } from '../../audio/dsp/spectrum';
import { TimeSeries } from '../../audio/time-series';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoAnalysisSignal } from '../../core/capture/demo-signal';
import { CaptureControls } from '../../shared/capture/capture-controls';
import { StatusBanner } from '../../shared/status/status-banner';
import { HistoryCanvas } from '../../shared/visualization/history-canvas';
import { AnalogMeter } from '../../shared/visualization/analog-meter';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';

const UPDATE_SECONDS = 0.1;

/** Level, clipping and dominant frequency at a glance, with a 30-second history. */
@Component({
  selector: 'app-signal-monitor-page',
  imports: [CaptureControls, AnalogMeter, LevelMeterBar, HistoryCanvas, StatusBanner],
  providers: [provideAudioCapture({ demo: demoAnalysisSignal })],
  template: `
    <div class="module-page">
      <header class="module-head">
        <p class="eyebrow">Analyze</p>
        <h1>Signal Monitor</h1>
      </header>
      <section class="panel" aria-label="Capture controls"><app-capture-controls /></section>
      <section class="panel" aria-labelledby="now-title">
        <h2 id="now-title">Now</h2>
        <div class="now">
          <app-analog-meter class="vu" [meter]="meter" [active]="session.running()" />
          <div class="now-side">
            <app-level-meter-bar [meter]="meter" [active]="session.running()" />
            <dl class="readouts">
              <div class="readout">
                <dt>RMS</dt>
                <dd>{{ rms() === null ? '–' : rms()!.toFixed(1) + ' dBFS' }}</dd>
              </div>
              <div class="readout">
                <dt>Peak</dt>
                <dd>{{ peak() === null ? '–' : peak()!.toFixed(1) + ' dBFS' }}</dd>
              </div>
              <div class="readout">
                <dt>Dominant frequency</dt>
                <dd>{{ frequency() === null ? '–' : frequency()!.toFixed(0) + ' Hz' }}</dd>
              </div>
            </dl>
          </div>
        </div>
        @if (clipped()) {
          <app-status-banner
            [message]="{
              tone: 'danger',
              text: 'Clipping detected.',
              hint: 'Lower the input gain in the system settings.',
            }"
          />
          <button type="button" class="btn" (click)="clipped.set(false)">Clear warning</button>
        }
      </section>
      <section class="panel" aria-labelledby="history-title">
        <h2 id="history-title">Last 30 seconds</h2>
        <p class="label">Level (RMS)</p>
        <app-history-canvas
          class="chart history"
          [series]="levels"
          [seconds]="30"
          [min]="-80"
          [max]="0"
          unit=" dB"
          label="Level history"
        />
        <p class="label">Dominant frequency</p>
        <app-history-canvas
          class="chart history"
          [series]="frequencies"
          [seconds]="30"
          [min]="50"
          [max]="5000"
          [log]="true"
          unit=" Hz"
          color="--display-cyan"
          label="Frequency history"
        />
      </section>
    </div>
  `,
  styles: `
    .history {
      height: 8rem;
    }
    .now {
      display: grid;
      grid-template-columns: minmax(14rem, 22rem) minmax(0, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    .now-side {
      display: grid;
      gap: var(--space-3);
    }
    @media (max-width: 760px) {
      .now {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .label {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--color-text-subtle);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalMonitorPage {
  protected readonly session = inject(CaptureSession);
  protected readonly meter = new LevelMeter();
  private readonly analyzer = new SpectrumAnalyzer({ size: 4096, averaging: 0.5 });
  protected readonly levels = new TimeSeries(400);
  protected readonly frequencies = new TimeSeries(400);
  protected readonly rms = signal<number | null>(null);
  protected readonly peak = signal<number | null>(null);
  protected readonly frequency = signal<number | null>(null);
  protected readonly clipped = signal(false);
  private lastUpdate = -Infinity;

  constructor() {
    this.session.addConsumer((frame) => {
      this.meter.process(frame.samples, frame.sampleRate);
      this.analyzer.process(frame.samples, frame.sampleRate);
      const r = this.meter.reading;
      if (r.clipped && !this.clipped()) this.clipped.set(true);
      const t = frame.timestamp;
      if (t - this.lastUpdate < UPDATE_SECONDS) return;
      this.lastUpdate = t;
      const p = findPeak(this.analyzer, 30, 15000);
      const f = p && p.db > -60 ? p.frequency : null;
      this.levels.push(t, r.rmsDb);
      this.frequencies.push(t, f ?? NaN);
      this.rms.set(r.rmsDb);
      this.peak.set(r.peakDb);
      this.frequency.set(f);
    });
  }
}
