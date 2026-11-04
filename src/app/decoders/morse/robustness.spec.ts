import { characterErrorRate } from '../../../testing/signals/cer';
import { ImpairedMorseOptions, impairedMorse } from '../../../testing/signals/impaired-morse';
import { mix, render, tone, whiteNoise } from '../../audio/synthesis/signal';
import { MorseDecoder, MorseDecoderConfig, eventsToText } from './morse-decoder';
import { scheduleMorse } from './morse-timing';

/** Same values as the "high" sensitivity preset in features/morse-decoder/morse-settings.ts. */
const HIGH_SENSITIVITY: Partial<MorseDecoderConfig> = {
  onRatio: 0.45,
  offRatio: 0.3,
  minSnr: 2.2,
  minElementMs: 10,
};

const TEXT =
  'CQ CQ DE DL1ABC DL1ABC PSE K = TNX FER CALL UR RST 599 5NN = NAME MARC QTH BERLIN = HW? AR';

interface Scenario {
  readonly name: string;
  readonly options: ImpairedMorseOptions;
  /** Maximum accepted character error rate. */
  readonly maxCer: number;
  readonly text?: string;
  readonly config?: Partial<MorseDecoderConfig>;
}

const SCENARIOS: Scenario[] = [
  { name: 'clean 20 WPM', options: { wpm: 20 }, maxCer: 0 },
  { name: 'SNR 20 dB, 20 WPM', options: { wpm: 20, snrDb: 20 }, maxCer: 0 },
  { name: 'SNR 10 dB, 20 WPM', options: { wpm: 20, snrDb: 10 }, maxCer: 0.02 },
  { name: 'SNR 6 dB, 20 WPM', options: { wpm: 20, snrDb: 6 }, maxCer: 0.05 },
  // known limit: with the default sensitivity a 3 dB signal is partly missed
  { name: 'SNR 3 dB, 15 WPM', options: { wpm: 15, snrDb: 3 }, maxCer: 0.2 },
  {
    name: 'SNR 3 dB, 15 WPM, sensitivity high',
    options: { wpm: 15, snrDb: 3 },
    maxCer: 0.1,
    config: HIGH_SENSITIVITY,
  },
  { name: 'pink noise SNR 10 dB', options: { wpm: 20, snrDb: 10, noise: 'pink' }, maxCer: 0.03 },
  {
    name: 'QSB 10 dB / 3 s, SNR 20 dB',
    options: { wpm: 20, snrDb: 20, qsb: { depthDb: 10, periodSeconds: 3 } },
    maxCer: 0.05,
  },
  // known limit: in the trough the signal is 5 dB below the noise – those parts cannot be decoded
  {
    name: 'QSB 20 dB / 4 s, SNR 15 dB (trough −5 dB)',
    options: { wpm: 20, snrDb: 15, qsb: { depthDb: 20, periodSeconds: 4 } },
    maxCer: 0.6,
  },
  {
    name: 'clicks 2/s, SNR 15 dB',
    options: { wpm: 20, snrDb: 15, clicksPerSecond: 2 },
    maxCer: 0.03,
  },
  {
    name: 'off-frequency bursts 3/s',
    options: { wpm: 20, snrDb: 15, burstsPerSecond: 3 },
    maxCer: 0.03,
  },
  {
    name: 'on-frequency glitches 1/s',
    options: { wpm: 20, snrDb: 15, onFrequencyGlitchesPerSecond: 1 },
    maxCer: 0.05,
  },
  { name: 'drift +60 Hz', options: { wpm: 20, snrDb: 15, driftHz: 60 }, maxCer: 0.02 },
  { name: 'hand keying ±15 %', options: { wpm: 18, snrDb: 15, jitter: 0.15 }, maxCer: 0.03 },
  { name: 'hand keying ±25 %', options: { wpm: 18, snrDb: 20, jitter: 0.25 }, maxCer: 0.08 },
  { name: 'heavy weight 1:4', options: { wpm: 20, snrDb: 15, dahUnits: 4 }, maxCer: 0.02 },
  { name: 'light weight 1:2.5', options: { wpm: 20, snrDb: 15, dahUnits: 2.5 }, maxCer: 0.03 },
  // the first word gaps are learned from the data, so the first word may be split
  { name: 'Farnsworth 18/8', options: { wpm: 18, farnsworthWpm: 8, snrDb: 15 }, maxCer: 0.03 },
  { name: 'fast 35 WPM, SNR 15 dB', options: { wpm: 35, snrDb: 15 }, maxCer: 0.03 },
  // loudspeaker → room → microphone: element gaps filled by the reverberant tail. The result
  // depends on the room (its gain at the tone frequency); `seed` picks the simulated room.
  {
    name: 'room reverb RT60 0.3 s / 25 % wet, 18 WPM',
    options: { wpm: 18, snrDb: 20, reverb: { rt60Seconds: 0.3, wet: 0.25, seed: 5 } },
    maxCer: 0.02,
  },
  {
    name: 'room reverb RT60 0.3 s / 50 % wet, 18 WPM',
    options: { wpm: 18, snrDb: 20, reverb: { rt60Seconds: 0.3, wet: 0.5, seed: 3 } },
    maxCer: 0.03,
  },
  {
    name: 'room reverb RT60 0.6 s / 25 % wet, 12 WPM',
    options: { wpm: 12, snrDb: 20, reverb: { rt60Seconds: 0.6, wet: 0.25, seed: 3 } },
    maxCer: 0.03,
  },
  {
    name: 'room reverb RT60 0.3 s / 25 % wet, 25 WPM',
    options: { wpm: 25, snrDb: 20, reverb: { rt60Seconds: 0.3, wet: 0.25, seed: 7 } },
    maxCer: 0.03,
  },
  // gaps that stay above the off-threshold: the next element must start on the fast rise of its
  // direct sound, and tail swells after a key-up must neither start marks nor skew the speed
  {
    name: 'room reverb RT60 0.3 s / 50 % wet, 12 WPM (tail above off-threshold)',
    options: { wpm: 12, snrDb: 20, reverb: { rt60Seconds: 0.3, wet: 0.5, seed: 2 } },
    maxCer: 0.06,
  },
  {
    name: 'room reverb RT60 0.6 s / 25 % wet, 12 WPM (slow build-up)',
    options: { wpm: 12, snrDb: 20, reverb: { rt60Seconds: 0.6, wet: 0.25, seed: 8 } },
    maxCer: 0.03,
  },
  {
    name: 'room reverb RT60 0.6 s / 25 % wet, 30 WPM',
    options: { wpm: 30, snrDb: 20, reverb: { rt60Seconds: 0.6, wet: 0.25, seed: 4 } },
    maxCer: 0.03,
  },

  {
    name: 'slow 8 WPM, SNR 10 dB',
    options: { wpm: 8, snrDb: 10 },
    maxCer: 0.02,
    text: 'CQ DE DL1ABC K',
  },
];

