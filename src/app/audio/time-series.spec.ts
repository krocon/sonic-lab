import { TimeSeries } from './time-series';

describe('TimeSeries', () => {
  it('keeps the newest points and computes statistics', () => {
    const ts = new TimeSeries(3);
    [1, 2, 3, 4].forEach((v, i) => ts.push(i, v));
    const seen: number[] = [];
    ts.forEach((_, v) => seen.push(v));
    expect(seen).toEqual([2, 3, 4]);
    expect(ts.last).toEqual({ time: 3, value: 4 });
    expect(ts.stats(2)).toEqual({ mean: 3.5, std: 0.5, n: 2 });
    ts.push(4, NaN);
    expect(ts.stats(0).n).toBe(2);
    ts.clear();
    expect(ts.size).toBe(0);
    expect(ts.last).toBeNull();
  });
});
