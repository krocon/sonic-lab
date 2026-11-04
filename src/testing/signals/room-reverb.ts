import { FFT } from '../../app/audio/dsp/fft';
import { createGaussian, createRandom } from '../../app/audio/synthesis/random';

export interface RoomReverbOptions {
  /** Reverberation time (−60 dB), seconds. */
  readonly rt60Seconds: number;
  /** Reverberant share of the total energy, 0..1 (0.5 ≈ listening at the critical distance). */
  readonly wet: number;
  readonly seed?: number;
}

/**
 * Room reverb: convolution with exponentially decaying white noise (statistical room model,
 * RT60 in seconds), via FFT overlap-add. Unlike comb-filter reverbs it treats every tone
 * frequency alike – a sustained tone in a real room fluctuates and rings out the same way.
 * `wet` is the reverberant share of the total energy.
 */
export function roomReverb(
  input: Float32Array,
  rate: number,
  { rt60Seconds, wet, seed = 4711 }: RoomReverbOptions,
): Float32Array {
  const rt60 = rt60Seconds;
  const taps = Math.max(1, Math.round(rt60 * rate));
  const random = createGaussian(createRandom(seed));
  const ir = new Float64Array(taps);
  let energy = 0;
  for (let i = 0; i < taps; i++) {
    ir[i] = random() * Math.pow(10, (-3 * i) / taps);
    energy += (ir[i] ?? 0) ** 2;
  }
  const gWet = Math.sqrt(wet / energy);
  const gDry = Math.sqrt(1 - wet);
  let size = 2;
  while (size < 2 * taps) size *= 2;
  const fft = new FFT(size);
  const hop = size - taps + 1;
  const irRe = new Float64Array(size);
  const irIm = new Float64Array(size);
  irRe.set(ir);
  fft.transform(irRe, irIm);
  const out = new Float32Array(input.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start < input.length; start += hop) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < hop && start + i < input.length; i++) re[i] = input[start + i] ?? 0;
    fft.transform(re, im);
    for (let k = 0; k < size; k++) {
      const a = re[k] ?? 0,
        b = im[k] ?? 0,
        c = irRe[k] ?? 0,
        d = irIm[k] ?? 0;
      re[k] = a * c - b * d;
      im[k] = -(a * d + b * c); // conjugate → forward FFT acts as inverse
    }
    fft.transform(re, im);
    for (let i = 0; i < size && start + i < out.length; i++)
      out[start + i] = (out[start + i] ?? 0) + (gWet * (re[i] ?? 0)) / size;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + gDry * (input[i] ?? 0);
  return out;
}
