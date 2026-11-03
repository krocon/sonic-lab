import { DestroyRef, afterNextRender, inject } from '@angular/core';

/**
 * Runs `draw` on every animation frame while the component lives. Drawing happens outside
 * signals/change detection; browsers pause rAF in hidden tabs automatically.
 */
export function animationLoop(draw: (time: number) => void): void {
  let handle = 0;
  let stopped = false;
  const tick = (time: number) => {
    if (stopped) return;
    draw(time);
    handle = requestAnimationFrame(tick);
  };
  afterNextRender(() => {
    if (!stopped && typeof requestAnimationFrame === 'function')
      handle = requestAnimationFrame(tick);
  });
  inject(DestroyRef).onDestroy(() => {
    stopped = true;
    if (handle) cancelAnimationFrame(handle);
  });
}

/** Reads a CSS custom property from an element (theme-aware colors for canvas drawing). */
export function cssVar(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}
