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
import { RingBuffer } from '../../audio/ring-buffer';
import { animationLoop, cssVar } from './animation-loop';

/**
 * Oscilloscope-style waveform of the latest samples in a {@link RingBuffer}.
 * Draws min/max per pixel column, so long windows stay readable and cheap.
 */
@Component({
  selector: 'app-waveform-canvas',
  template: '<canvas #canvas></canvas>',
  styles: `
    :host {
      display: block;
      position: relative;
      min-height: 6rem;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
  `,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaveformCanvas {
  readonly buffer = input.required<RingBuffer>();
  /** Number of most recent samples shown. */
  readonly windowSize = input(4096);
  readonly label = input('Live waveform');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private scratch = new Float32Array(0);
  private lastWritten = -1;
  private colors = { line: '#38bdf8', axis: 'rgba(127,127,127,.3)' };
  private frameCount = 0;
  private dirty = true;

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      this.resize();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.host);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
    animationLoop(() => this.draw());
  }

  private resize(): void {
    const canvas = this.canvas().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(this.host.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(this.host.clientHeight * dpr));
    this.dirty = true;
  }

  private draw(): void {
    const buffer = this.buffer();
    if (this.frameCount++ % 60 === 0) {
      this.colors = {
        line: cssVar(this.host, '--display-trace', '#6dffa0'),
        axis: cssVar(this.host, '--display-grid-strong', 'rgba(120,200,150,.3)'),
      };
      this.dirty = true;
    }
    if (!this.dirty && buffer.totalWritten === this.lastWritten) return;
    this.lastWritten = buffer.totalWritten;
    this.dirty = false;

    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const n = this.windowSize();
    if (this.scratch.length !== n) this.scratch = new Float32Array(n);
    buffer.readLatest(this.scratch);

    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    ctx.fillStyle = this.colors.axis;
    ctx.fillRect(0, Math.floor(mid), width, 1);

    ctx.fillStyle = this.colors.line;
    ctx.shadowColor = this.colors.line;
    ctx.shadowBlur = 6;
    const perColumn = n / width;
    for (let x = 0; x < width; x++) {
      const from = Math.floor(x * perColumn);
      const to = Math.max(from + 1, Math.floor((x + 1) * perColumn));
      let min = 1;
      let max = -1;
      for (let i = from; i < to; i++) {
        const s = this.scratch[i] ?? 0;
        if (s < min) min = s;
        if (s > max) max = s;
      }
      const y1 = mid - max * mid * 0.95;
      const y2 = mid - min * mid * 0.95;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    ctx.shadowBlur = 0;
  }
}
