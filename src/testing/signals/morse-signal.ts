import { mix, render, tone, whiteNoise } from '../../app/audio/synthesis/signal';
import { MorseTimingOptions, scheduleMorse } from '../../app/decoders/morse/morse-timing';

export interface MorseSignalOptions extends MorseTimingOptions {
  readonly frequency?: number;
  readonly amplitude?: number;
  readonly sampleRate?: number;
  /** RMS of added white noise (0 = none). */
  readonly noiseRms?: number;
  readonly seed?: number;
  readonly rampSeconds?: number;
}

/** Renders text as a keyed sine tone (deterministic). */
export function morseSignal(
  text: string,
  options: MorseSignalOptions,
): { samples: Float32Array; sampleRate: number } {
  const sampleRate = options.sampleRate ?? 48000;
  const schedule = scheduleMorse(text, { leadIn: 0.3, ...options });
  const keyed = tone({
    frequency: options.frequency ?? 700,
    amplitude: options.amplitude ?? 0.5,
    spans: schedule.elements,
    rampSeconds: options.rampSeconds ?? 0.004,
  });
  const generator = options.noiseRms
    ? mix(keyed, whiteNoise(options.noiseRms, options.seed ?? 1))
    : keyed;
  return { samples: render(generator, schedule.duration, sampleRate), sampleRate };
}
