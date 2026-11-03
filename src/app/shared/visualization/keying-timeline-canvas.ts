import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { KeyingTimeline } from '../../decoders/morse/keying-timeline';
import { animationLoop, cssVar } from './animation-loop';

/** Scrolling key-down/key-up timeline of the last few seconds. */
@Component({
  selector: 'app-keying-timeline-canvas',
  template: '<canvas #canvas></canvas>',
  styles: `
    :host {
      display: block;
      position: relative;
      min-height: 2.5rem;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
  `,
  host: { role: 'img', 'aria-label': 'Key-down and key-up timeline' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyingTimelineCanvas {
  readonly timeline = input.required<KeyingTimeline>();
  /** Visible history in seconds. */
  readonly seconds = input(6);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private lastVersion = -1;
  private frame = 0;
  private color = '#f59e0b';

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const resize = () => {
        const c = this.canvas().nativeElement;
        const dpr = window.devicePixelRatio || 1;
        c.width = Math.max(1, Math.round(this.host.clientWidth * dpr));
        c.height = Math.max(1, Math.round(this.host.clientHeight * dpr));
        this.lastVersion = -1;
      };
      resize();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(resize);
      observer.observe(this.host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    animationLoop(() => this.draw());
  }

  private draw(): void {
    const t = this.timeline();
    if (this.frame++ % 60 === 0) {
      this.color = cssVar(this.host, '--display-value', '#22409e');
      this.lastVersion = -1;
    }
    if (t.version === this.lastVersion) return;
    this.lastVersion = t.version;
    const c = this.canvas().nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { width, height } = c;
    ctx.clearRect(0, 0, width, height);
    const span = this.seconds();
    const from = t.now - span;
    const pad = Math.round(height * 0.25);
    ctx.fillStyle = this.color;
    for (const s of t.visible(from)) {
      const x1 = ((Math.max(s.start, from) - from) / span) * width;
      const x2 = ((s.end - from) / span) * width;
      ctx.fillRect(x1, pad, Math.max(1, x2 - x1), height - 2 * pad);
    }
  }
}
