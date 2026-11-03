import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { KNOB_SWEEP, KnobScale, fromPosition, nudge, toAngle, toPosition } from './knob-math';

let nextId = 0;
const TICKS = Array.from({ length: 11 }, (_, i) => -KNOB_SWEEP / 2 + (i * KNOB_SWEEP) / 10);
/** Radius of the scale arc in the 100 × 100 scale box; its circumference drives the dash array. */
const ARC_RADIUS = 41;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS;
const SWEEP_LENGTH = (ARC_LENGTH * KNOB_SWEEP) / 360;
/** Pixels of vertical drag for the full travel (Shift: fine adjustment ×4). */
const DRAG_TRAVEL = 220;

export type KnobVariant = 'knob' | 'dial';

/**
 * Rotary control: a machined knob (or a large tuning dial with a finger dimple) inside a lit scale
 * arc, operated by dragging (up = more), the mouse wheel or the keyboard (arrows, Page Up/Down,
 * Home/End); double-click restores the default. Exposed to assistive technology as a slider with
 * value text.
 */
@Component({
  selector: 'app-knob',
  template: `
    <span class="label" [id]="labelId">{{ label() }}</span>
    <div
      class="knob"
      [class.dial]="variant() === 'dial'"
      role="slider"
      tabindex="0"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuetext]="text()"
      [attr.aria-labelledby]="labelId"
      [style.--size.px]="size()"
      (pointerdown)="onPointerDown($event)"
      (wheel)="onWheel($event)"
      (keydown)="onKey($event)"
      (dblclick)="reset()"
    >
      <svg class="scale" viewBox="-50 -50 100 100" aria-hidden="true">
        @for (t of ticks; track t) {
          <line
            [attr.transform]="'rotate(' + t + ')'"
            x1="0"
            y1="-49.5"
            x2="0"
            [attr.y2]="$first || $last ? -44 : -46"
            [class.lit]="t <= angle() + 0.01"
          />
        }
        <!-- the arc starts at the minimum (−135° from 12 o'clock = 135° in SVG terms) -->
        <g transform="rotate(135)">
          <circle class="track" [attr.r]="arcRadius" [attr.stroke-dasharray]="track" />
          <circle class="arc" [attr.r]="arcRadius" [attr.stroke-dasharray]="arc()" />
        </g>
      </svg>
      <div class="body">
        <div class="rotor" [style.transform]="rotation()"></div>
        <div class="cap"></div>
        <div class="index" [style.transform]="rotation()"><span class="pointer"></span></div>
      </div>
    </div>
    <span class="value">{{ text() }}</span>
  `,
  styles: `
    :host {
      display: inline-grid;
      justify-items: center;
      align-content: start;
      gap: 2px;
      user-select: none;
      -webkit-user-select: none;
    }
    .label {
      font-size: var(--text-2xs);
      font-weight: var(--weight-bold);
      letter-spacing: var(--tracking-caps);
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--silkscreen);
      text-shadow: var(--silkscreen-shadow);
    }
    .knob {
      --size: 64px;
      position: relative;
      width: calc(var(--size) * 1.4);
      height: calc(var(--size) * 1.4);
      border-radius: 50%;
      cursor: ns-resize;
      touch-action: none;
    }
    .knob:focus-visible {
      outline-offset: -2px;
    }

    /* scale: tick marks and an arc that lights up to the current value */
    .scale {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .scale line {
      stroke: #5d646d;
      stroke-width: 1.6;
      stroke-linecap: round;
    }
    .scale line.lit {
      stroke: var(--silkscreen);
    }
    .scale circle {
      fill: none;
      stroke-width: 2.6;
      stroke-linecap: round;
    }
    .track {
      stroke: #050607;
    }
    .arc {
      stroke: var(--color-accent);
      filter: drop-shadow(0 0 2px rgb(61 155 255 / 80%));
    }

    /* knob body: knurled skirt (turns), machined cap (light stays put), index (turns) */
    .body {
      position: absolute;
      inset: calc(var(--size) * 0.2);
      border-radius: 50%;
      /* light from the top left: the knob casts its shadow down and to the right */
      box-shadow:
        0 0 0 1px #000,
        calc(var(--size) * 0.03) calc(var(--size) * 0.05) calc(var(--size) * 0.06) rgb(0 0 0 / 70%),
        calc(var(--size) * 0.09) calc(var(--size) * 0.15) calc(var(--size) * 0.18) rgb(0 0 0 / 65%);
    }
    .rotor,
    .cap,
    .index {
      position: absolute;
      border-radius: 50%;
    }
    .rotor {
      inset: 0;
      background:
        radial-gradient(circle at 50% 8%, rgb(255 255 255 / 22%), transparent 55%),
        repeating-conic-gradient(#08090a 0deg 4deg, #4a5058 5deg 6deg, #08090a 7deg 10deg);
    }
    .cap {
      inset: 13%;
      background:
        radial-gradient(circle at 50% 28%, rgb(255 255 255 / 14%), transparent 58%),
        conic-gradient(
          from 15deg,
          #16181b,
          #4b5159 12%,
          #191b1f 25%,
          #3c4148 38%,
          #141619 50%,
          #4b5159 62%,
          #191b1f 75%,
          #3c4148 88%,
          #16181b
        );
      box-shadow:
        inset 0 1px 1px rgb(255 255 255 / 28%),
        inset 0 -2px 4px rgb(0 0 0 / 70%),
        0 0 0 1px rgb(0 0 0 / 90%),
        0 2px 4px rgb(0 0 0 / 60%);
    }
    .index {
      inset: 0;
      pointer-events: none;
    }
    .pointer {
      position: absolute;
      left: 50%;
      top: 15%;
      width: 3px;
      height: 25%;
      margin-left: -1.5px;
      border-radius: 2px;
      background: #f1f3f5;
      box-shadow: 0 0 3px rgb(255 255 255 / 45%);
    }

    /* tuning dial: ribbed rubber ring around a spun-metal disc with a finger dimple */
    .dial .rotor {
      background:
        radial-gradient(circle at 50% 8%, rgb(255 255 255 / 16%), transparent 55%),
        repeating-conic-gradient(#060708 0deg 1.5deg, #2c3036 2deg 2.5deg, #060708 3deg 4deg);
    }
    .dial .cap {
      inset: 13%;
      /* concentric turning grooves over a bow-tie reflection, as on spun aluminium */
      background:
        repeating-radial-gradient(circle, rgb(255 255 255 / 3%) 0 1px, transparent 1px 3px),
        conic-gradient(
          from 0deg,
          #111214,
          #3e4146 9%,
          #141518 20%,
          #0e0f11 32%,
          #2d3034 43%,
          #111214 50%,
          #3e4146 59%,
          #141518 70%,
          #0e0f11 82%,
          #2d3034 93%,
          #111214
        );
      box-shadow:
        inset 0 1px 1px rgb(255 255 255 / 22%),
        inset 0 -2px 4px rgb(0 0 0 / 70%),
        0 0 0 1px #000,
        0 0 0 3px rgb(0 0 0 / 35%);
    }
    .dial .pointer {
      top: 15%;
      width: 24%;
      height: 24%;
      margin-left: -12%;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 30%, #07080a, #24272c);
      box-shadow:
        inset 0 3px 5px rgb(0 0 0 / 90%),
        0 1px 0 rgb(255 255 255 / 12%);
    }
    .dial .index::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 3%;
      width: 4px;
      height: 4px;
      margin-left: -2px;
      border-radius: 50%;
      background: var(--color-accent-strong);
      box-shadow: 0 0 4px var(--color-accent);
    }

    .value {
      min-width: 5.5rem;
      margin-top: 2px;
      padding: 1px var(--space-2);
      border-radius: var(--radius-sm);
      background-color: var(--display-bg);
      box-shadow: var(--display-inset);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--display-value);
      text-shadow: var(--display-glow);
      text-align: center;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Knob {
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly log = input(false);
  readonly label = input.required<string>();
  readonly unit = input('');
  /** Custom value text (display and screen readers); default: value and unit. */
  readonly format = input<((value: number) => string) | null>(null);
  /** Value restored on double-click. */
  readonly defaultValue = input<number | null>(null);
  /** Diameter of the knob body in pixels; the scale adds 40 %. */
  readonly size = input(64);
  readonly variant = input<KnobVariant>('knob');
  readonly valueChange = output<number>();

  protected readonly labelId = `knob-label-${nextId++}`;
  protected readonly ticks = TICKS;
  protected readonly arcRadius = ARC_RADIUS;
  protected readonly track = `${SWEEP_LENGTH} ${ARC_LENGTH}`;
  private readonly scale = computed<KnobScale>(() => ({
    min: this.min(),
    max: this.max(),
    step: this.step(),
    log: this.log(),
  }));
  protected readonly angle = computed(() => toAngle(this.value(), this.scale()));
  protected readonly rotation = computed(() => `rotate(${this.angle()}deg)`);
  protected readonly arc = computed(
    () => `${toPosition(this.value(), this.scale()) * SWEEP_LENGTH} ${ARC_LENGTH}`,
  );
  protected readonly text = computed(() => {
    const format = this.format();
    if (format) return format(this.value());
    return `${this.value()}${this.unit() ? ' ' + this.unit() : ''}`;
  });

  protected onPointerDown(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture?.(event.pointerId);
    el.focus();
    const startY = event.clientY;
    const startPos = toPosition(this.value(), this.scale());
    const move = (e: PointerEvent) => {
      const travel = DRAG_TRAVEL * (e.shiftKey ? 4 : 1);
      this.emit(fromPosition(startPos + (startY - e.clientY) / travel, this.scale()));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY === 0) return;
    this.emit(nudge(this.value(), this.scale(), event.deltaY < 0 ? 1 : -1, event.shiftKey));
  }

  protected onKey(event: KeyboardEvent): void {
    const s = this.scale();
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = nudge(this.value(), s, 1, event.shiftKey);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = nudge(this.value(), s, -1, event.shiftKey);
        break;
      case 'PageUp':
        next = nudge(this.value(), s, 1, true);
        break;
      case 'PageDown':
        next = nudge(this.value(), s, -1, true);
        break;
      case 'Home':
        next = s.min;
        break;
      case 'End':
        next = s.max;
        break;
    }
    if (next === null) return;
    event.preventDefault();
    this.emit(next);
  }

  protected reset(): void {
    const d = this.defaultValue();
    if (d !== null) this.emit(d);
  }

  private emit(v: number): void {
    if (v !== this.value()) this.valueChange.emit(v);
  }
}
