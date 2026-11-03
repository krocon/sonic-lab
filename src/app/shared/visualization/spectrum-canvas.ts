import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Peak, SpectrumAnalyzer } from '../../audio/dsp/spectrum';
import { animationLoop, cssVar } from './animation-loop';
import { CANVAS_HOST_STYLES, canvasSurface, formatHz, frequencyToX } from './canvas-surface';

const GRID_HZ = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

/** Magnitude spectrum with axes, optional peak hold and peak marker. */
@Component({
  selector: 'app-spectrum-canvas',
  template: '<canvas #canvas></canvas>',
  styles: CANVAS_HOST_STYLES,
  host: { role: 'img', 'aria-label': 'Frequency spectrum' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpectrumCanvas {
  readonly analyzer = input.required<SpectrumAnalyzer>();
  readonly log = input(true);
  readonly minDb = input(-100);
  readonly maxDb = input(0);
  readonly minHz = input(20);
  readonly maxHz = input(20000);
  readonly peakHold = input(false);
  readonly marker = input<Peak | null>(null);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private lastVersion = -1;
  private frame = 0;
  private colors = {
    line: '#38bdf8',
    hold: '#f59e0b',
    grid: 'rgba(127,127,127,.2)',
    text: '#888',
    mark: '#2dd4bf',
  };

  constructor() {
    canvasSurface(
      () => this.canvas(),
      () => (this.lastVersion = -1),
    );
    animationLoop(() => this.draw());
  }

  private draw(): void {
    const a = this.analyzer();
    if (this.frame++ % 60 === 0) {
      this.colors = {
        line: cssVar(this.host, '--color-signal', '#38bdf8'),
        hold: cssVar(this.host, '--color-mark', '#f59e0b'),
        grid: cssVar(this.host, '--color-grid', 'rgba(127,127,127,.2)'),
        text: cssVar(this.host, '--color-text-subtle', '#888'),
        mark: cssVar(this.host, '--color-accent', '#2dd4bf'),
      };
      this.lastVersion = -1;
    }
    if (a.version === this.lastVersion) return;
    this.lastVersion = a.version;
    const c = this.canvas().nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { width, height } = c;
    const dpr = window.devicePixelRatio || 1;
    const log = this.log();
    const minHz = this.minHz();
    const maxHz = Math.min(this.maxHz(), a.sampleRate / 2);
    const minDb = this.minDb();
    const maxDb = this.maxDb();
    const y = (db: number) => ((maxDb - db) / (maxDb - minDb)) * height;
    const x = (f: number) => frequencyToX(f, minHz, maxHz, width, log);

    ctx.clearRect(0, 0, width, height);
    ctx.font = `${10 * dpr}px system-ui, sans-serif`;
    ctx.fillStyle = this.colors.text;
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of GRID_HZ.filter((f) => f >= minHz && f <= maxHz)) {
      const gx = Math.round(x(f)) + 0.5;
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.fillText(formatHz(f), gx + 3 * dpr, height - 4 * dpr);
    }
    for (let db = Math.ceil(maxDb / 20) * 20; db > minDb; db -= 20) {
      const gy = Math.round(y(db)) + 0.5;
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.fillText(`${db} dB`, 3 * dpr, gy - 3 * dpr);
    }
    ctx.stroke();

    const binHz = a.sampleRate / a.options.size;
    const path = (data: Float32Array, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25 * dpr;
      ctx.beginPath();
      // one point per pixel column: max of the bins that fall into it
      let lastX = -1;
      let colMax = -Infinity;
      let first = true;
      const k0 = Math.max(1, Math.floor(minHz / binHz));
      const k1 = Math.min(data.length - 1, Math.ceil(maxHz / binHz));
      for (let k = k0; k <= k1; k++) {
        const px = Math.round(x(k * binHz));
        colMax = Math.max(colMax, data[k] ?? minDb);
        if (px !== lastX || k === k1) {
          const py = y(Math.max(minDb, colMax));
          if (first) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
          first = false;
          lastX = px;
          colMax = -Infinity;
        }
      }
      ctx.stroke();
    };
    if (this.peakHold()) path(a.peakHold, this.colors.hold);
    path(a.db, this.colors.line);

    const m = this.marker();
    if (m && m.frequency >= minHz && m.frequency <= maxHz) {
      const mx = x(m.frequency);
      const my = y(m.db);
      ctx.fillStyle = this.colors.mark;
      ctx.beginPath();
      ctx.arc(mx, my, 4 * dpr, 0, 2 * Math.PI);
      ctx.fill();
      const label = `${m.frequency.toFixed(1)} Hz · ${m.db.toFixed(1)} dB`;
      ctx.fillText(
        label,
        Math.min(mx + 8 * dpr, width - ctx.measureText(label).width - 4 * dpr),
        Math.max(14 * dpr, my - 8 * dpr),
      );
    }
  }
}
