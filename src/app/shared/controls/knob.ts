import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { KnobScale, fromPosition, nudge, toAngle, toPosition } from './knob-math';

let nextId = 0;
const TICKS = Array.from({ length: 21 }, (_, i) => -135 + i * 13.5);
/** Pixels of vertical drag for the full travel (Shift: fine adjustment ×4). */
const DRAG_TRAVEL = 220;

/**
 * Rotary knob – a knurled control with a scale ring, operated by dragging (up = more), the mouse
 * wheel or the keyboard (arrows, Page Up/Down, Home/End). Exposed to assistive technology as a
 * slider with value text.
 */
@Component({
  selector: 'app-knob',
  template: `
    <div
      class="knob"
      role="slider"
      tabindex="0"
      [attr.aria-label]="label()"
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
      <svg class="ring" viewBox="-50 -50 100 100" aria-hidden="true">
        @for (t of ticks; track t) {
          <line
            [attr.transform]="'rotate(' + t + ')'"
            x1="0"
            y1="-47"
            x2="0"
            [attr.y2]="t === -135 || t === 0 || t === 135 ? -40 : -43"
            [class.lit]="t <= angle()"
          />
        }
      </svg>
      <div class="cap" [style.transform]="'rotate(' + angle() + 'deg)'">
        <span class="pointer"></span>
      </div>
    </div>
    <span class="label" [id]="labelId">{{ label() }}</span>
    <span class="value">{{ text() }}</span>
  `,
  styles: `
    :host {
      display: inline-grid;
      justify-items: center;
      gap: var(--space-1);
      user-select: none;
    }
    .knob {
      --size: 72px;
      position: relative;
      width: calc(var(--size) + 22px);
      height: calc(var(--size) + 22px);
      border-radius: 50%;
      cursor: ns-resize;
      touch-action: none;
    }
    .knob:focus-visible {
      outline-offset: 0;
    }
    .ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .ring line {
      stroke: var(--color-text-subtle);
      stroke-width: 2;
      stroke-linecap: round;
    }
    .ring line.lit {
      stroke: var(--color-accent);
    }
    .cap {
      position: absolute;
      inset: 11px;
      border-radius: 50%;
      /* knurled rim + brushed top */
      background:
        radial-gradient(circle at 50% 38%, #6b727b 0%, #3a3f45 52%, #23272b 64%, transparent 65%),
        repeating-conic-gradient(#14171a 0deg 5deg, #4d535b 5deg 10deg);
      box-shadow:
        0 4px 8px rgb(0 0 0 / 60%),
        0 1px 0 rgb(255 255 255 / 18%) inset,
        0 0 0 1px #0b0c0e;
    }
    .pointer {
      position: absolute;
      left: 50%;
      top: 9%;
      width: 4px;
      height: 22%;
      margin-left: -2px;
      border-radius: 2px;
      background: var(--color-accent-strong);
      box-shadow: 0 0 4px var(--color-accent);
    }
    .label {
      font-size: var(--text-xs);
      font-weight: var(--weight-bold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-subtle);
      text-shadow: var(--silkscreen-shadow);
    }
    .value {
      min-width: 6.5rem;
      padding: 1px var(--space-2);
      border-radius: var(--radius-sm);
      background-color: var(--display-bg);
      box-shadow: var(--display-inset);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      color: var(--display-amber);
      text-shadow: var(--display-glow-amber);
      text-align: center;
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
  /** Value restored on double-click. */
  readonly defaultValue = input<number | null>(null);
  readonly size = input(72);
  readonly valueChange = output<number>();

  protected readonly labelId = `knob-label-${nextId++}`;
  protected readonly ticks = TICKS;
  private readonly scale = computed<KnobScale>(() => ({
    min: this.min(),
    max: this.max(),
    step: this.step(),
    log: this.log(),
  }));
  protected readonly angle = computed(() => toAngle(this.value(), this.scale()));
  protected readonly text = computed(
    () => `${this.value()}${this.unit() ? ' ' + this.unit() : ''}`,
  );

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
