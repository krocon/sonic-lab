/**
 * Estimates the Morse time unit (dit length) from recent mark and space durations.
 *
 * Marks are either 1 unit (dit) or ~3 units (dah); spaces are 1 (element gap), 3 (character
 * gap) or 7+ (word gap). Durations are clustered on a log scale with 2-means. A clear
 * two-cluster split (ratio > 2) in marks, or a split in spaces combined with marks that fit one
 * side, yields a confident estimate. Otherwise the prior (initial WPM) breaks the tie.
 */
export interface UnitEstimate {
  readonly unit: number;
  readonly confident: boolean;
}

interface Clusters {
  readonly low: number;
  readonly high: number;
  readonly lowCount: number;
  readonly highCount: number;
}

/** 2-means on log durations. Returns geometric cluster centres. */
export function twoMeans(values: readonly number[]): Clusters | null {
  if (values.length === 0) return null;
  const logs = values.map((v) => Math.log(v));
  let lo = Math.min(...logs);
  let hi = Math.max(...logs);
  let lowCount = 0;
  let highCount = 0;
  for (let iter = 0; iter < 12; iter++) {
    let sumLo = 0;
    let sumHi = 0;
    lowCount = highCount = 0;
    const mid = (lo + hi) / 2;
    for (const l of logs) {
      if (l <= mid) {
        sumLo += l;
        lowCount++;
      } else {
        sumHi += l;
        highCount++;
      }
    }
    const nextLo = lowCount ? sumLo / lowCount : lo;
    const nextHi = highCount ? sumHi / highCount : hi;
    if (nextLo === lo && nextHi === hi) break;
    lo = nextLo;
    hi = nextHi;
  }
  return { low: Math.exp(lo), high: Math.exp(hi), lowCount, highCount };
}

const SPLIT_RATIO = 2;

function isSplit(c: Clusters | null): boolean {
  return c !== null && c.lowCount > 0 && c.highCount > 0 && c.high / c.low > SPLIT_RATIO;
}

/**
 * @param marks recent mark durations (s)
 * @param spaces recent space durations (s), word gaps included
 * @param prior unit to fall back on (s)
 */
export function estimateUnit(
  marks: readonly number[],
  spaces: readonly number[],
  prior: number,
): UnitEstimate {
  const m = twoMeans(marks);
  const s = twoMeans(spaces);
  if (!m) return { unit: prior, confident: false };

  if (isSplit(m) && m) {
    // dits and dahs both present: weight by how many of each we saw
    const unit = (m.low * m.lowCount + (m.high / 3) * m.highCount) / (m.lowCount + m.highCount);
    return { unit, confident: m.lowCount + m.highCount >= 3 };
  }

  const markLen = Math.sqrt(m.low * m.high); // single cluster centre
  if (isSplit(s) && s) {
    // element gaps (1 unit) are the low space cluster; marks are either dits (≈1) or dahs (≈3)
    const gap = s.low;
    const unit = markLen / gap < SPLIT_RATIO ? (markLen + gap) / 2 : (markLen / 3 + gap) / 2;
    return { unit, confident: true };
  }
  if (s && spaces.length > 0) {
    // one mark length and one gap length: either dit+element gap (ratio ≈ 1) or dah+element gap (≈ 3)
    // or dit+character gap (≈ 1/3). Equal lengths are unambiguous.
    const ratio = Math.sqrt(s.low * s.high) / markLen;
    if (ratio > 0.6 && ratio < 1.6) return { unit: markLen, confident: marks.length >= 2 };
  }
  // ambiguous: choose dit or dah interpretation closest to the prior (log distance)
  const asDit = markLen;
  const asDah = markLen / 3;
  const unit =
    Math.abs(Math.log(asDit / prior)) <= Math.abs(Math.log(asDah / prior)) ? asDit : asDah;
  return { unit, confident: false };
}
