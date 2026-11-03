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
    }
    .track {
      position: relative;
      flex: 1;
      height: 0.5rem;
      border-radius: var(--radius-pill);
      /* full-width scale; the unlit part is covered from the right */
      background: linear-gradient(
        90deg,
        var(--color-accent) 0 75%,
        var(--color-warning) 75% 90%,
        var(--color-danger) 90%
      );
      overflow: hidden;
    }
    .cover {
      position: absolute;
      inset: 0 0 0 auto;
      width: 100%;
      background: var(--color-surface-sunken);
    }
    .hold {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      left: 0;
      background: var(--color-text);
      opacity: 0.7;
    }
    .value {
      min-width: 4.5rem;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      text-align: right;
    }
    .value.clip {
      color: var(--color-danger);
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
