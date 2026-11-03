import { AudioFrame } from '../audio/audio-frame';

/** Base shape of everything a decoder emits. */
export interface DecoderEvent {
  readonly type: string;
  /** Seconds on the frame clock (see {@link AudioFrame.timestamp}). */
  readonly timestamp: number;
}

/**
 * A decoder turns audio frames into events. Pure TypeScript: no Angular, RxJS or Tauri,
 * so it can be driven by synthetic signals in tests.
 */
export interface SignalDecoder<TConfig = unknown, TResult extends DecoderEvent = DecoderEvent> {
  readonly id: string;
  readonly name: string;
  configure(config: Partial<TConfig>): void;
  /** Must not keep a reference to `frame.samples` (buffers are reused). */
  process(frame: AudioFrame): TResult[];
  reset(): void;
}
