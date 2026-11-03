import { render } from '../../audio/synthesis/signal';
import { MORSE_CHARACTERS } from './morse-alphabet';
import { MorseDecoder, eventsToText } from './morse-decoder';
import { morseTone } from './morse-synthesis';

/** Every encodable character, grouped into five-character "words". */
const ALL = Object.keys(MORSE_CHARACTERS)
  .join('')
  .match(/.{1,5}/g)
  ?.join(' ') as string;

describe('encoder → audio → decoder round trip', { timeout: 60_000 }, () => {
  for (const wpm of [10, 20, 30]) {
    it(`reproduces every character at ${wpm} WPM`, () => {
      const { generator, schedule } = morseTone(ALL, { wpm, leadIn: 0.4 });
      const samples = render(generator, schedule.duration + 0.5, 48000);
      expect(eventsToText(new MorseDecoder().decodeAll(samples, 48000))).toBe(ALL);
    });
  }

  it('reproduces prosigns and learns Farnsworth word gaps', () => {
    // <KN> shares its code with "(" – the decoder shows the character
    const text = 'CQ CQ DE DL1ABC DL1ABC <KN> CQ DE DL1ABC 73 <SK>';
    const { generator, schedule } = morseTone(text, { wpm: 20, farnsworthWpm: 12, leadIn: 0.4 });
    const samples = render(generator, schedule.duration + 0.5, 48000);
    const decoded = eventsToText(new MorseDecoder().decodeAll(samples, 48000));
    const expected = text.replace('<KN>', '(');
    expect(decoded.replace(/ /g, '')).toBe(expected.replace(/ /g, ''));
    // after a few gaps the stretched character gaps are no longer taken for word gaps
    expect(decoded.endsWith('CQ DE DL1ABC 73 <SK>')).toBe(true);
  });
});
