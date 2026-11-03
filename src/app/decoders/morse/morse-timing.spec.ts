import { scheduleMorse, unitSeconds, wpmFromUnit } from './morse-timing';

describe('Morse timing', () => {
  it('uses the PARIS standard', () => {
    expect(unitSeconds(20)).toBeCloseTo(0.06, 10);
    expect(wpmFromUnit(0.06)).toBeCloseTo(20, 10);
    // PARIS + word gap = 50 units
    const s = scheduleMorse('PARIS', { wpm: 20 });
    expect(s.duration / unitSeconds(20)).toBeCloseTo(50, 6);
  });

  it('places elements, character and word gaps', () => {
    const u = unitSeconds(10);
    const s = scheduleMorse('A E', { wpm: 10 });
    const e = s.elements.map((x) => [x.kind, +(x.start / u).toFixed(6), +(x.end / u).toFixed(6)]);
    // A: dit 0–1, gap, dah 2–5; word gap 7 units; E: dit 12–13
    expect(e).toEqual([
      ['dit', 0, 1],
      ['dah', 2, 5],
      ['dit', 12, 13],
    ]);
  });

  it('stretches only gaps for Farnsworth timing', () => {
    const normal = scheduleMorse('PARIS PARIS', { wpm: 20 });
    const fw = scheduleMorse('PARIS PARIS', { wpm: 20, farnsworthWpm: 10 });
    const len = (x: { start: number; end: number }) => x.end - x.start;
    fw.elements.forEach((el, i) =>
      expect(len(el)).toBeCloseTo(len(normal.elements[i] as typeof el), 9),
    );
    expect(fw.duration).toBeGreaterThan(normal.duration * 1.6);
  });

  it('skips unsupported characters', () => {
    const s = scheduleMorse('AÄB', { wpm: 20 });
    expect(s.tokens.map((t) => t.kind)).toEqual(['char', 'unsupported', 'char']);
    expect(s.elements.length).toBe(2 + 4);
  });
});
