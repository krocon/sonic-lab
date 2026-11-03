import { mix, render, tone } from '../synthesis/signal';
import { FFT } from './fft';
import { frequencyToNote } from './note';
import { SpectrumAnalyzer, findPeak, findPeaks } from './spectrum';
import { coherentGain, makeWindow } from './window';

function dft(x: number[]): { re: number[]; im: number[] } {
  const n = x.length;
  const re: number[] = [];
  const im: number[] = [];
  for (let k = 0; k < n; k++) {
    let r = 0;
    let i = 0;
    for (let t = 0; t < n; t++) {
      r += (x[t] ?? 0) * Math.cos((2 * Math.PI * k * t) / n);
      i -= (x[t] ?? 0) * Math.sin((2 * Math.PI * k * t) / n);
    }
    re.push(r);
    im.push(i);
  }
  return { re, im };
}

describe('FFT', () => {
  it('rejects sizes that are not a power of two', () => {
    expect(() => new FFT(12)).toThrow(RangeError);
  });

  it('matches a direct DFT', () => {
    const x = Array.from(
      { length: 16 },
      (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1) + (i % 3) * 0.1,
    );
    const re = Float64Array.from(x);
    const im = new Float64Array(16);
    new FFT(16).transform(re, im);
    const ref = dft(x);
    for (let k = 0; k < 16; k++) {
      expect(re[k]).toBeCloseTo(ref.re[k] ?? 0, 9);
      expect(im[k]).toBeCloseTo(ref.im[k] ?? 0, 9);
    }
  });

  it('satisfies Parseval', () => {
    const n = 1024;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) * Math.cos(i * 0.011));
    const timeEnergy = re.reduce((s, v) => s + v * v, 0);
    const im = new Float64Array(n);
    new FFT(n).transform(re, im);
    let freqEnergy = 0;
    for (let k = 0; k < n; k++) freqEnergy += (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
    expect(freqEnergy / n).toBeCloseTo(timeEnergy, 6);
  });

  it('transforms 4096 points quickly', () => {
    const fft = new FFT(4096);
    const re = new Float64Array(4096).map(() => Math.random());
    const im = new Float64Array(4096);
    const start = performance.now();
    for (let i = 0; i < 100; i++) fft.transform(re, im);
    expect((performance.now() - start) / 100).toBeLessThan(5);
  });
});

describe('windows', () => {
  it('have the expected coherent gains', () => {
    expect(coherentGain(makeWindow('hann', 1024))).toBeCloseTo(0.5, 6);
    expect(coherentGain(makeWindow('blackman-harris', 1024))).toBeCloseTo(0.35875, 5);
  });
});

describe('SpectrumAnalyzer', () => {
  const rate = 48000;

  function analyze(samples: Float32Array, options = {}) {
    const a = new SpectrumAnalyzer(options);
    a.process(samples, rate);
    return a;
  }

  it('reads a full-scale sine at 0 dBFS', () => {
    const a = analyze(render(tone({ frequency: 1500, amplitude: 1 }), 0.5, rate), { averaging: 0 });
    const peak = findPeak(a);
    expect(peak?.db).toBeCloseTo(0, 0);
  });

  for (const f of [50, 440, 1000, 3333, 10000, 20000]) {
    it(`estimates ${f} Hz within ±1 Hz`, () => {
      const a = analyze(render(tone({ frequency: f, amplitude: 0.5 }), 0.5, rate));
      expect(Math.abs((findPeak(a)?.frequency ?? 0) - f)).toBeLessThanOrEqual(1);
    });
  }

  it('shows two peaks for a two-tone signal', () => {
    const a = analyze(
      render(
        mix(tone({ frequency: 700, amplitude: 0.3 }), tone({ frequency: 1900, amplitude: 0.1 })),
        0.5,
        rate,
      ),
    );
    const peaks = findPeaks(a, -60, 2);
    expect(peaks.map((p) => Math.round(p.frequency / 10) * 10).sort((x, y) => x - y)).toEqual([
      700, 1900,
    ]);
  });

  it('holds peaks until reset', () => {
    const a = analyze(render(tone({ frequency: 1000, amplitude: 0.5 }), 0.2, rate));
    a.process(new Float32Array(2 * 48000), rate);
    const bin = Math.round((1000 * 4096) / rate);
    expect(a.peakHold[bin]).toBeGreaterThan(-10);
    expect(a.db[bin]).toBeLessThan(-60);
    a.resetPeaks();
    expect(a.peakHold[bin]).toBe(-100);
  });

  it('finds nothing in silence', () => {
    expect(findPeak(analyze(new Float32Array(8192)))).toBeNull();
  });
});

describe('frequencyToNote', () => {
  it('names notes and cents', () => {
    expect(frequencyToNote(440)).toEqual({ name: 'A4', cents: 0 });
    expect(frequencyToNote(261.63)).toEqual({ name: 'C4', cents: 0 });
    expect(frequencyToNote(452)?.cents).toBe(47);
    expect(frequencyToNote(0)).toBeNull();
  });
});
