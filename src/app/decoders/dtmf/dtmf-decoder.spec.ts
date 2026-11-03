import { createRandom } from '../../audio/synthesis/random';
import { mix, render, tone, whiteNoise } from '../../audio/synthesis/signal';
import { DtmfDecoder } from './dtmf-decoder';
import { dtmfSequence } from './dtmf-tones';

const ALL = '123A456B789C*0#D';

function decode(
  keys: string,
  rate: number,
  opts: Parameters<typeof dtmfSequence>[1] = {},
  noiseRms = 0,
): string {
  const { generator, duration } = dtmfSequence(keys, opts);
  const g = noiseRms ? mix(generator, whiteNoise(noiseRms, 4)) : generator;
  return new DtmfDecoder().decodeAll(render(g, duration, rate), rate);
}

describe('DtmfDecoder', { timeout: 60_000 }, () => {
  for (const rate of [8000, 16000, 44100, 48000]) {
    it(`detects all 16 keys at ${rate} Hz`, () => {
      expect(decode(ALL, rate)).toBe(ALL);
    });
  }

  it('decodes 50 ms tones with 50 ms pauses exactly', () => {
    expect(decode('0123456789*#', 48000, { toneSeconds: 0.05, pauseSeconds: 0.05 })).toBe(
      '0123456789*#',
    );
  });

  it('reports one key per press, including repeated keys', () => {
    expect(decode('5555', 48000, { toneSeconds: 0.3, pauseSeconds: 0.08 })).toBe('5555');
  });

  it('accepts ±1.5 % frequency error and rejects ±3.5 %', () => {
    expect(decode(ALL, 48000, { frequencyError: 0.015 })).toBe(ALL);
    expect(decode(ALL, 48000, { frequencyError: -0.015 })).toBe(ALL);
    expect(decode(ALL, 48000, { frequencyError: 0.035 })).toBe('');
    expect(decode(ALL, 48000, { frequencyError: -0.035 })).toBe('');
  });

  it('accepts twist within limits and rejects beyond', () => {
    expect(decode(ALL, 48000, { twistDb: -7 })).toBe(ALL);
    expect(decode(ALL, 48000, { twistDb: 3 })).toBe(ALL);
    expect(decode(ALL, 48000, { twistDb: -11 })).toBe('');
    expect(decode(ALL, 48000, { twistDb: 7 })).toBe('');
  });

  it('works at 15 dB SNR', () => {
    // tone amplitude 0.3 → power 0.045 each; noise 0.3/√2/10^(15/20) relative to one tone in full band
    expect(decode(ALL, 48000, {}, 0.3 / Math.SQRT2 / Math.pow(10, 15 / 20))).toBe(ALL);
  });

  it('rejects tones shorter than about 25 ms', () => {
    expect(decode('159', 48000, { toneSeconds: 0.02, pauseSeconds: 0.1 })).toBe('');
  });

  it('does not fire on single tones, sweeps, noise or chords', () => {
    const rate = 48000;
    const rand = createRandom(9);
    const chord = mix(
      ...[440, 554, 659, 880, 1100].map((f) => tone({ frequency: f, amplitude: 0.1 })),
    );
    const sweep = (out: Float32Array, start: number, sr: number) => {
      for (let i = 0; i < out.length; i++) {
        const t = (start + i) / sr;
        out[i] = 0.3 * Math.sin(2 * Math.PI * (500 * t + 300 * t * t));
      }
    };
    // speech-like: many harmonics of a moving fundamental with random amplitudes
    const speech = (out: Float32Array, start: number, sr: number) => {
      const amps = Array.from({ length: 20 }, () => rand() * 0.05);
      for (let i = 0; i < out.length; i++) {
        const t = (start + i) / sr;
        const f0 = 120 + 30 * Math.sin(2 * Math.PI * 3 * t);
        let v = 0;
        for (let h = 1; h <= 20; h++) v += (amps[h - 1] ?? 0) * Math.sin(2 * Math.PI * f0 * h * t);
        out[i] = v;
      }
    };
    for (const g of [
      tone({ frequency: 770, amplitude: 0.5 }),
      tone({ frequency: 1336, amplitude: 0.5 }),
      sweep,
      whiteNoise(0.2, 2),
      chord,
      speech,
    ]) {
      expect(new DtmfDecoder().decodeAll(render(g, 3, rate), rate)).toBe('');
    }
  });

  it('emits key-up with the duration and reports tone levels', () => {
    const { generator, duration } = dtmfSequence('7', { toneSeconds: 0.2 });
    const d = new DtmfDecoder();
    const events = d.process({
      samples: render(generator, duration + 0.2, 48000),
      sampleRate: 48000,
      timestamp: 0,
    });
    const up = events.find((e) => e.type === 'key-up');
    expect(up?.type === 'key-up' && up.key).toBe('7');
    expect(up?.type === 'key-up' && up.duration).toBeGreaterThan(0.17);
    expect(up?.type === 'key-up' && up.duration).toBeLessThan(0.25);
    const levels = events.find((e) => e.type === 'levels' && Math.max(...e.rows) > -20);
    expect(levels?.type === 'levels' && levels.rows.indexOf(Math.max(...levels.rows))).toBe(2); // 852 Hz
  });
});