function run(s: Scenario, seed: number): { cer: number; text: string } {
  const text = s.text ?? TEXT;
  const signal = impairedMorse(text, { seed, ...s.options });
  const decoded = eventsToText(
    new MorseDecoder(s.config).decodeAll(signal.samples, signal.sampleRate),
  );
  return { cer: characterErrorRate(text, decoded), text: decoded };
}

const SEEDS = [1, 2, 3];
const report: string[] = [];

describe('Morse decoder robustness (CER per scenario, 3 seeds)', { timeout: 60_000 }, () => {
  afterAll(() => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
      ?.env;
    if (env?.['MORSE_REPORT'])
      console.log(`\nscenario | mean CER | worst CER\n${report.join('\n')}`);
  });

  for (const s of SCENARIOS) {
    it(`${s.name}: CER ≤ ${(s.maxCer * 100).toFixed(0)} %`, () => {
      const results = SEEDS.map((seed) => run(s, seed));
      const mean = results.reduce((a, r) => a + r.cer, 0) / results.length;
      const worst = results.reduce((a, r) => Math.max(a, r.cer), 0);
      report.push(`${s.name} | ${(mean * 100).toFixed(1)} % | ${(worst * 100).toFixed(1)} %`);
      expect(mean, `decoded: ${results.map((r) => r.text).join(' || ')}`).toBeLessThanOrEqual(
        s.maxCer,
      );
    });
  }
});

describe('Morse decoder adaptation and endurance', { timeout: 120_000 }, () => {
  const rate = 48000;

  function keyed(
    text: string,
    wpm: number,
    start: number,
  ): { spans: { start: number; end: number }[]; end: number } {
    const s = scheduleMorse(text, { wpm, leadIn: start });
    return { spans: s.elements.map((e) => ({ start: e.start, end: e.end })), end: s.duration };
  }

  it('follows a tempo change from 15 to 30 WPM within 10 characters', () => {
    const first = keyed('CQ CQ DE DL1ABC K', 15, 0.5);
    const secondText = 'QRL? QRL? QRZ DE DL1ABC DL1ABC K';
    const second = keyed(secondText, 30, first.end + 0.3);
    const samples = render(
      mix(
        tone({ frequency: 700, amplitude: 0.3, spans: [...first.spans, ...second.spans] }),
        whiteNoise(0.002, 9),
      ),
      second.end + 0.5,
      rate,
    );
    const decoder = new MorseDecoder();
    const text = eventsToText(decoder.decodeAll(samples, rate));
    expect(text.startsWith('CQ CQ DE DL1ABC K')).toBe(true);
    const tail = text.slice('CQ CQ DE DL1ABC K '.length);
    // after ≤ 10 characters of adaptation the rest must be exact
    expect(tail).toContain(secondText.slice(10));
    expect(decoder.wpm).toBeGreaterThan(27);
  });

  it('decodes a 5-minute transmission without drift', () => {
    const text = Array.from({ length: 40 }, () => 'CQ CQ DE DL1ABC PSE K').join(' ');
    const signal = impairedMorse(text, { wpm: 22, snrDb: 15, seed: 4 });
    expect(signal.duration).toBeGreaterThan(300);
    const decoder = new MorseDecoder();
    const decoded = eventsToText(decoder.decodeAll(signal.samples, signal.sampleRate));
    expect(characterErrorRate(text, decoded)).toBeLessThanOrEqual(0.005);
    expect(decoder.wpm).toBeGreaterThan(20.5);
    expect(decoder.wpm).toBeLessThan(23.5);
  });

  it('processes one second of 48 kHz audio quickly', () => {
    const signal = impairedMorse('PARIS PARIS PARIS PARIS', { wpm: 20, snrDb: 15, seed: 5 });
    const decoder = new MorseDecoder();
    const seconds = signal.samples.length / rate;
    const start = performance.now();
    decoder.decodeAll(signal.samples, rate);
    const msPerSecond = (performance.now() - start) / seconds;
    // budget 5 ms/s on a desktop; generous limit for slow CI machines and instrumented runs
    expect(msPerSecond).toBeLessThan(25);
  });
});
