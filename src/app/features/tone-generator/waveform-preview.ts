import { GeneratorWaveform } from '../../audio/output/tone-generator';

export const PREVIEW_WIDTH = 300;
export const PREVIEW_HEIGHT = 100;
const POINTS = 300;
const PERIODS = 3;

/** Deterministic noise, so the preview does not flicker between renders. */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

/**
 * SVG path of a few periods of a waveform for the display (−1…1 mapped into a 300 × 100 box).
 * `ratio` is the second frequency relative to the first (two-tone, DTMF); sweeps show a chirp.
 */
export function waveformPath(waveform: GeneratorWaveform, ratio = 2): string {
  const rnd = noise(7);
  let pink = 0;
  const sample = (t: number): number => {
    const phase = t * PERIODS;
    const frac = phase - Math.floor(phase);
    switch (waveform) {
      case 'sine':
        return Math.sin(2 * Math.PI * phase);
      case 'square':
        return frac < 0.5 ? 1 : -1;
      case 'triangle':
        return 1 - 4 * Math.abs(frac - 0.5);
      case 'sawtooth':
        return 2 * frac - 1;
      case 'white-noise':
        return rnd();
      case 'pink-noise':
        pink = 0.85 * pink + 0.15 * rnd() * 3;
        return Math.max(-1, Math.min(1, pink));
      case 'sweep-linear':
        return Math.sin(2 * Math.PI * (2 * t + 4 * t * t));
      case 'sweep-log':
        return Math.sin(2 * Math.PI * ((Math.pow(8, t) - 1) / Math.log(8)) * 3);
      case 'two-tone':
      case 'dtmf':
        return (Math.sin(2 * Math.PI * phase) + Math.sin(2 * Math.PI * phase * ratio)) / 2;
    }
  };
  let d = '';
  for (let i = 0; i <= POINTS; i++) {
    const t = i / POINTS;
    const x = (t * PREVIEW_WIDTH).toFixed(1);
    const y = ((1 - sample(t) * 0.85) * (PREVIEW_HEIGHT / 2)).toFixed(1);
    d += `${i ? 'L' : 'M'}${x} ${y}`;
  }
  return d;
}
