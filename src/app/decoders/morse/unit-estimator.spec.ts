import { estimateUnit, twoMeans } from './unit-estimator';

describe('unit estimator', () => {
  it('splits two clusters on a log scale', () => {
    const c = twoMeans([0.05, 0.06, 0.18, 0.17, 0.055]);
    expect(c?.lowCount).toBe(3);
    expect(c?.highCount).toBe(2);
    expect(c?.low).toBeCloseTo(0.055, 2);
  });

  it('is confident with dits and dahs', () => {
    const e = estimateUnit([0.06, 0.18, 0.06, 0.18], [0.06, 0.06], 0.1);
    expect(e.confident).toBe(true);
    expect(e.unit).toBeCloseTo(0.06, 3);
  });

  it('recognises only-dit characters from equal gaps (slow speed, wrong prior)', () => {
    // "S" at 5 WPM: three 240 ms dits with 240 ms gaps; prior 20 WPM (60 ms)
    const e = estimateUnit([0.24, 0.24, 0.24], [0.24, 0.24], 0.06);
    expect(e.unit).toBeCloseTo(0.24, 3);
    expect(e.confident).toBe(true);
  });

  it('recognises only-dah characters via split gaps', () => {
    const e = estimateUnit([0.3, 0.3, 0.3, 0.3], [0.1, 0.1, 0.3], 0.06);
    expect(e.unit).toBeCloseTo(0.1, 3);
  });

  it('falls back to the prior when ambiguous', () => {
    const e = estimateUnit([0.18], [], 0.06);
    expect(e.confident).toBe(false);
    expect(e.unit).toBeCloseTo(0.06, 3);
  });
});
