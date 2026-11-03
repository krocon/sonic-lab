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
 * Moving-coil style VU meter: backlit dial, red zone above −6 dBFS, a needle with ballistics
 * (≈ 300 ms rise/fall). Purely decorative next to the numeric readouts – hidden from assistive
 * technology, which reads the level meter instead.
 */
@Component({
  selector: 'app-analog-meter',
  template: `
    <svg viewBox="-110 -105 220 120" aria-hidden="true">
      <defs>
        <radialGradient id="dial" cx="50%" cy="100%" r="100%">
          <stop offset="0" stop-color="#fff5d6" />
          <stop offset="1" stop-color="#e9cf8a" />
        </radialGradient>
      </defs>
      <rect x="-108" y="-103" width="216" height="116" rx="6" fill="url(#dial)" />
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
      <circle cx="0" cy="8" r="9" class="hub" />
    </svg>
  `,
  styles: `
    /* the backlit dial sits behind a black bezel */
    :host {
      display: block;
      padding: 6px;
      border-radius: var(--radius-sm);
      background: #050506;
      box-shadow:
        inset 0 2px 6px rgb(0 0 0 / 90%),
        0 0 0 1px rgb(255 255 255 / 9%);
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .arc {
      fill: none;
      stroke: #2b2416;
      stroke-width: 2;
    }
    .arc.red {
      stroke: #c0281c;
      stroke-width: 5;
    }
    line {
      stroke: #2b2416;
      stroke-width: 2;
    }
    line.red,
    text.red {
      stroke: #c0281c;
      fill: #c0281c;
    }
    text {
      fill: #2b2416;
      font: 600 10px var(--font-sans);
      text-anchor: middle;
    }
    .unit {
      font-size: 12px;
      letter-spacing: 0.1em;
    }
    .needle line {
      stroke: #111;
      stroke-width: 2;
    }
    .hub {
      fill: #222;
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
