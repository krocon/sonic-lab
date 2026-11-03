import { KeyingDetector, KeyingSegment } from './keying-detector';

const HOP = 0.005;

function run(amplitudes: number[], config = {}): KeyingSegment[] {
  const d = new KeyingDetector();
  d.configure(config);
  const out: KeyingSegment[] = [];
  amplitudes.forEach((a, i) => d.push(a, (i + 1) * HOP, HOP, (s) => out.push(s)));
  return out;
}

const repeat = (value: number, hops: number) => Array<number>(hops).fill(value);

describe('KeyingDetector', () => {
  it('measures marks and spaces independent of the absolute level', () => {
    for (const level of [0.01, 0.5]) {
      const segs = run([
        ...repeat(0.0001, 40),
        ...repeat(level, 12),
        ...repeat(0.0001, 12),
        ...repeat(level, 36),
        ...repeat(0.0001, 20),
      ]);
      const marks = segs.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP));
      expect(marks).toEqual([12, 36]);
    }
  });

  it('suppresses glitches shorter than minElementMs', () => {
    const segs = run([
      ...repeat(0.0001, 40),
      ...repeat(0.5, 1),
      ...repeat(0.0001, 40),
      ...repeat(0.5, 10),
      ...repeat(0.0001, 10),
    ]);
    expect(segs.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP))).toEqual(
      [10],
    );
  });

  it('bridges short dropouts inside a mark', () => {
    const segs = run([
      ...repeat(0.0001, 40),
      ...repeat(0.5, 10),
      0.0001,
      ...repeat(0.5, 10),
      ...repeat(0.0001, 20),
    ]);
    expect(segs.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP))).toEqual(
      [21],
    );
  });

  it('holds the state between the hysteresis thresholds', () => {
    // 0.2 is below the on-threshold (0.25) but above the off-threshold (0.15) once a mark started
    const segs = run([
      ...repeat(0.0001, 40),
      ...repeat(0.5, 10),
      ...repeat(0.2, 10),
      ...repeat(0.0001, 20),
    ]);
    expect(segs.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP))).toEqual(
      [20],
    );
  });

  it('ignores noise without a tone', () => {
    const noise = Array.from({ length: 400 }, (_, i) => 0.0005 + 0.0004 * Math.sin(i * 1.7));
    expect(run(noise).filter((s) => s.state === 'mark')).toEqual([]);
  });
});
