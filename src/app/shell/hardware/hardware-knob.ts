import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FrontPanel, PanelValue } from '../../core/panel/front-panel';
import { fromPosition, toAngle, toPosition } from '../../core/panel/panel-scale';

/** Pixels of vertical drag for the full travel (Shift: fine adjustment ×4). */
const DRAG_TRAVEL = 220;

/**
 * One of the three hardware knobs. What it changes depends on the page ({@link PanelValue});
 * without a function it stays in place and is hidden from assistive technology. Operated by
 * dragging (up = more), the mouse wheel or the keyboard (arrows, Page Up/Down, Home/End).
 */
@Component({
  selector: 'app-hardware-knob',
  template: `
    <span class="silk" aria-hidden="true">{{ legend() }}</span>
    @if (control(); as c) {
      <div
        class="knob"
        role="slider"
        tabindex="0"
        [attr.aria-label]="c.name"
        [attr.aria-valuemin]="c.scale().min"
        [attr.aria-valuemax]="c.scale().max"
        [attr.aria-valuenow]="c.value()"
        [attr.aria-valuetext]="c.format(c.value())"
        [attr.aria-disabled]="c.disabled?.() || null"
        (pointerdown)="onPointerDown($event, c)"
        (wheel)="onWheel($event, c)"
        (keydown)="onKey($event, c)"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    } @else {
      <div class="knob idle" aria-hidden="true"><ng-container [ngTemplateOutlet]="body" /></div>
    }
    <ng-template #body>
      <span class="face">
        <span class="rotor" [style.transform]="rotation()"><i class="mark"></i></span>
      </span>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 6px;
      user-select: none;
      -webkit-user-select: none;
    }
    .knob {
      position: relative;
      width: 84px;
      aspect-ratio: 66 / 60;
      border-radius: 50%;
      touch-action: none;
      cursor: ns-resize;
    }
    .knob.idle {
      cursor: default;
    }
    .knob:focus-visible {
      outline-offset: 0;
    }
    /* silver travel arc around the knob */
    .knob::before {
      content: '';
      position: absolute;
      left: 50.8%;
      top: 45%;
      width: 88%;
      aspect-ratio: 1;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: conic-gradient(from -112deg, #d9dce0 0 224deg, transparent 0);
      -webkit-mask: radial-gradient(circle, transparent 67%, #000 68%, #000 71%, transparent 72%);
      mask: radial-gradient(circle, transparent 67%, #000 68%, #000 71%, transparent 72%);
    }
    /* knurled skirt */
    .face {
      position: absolute;
      left: 50.8%;
      top: 45%;
      width: 74%;
      aspect-ratio: 1;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background:
        radial-gradient(circle, transparent 60%, rgb(0 0 0 / 60%) 61%, transparent 64%),
        repeating-conic-gradient(#0a0a0b 0 5deg, #26282c 5deg 7deg, #0a0a0b 7deg 10deg);
      box-shadow:
        0 0 0 1px #000,
        0 6px 10px rgb(0 0 0 / 70%),
        inset 0 1px 1px rgb(255 255 255 / 15%);
    }
    /* light on the cap stays put while the cap turns */
    .face::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      width: 66%;
      aspect-ratio: 1;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(
        circle at 42% 28%,
        rgb(255 255 255 / 22%),
        rgb(255 255 255 / 5%) 35%,
        transparent 60%
      );
      pointer-events: none;
    }
    .rotor {
      position: absolute;
      inset: 17%;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 50%, #2c2f34, #1a1b1e 70%, #0f1012);
      box-shadow:
        0 0 0 1px #000,
        0 3px 5px rgb(0 0 0 / 80%);
      transition: transform var(--duration-fast) var(--easing);
    }
    .mark {
      position: absolute;
      left: 50%;
      top: 7%;
      width: 3px;
      height: 18%;
      margin-left: -1.5px;
      border-radius: 2px;
      background: #f2f2f2;
      box-shadow: 0 0 2px rgb(0 0 0 / 90%);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HardwareKnob {
  /** Silkscreen legend, e.g. "TONE". */
  readonly legend = input.required<string>();
  readonly control = input<PanelValue | null>(null);
  private readonly panel = inject(FrontPanel);

  protected readonly rotation = computed(() => {
    const c = this.control();
    return `rotate(${c ? toAngle(c.value(), c.scale()) : 0}deg)`;
  });

  protected onPointerDown(event: PointerEvent, c: PanelValue): void {
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture?.(event.pointerId);
    el.focus();
    const startY = event.clientY;
    const startPos = toPosition(c.value(), c.scale());
    const move = (e: PointerEvent) => {
      const travel = DRAG_TRAVEL * (e.shiftKey ? 4 : 1);
      this.panel.setValue(c, fromPosition(startPos + (startY - e.clientY) / travel, c.scale()));
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

  protected onWheel(event: WheelEvent, c: PanelValue): void {
    event.preventDefault();
    if (event.deltaY !== 0) this.panel.step(c, event.deltaY < 0 ? 1 : -1, false, event.shiftKey);
  }

  protected onKey(event: KeyboardEvent, c: PanelValue): void {
    const s = c.scale();
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        this.panel.step(c, 1, false, event.shiftKey);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        this.panel.step(c, -1, false, event.shiftKey);
        break;
      case 'PageUp':
        this.panel.step(c, 1, false, true);
        break;
      case 'PageDown':
        this.panel.step(c, -1, false, true);
        break;
      case 'Home':
        this.panel.setValue(c, s.min);
        break;
      case 'End':
        this.panel.setValue(c, s.max);
        break;
      default:
        return;
    }
    event.preventDefault();
  }
}
