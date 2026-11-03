import { SignalGenerator, mix, tone, whiteNoise } from '../../audio/synthesis/signal';
import { scheduleMorse } from '../../decoders/morse/morse-timing';

export const DEMO_TEXT = 'CQ CQ DE AUDIOLAB K';

/** Demo input: a looping Morse message on 700 Hz with light noise – try AudioLab without a microphone. */
export function demoSignal(): SignalGenerator {
  const schedule = scheduleMorse(DEMO_TEXT, { wpm: 18, leadIn: 0.4 });
  return mix(
    tone({
      frequency: 700,
      amplitude: 0.4,
      spans: schedule.elements,
      loopSeconds: schedule.duration + 0.6,
    }),
    whiteNoise(0.01, 7),
  );
}
