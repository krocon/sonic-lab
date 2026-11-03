import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { SpectrumAnalyzer, findPeak } from '../../audio/dsp/spectrum';
import { TimeSeries } from '../../audio/time-series';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoAnalysisSignal } from '../../core/capture/demo-signal';
import { attachPanel, panelAction } from '../../core/panel/front-panel';
import { HistoryCanvas } from '../../shared/visualization/history-canvas';
import { AnalogMeter } from '../../shared/visualization/analog-meter';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';

const UPDATE_SECONDS = 0.1;

/** Level, clipping and dominant frequency at a glance, with a 30-second history. */
@Component({
  selector: 'app-signal-monitor-page',
  imports: [AnalogMeter, LevelMeterBar, HistoryCanvas],
  providers: [provideAudioCapture({ demo: demoAnalysisSignal })],
  template: `
    <div class="screen">
      <header class="module-head">
        <h1>Signal Monitor</h1>
      </header>
      <div class="now">
        <section class="box meter-box" aria-labelledby="level-title">
          <h2 id="level-title" class="box-title">Level</h2>
          <app-analog-meter class="vu" [meter]="meter" [active]="session.running()" />
          <app-level-meter-bar [meter]="meter" [active]="session.running()" />
        </section>
        <dl class="side">
          <div class="ro accent">
            <dt>Peak</dt>
            <dd class="glow">
              {{ peak() === null ? '–' : peak()!.toFixed(1) }}<span class="unit">dBFS</span>
            </dd>
          </div>
          <div class="ro">
            <dt>RMS</dt>
            <dd>{{ rms() === null ? '–' : rms()!.toFixed(1) }}<span class="unit">dBFS</span></dd>
          </div>
          <div class="ro hot">
            <dt>Dominant frequency</dt>
            <dd class="glow">{{ frequency() === null ? '–' : frequency()!.toFixed(0) + ' Hz' }}</dd>
          </div>
          @if (clipped()) {
            <div class="clip"><span class="chip live">Clip</span></div>
          }
        </dl>
      </div>
      <section class="box history" aria-labelledby="history-title">
        <h2 id="history-title" class="box-title">Last 30 seconds</h2>
        <span class="box-meta">level · dominant frequency</span>
        <app-history-canvas
          class="chart"
          [series]="levels"
          [seconds]="30"
          [min]="-80"
          [max]="0"
          unit=" dB"
          label="Level history"
        />
        <app-history-canvas
          class="chart"
          [series]="frequencies"
          [seconds]="30"
          [min]="50"
          [max]="5000"
          [log]="true"
          unit=" Hz"
          color="--display-trace-alt"
          label="Frequency history"
        />
      </section>
    </div>
  `,
  styles: `
    .screen {
      grid-template-rows: minmax(0, 1.1fr) minmax(0, 1fr);
    }
    .now {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
      gap: 2cqw;
      min-height: 0;
    }
    .meter-box {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 6px;
      padding: 12px 12px 10px;
    }
    .vu {
      min-height: 0;
    }
    .side {
      display: grid;
      align-content: center;
      gap: 3cqh;
      margin: 0;
    }
    .history {
      display: grid;
      grid-template-rows: 1fr 1fr;
      gap: 6px;
      padding: 12px 8px 6px;
    }
    .chart {
      min-height: 0;
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
    attachPanel({
      softkeys: [
        panelAction({
          label: 'CLR CLIP',
          name: 'Clear clipping warning',
          run: () => this.clipped.set(false),
          disabled: () => !this.clipped(),
        }),
      ],
      capture: this.session,
      message: () =>
        this.clipped()
          ? {
              tone: 'danger',
              text: 'Clipping detected.',
              hint: 'Lower the input gain in the system settings.',
            }
          : null,
    });
  }
}
