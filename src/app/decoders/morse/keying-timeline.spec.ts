import { KeyingTimeline } from './keying-timeline';

describe('KeyingTimeline', () => {
  it('keeps recent marks, the open mark and drops old ones', () => {
    const t = new KeyingTimeline(5);
    t.addMark(0, 0.1);
    t.addMark(1, 1.3);
    t.update(1.5, true, 0.4, 0.2);
    t.update(1.6, true, 0.4, 0.2);
    expect(t.visible(0.5)).toEqual([
      { start: 1, end: 1.3 },
      { start: 1.5, end: 1.6 },
    ]);
    t.addMark(10, 10.1);
    expect(t.visible(0)).toEqual([
      { start: 10, end: 10.1 },
      { start: 1.5, end: 1.6 },
    ]);
    t.update(10.2, false, 0, 0.2);
    expect(t.openSince).toBeNull();
    const v = t.version;
    t.clear();
    expect(t.version).toBeGreaterThan(v);
    expect(t.visible(0)).toEqual([]);
  });
});
