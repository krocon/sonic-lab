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
    // after a 0.5 mark the thresholds are 0.25 (on) / 0.15 (off); a second mark at 0.3 that
    // sinks gently to 0.2 – below on, above off, less than 6 dB under its peak – continues
    const segs = run([
      ...repeat(0.0001, 40),
      ...repeat(0.5, 10),
      ...repeat(0.0001, 20),
      ...repeat(0.3, 10),
      ...repeat(0.2, 10),
      ...repeat(0.0001, 20),
    ]);
    expect(segs.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP))).toEqual(
      [10, 20],
    );
  });

  it('finds element gaps that stay far above the noise floor (ringing, reverberation)', () => {
    // gaps only 12 dB below the marks, 40 dB above the noise
    const segs = run([
      ...repeat(0.0001, 40),
      ...repeat(0.5, 12),
      ...repeat(0.12, 12),
      ...repeat(0.5, 36),
      ...repeat(0.12, 12),
      ...repeat(0.5, 12),
      ...repeat(0.0001, 40),
    ]);
    expect(segs.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP))).toEqual(
      [12, 36, 12],
    );
  });

  it('does not start a mark on the swelling tail after a key-up', () => {
    // a reverberant tail can rise again right after the dry tone stopped; only a fresh rise of
    // ≥ 8 dB out of the gap minimum counts
    const segs = run([
      ...repeat(0.0001, 40),
      ...repeat(0.5, 12),
      ...repeat(0.15, 3),
      ...repeat(0.3, 6),
      ...repeat(0.1, 6),
      ...repeat(0.5, 12),
      ...repeat(0.0001, 40),
    ]);
    expect(segs.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP))).toEqual(
      [12, 12],
    );
  });

  it('starts the next element on a fast rise out of a tail that has not decayed', () => {
    // RT60 ≈ 0.3 s at 30 WPM: the gap stays ≈ 9 dB below the marks (tail flag stays on); the
    // next element's direct sound adds ≈ 5 dB at once, the rest of the 9 dB builds up slowly –
    // the 8 dB rise alone would start this mark ≈ 4 hops late
    const d = new KeyingDetector();
    d.setUnit(0.04);
    const out: KeyingSegment[] = [];
    [
      ...repeat(0.0001, 40),
      ...repeat(0.5, 24),
      ...repeat(0.18, 8),
      0.32,
      0.36,
      0.4,
      0.44,
      0.48,
      ...repeat(0.5, 7),
      ...repeat(0.0001, 40),
    ].forEach((a, i) => d.push(a, (i + 1) * HOP, HOP, (s) => out.push(s)));
    const marks = out.filter((s) => s.state === 'mark');
    expect(marks.map((s) => Math.round(s.duration / HOP))).toEqual([24, 12]);
  });

  it('does not start a mark within the refractory time after a key-up', () => {
    const signal = [
      ...repeat(0.0001, 40),
      ...repeat(0.5, 12),
      ...repeat(0.0001, 2),
      ...repeat(0.5, 3), // the tail swelling right after the key-up
      ...repeat(0.0001, 10),
      ...repeat(0.5, 12),
      ...repeat(0.0001, 40),
    ];
    const marks = (refractory: number) => {
      const d = new KeyingDetector();
      d.setRefractory(refractory);
      const out: KeyingSegment[] = [];
      signal.forEach((a, i) => d.push(a, (i + 1) * HOP, HOP, (s) => out.push(s)));
      return out.filter((s) => s.state === 'mark').map((s) => Math.round(s.duration / HOP));
    };
    expect(marks(0)).toEqual([12, 3, 12]);
    expect(marks(6 * HOP)).toEqual([12, 12]);
  });

  it('drops a running mark on restart', () => {
    const d = new KeyingDetector();
    const out: KeyingSegment[] = [];
    const push = (a: number, hops: number, from: number) => {
      for (let i = 0; i < hops; i++) d.push(a, (from + i + 1) * HOP, HOP, (s) => out.push(s));
    };
    push(0.0001, 40, 0);
    push(0.5, 30, 40);
    d.restart(70 * HOP);
    expect(d.isKeyDown).toBe(false);
    push(0.0001, 20, 70);
    expect(out.filter((s) => s.state === 'mark')).toEqual([]);
  });

  it('ignores noise without a tone', () => {
    const noise = Array.from({ length: 400 }, (_, i) => 0.0005 + 0.0004 * Math.sin(i * 1.7));
    expect(run(noise).filter((s) => s.state === 'mark')).toEqual([]);
  });
});
