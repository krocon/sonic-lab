import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TimeSeries } from '../../audio/time-series';
import { animationLoop, cssVar } from './animation-loop';
import { CANVAS_HOST_STYLES, canvasSurface } from './canvas-surface';

/** Line chart of a {@link TimeSeries} over the last `seconds`, y from `min` to `max`. */
@Component({
  selector: 'app-history-canvas',
  template: '<canvas #canvas></canvas>',
  styles: CANVAS_HOST_STYLES,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryCanvas {
  readonly series = input.required<TimeSeries>();
  readonly seconds = input(10);
  readonly min = input(0);
  readonly max = input(1);
  /** Use a logarithmic y axis (e.g. for frequencies). */
  readonly log = input(false);
  readonly unit = input('');
  readonly color = input('--color-signal');
  readonly label = input('History');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private lastVersion = -1;
  private frame = 0;
  private colors = { line: '#38bdf8', grid: 'rgba(127,127,127,.2)', text: '#888' };

  constructor() {
    canvasSurface(
      () => this.canvas(),
      () => (this.lastVersion = -1),
    );
    animationLoop(() => this.draw());
  }

  private draw(): void {
    const s = this.series();
    if (this.frame++ % 60 === 0) {
      this.colors = {
        line: cssVar(this.host, this.color(), '#38bdf8'),
        grid: cssVar(this.host, '--color-grid', 'rgba(127,127,127,.2)'),
        text: cssVar(this.host, '--color-text-subtle', '#888'),
      };
      this.lastVersion = -1;
    }
    if (s.version === this.lastVersion) return;
    this.lastVersion = s.version;
    const c = this.canvas().nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { width, height } = c;
    const dpr = window.devicePixelRatio || 1;
    const now = s.last?.time ?? 0;
    const span = this.seconds();
    const lo = this.min();
    const hi = this.max();
    const log = this.log() && lo > 0;
    const norm = (v: number) => (log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo));
    const y = (v: number) => height - Math.max(0, Math.min(1, norm(v))) * height;

    ctx.clearRect(0, 0, width, height);
    ctx.font = `${10 * dpr}px system-ui, sans-serif`;
    ctx.fillStyle = this.colors.text;
    ctx.fillText(`${hi}${this.unit()}`, 3 * dpr, 12 * dpr);
    ctx.fillText(`${lo}${this.unit()}`, 3 * dpr, height - 4 * dpr);
    ctx.strokeStyle = this.colors.line;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    let pen = false;
    s.forEach((t, v) => {
      if (t < now - span) return;
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      const px = ((t - (now - span)) / span) * width;
      if (pen) ctx.lineTo(px, y(v));
      else ctx.moveTo(px, y(v));
      pen = true;
    });
    ctx.stroke();
  }
}
