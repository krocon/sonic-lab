import { render } from '../../app/audio/synthesis/signal';
import { MorseToneOptions, morseTone } from '../../app/decoders/morse/morse-synthesis';

export interface MorseSignalOptions extends MorseToneOptions {
  readonly sampleRate?: number;
}

/** Renders text as a keyed sine tone (deterministic) – the same synthesis the app uses. */
export function morseSignal(
  text: string,
  options: MorseSignalOptions,
): { samples: Float32Array; sampleRate: number } {
  const sampleRate = options.sampleRate ?? 48000;
  const { generator, schedule } = morseTone(text, { leadIn: 0.3, rampSeconds: 0.004, ...options });
  return { samples: render(generator, schedule.duration, sampleRate), sampleRate };
}
