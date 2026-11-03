import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { frequencyToNote } from '../../audio/dsp/note';
import { SpectrumAnalyzer, findPeak } from '../../audio/dsp/spectrum';
import { TimeSeries } from '../../audio/time-series';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoAnalysisSignal } from '../../core/capture/demo-signal';
import { attachPanel } from '../../core/panel/front-panel';
import { HistoryCanvas } from '../../shared/visualization/history-canvas';

/** Below this level the input counts as silence and no frequency is shown. */
const GATE_DB = -60;
const UPDATE_SECONDS = 0.1;

/** Dominant frequency with note name, tuning and a 10-second history. */
@Component({
  selector: 'app-frequency-analyzer-page',
  imports: [HistoryCanvas],
  providers: [provideAudioCapture({ demo: demoAnalysisSignal })],
  template: `
    <div class="screen">
      <header class="module-head">
        <h1>Frequency Analyzer</h1>
      </header>
      <div class="row top">
        <p class="huge glow frequency" aria-live="polite">
          <span class="value"
            >{{ whole() }}<span class="dimmed">{{ fraction() }}</span></span
          ><span class="unit">Hz</span>
        </p>
        <dl class="readouts">
          <div class="ro hot">
            <dt>Note</dt>
            <dd class="glow note">{{ note()?.name ?? '–' }}</dd>
          </div>
          <div class="ro">
            <dt>Cents</dt>
            <dd>{{ centsText() }}</dd>
          </div>
          <div class="ro">
            <dt>Level</dt>
            <dd>
              {{ level() === null ? '–' : level()!.toFixed(1) }}<span class="unit">dBFS</span>
            </dd>
          </div>
          <div class="ro">
            <dt>Stability (1 s)</dt>
            <dd>
              {{ stability() === null ? '–' : '± ' + stability()!.toFixed(2)
              }}<span class="unit">Hz</span>
            </dd>
          </div>
        </dl>
      </div>
      <div class="tuner" aria-hidden="true">
        <div class="scale"></div>
        <div class="zero"></div>
        @if (note(); as n) {
          <div class="needle" [style.left.%]="50 + n.cents"></div>
        }
        <div class="ticks">
          <span>−50</span><span>−25</span><span>0</span><span>+25</span><span>+50 ct</span>
        </div>
      </div>
      <section class="box" aria-labelledby="history-title">
        <h2 id="history-title" class="box-title">Frequency</h2>
        <span class="box-meta">last 10 s · log scale</span>
        <app-history-canvas
          class="viz"
          [series]="history"
          [seconds]="10"
          [min]="50"
          [max]="5000"
          [log]="true"
          unit=" Hz"
          color="--display-trace-alt"
          label="Frequency over the last 10 seconds"
        />
      </section>
    </div>
  `,
  styles: `
    .screen {
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    .top {
      align-items: center;
      gap: 4cqw;
    }
    .frequency {
      flex: none;
    }
    .readouts {
      display: grid;
      grid-template-columns: repeat(2, auto);
      gap: 2cqh 3cqw;
    }
    .note {
      font-size: min(9cqh, 6cqw);
    }
    .tuner {
      position: relative;
      height: 5cqh;
      min-height: 18px;
      margin: 0 1cqw 3cqh;
    }
    .scale {
      position: absolute;
      inset: 0;
      border-bottom: 1px solid var(--oled-faint);
      background: repeating-linear-gradient(90deg, var(--oled-faint) 0 1px, transparent 1px 10%);
    }
    .zero {
      position: absolute;
      left: 50%;
      top: -2px;
      bottom: -2px;
      width: 2px;
      margin-left: -1px;
      background: var(--oled-ok);
    }
    .needle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 6px;
      margin-left: -3px;
      background: var(--oled-hot);
      box-shadow: 0 0 8px var(--oled-hot);
      transition: left 120ms linear;
    }
    .ticks {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      padding-top: 3px;
      font-size: clamp(8px, 1.6cqh, 11px);
      color: var(--oled-dim);
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
  /** Frequency split for the display: whole hertz, then the dimmed decimal. */
  protected readonly whole = computed(() => {
    const f = this.frequency();
    return f === null ? '–' : `${Math.trunc(f)}.`;
  });
  protected readonly fraction = computed(() => {
    const f = this.frequency();
    return f === null ? '' : f.toFixed(1).split('.')[1];
  });
  protected readonly note = computed(() => frequencyToNote(this.frequency() ?? 0));
  protected readonly centsText = computed(() => {
    const n = this.note();
    return n ? `${n.cents >= 0 ? '+' : '−'}${Math.abs(n.cents)}` : '–';
  });
  private lastUpdate = -Infinity;

  constructor() {
    attachPanel({ capture: this.session });
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
