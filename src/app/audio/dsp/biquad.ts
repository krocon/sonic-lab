/** Direct-form-II-transposed biquad section (RBJ cookbook coefficients). */
export class Biquad {
  private z1 = 0;
  private z2 = 0;

  private constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}

  static lowpass(cutoff: number, sampleRate: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * cutoff) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    return new Biquad(
      (1 - cos) / 2 / a0,
      (1 - cos) / a0,
      (1 - cos) / 2 / a0,
      (-2 * cos) / a0,
      (1 - alpha) / a0,
    );
  }

  /** Two cascaded sections forming a 4th-order Butterworth low-pass. */
  static butterworth4(cutoff: number, sampleRate: number): [Biquad, Biquad] {
    return [Biquad.lowpass(cutoff, sampleRate, 0.5412), Biquad.lowpass(cutoff, sampleRate, 1.3066)];
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  reset(): void {
    this.z1 = this.z2 = 0;
  }
}
