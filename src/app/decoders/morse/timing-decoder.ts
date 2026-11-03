import { decodeMorse } from './morse-alphabet';
import { KeyingSegment } from './keying-detector';
import { unitSeconds } from './morse-timing';
import { estimateUnit } from './unit-estimator';

/**
 * Stages 4–5 of the Morse chain: classifies mark/space durations relative to an adaptive time
 * unit and assembles characters and words.
 *
 * Decisions are deferred: until the unit estimate is confident, segments are buffered and
 * re-classified once it is (or once a long silence ends the transmission). Afterwards a
 * character is committed as soon as the following gap exceeds the character-gap threshold.
 */
export interface TimingDecoderConfig {
  /** Prior speed before anything has been heard. */
  readonly initialWpm: number;
  /** Mark ≥ this many units = dah (standard boundary 2). */
  readonly dahThreshold: number;
  /** Space ≥ this many units = character gap (between 1 and 3). */
  readonly charGapThreshold: number;
  /** Space ≥ this many units = word gap (between 3 and 7). */
  readonly wordGapThreshold: number;
  /** Silence after which buffered segments are decoded even without a confident estimate, s. */
  readonly flushAfter: number;
  /** Number of recent marks/spaces used for the estimate. */
  readonly history: number;
}

export const DEFAULT_TIMING_CONFIG: TimingDecoderConfig = {
  initialWpm: 20,
  dahThreshold: 2,
  charGapThreshold: 2,
  wordGapThreshold: 5,
  flushAfter: 1.5,
  history: 24,
};

export type TimingEvent =
  | {
      readonly type: 'character';
      readonly timestamp: number;
      readonly code: string;
      readonly text: string;
      readonly known: boolean;
    }
  | { readonly type: 'word-gap'; readonly timestamp: number }
  | { readonly type: 'wpm'; readonly timestamp: number; readonly wpm: number };

interface Segment {
  readonly mark: boolean;
  readonly start: number;
  readonly duration: number;
}

export class TimingDecoder {
  private config = DEFAULT_TIMING_CONFIG;
  private marks: number[] = [];
  private spaces: number[] = [];
  private pending: Segment[] = [];
  private unit = unitSeconds(DEFAULT_TIMING_CONFIG.initialWpm);
  private confident = false;
  private wordGapEmitted = true;
  private reportedWpm = 0;

  configure(config: Partial<TimingDecoderConfig>): void {
    const prior = config.initialWpm !== undefined && config.initialWpm !== this.config.initialWpm;
    this.config = { ...this.config, ...config };
    if (prior && !this.confident) this.unit = unitSeconds(this.config.initialWpm);
  }

  reset(): void {
    this.marks = [];
    this.spaces = [];
    this.pending = [];
    this.unit = unitSeconds(this.config.initialWpm);
    this.confident = false;
    this.wordGapEmitted = true;
    this.reportedWpm = 0;
  }

  /** Current unit estimate, seconds. */
  get unitSeconds(): number {
    return this.unit;
  }

  get isConfident(): boolean {
    return this.confident;
  }

  /** Dit/dah string of the character currently being keyed (provisional). */
  get pendingCode(): string {
    return this.pending
      .filter((s) => s.mark)
      .map((s) => this.symbol(s.duration))
      .join('');
  }

  /** A mark or space has ended. */
  push(segment: KeyingSegment, out: TimingEvent[]): void {
    const mark = segment.state === 'mark';
    if (!mark && this.pending.length === 0) {
      // leading silence: only relevant for a word gap after committed text
      this.silence(segment.start + segment.duration, segment.duration, out);
      return;
    }
    this.remember(mark ? this.marks : this.spaces, segment.duration);
    this.pending.push({ mark, start: segment.start, duration: segment.duration });
    if (mark) this.wordGapEmitted = false;
    this.reestimate(out, segment.start + segment.duration);
    if (this.confident) this.commit(out, false);
  }

  /** Called periodically while the key is up; `silence` = current gap length so far. */
  idle(time: number, silence: number, out: TimingEvent[]): void {
    this.silence(time, silence, out);
  }

  private silence(time: number, silence: number, out: TimingEvent[]): void {
    if (this.pending.length > 0) {
      const hasMark = this.pending.some((s) => s.mark);
      if (!hasMark) {
        this.pending = [];
      } else if (
        this.confident
          ? silence >= this.config.charGapThreshold * this.unit
          : silence >= this.config.flushAfter
      ) {
        this.commit(out, true);
      }
    }
    if (
      !this.wordGapEmitted &&
      this.pending.length === 0 &&
      silence >= this.config.wordGapThreshold * this.unit
    ) {
      out.push({ type: 'word-gap', timestamp: time });
      this.wordGapEmitted = true;
    }
  }

  private reestimate(out: TimingEvent[], time: number): void {
    const prior = this.confident ? this.unit : unitSeconds(this.config.initialWpm);
    const est = estimateUnit(this.marks, this.spaces, prior);
    this.unit = est.unit;
    this.confident ||= est.confident;
    const wpm = Math.round(1.2 / this.unit);
    if (this.confident && wpm !== this.reportedWpm) {
      this.reportedWpm = wpm;
      out.push({ type: 'wpm', timestamp: time, wpm });
    }
  }

  /**
   * Walks the pending segments and emits every character that is followed by a character or word
   * gap. With `final`, the trailing character is emitted too (the silence after it is long enough).
   */
  private commit(out: TimingEvent[], final: boolean): void {
    let code = '';
    let charStart = 0;
    let consumed = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const s = this.pending[i] as Segment;
      if (s.mark) {
        if (code === '') charStart = s.start;
        code += this.symbol(s.duration);
        continue;
      }
      const units = s.duration / this.unit;
      if (units < this.config.charGapThreshold) continue; // element gap
      if (code) this.emitChar(code, charStart, out);
      if (units >= this.config.wordGapThreshold) {
        out.push({ type: 'word-gap', timestamp: s.start });
        this.wordGapEmitted = true;
      }
      code = '';
      consumed = i + 1;
    }
    if (final && code) {
      this.emitChar(code, charStart, out);
      consumed = this.pending.length;
    }
    this.pending = this.pending.slice(consumed);
  }

  private emitChar(code: string, timestamp: number, out: TimingEvent[]): void {
    const lookup = decodeMorse(code);
    out.push(
      lookup.known
        ? { type: 'character', timestamp, code, text: lookup.text, known: true }
        : { type: 'character', timestamp, code, text: '�', known: false },
    );
  }

  private symbol(duration: number): '.' | '-' {
    return duration >= this.config.dahThreshold * this.unit ? '-' : '.';
  }

  private remember(list: number[], value: number): void {
    list.push(value);
    if (list.length > this.config.history) list.shift();
  }
}
