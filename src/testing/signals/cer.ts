/** Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

/** Character error rate of `actual` against `expected` (whitespace-normalised). */
export function characterErrorRate(expected: string, actual: string): number {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
  const e = norm(expected);
  return e.length === 0 ? 0 : editDistance(e, norm(actual)) / e.length;
}
