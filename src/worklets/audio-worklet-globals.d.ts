// Minimal AudioWorkletGlobalScope typings (not part of TypeScript's DOM lib).
// See https://webaudio.github.io/web-audio-api/#AudioWorkletGlobalScope

declare const sampleRate: number;
declare const currentFrame: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

interface AudioWorkletNodeOptions {
  processorOptions?: unknown;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;
