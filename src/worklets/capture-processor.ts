import {
  CAPTURE_PROCESSOR_NAME,
  CaptureBlockMessage,
  CaptureOverrunMessage,
  CaptureProcessorOptions,
  CaptureRecycleMessage,
} from './capture-protocol';

/**
 * Collects 128-sample render quanta into larger mono blocks and transfers them to the main
 * thread. Buffers circulate through a small pool, so steady-state capture allocates nothing.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  private readonly blockSize: number;
  private readonly pool: ArrayBuffer[] = [];
  private current: Float32Array | null = null;
  private fill = 0;
  private blockStartFrame = 0;
  private dropped = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const opts = (options?.processorOptions ?? {}) as Partial<CaptureProcessorOptions>;
    this.blockSize = opts.blockSize ?? 1024;
    for (let i = 0; i < (opts.poolSize ?? 8); i++) {
      this.pool.push(new ArrayBuffer(this.blockSize * 4));
    }
    this.port.onmessage = (event: MessageEvent<CaptureRecycleMessage>) => {
      if (event.data.type === 'recycle' && event.data.buffer.byteLength === this.blockSize * 4) {
        this.pool.push(event.data.buffer);
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const length = channels[0]?.length ?? 0;
    const count = channels.length;

    for (let i = 0; i < length; i++) {
      if (!this.current) {
        const buffer = this.pool.pop();
        if (!buffer) {
          this.dropped++;
          continue;
        }
        if (this.dropped > 0) {
          this.port.postMessage({
            type: 'overrun',
            dropped: this.dropped,
          } satisfies CaptureOverrunMessage);
          this.dropped = 0;
        }
        this.current = new Float32Array(buffer);
        this.fill = 0;
        this.blockStartFrame = currentFrame + i;
      }
      let sum = 0;
      for (let c = 0; c < count; c++) sum += channels[c]?.[i] ?? 0;
      this.current[this.fill++] = sum / count;

      if (this.fill === this.blockSize) {
        const buffer = this.current.buffer as ArrayBuffer;
        this.port.postMessage(
          { type: 'block', buffer, frame: this.blockStartFrame } satisfies CaptureBlockMessage,
          [buffer],
        );
        this.current = null;
      }
    }
    return true;
  }
}

registerProcessor(CAPTURE_PROCESSOR_NAME, CaptureProcessor);
