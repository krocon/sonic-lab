/**
 * In-place radix-2 complex FFT with precomputed twiddles and bit-reversal table.
 * No allocations per transform.
 */
export class FFT {
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reverse: Uint32Array;

  constructor(readonly size: number) {
    if (size < 2 || (size & (size - 1)) !== 0)
      throw new RangeError('FFT size must be a power of two ≥ 2');
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    this.reverse = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reverse[i] = r;
    }
  }

  /** Transforms `re`/`im` (length = size) in place. */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i] ?? 0;
      if (j > i) {
        const tr = re[i] ?? 0;
        re[i] = re[j] ?? 0;
        re[j] = tr;
        const ti = im[i] ?? 0;
        im[i] = im[j] ?? 0;
        im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step] ?? 0;
          const wi = this.sin[k * step] ?? 0;
          const a = start + k;
          const b = a + half;
          const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
          const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
          re[b] = (re[a] ?? 0) - xr;
          im[b] = (im[a] ?? 0) - xi;
          re[a] = (re[a] ?? 0) + xr;
          im[a] = (im[a] ?? 0) + xi;
        }
      }
    }
  }
}
