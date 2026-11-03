import { SignalGenerator, mix, tone, whiteNoise } from '../../audio/synthesis/signal';
import { MorseSchedule, MorseTimingOptions, scheduleMorse } from './morse-timing';

export interface MorseToneOptions extends MorseTimingOptions {
  readonly frequency?: number;
  readonly amplitude?: number;
  /** Rise/fall time of each element, s (default 5 ms – no key clicks). */
  readonly rampSeconds?: number;
  /** Repeat the message after this many seconds. */
  readonly loopSeconds?: number;
  /** RMS of added white noise. */
  readonly noiseRms?: number;
  readonly seed?: number;
}

/**
 * One synthesis path for the encoder's offline rendering, the demo input and the tests, so test
 * signals look exactly like what AudioLab itself sends.
 */
export function morseTone(
  text: string,
  options: MorseToneOptions,
): { generator: SignalGenerator; schedule: MorseSchedule } {
  const schedule = scheduleMorse(text, options);
  const keyed = tone({
    frequency: options.frequency ?? 700,
    amplitude: options.amplitude ?? 0.5,
    spans: schedule.elements,
    rampSeconds: options.rampSeconds ?? 0.005,
    loopSeconds: options.loopSeconds,
  });
  const generator = options.noiseRms
    ? mix(keyed, whiteNoise(options.noiseRms, options.seed ?? 1))
    : keyed;
  return { generator, schedule };
}
