/**
 * Messages between the capture worklet and the main thread.
 * Shared by `capture-processor.ts` (worklet) and `BrowserMicrophoneSource` (main thread).
 */
export const CAPTURE_PROCESSOR_NAME = 'audiolab-capture';

export interface CaptureProcessorOptions {
  /** Samples per posted block. */
  readonly blockSize: number;
  /** Number of buffers circulating between worklet and main thread. */
  readonly poolSize: number;
}

/** Worklet → main: a filled block. `buffer` is transferred (zero-copy). */
export interface CaptureBlockMessage {
  readonly type: 'block';
  readonly buffer: ArrayBuffer;
  /** Frame index (sample count since context start) of the first sample. */
  readonly frame: number;
}

/** Worklet → main: blocks were dropped because the main thread did not return buffers. */
export interface CaptureOverrunMessage {
  readonly type: 'overrun';
  readonly dropped: number;
}

export type CaptureWorkletMessage = CaptureBlockMessage | CaptureOverrunMessage;

/** Main → worklet: give a buffer back for reuse. */
export interface CaptureRecycleMessage {
  readonly type: 'recycle';
  readonly buffer: ArrayBuffer;
}
