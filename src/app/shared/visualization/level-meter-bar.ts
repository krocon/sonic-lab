import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
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
      /* LED ladder: the full colour scale, cut into segments */
      background: linear-gradient(
        90deg,
        var(--led-green) 0 75%,
        var(--led-amber) 75% 90%,
        var(--led-red) 90%
      );
      mask: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 7px);
      filter: drop-shadow(0 0 3px rgb(109 255 160 / 35%));
    }
    .cover {
      position: absolute;
      inset: 0 0 0 auto;
      width: 100%;
      background: rgb(5 8 7 / 82%);
    }
    .hold {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 3px;
      left: 0;
      background: #ffffff;
    }
    .value {
      min-width: 5rem;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      color: var(--display-amber);
      text-shadow: var(--display-glow-amber);
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
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelMeterBar {
  readonly meter = input.required<LevelMeter>();
  /** False while capture is stopped: shows an empty meter. */
  readonly active = input(true);

  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
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
        this.host.setAttribute('aria-valuenow', Math.max(-60, rmsDb).toFixed(0));
      }
    });
  }
}
