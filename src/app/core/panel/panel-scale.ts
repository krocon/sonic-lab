/** Pure scale helpers for knobs, the MULTI dial and soft-key values (unit-tested, framework-free). */
export interface KnobScale {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly log: boolean;
}

export const KNOB_SWEEP = 270; // degrees from min to max

/** Position 0…1 of a value on the scale. */
export function toPosition(value: number, s: KnobScale): number {
  const v = Math.min(s.max, Math.max(s.min, value));
  if (s.log && s.min > 0) return Math.log(v / s.min) / Math.log(s.max / s.min);
  return s.max === s.min ? 0 : (v - s.min) / (s.max - s.min);
}

/** Value at a position 0…1, snapped to the step. */
export function fromPosition(position: number, s: KnobScale): number {
  const p = Math.min(1, Math.max(0, position));
  const raw = s.log && s.min > 0 ? s.min * Math.pow(s.max / s.min, p) : s.min + p * (s.max - s.min);
  const snapped = Math.round(raw / s.step) * s.step;
  // avoid binary noise like 0.30000000000000004
  return Math.min(s.max, Math.max(s.min, +snapped.toFixed(10)));
}

/** Pointer angle in degrees (−135 … +135) for a value. */
export function toAngle(value: number, s: KnobScale): number {
  return -KNOB_SWEEP / 2 + toPosition(value, s) * KNOB_SWEEP;
}

/**
 * Value after a keyboard or wheel step. Linear scales move by `step` (×10 for coarse);
 * log scales move by 1 % of the travel (×10 for coarse) so every octave takes similar effort.
 */
export function nudge(value: number, s: KnobScale, direction: 1 | -1, coarse = false): number {
  if (s.log) return fromPosition(toPosition(value, s) + direction * (coarse ? 0.1 : 0.01), s);
  const next = value + direction * s.step * (coarse ? 10 : 1);
  return fromPosition(toPosition(next, s), s);
}
