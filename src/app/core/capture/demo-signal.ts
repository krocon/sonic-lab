import { SignalGenerator } from '../../audio/synthesis/signal';
import { morseTone } from '../../decoders/morse/morse-synthesis';
import { scheduleMorse } from '../../decoders/morse/morse-timing';

export const DEMO_TEXT = 'CQ CQ DE AUDIOLAB K';

/** Demo input: a looping Morse message on 700 Hz with light noise – try AudioLab without a microphone. */
export function demoSignal(): SignalGenerator {
  const loopSeconds = scheduleMorse(DEMO_TEXT, { wpm: 18, leadIn: 0.4 }).duration + 0.6;
  return morseTone(DEMO_TEXT, {
    wpm: 18,
    leadIn: 0.4,
    amplitude: 0.4,
    loopSeconds,
    noiseRms: 0.01,
    seed: 7,
  }).generator;
}
