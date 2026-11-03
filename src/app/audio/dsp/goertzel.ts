/**
 * Amplitude of the sine at `frequency` in `samples` (Goertzel algorithm, rectangular window).
 * Reference implementation – the decoders use unrolled, windowed banks of the same recurrence.
 */
export function goertzel(
  samples: Float32Array | Float64Array,
  frequency: number,
  sampleRate: number,
): number {
  const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  for (const x of samples) {
    const s0 = x + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2))) / samples.length;
}
