/**
 * International Morse code (ITU-R M.1677-1) plus common non-ITU punctuation.
 * Codes use '.' for dit and '-' for dah.
 */
export const MORSE_CHARACTERS: Readonly<Record<string, string>> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  $: '...-..-',
  '@': '.--.-.',
};

/**
 * Prosigns: run-together characters with their own meaning. Several share a code with a
 * punctuation mark (e.g. AR = "+", BT = "="); decoding prefers the character, encoding of
 * `<AR>` style tokens uses this table.
 */
export const MORSE_PROSIGNS: Readonly<Record<string, string>> = {
  AR: '.-.-.',
  AS: '.-...',
  BK: '-...-.-',
  BT: '-...-',
  CT: '-.-.-',
  KN: '-.--.',
  SK: '...-.-',
  SN: '...-.',
  SOS: '...---...',
  HH: '........',
};

const CODE_TO_TEXT: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [name, code] of Object.entries(MORSE_PROSIGNS)) map.set(code, `<${name}>`);
  for (const [ch, code] of Object.entries(MORSE_CHARACTERS)) map.set(code, ch); // characters win
  return map;
})();

export type MorseLookup =
  | { readonly known: true; readonly text: string }
  | { readonly known: false; readonly code: string };

/** Decodes one character code. Unknown codes are reported, never guessed. */
export function decodeMorse(code: string): MorseLookup {
  const text = CODE_TO_TEXT.get(code);
  return text === undefined ? { known: false, code } : { known: true, text };
}

/** Code of a single character (case-insensitive) or prosign name, e.g. `"A"` or `"<SK>"`. */
export function encodeMorse(token: string): string | undefined {
  if (token.startsWith('<') && token.endsWith('>'))
    return MORSE_PROSIGNS[token.slice(1, -1).toUpperCase()];
  return MORSE_CHARACTERS[token.toUpperCase()];
}

export type MorseToken =
  | { readonly kind: 'char'; readonly text: string; readonly code: string }
  | { readonly kind: 'word-gap' }
  | { readonly kind: 'unsupported'; readonly text: string };

/** Splits text into encodable tokens: characters, `<PROSIGN>`s and word gaps. */
export function tokenizeText(text: string): MorseToken[] {
  const tokens: MorseToken[] = [];
  const re = /<([A-Za-z]+)>|\s+|./gsu;
  let pendingGap = false;
  for (const match of text.matchAll(re)) {
    const raw = match[0];
    if (/^\s+$/.test(raw)) {
      pendingGap = tokens.length > 0;
      continue;
    }
    if (pendingGap) tokens.push({ kind: 'word-gap' });
    pendingGap = false;
    const code = encodeMorse(raw);
    tokens.push(
      code ? { kind: 'char', text: raw.toUpperCase(), code } : { kind: 'unsupported', text: raw },
    );
  }
  return tokens;
}
