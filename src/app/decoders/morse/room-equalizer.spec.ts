import { createGaussian, createRandom } from '../../audio/synthesis/random';
import { characterErrorRate } from '../../../testing/signals/cer';
import { impairedMorse } from '../../../testing/signals/impaired-morse';
import { MorseDecoder, eventsToText } from './morse-decoder';

const TEXT =
  'CQ CQ DE DL1ABC DL1ABC K = GM OM TNX FER CALL UR RST 579 579 = NAME MARC QTH BERLIN = ' +
  'WX CLOUDY ES 12C = HW CPY? AR KN';

/** Longer text with digits and punctuation (the `morse:sweep` text). */
const LONG_TEXT =
  TEXT.replace(' AR KN', '') +
  ' = RIG IC7300 ES DIPOLE AT 15M = HW CPY? AR KN THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG ' +
  '1234567890 /?.,';

function decode(samples: Float32Array, rate: number, roomEqualizer: boolean): string {
  return eventsToText(new MorseDecoder({ roomEqualizer }).decodeAll(samples, rate));
}

describe('room equalizer (Morse decoder, roomEqualizer: true)', { timeout: 60_000 }, () => {
  it('decodes a room that cancels the direct sound once it has learned the room', () => {
    // RT60 0.3 s, 50 % reverberant energy, room 3: the steady tone is as loud as its tail, the
    // level detector merges every character into one mark
    const s = impairedMorse(TEXT, {
      wpm: 18,
      sampleRate: 16000,
      snrDb: 30,
      seed: 3,
      reverb: { rt60Seconds: 0.3, wet: 0.5, seed: 3 },
    });
    expect(characterErrorRate(TEXT, decode(s.samples, s.sampleRate, false))).toBeGreaterThan(0.5);
    const text = decode(s.samples, s.sampleRate, true);
    // the first characters come from the level detector while the room is learned
    expect(text).toContain('TNX FER CALL UR RST 579 579 = NAME MARC QTH BERLIN = WX CLOUDY');
    expect(characterErrorRate(TEXT, text)).toBeLessThan(0.15);
  });

  it('follows a tone off the analysis bin (residual frequency offset)', () => {
    const s = impairedMorse(TEXT, {
      wpm: 18,
      frequency: 712,
      sampleRate: 16000,
      snrDb: 30,
      seed: 3,
      reverb: { rt60Seconds: 0.3, wet: 0.5, seed: 3 },
    });
    expect(characterErrorRate(TEXT, decode(s.samples, s.sampleRate, true))).toBeLessThan(0.05);
  });

  it('does not settle on a multiple of the speed (offset explained by short elements)', () => {
    // 12 WPM, 12 Hz off the bin, RT60 0.6 s: wrong residual offsets decoded every element as a
    // chain of short ones (≈ 50 WPM) with many plausible characters; only the model fit with a
    // penalty for extra elements tells the right reading
    const s = impairedMorse(TEXT, {
      wpm: 12,
      frequency: 712,
      sampleRate: 16000,
      snrDb: 30,
      seed: 3,
      reverb: { rt60Seconds: 0.6, wet: 0.25, seed: 3 },
    });
    const decoder = new MorseDecoder({ roomEqualizer: true });
    const text = eventsToText(decoder.decodeAll(s.samples, s.sampleRate));
    expect(characterErrorRate(TEXT, text)).toBeLessThan(0.05);
    expect(decoder.wpm).toBeLessThan(14);
  });

  it('never goes silent on a broken room model', () => {
    // 12 WPM at 735 Hz, RT60 0.6 s / 25 %, room 5: a refit left a model that no longer fitted;
    // the equalizer took over and never reported another edge – the text stopped mid-way
    const text = LONG_TEXT;
    const s = impairedMorse(text, {
      wpm: 12,
      frequency: 735,
      sampleRate: 16000,
      snrDb: 30,
      seed: 5,
      reverb: { rt60Seconds: 0.6, wet: 0.25, seed: 5 },
    });
    const decoded = decode(s.samples, s.sampleRate, true);
    expect(decoded.endsWith('1234567890 /?.,')).toBe(true);
    expect(characterErrorRate(text, decoded)).toBeLessThan(0.05);
  });

  it('keeps clean signals decoded exactly', () => {
    for (const wpm of [15, 30]) {
      const s = impairedMorse(TEXT, { wpm, sampleRate: 16000, snrDb: 20, seed: 1 });
      expect(decode(s.samples, s.sampleRate, true)).toBe(TEXT);
    }
  });

  it('produces no characters from noise alone', () => {
    const rate = 16000;
    const gauss = createGaussian(createRandom(7));
    const noise = Float32Array.from({ length: 10 * rate }, () => 0.02 * gauss());
    expect(decode(noise, rate, true)).toBe('');
  });
});
