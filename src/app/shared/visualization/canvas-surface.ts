import { DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Keeps a canvas at the host's size × devicePixelRatio and reports resizes. Use from a component
 * constructor; `draw` receives the 2D context (or is skipped where canvas is unavailable).
 */
export function canvasSurface(
  canvas: () => ElementRef<HTMLCanvasElement>,
  onResize: () => void,
): void {
  const host = inject(ElementRef).nativeElement as HTMLElement;
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const resize = () => {
      const c = canvas().nativeElement;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(host.clientWidth * dpr));
      c.height = Math.max(1, Math.round(host.clientHeight * dpr));
      onResize();
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    destroyRef.onDestroy(() => observer.disconnect());
  });
}

export const CANVAS_HOST_STYLES = `
  :host { display: block; position: relative; min-height: 4rem; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
`;

/** Maps a frequency to x on a linear or logarithmic axis. */
export function frequencyToX(
  f: number,
  minHz: number,
  maxHz: number,
  width: number,
  log: boolean,
): number {
  if (log) return (Math.log(Math.max(f, minHz) / minHz) / Math.log(maxHz / minHz)) * width;
  return ((f - minHz) / (maxHz - minHz)) * width;
}

export function xToFrequency(
  x: number,
  minHz: number,
  maxHz: number,
  width: number,
  log: boolean,
): number {
  return log ? minHz * Math.pow(maxHz / minHz, x / width) : minHz + (x / width) * (maxHz - minHz);
}

export function formatHz(f: number): string {
  return f >= 1000 ? `${+(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`;
}
