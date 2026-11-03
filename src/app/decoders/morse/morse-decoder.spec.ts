import { morseSignal } from '../../../testing/signals/morse-signal';
import { mix, render, tone, whiteNoise } from '../../audio/synthesis/signal';
import { scheduleMorse } from './morse-timing';
import { MorseDecoder, eventsToText } from './morse-decoder';

function decode(text: string, opts: Parameters<typeof morseSignal>[1], cfg = {}): string {
  const { samples, sampleRate } = morseSignal(text, opts);
  return eventsToText(new MorseDecoder(cfg).decodeAll(samples, sampleRate));
}

describe('MorseDecoder (synthetic signals)', () => {
  it('decodes SOS', () => {
    expect(decode('SOS', { wpm: 20 })).toBe('SOS');
  });

  it('decodes PARIS PARIS', () => {
    expect(decode('PARIS PARIS', { wpm: 20 })).toBe('PARIS PARIS');
  });

  const ALL = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 0123456789';
  for (const wpm of [5, 15, 25, 40]) {
    it(`decodes all letters and digits at ${wpm} WPM`, () => {
      expect(decode(ALL, { wpm })).toBe(ALL);
    });
  }

  for (const frequency of [500, 700, 1000]) {
    for (const sampleRate of [44100, 48000]) {
      it(`decodes at ${frequency} Hz / ${sampleRate} Hz sample rate`, () => {
        expect(decode('CQ CQ DE DL1ABC K', { wpm: 18, frequency, sampleRate })).toBe(
          'CQ CQ DE DL1ABC K',
        );
      });
    }
  }

  it('decodes quiet and loud signals alike', () => {
    expect(decode('TEST 73', { wpm: 20, amplitude: 0.02 })).toBe('TEST 73');
    expect(decode('TEST 73', { wpm: 20, amplitude: 0.95 })).toBe('TEST 73');
  });

  it('decodes punctuation', () => {
    expect(decode('A.B,C? 1/2 = @', { wpm: 20 })).toBe('A.B,C? 1/2 = @');
  });

  it('marks unknown codes instead of guessing', () => {
    // seven dits form no valid character (eight would be the HH prosign)
    const unit = 0.06;
    const spans = Array.from({ length: 7 }, (_, i) => ({
      start: 0.8 + 2 * i * unit,
      end: 0.8 + (2 * i + 1) * unit,
    }));
    const samples = render(tone({ frequency: 700, spans }), 3, 48000);
    const events = new MorseDecoder().decodeAll(samples, 48000);
    const chars = events.filter((e) => e.type === 'character');
    expect(chars).toHaveLength(1);
    expect(chars[0]).toMatchObject({ known: false, code: '.......', text: '\uFFFD' });
  });

  it('produces nothing from pure noise', () => {
    for (const rms of [0.001, 0.01, 0.1]) {
      const samples = render(whiteNoise(rms, 11), 8, 48000);
      const chars = new MorseDecoder()
        .decodeAll(samples, 48000)
        .filter((e) => e.type === 'character');
      expect(chars, `noise rms ${rms}`).toEqual([]);
    }
  });

  it('produces nothing from pure noise with high sensitivity either', () => {
    const high = { onRatio: 0.45, offRatio: 0.3, minSnr: 2.2, minElementMs: 10 };
    for (const seed of [21, 22, 23]) {
      const samples = render(whiteNoise(0.02, seed), 8, 48000);
      const chars = new MorseDecoder(high)
        .decodeAll(samples, 48000)
        .filter((e) => e.type === 'character');
      expect(chars, `seed ${seed}`).toEqual([]);
    }
  });

  it('does not invent elements in noise before the first character', () => {
    expect(decode('CQ CQ', { wpm: 18, noiseRms: 0.01, leadIn: 1.5 })).toBe('CQ CQ');
  });

  it('decodes prosigns', () => {
    expect(decode('<SK>', { wpm: 20 })).toBe('<SK>');
  });

  it('reports WPM and emits keying segments', () => {
    const { samples, sampleRate } = morseSignal('PARIS PARIS PARIS', { wpm: 25 });
    const decoder = new MorseDecoder();
    const events = decoder.decodeAll(samples, sampleRate);
    const wpmEvents = events.filter((e) => e.type === 'wpm');
    expect(wpmEvents.length).toBeGreaterThan(0);
    expect(decoder.wpm).toBeGreaterThan(23);
    expect(decoder.wpm).toBeLessThan(27);
    expect(events.filter((e) => e.type === 'segment' && e.state === 'mark').length).toBe(14 * 3);
  });

  it('detects the tone frequency automatically', () => {
    const { samples, sampleRate } = morseSignal('TEST', { wpm: 20, frequency: 850 });
    const events = new MorseDecoder().decodeAll(samples, sampleRate);
    const tones = events.filter((e) => e.type === 'tone' && e.keyDown);
    const last = tones.at(-1);
    expect(last?.type === 'tone' && Math.abs(last.frequency - 850)).toBeLessThanOrEqual(25);
  });

  it('separates two simultaneous stations by the configured frequency', () => {
    const a = scheduleMorse('AAA', { wpm: 18, leadIn: 0.3 });
    const b = scheduleMorse('TEST', { wpm: 22, leadIn: 0.5 });
    const length = Math.max(a.duration, b.duration) + 0.5;
    const samples = render(
      mix(
        tone({ frequency: 600, amplitude: 0.4, spans: a.elements }),
        tone({ frequency: 1200, amplitude: 0.4, spans: b.elements }),
        whiteNoise(0.003, 5),
      ),
      length,
      48000,
    );
    expect(eventsToText(new MorseDecoder({ frequency: 600 }).decodeAll(samples, 48000))).toBe(
      'AAA',
    );
    expect(eventsToText(new MorseDecoder({ frequency: 1200 }).decodeAll(samples, 48000))).toBe(
      'TEST',
    );
  });

  it('starts over after reset() and applies configure()', () => {
    const decoder = new MorseDecoder();
    const a = morseSignal('ABC', { wpm: 20 });
    expect(eventsToText(decoder.decodeAll(a.samples, a.sampleRate))).toBe('ABC');
    decoder.reset();
    decoder.configure({ initialWpm: 12 });
    const b = morseSignal('XYZ', { wpm: 12 });
    expect(eventsToText(decoder.decodeAll(b.samples, b.sampleRate))).toBe('XYZ');
  });
});
