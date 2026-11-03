import { fromPosition, nudge, toAngle, toPosition } from './panel-scale';

describe('panel scale', () => {
  const lin = { min: -60, max: -3, step: 1, log: false };
  const log = { min: 20, max: 20000, step: 1, log: true };

  it('maps values to positions and angles', () => {
    expect(toPosition(-60, lin)).toBe(0);
    expect(toAngle(-3, lin)).toBe(135);
    expect(toPosition(632, log)).toBeCloseTo(0.5, 2); // geometric middle of 20 Hz … 20 kHz
    expect(toAngle(20, log)).toBe(-135);
  });

  it('round-trips, clamps and snaps', () => {
    expect(fromPosition(toPosition(1000, log), log)).toBe(1000);
    expect(fromPosition(2, lin)).toBe(-3);
    expect(fromPosition(0.501, { min: 0, max: 1, step: 0.05, log: false })).toBe(0.5);
  });

  it('nudges by step (linear) or by 1 % of travel (log)', () => {
    expect(nudge(-20, lin, 1)).toBe(-19);
    expect(nudge(-20, lin, -1, true)).toBe(-30);
    expect(nudge(-3, lin, 1)).toBe(-3);
    expect(nudge(1000, log, 1)).toBeGreaterThan(1060);
    expect(nudge(1000, log, 1)).toBeLessThan(1080);
  });
});
