import { WavFormat, encodeWav } from './wav';

/**
 * In-memory mono recording of captured frames, bounded by `maxSeconds` to protect memory.
 * Frames are copied (capture buffers are reused). Nothing is written anywhere unless exported.
 */
export class AudioRecorder {
  private chunks: Float32Array[] = [];
  private frames = 0;
  sampleRate = 48000;
  full = false;

  constructor(readonly maxSeconds = 600) {}

  get seconds(): number {
    return this.frames / this.sampleRate;
  }

  get isEmpty(): boolean {
    return this.frames === 0;
  }

  /** Share of the maximum length used, 0..1. */
  get fill(): number {
    return Math.min(1, this.seconds / this.maxSeconds);
  }

  push(samples: Float32Array, sampleRate: number): void {
    if (this.full) return;
    if (this.frames === 0) this.sampleRate = sampleRate;
    const room = Math.floor(this.maxSeconds * this.sampleRate) - this.frames;
    const take = Math.min(room, samples.length);
    if (take > 0) {
      this.chunks.push(samples.slice(0, take));
      this.frames += take;
    }
    if (take < samples.length || room - take <= 0) this.full = true;
  }

  /** All samples as one array (for playback). */
  samples(): Float32Array {
    const out = new Float32Array(this.frames);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  toWav(format: WavFormat = 'pcm16'): ArrayBuffer {
    return encodeWav(this.chunks, this.sampleRate, format);
  }

  clear(): void {
    this.chunks = [];
    this.frames = 0;
    this.full = false;
  }
}
