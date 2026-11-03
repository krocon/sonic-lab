import { KeyedSpan, SignalGenerator, mix, tone, whiteNoise } from '../../audio/synthesis/signal';

/** Keying pattern "CQ" at 18 WPM (unit = 1.2 / wpm s), repeated with a pause. */
function cqSpans(wpm: number): { spans: KeyedSpan[]; length: number } {
  const unit = 1.2 / wpm;
  const pattern = ['-.-.', '--.-'];
  const spans: KeyedSpan[] = [];
  let t = 0.3;
  for (const ch of pattern) {
    for (const el of ch) {
      const len = el === '-' ? 3 * unit : unit;
      spans.push({ start: t, end: t + len });
      t += len + unit;
    }
    t += 2 * unit;
  }
  return { spans, length: t + 7 * unit };
}

/** Demo input: a keyed 700 Hz tone with light noise – lets people try AudioLab without a microphone. */
export function demoSignal(): SignalGenerator {
  const { spans, length } = cqSpans(18);
  return mix(
    tone({ frequency: 700, amplitude: 0.4, spans, loopSeconds: length }),
    whiteNoise(0.01, 7),
  );
}
