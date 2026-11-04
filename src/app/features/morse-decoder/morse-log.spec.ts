import { TestBed } from '@angular/core/testing';
import { MorseLog, formatLog } from './morse-log';

describe('MorseLog', () => {
  let log: MorseLog;
  let clock: Date;

  beforeEach(() => {
    log = TestBed.inject(MorseLog);
    clock = new Date(2026, 10, 4, 14, 2, 31);
    log.now = () => clock;
  });

  const type = (text: string, wpm: number | null = 20) => {
    for (const word of text.split(' ')) {
      for (const c of word) log.append(c, wpm);
      log.space();
    }
  };

  it('collects characters and word gaps into a line without trailing spaces', () => {
    log.space(); // a gap before anything was decoded is ignored
    type('CQ CQ DE');
    expect(log.entries()).toEqual([{ time: clock, text: 'CQ CQ DE', wpm: 20 }]);
  });

  it('starts a new line after endLine, with its own time and speed', () => {
    type('CQ', null);
    log.endLine();
    clock = new Date(2026, 10, 4, 14, 3, 5);
    type('DE DL1ABC', 18);
    expect(log.entries().map((e) => [e.text, e.wpm, e.time.getMinutes()])).toEqual([
      ['CQ', null, 2],
      ['DE DL1ABC', 18, 3],
    ]);
  });

  it('keeps the last known speed of a line', () => {
    log.append('A', 20);
    log.append('B', null);
    expect(log.entries()[0]?.wpm).toBe(20);
  });

  it('formats one text line per entry with local date, time and speed', () => {
    type('CQ', 7);
    log.endLine();
    type('K', null);
    expect(log.toText()).toBe('2026-11-04 14:02:31   7 WPM  CQ\n2026-11-04 14:02:31  -- WPM  K');
    expect(formatLog([])).toBe('');
  });

  it('continues an overlong line in a new one and drops the oldest lines', () => {
    for (let i = 0; i < 2001; i++) log.append('E', 20);
    expect(log.entries().map((e) => e.text.length)).toEqual([2000, 1]);
    for (let i = 0; i < 1100; i++) {
      log.endLine();
      log.append(String(i % 10), 20);
    }
    expect(log.entries()).toHaveLength(1000);
    expect(log.entries().at(-1)?.text).toBe('9');
  });

  it('clears everything', () => {
    type('AB');
    log.clear();
    log.append('C', 20);
    expect(log.entries()).toEqual([{ time: clock, text: 'C', wpm: 20 }]);
  });
});
