import { SignalGenerator, mix, tone, whiteNoise } from '../../audio/synthesis/signal';
import { morseTone } from '../../decoders/morse/morse-synthesis';
import { dtmfSequence } from '../../decoders/dtmf/dtmf-tones';
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

/**
 * Demo input for the analyzers: a tone gliding 220 → 1760 Hz and back every 16 s plus a quiet
 * steady 3 kHz tone and light noise.
 */
export function demoAnalysisSignal(): SignalGenerator {
  let phase = 0;
  const glide: SignalGenerator = (out, start, sampleRate) => {
    for (let i = 0; i < out.length; i++) {
      const t = (start + i) / sampleRate;
      const p = (t % 16) / 8; // 0..2
      const octaves = 3 * (p < 1 ? p : 2 - p);
      phase += (2 * Math.PI * 220 * Math.pow(2, octaves)) / sampleRate;
      out[i] = 0.3 * Math.sin(phase);
    }
  };
  return mix(glide, tone({ frequency: 3000, amplitude: 0.05 }), whiteNoise(0.003, 3));
}

export const DTMF_DEMO_KEYS = '0123456789*#ABCD';

/** Demo input for the DTMF decoder: all 16 keys, repeated, with light noise. */
export function demoDtmfSignal(): SignalGenerator {
  const { generator, duration } = dtmfSequence(DTMF_DEMO_KEYS, {
    toneSeconds: 0.12,
    pauseSeconds: 0.12,
    leadIn: 0.3,
  });
  const loop = duration + 0.8;
  const looped: SignalGenerator = (out, start, sampleRate) => {
    // render sample by sample position modulo the loop length
    const period = Math.round(loop * sampleRate);
    const offset = start % period;
    if (offset + out.length <= period) return generator(out, offset, sampleRate);
    const first = period - offset;
    generator(out.subarray(0, first), offset, sampleRate);
    generator(out.subarray(first), 0, sampleRate);
  };
  return mix(looped, whiteNoise(0.005, 5));
}
