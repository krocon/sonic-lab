import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FrontPanel, targetText } from '../../core/panel/front-panel';

/** Degrees of dial rotation per detent. */
const DETENT = 6;

/**
 * The large MULTI dial: an endless encoder that changes the selected soft-key value (or the
 * page's default). Turned by dragging around its centre, the mouse wheel or the arrow keys.
 * Ribs and finger dimple turn with it; the light on the spun-metal face stays put.
 */
@Component({
  selector: 'app-jog-dial',
  template: `
    <span class="silk" aria-hidden="true">MULTI</span>
    <div
      class="dial"
      role="slider"
      tabindex="0"
      [attr.aria-label]="label()"
      [attr.aria-valuenow]="valueNow()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-disabled]="!panel.multiTarget() || null"
      [style.--a]="angle() + 'deg'"
      (pointerdown)="onPointerDown($event)"
      (wheel)="onWheel($event)"
      (keydown)="onKey($event)"
    >
      <span class="well" aria-hidden="true">
        <span class="layer grip"></span>
        <span class="layer bevel"></span>
        <span class="layer shade"></span>
        <span class="layer chrome"></span>
        <span class="layer face"></span>
        <span class="layer rotor"><i class="dimple"></i></span>
      </span>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 6px;
      user-select: none;
      -webkit-user-select: none;
    }
    .dial {
      position: relative;
      width: 188px;
      aspect-ratio: 1;
      border-radius: 50%;
      touch-action: none;
      cursor: grab;
    }
    .dial:active {
      cursor: grabbing;
    }
    .dial:focus-visible {
      outline-offset: 2px;
    }
    /* recessed well in the plate */
    .well {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(circle closest-side, #000 0 88%, #060607 97%, #16171a 100%);
      box-shadow:
        0 0 0 1px rgb(0 0 0 / 60%),
        0 1px 0 1px rgb(255 255 255 / 6%),
        inset 0 4px 8px rgb(0 0 0 / 95%);
    }
    .layer {
      position: absolute;
      left: 50%;
      top: 50%;
      aspect-ratio: 1;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    /* 72 rubber ribs on the outer band – they move when the dial turns */
    .grip {
      width: 94%;
      transform: translate(-50%, -50%) rotate(var(--a, 0deg));
      transition: transform 90ms ease-out;
      background: repeating-conic-gradient(
        #0b0c0e 0deg,
        #1d1f23 1.2deg,
        #34373d 2.3deg,
        #3b3e44 2.7deg,
        #24272b 3.8deg,
        #0b0c0e 5deg
      );
      -webkit-mask: radial-gradient(circle closest-side, transparent 0 90.5%, #000 91%);
      mask: radial-gradient(circle closest-side, transparent 0 90.5%, #000 91%);
    }
    /* smooth step between grip and chrome ring */
    .bevel {
      width: 94%;
      background: linear-gradient(180deg, #44474d 0%, #1f2124 38%, #101113 62%, #1a1b1e 100%);
      -webkit-mask: radial-gradient(
        circle closest-side,
        transparent 0 86.5%,
        #000 87%,
        #000 90%,
        transparent 90.5%
      );
      mask: radial-gradient(
        circle closest-side,
        transparent 0 86.5%,
        #000 87%,
        #000 90%,
        transparent 90.5%
      );
    }
    /* fixed light on the grip: lit from above, rounded outer edge */
    .shade {
      width: 94%;
      background:
        radial-gradient(
          circle closest-side,
          transparent 0 90%,
          rgb(0 0 0 / 75%) 90.8%,
          transparent 93%,
          transparent 96.5%,
          rgb(0 0 0 / 75%) 100%
        ),
        linear-gradient(
          180deg,
          rgb(255 255 255 / 20%) 0%,
          rgb(255 255 255 / 4%) 30%,
          transparent 52%,
          rgb(0 0 0 / 55%) 100%
        );
      -webkit-mask: radial-gradient(circle closest-side, transparent 0 86.5%, #000 87%);
      mask: radial-gradient(circle closest-side, transparent 0 86.5%, #000 87%);
    }
    .chrome {
      width: 82%;
      background: conic-gradient(
        from 15deg,
        #f6f8fa,
        #8d939a 40deg,
        #2b2e33 95deg,
        #b9bec4 140deg,
        #f3f5f7 168deg,
        #757a81 215deg,
        #26292d 270deg,
        #a3a8ae 320deg,
        #f6f8fa
      );
      -webkit-mask: radial-gradient(
        circle closest-side,
        transparent calc(100% - 3px),
        #000 calc(100% - 2.5px),
        #000 calc(100% - 0.8px),
        transparent 100%
      );
      mask: radial-gradient(
        circle closest-side,
        transparent calc(100% - 3px),
        #000 calc(100% - 2.5px),
        #000 calc(100% - 0.8px),
        transparent 100%
      );
    }
    /* spun-metal face */
    .face {
      width: 80%;
      background:
        radial-gradient(
          circle closest-side,
          rgb(255 255 255 / 95%) 0 1.1%,
          rgb(255 255 255 / 25%) 2%,
          rgb(255 255 255 / 0%) 3.2%
        ),
        repeating-radial-gradient(
          circle closest-side,
          rgb(255 255 255 / 2.5%) 0 1px,
          rgb(0 0 0 / 0%) 1px 2.5px
        ),
        radial-gradient(circle closest-side, #1f2124 0%, #121315 55%, #08090a 100%);
      box-shadow:
        inset 0 0 0 1px #000,
        inset 0 -10px 18px rgb(0 0 0 / 50%),
        inset 0 3px 2px -1px rgb(255 255 255 / 6%);
    }
    /* a narrow beam up to the dimple, a wide cone down to the rim */
    .face::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(
        rgb(208 214 221 / 70%) 0deg,
        rgb(208 214 221 / 18%) 4deg,
        rgb(208 214 221 / 0%) 12deg,
        rgb(0 0 0 / 0%) 158deg,
        rgb(220 225 231 / 22%) 170deg,
        rgb(238 241 245 / 95%) 180deg,
        rgb(220 225 231 / 22%) 190deg,
        rgb(0 0 0 / 0%) 202deg,
        rgb(0 0 0 / 0%) 348deg,
        rgb(208 214 221 / 18%) 356deg,
        rgb(208 214 221 / 70%) 360deg
      );
      -webkit-mask: radial-gradient(
        circle closest-side,
        #000 0%,
        rgb(0 0 0 / 72%) 28%,
        rgb(0 0 0 / 30%) 100%
      );
      mask: radial-gradient(
        circle closest-side,
        #000 0%,
        rgb(0 0 0 / 72%) 28%,
        rgb(0 0 0 / 30%) 100%
      );
    }
    .face::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(
        ellipse 85% 48% at 50% 10%,
        rgb(255 255 255 / 7.5%),
        transparent 72%
      );
    }
    .rotor {
      width: 80%;
      transform: translate(-50%, -50%) rotate(var(--a, 0deg));
      transition: transform 90ms ease-out;
    }
    /* concave and spun like the face: its shading stays fixed while it travels round */
    .dimple {
      position: absolute;
      left: 50%;
      top: 9%;
      width: 30%;
      aspect-ratio: 1;
      margin-left: -15%;
      border-radius: 50%;
      transform: rotate(calc(var(--a, 0deg) * -1));
      transition: transform 90ms ease-out;
      background: radial-gradient(circle at 50% 42%, #070708 0 45%, #121316 75%, #24262a 100%);
      box-shadow:
        inset 0 6px 7px rgb(0 0 0 / 95%),
        inset 0 -2px 2px rgb(255 255 255 / 10%),
        0 -1px 0 rgb(0 0 0 / 85%),
        0 1px 0 rgb(255 255 255 / 10%);
    }
    .dimple::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background:
        radial-gradient(
          ellipse 10% 17% at 50% 64%,
          rgb(245 248 250 / 90%),
          rgb(245 248 250 / 0%) 100%
        ),
        conic-gradient(
          from 0deg at 50% 64%,
          rgb(225 230 236 / 60%) 0deg,
          rgb(225 230 236 / 10%) 7deg,
          transparent 18deg 342deg,
          rgb(225 230 236 / 10%) 353deg,
          rgb(225 230 236 / 60%) 360deg
        ),
        conic-gradient(
          from 180deg at 50% 64%,
          rgb(225 230 236 / 35%) 0deg,
          transparent 14deg 346deg,
          rgb(225 230 236 / 35%) 360deg
        );
      -webkit-mask: radial-gradient(
        circle at 50% 60%,
        #000 0%,
        rgb(0 0 0 / 60%) 30%,
        transparent 50%
      );
      mask: radial-gradient(circle at 50% 60%, #000 0%, rgb(0 0 0 / 60%) 30%, transparent 50%);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JogDial {
  protected readonly panel = inject(FrontPanel);
  /** Visual rotation only – the dial is endless. */
  protected readonly angle = signal(0);

  protected readonly label = computed(() => {
    const t = this.panel.multiTarget();
    return t ? `Multi dial: ${t.name}` : 'Multi dial';
  });
  protected readonly valueNow = computed(() => {
    const t = this.panel.multiTarget();
    if (!t) return 0;
    return t.kind === 'value' ? t.value() : t.options.findIndex((o) => o.value === t.value());
  });
  protected readonly valueText = computed(() => {
    const t = this.panel.multiTarget();
    return t ? targetText(t) : 'not used in this mode';
  });

  turn(steps: number): void {
    if (steps === 0) return;
    this.angle.update((a) => a + steps * DETENT);
    this.panel.turnMulti(steps);
  }

  protected onPointerDown(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture?.(event.pointerId);
    el.focus();
    const angleOf = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    let last = angleOf(event);
    let degrees = 0;
    const move = (e: PointerEvent) => {
      const a = angleOf(e);
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      else if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      degrees += (d * 180) / Math.PI;
      const steps = Math.trunc(degrees / DETENT);
      if (steps) {
        degrees -= steps * DETENT;
        this.turn(steps);
      }
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
    if (event.deltaY !== 0) this.turn(event.deltaY < 0 ? 1 : -1);
  }

  protected onKey(event: KeyboardEvent): void {
    const steps: Partial<Record<string, number>> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    const s = steps[event.key];
    if (s === undefined) return;
    event.preventDefault();
    this.turn(s);
  }
}
