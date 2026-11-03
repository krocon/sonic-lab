import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  signal,
  input,
  viewChild,
} from '@angular/core';
import { LevelMeter, MIN_DBFS } from '../../audio/level';
import { animationLoop } from './animation-loop';

const FLOOR_DB = -60;

function toPercent(db: number): number {
  return Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100));
}

/** Horizontal RMS/peak meter (−60…0 dBFS) updated per animation frame without change detection. */
@Component({
  selector: 'app-level-meter-bar',
  template: `
    <div class="track" aria-hidden="true">
      <div #rms class="cover"></div>
      <div #hold class="hold"></div>
    </div>
    <span #value class="value">– dB</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      background-color: var(--display-bg);
      background-image: var(--display-reflection);
      box-shadow: var(--display-inset);
    }
    .track {
      position: relative;
      flex: 1;
      height: 0.7rem;
      /* LCD bar graph: dark segments, the top of the scale in red */
      background: linear-gradient(
        90deg,
        var(--display-text) 0 75%,
        var(--display-value) 75% 90%,
        var(--display-mark) 90%
      );
      mask: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 7px);
    }
    .cover {
      position: absolute;
      inset: 0 0 0 auto;
      width: 100%;
      /* unlit segments stay faintly visible, as on a real LCD */
      background: var(--display-bg);
      opacity: 0.82;
    }
    .hold {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 3px;
      left: 0;
      background: var(--display-mark);
    }
    .value {
      min-width: 5rem;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      color: var(--display-value);
      text-shadow: var(--display-glow);
      text-align: right;
    }
    .value.clip {
      color: var(--led-red);
    }
  `,
  host: {
    role: 'meter',
    'aria-label': 'Input level',
    'aria-valuemin': '-60',
    'aria-valuemax': '0',
    '[attr.aria-valuenow]': 'valueNow()',
    '[attr.aria-valuetext]': 'valueText()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelMeterBar {
  readonly meter = input.required<LevelMeter>();
  /** False while capture is stopped: shows an empty meter. */
  readonly active = input(true);

  /** Accessible value, updated at most ~4× per second (not per animation frame). */
  protected readonly valueNow = signal(-60);
  protected readonly valueText = signal('no signal');
  private lastAria = 0;
  private readonly rms = viewChild.required<ElementRef<HTMLElement>>('rms');
  private readonly hold = viewChild.required<ElementRef<HTMLElement>>('hold');
  private readonly value = viewChild.required<ElementRef<HTMLElement>>('value');
  private lastText = '';

  constructor() {
    animationLoop(() => {
      const r = this.meter().reading;
      const active = this.active();
      const rmsDb = active ? r.rmsDb : MIN_DBFS;
      this.rms().nativeElement.style.width = `${100 - toPercent(rmsDb)}%`;
      this.hold().nativeElement.style.left = `${toPercent(active ? r.peakHoldDb : MIN_DBFS)}%`;
      const text =
        active && rmsDb > MIN_DBFS ? `${rmsDb.toFixed(0)} dB${r.clipped ? ' CLIP' : ''}` : '– dB';
      if (text !== this.lastText) {
        const el = this.value().nativeElement;
        el.textContent = text;
        el.classList.toggle('clip', r.clipped && active);
        this.lastText = text;
      }
      const now = performance.now();
      if (now - this.lastAria > 250) {
        this.lastAria = now;
        const v = Math.round(Math.max(-60, rmsDb));
        if (v !== this.valueNow()) {
          this.valueNow.set(v);
          this.valueText.set(active && rmsDb > MIN_DBFS ? `${v} dBFS` : 'no signal');
        }
      }
    });
  }
}
