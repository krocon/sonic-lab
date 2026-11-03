import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { SpectrumAnalyzer } from '../../audio/dsp/spectrum';
import { animationLoop } from './animation-loop';
import { CANVAS_HOST_STYLES, canvasSurface, xToFrequency } from './canvas-surface';

/** Perceptually ordered colour map (dark blue → teal → yellow), independent of the theme. */
const STOPS: readonly [number, number, number][] = [
  [8, 13, 18],
  [30, 41, 120],
  [20, 120, 160],
  [45, 212, 191],
  [250, 220, 70],
  [255, 255, 255],
];
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const p = (i / 255) * (STOPS.length - 1);
    const a = STOPS[Math.floor(p)] ?? [0, 0, 0];
    const b = STOPS[Math.min(STOPS.length - 1, Math.floor(p) + 1)] ?? a;
    const t = p - Math.floor(p);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = (a[c] ?? 0) + ((b[c] ?? 0) - (a[c] ?? 0)) * t;
  }
  return lut;
})();

/** Scrolling waterfall: time runs left → right, frequency bottom → top. */
@Component({
  selector: 'app-spectrogram-canvas',
  template: '<canvas #canvas></canvas>',
  styles: CANVAS_HOST_STYLES,
  host: { role: 'img', 'aria-label': 'Spectrogram' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpectrogramCanvas {
  readonly analyzer = input.required<SpectrumAnalyzer>();
  readonly log = input(true);
  readonly minDb = input(-100);
  readonly maxDb = input(0);
  readonly minHz = input(20);
  readonly maxHz = input(20000);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private lastVersion = -1;
  private column: ImageData | null = null;
  private rowBins = new Int32Array(0);

  constructor() {
    canvasSurface(
      () => this.canvas(),
      () => {
        this.column = null;
        this.canvas().nativeElement.getContext('2d')?.clearRect(0, 0, 1e5, 1e5);
      },
    );
    animationLoop(() => this.draw());
  }

  private draw(): void {
    const a = this.analyzer();
    if (a.version === this.lastVersion) return;
    const steps = Math.min(8, a.version - this.lastVersion);
    this.lastVersion = a.version;
    const c = this.canvas().nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { width, height } = c;
    const maxHz = Math.min(this.maxHz(), a.sampleRate / 2);
    if (!this.column || this.column.height !== height || this.rowBins.length !== height) {
      this.column = ctx.createImageData(1, height);
      const binHz = a.sampleRate / a.options.size;
      this.rowBins = Int32Array.from({ length: height }, (_, row) =>
        Math.round(xToFrequency(height - 1 - row, this.minHz(), maxHz, height, this.log()) / binHz),
      );
    }
    // scroll left by the number of new frames (max 8 per animation frame)
    ctx.drawImage(c, -steps, 0);
    const data = this.column.data;
    const range = this.maxDb() - this.minDb();
    for (let row = 0; row < height; row++) {
      const v = a.db[this.rowBins[row] ?? 0] ?? this.minDb();
      const idx = Math.max(0, Math.min(255, Math.round(((v - this.minDb()) / range) * 255))) * 3;
      data[row * 4] = LUT[idx] ?? 0;
      data[row * 4 + 1] = LUT[idx + 1] ?? 0;
      data[row * 4 + 2] = LUT[idx + 2] ?? 0;
      data[row * 4 + 3] = 255;
    }
    for (let s = 0; s < steps; s++) ctx.putImageData(this.column, width - steps + s, 0);
  }
}
