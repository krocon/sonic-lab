/** Recent key-down spans for display (framework-free, bounded). */
export interface TimelineSpan {
  start: number;
  end: number;
}

export class KeyingTimeline {
  private readonly spans: TimelineSpan[] = [];
  /** Latest decoder time, seconds. */
  now = 0;
  /** Start of the currently open mark, or null. */
  openSince: number | null = null;
  threshold = 0;
  level = 0;
  /** Bumped on every change so canvases can skip redraws. */
  version = 0;

  constructor(private readonly keepSeconds = 12) {}

  addMark(start: number, end: number): void {
    this.spans.push({ start, end });
    while (this.spans.length && (this.spans[0]?.end ?? 0) < end - this.keepSeconds)
      this.spans.shift();
    this.version++;
  }

  update(now: number, keyDown: boolean, level: number, threshold: number): void {
    this.now = now;
    this.level = level;
    this.threshold = threshold;
    if (keyDown && this.openSince === null) this.openSince = now;
    if (!keyDown) this.openSince = null;
    this.version++;
  }

  /** Spans overlapping [from, to], including the open mark. */
  visible(from: number): readonly TimelineSpan[] {
    const list = this.spans.filter((s) => s.end >= from);
    if (this.openSince !== null) list.push({ start: this.openSince, end: this.now });
    return list;
  }

  clear(): void {
    this.spans.length = 0;
    this.openSince = null;
    this.now = 0;
    this.version++;
  }
}
