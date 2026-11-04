import { render, tone } from '../../audio/synthesis/signal';
import { impairedMorse } from '../../../testing/signals/impaired-morse';
import { ToneDetector } from './tone-detector';

function lastHop(detector: ToneDetector, samples: Float32Array, rate: number) {
  let amp = 0;
  let freq = 0;
  detector.process(samples, rate, (h) => {
    amp = h.amplitude;
    freq = h.frequency;
  });
  return { amp, freq };
}

describe('ToneDetector', () => {
  it('measures the amplitude of a tone', () => {
    const d = new ToneDetector();
    d.configure({ frequency: 700 });
    const { amp } = lastHop(d, render(tone({ frequency: 700, amplitude: 0.3 }), 0.2, 48000), 48000);
    expect(amp).toBeCloseTo(0.3, 1);
  });

  it('finds the tone in auto mode', () => {
    const d = new ToneDetector();
    const { freq } = lastHop(d, render(tone({ frequency: 1030, amplitude: 0.3 }), 1, 44100), 44100);
    expect(Math.abs(freq - 1030)).toBeLessThanOrEqual(25);
  });

  it('stays on a keyed tone whose gaps are filled by reverberation', () => {
    // the reverberant tail makes the tone itself look less keyed than the skirts of its spectrum
    const s = impairedMorse('PARIS PARIS PARIS PARIS PARIS PARIS', {
      wpm: 40,
      frequency: 750,
      reverb: { rt60Seconds: 0.3, wet: 0.5, seed: 2 },
    });
    const { freq } = lastHop(new ToneDetector(), s.samples, s.sampleRate);
    expect(freq).toBe(750);
  });

  it('attenuates far-off tones in manual mode', () => {
    const d = new ToneDetector();
    d.configure({ frequency: 600 });
    const { amp } = lastHop(
      d,
      render(tone({ frequency: 1200, amplitude: 0.5 }), 0.2, 48000),
      48000,
    );
    expect(amp).toBeLessThan(0.5 * 0.01); // < −40 dB
  });

  it('emits one hop per hopMs', () => {
    const d = new ToneDetector();
    d.configure({ hopMs: 5 });
    let hops = 0;
    d.process(new Float32Array(48000), 48000, () => hops++);
    expect(hops).toBe(200); // the staggered second window reports after the first hop
  });
});
