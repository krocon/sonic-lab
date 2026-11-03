export type WindowKind = 'hann' | 'blackman-harris';

/** Window coefficients (periodic form, suited for spectral analysis). */
export function makeWindow(kind: WindowKind, size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const x = (2 * Math.PI * i) / size;
    w[i] =
      kind === 'hann'
        ? 0.5 - 0.5 * Math.cos(x)
        : 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x);
  }
  return w;
}

/** Mean of the coefficients – divides out of a windowed sine's amplitude. */
export function coherentGain(window: Float64Array): number {
  let sum = 0;
  for (const v of window) sum += v;
  return sum / window.length;
}
