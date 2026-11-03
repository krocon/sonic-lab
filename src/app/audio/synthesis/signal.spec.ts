import { createRandom } from './random';
import { keyedEnvelope, mix, render, tone, whiteNoise } from './signal';

describe('synthesis', () => {
  it('produces a deterministic PRNG sequence', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('renders a phase-continuous sine across block boundaries', () => {
    const gen = tone({ frequency: 440, amplitude: 1 });
    const whole = render(gen, 0.01, 48000);
    const a = new Float32Array(240);
    const b = new Float32Array(240);
    gen(a, 0, 48000);
    gen(b, 240, 48000);
    expect(Array.from(b)).toEqual(Array.from(whole.subarray(240, 480)));
  });

  it('shapes keyed spans with ramps', () => {
    const spans = [{ start: 0.1, end: 0.2 }];
    expect(keyedEnvelope(spans, 0.05, 0.005)).toBe(0);
    expect(keyedEnvelope(spans, 0.15, 0.005)).toBe(1);
    expect(keyedEnvelope(spans, 0.1025, 0.005)).toBeCloseTo(0.5, 5);
    expect(keyedEnvelope(spans, 0.21, 0.005)).toBe(0);
  });

  it('has white noise with the requested RMS', () => {
    const x = render(whiteNoise(0.1, 3), 1, 48000);
    const rms = Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    expect(rms).toBeCloseTo(0.1, 2);
  });

  it('mixes generators', () => {
    const one = (out: Float32Array) => out.fill(0.25);
    const x = render(mix(one, one), 0.001, 8000);
    expect(Array.from(x).every((v) => v === 0.5)).toBe(true);
  });
});
