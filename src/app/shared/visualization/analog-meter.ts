import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { LevelMeter, MIN_DBFS } from '../../audio/level';
import { animationLoop } from './animation-loop';

const FLOOR = -40;
const SPAN = 100; // degrees of needle travel
const MARKS = [-40, -20, -10, -6, -3, 0];

/**
 * Angle of the needle for a level in dBFS (−40 … 0 → −50° … +50°). Like a real VU meter the scale
 * is compressed at the bottom and spread at the top (∝ amplitude^½), so −6/−3/0 stay readable.
 */
export function meterAngle(db: number): number {
  const lo = Math.pow(10, FLOOR / 40);
  const p = Math.max(0, Math.min(1, (Math.pow(10, Math.min(0, db) / 40) - lo) / (1 - lo)));
  return -SPAN / 2 + p * SPAN;
}

/**
 * Moving-coil style meter drawn on the OLED: lit scale, red zone above −6 dBFS, a needle with
 * ballistics (≈ 300 ms rise/fall). Purely decorative next to the numeric readouts – hidden from
 * assistive technology, which reads the level meter instead.
 */
@Component({
  selector: 'app-analog-meter',
  template: `
    <svg viewBox="-110 -105 220 120" aria-hidden="true">
      <path d="M -70 -60 A 92 92 0 0 1 70 -60" class="arc" />
      <path d="M 27.7 -87.7 A 92 92 0 0 1 70 -60" class="arc red" />
      @for (m of marks; track m) {
        <g [attr.transform]="'rotate(' + angle(m) + ')'">
          <line x1="0" y1="-92" x2="0" y2="-102" [class.red]="m >= -6" />
          <text x="0" y="-74" [class.red]="m >= -6">{{ m }}</text>
        </g>
      }
      <text x="0" y="-22" class="unit">dBFS</text>
      <g #needle class="needle">
        <line x1="0" y1="8" x2="0" y2="-98" />
      </g>
      <circle cx="0" cy="8" r="7" class="hub" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .arc {
      fill: none;
      stroke: var(--oled-fg);
      stroke-width: 1.5;
    }
    .arc.red {
      stroke: var(--oled-bad);
      stroke-width: 4;
    }
    line {
      stroke: var(--oled-fg);
      stroke-width: 1.5;
    }
    line.red,
    text.red {
      stroke: var(--oled-bad);
      fill: var(--oled-bad);
    }
    text {
      fill: var(--oled-dim);
      stroke: none;
      font: 500 10px var(--font-sans);
      text-anchor: middle;
    }
    .unit {
      font-size: 11px;
      letter-spacing: 0.14em;
    }
    .needle line {
      stroke: var(--oled-hot);
      stroke-width: 2;
      stroke-linecap: round;
      filter: drop-shadow(0 0 3px var(--oled-hot));
    }
    .hub {
      fill: var(--oled-faint);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalogMeter {
  readonly meter = input.required<LevelMeter>();
  readonly active = input(true);
  protected readonly marks = MARKS;
  protected readonly angle = meterAngle;
  private readonly needle = viewChild.required<ElementRef<SVGGElement>>('needle');
  private shown = -SPAN / 2;
  private last = 0;

  constructor() {
    animationLoop((time) => {
      const dt = this.last ? Math.min(0.1, (time - this.last) / 1000) : 0;
      this.last = time;
      const target = meterAngle(this.active() ? this.meter().reading.rmsDb : MIN_DBFS);
      this.shown += (target - this.shown) * (1 - Math.exp(-dt / 0.1));
      this.needle().nativeElement.setAttribute('transform', `rotate(${this.shown.toFixed(2)})`);
    });
  }
}
