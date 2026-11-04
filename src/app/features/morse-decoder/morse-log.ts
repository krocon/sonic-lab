import { Injectable, signal } from '@angular/core';

/** One line of the log: what was decoded in one go, without a long pause. */
export interface MorseLogEntry {
  /** Wall-clock time of the line's first character. */
  readonly time: Date;
  readonly text: string;
  /** Speed estimate while the line was keyed (null before one was confident). */
  readonly wpm: number | null;
}

/** Oldest lines are dropped beyond this. */
const MAX_ENTRIES = 1000;
/** A line this long is continued in a new one. */
const MAX_LINE = 2000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local time as HH:MM:SS. */
export function formatLogTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Local date as YYYY-MM-DD. */
export function formatLogDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The log as plain text: "YYYY-MM-DD HH:MM:SS  20 WPM  TEXT", one line per entry. */
export function formatLog(entries: readonly MorseLogEntry[]): string {
  return entries
    .map((e) => {
      const wpm = e.wpm === null ? '--' : String(Math.round(e.wpm)).padStart(2);
      return `${formatLogDate(e.time)} ${formatLogTime(e.time)}  ${wpm} WPM  ${e.text}`;
    })
    .join('\n');
}

/**
 * Everything the Morse decoder decoded while the app runs, line by line with time and speed. A
 * line ends at a long pause, a capture restart or a reset (see `MorseSession`). Kept in memory
 * only – it survives switching modes, but nothing is stored unless the user exports it.
 */
@Injectable({ providedIn: 'root' })
export class MorseLog {
  private readonly list = signal<readonly MorseLogEntry[]>([]);
  readonly entries = this.list.asReadonly();
  /** Clock for line times; tests replace it. */
  now = (): Date => new Date();
  /** Whether the last line still takes characters. */
  private open = false;
  /** A word gap was heard; the next character in this line gets a space before it. */
  private gap = false;

  /** Adds decoded text to the current line, or starts a new line with it. */
  append(text: string, wpm: number | null): void {
    if (!text) return;
    const list = this.list();
    const last = list.at(-1);
    if (this.open && last && last.text.length < MAX_LINE) {
      const next = {
        ...last,
        text: last.text + (this.gap ? ' ' : '') + text,
        wpm: wpm ?? last.wpm,
      };
      this.list.set([...list.slice(0, -1), next]);
    } else {
      this.list.set([...list, { time: this.now(), text, wpm }].slice(-MAX_ENTRIES));
    }
    this.open = true;
    this.gap = false;
  }

  /** Word gap: the next character of this line starts a new word. */
  space(): void {
    if (this.open) this.gap = true;
  }

  /** Ends the current line; the next character starts a new one. */
  endLine(): void {
    this.open = false;
    this.gap = false;
  }

  clear(): void {
    this.list.set([]);
    this.endLine();
  }

  toText(): string {
    return formatLog(this.list());
  }
}
