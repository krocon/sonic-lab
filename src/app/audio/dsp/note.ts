const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export interface Note {
  /** e.g. "A4" */
  readonly name: string;
  /** Deviation from the equal-tempered note, cents (−50…+50). */
  readonly cents: number;
}

/** Nearest equal-tempered note (A4 = `a4` Hz) and the deviation in cents. */
export function frequencyToNote(frequency: number, a4 = 440): Note | null {
  if (!(frequency > 0)) return null;
  const semis = 12 * Math.log2(frequency / a4);
  const nearest = Math.round(semis);
  const midi = 69 + nearest;
  const name = `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  return { name, cents: Math.round((semis - nearest) * 100) };
}
