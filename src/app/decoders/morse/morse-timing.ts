import { MorseToken, tokenizeText } from './morse-alphabet';

/** Seconds per unit for a speed in words per minute (PARIS standard: 50 units per word). */
export function unitSeconds(wpm: number): number {
  return 1.2 / wpm;
}

export function wpmFromUnit(unit: number): number {
  return 1.2 / unit;
}

export interface MorseTimingOptions {
  /** Character speed (element and intra-character gap length). */
  readonly wpm: number;
  /**
   * Farnsworth: overall speed < `wpm` stretches only character and word gaps.
   * Default: same as `wpm`.
   */
  readonly farnsworthWpm?: number;
  /** Dah length in units (standard 3). */
  readonly dahUnits?: number;
  /** Silence before the first element, seconds. */
  readonly leadIn?: number;
}

export interface KeyedElement {
  readonly start: number;
  readonly end: number;
  readonly kind: 'dit' | 'dah';
  /** Index into the token list this element belongs to. */
  readonly token: number;
}

export interface MorseSchedule {
  readonly tokens: MorseToken[];
  readonly elements: KeyedElement[];
  /** Total length including the trailing word gap, seconds. */
  readonly duration: number;
}

/**
 * Farnsworth gap stretch (ARRL formula): extra time distributed over the 19 gap units of PARIS.
 * Returns the length of one *gap* unit for character and word gaps.
 */
function farnsworthGapUnit(wpm: number, farnsworthWpm: number): number {
  if (farnsworthWpm >= wpm) return unitSeconds(wpm);
  const total = (60 * wpm - 37.2 * farnsworthWpm) / (wpm * farnsworthWpm);
  return total / 19;
}

/** Turns text into a timed key-down schedule. Unsupported characters are skipped (see `tokens`). */
export function scheduleMorse(text: string, options: MorseTimingOptions): MorseSchedule {
  const unit = unitSeconds(options.wpm);
  const gapUnit = farnsworthGapUnit(options.wpm, options.farnsworthWpm ?? options.wpm);
  const dah = (options.dahUnits ?? 3) * unit;
  const tokens = tokenizeText(text);
  const elements: KeyedElement[] = [];
  let t = options.leadIn ?? 0;
  let previousWasChar = false;

  tokens.forEach((token, index) => {
    if (token.kind === 'word-gap') {
      if (previousWasChar) t += 7 * gapUnit;
      previousWasChar = false;
      return;
    }
    if (token.kind !== 'char') return;
    if (previousWasChar) t += 3 * gapUnit;
    [...token.code].forEach((symbol, i) => {
      if (i > 0) t += unit;
      const length = symbol === '-' ? dah : unit;
      elements.push({
        start: t,
        end: t + length,
        kind: symbol === '-' ? 'dah' : 'dit',
        token: index,
      });
      t += length;
    });
    previousWasChar = true;
  });
  return { tokens, elements, duration: t + 7 * gapUnit };
}
