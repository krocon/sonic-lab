/**
 * A block of mono PCM samples from an {@link AudioSource}.
 *
 * Ownership: `samples` is only valid during the listener call. Sources reuse their
 * buffers to avoid garbage in the audio hot path – copy (`samples.slice()`) to keep data.
 */
export interface AudioFrame {
  /** Mono samples in the range [-1, 1]. */
  readonly samples: Float32Array;
  /** Samples per second of `samples`, e.g. 48000. Never assume a fixed rate. */
  readonly sampleRate: number;
  /** Time of the first sample in seconds on the source's clock (AudioContext time or sample count). */
  readonly timestamp: number;
}
