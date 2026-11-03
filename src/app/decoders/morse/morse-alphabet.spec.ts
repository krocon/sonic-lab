import {
  MORSE_CHARACTERS,
  MORSE_PROSIGNS,
  decodeMorse,
  encodeMorse,
  tokenizeText,
} from './morse-alphabet';

describe('Morse alphabet', () => {
  it('covers A–Z and 0–9', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
      expect(MORSE_CHARACTERS[ch]).toMatch(/^[.-]+$/);
  });

  it('is bijective for characters', () => {
    const codes = Object.values(MORSE_CHARACTERS);
    expect(new Set(codes).size).toBe(codes.length);
    for (const [ch, code] of Object.entries(MORSE_CHARACTERS))
      expect(decodeMorse(code)).toEqual({ known: true, text: ch });
  });

  it('decodes prosigns that are not also characters', () => {
    expect(decodeMorse(MORSE_PROSIGNS['SK'] as string)).toEqual({ known: true, text: '<SK>' });
    expect(decodeMorse('...---...')).toEqual({ known: true, text: '<SOS>' });
    // AR shares its code with "+": the character wins
    expect(decodeMorse('.-.-.')).toEqual({ known: true, text: '+' });
  });

  it('reports unknown codes', () => {
    expect(decodeMorse('.......')).toEqual({ known: false, code: '.......' });
    expect(decodeMorse('')).toEqual({ known: false, code: '' });
  });

  it('encodes characters case-insensitively and prosigns in angle brackets', () => {
    expect(encodeMorse('a')).toBe('.-');
    expect(encodeMorse('<sk>')).toBe('...-.-');
    expect(encodeMorse('ä')).toBeUndefined();
  });

  it('tokenizes text with word gaps, prosigns and unsupported characters', () => {
    expect(tokenizeText('  hi  <AR> ä ')).toEqual([
      { kind: 'char', text: 'H', code: '....' },
      { kind: 'char', text: 'I', code: '..' },
      { kind: 'word-gap' },
      { kind: 'char', text: '<AR>', code: '.-.-.' },
      { kind: 'word-gap' },
      { kind: 'unsupported', text: 'ä' },
    ]);
  });
});
