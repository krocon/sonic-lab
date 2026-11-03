import {
  CAPTURE_PROCESSOR_NAME,
  CaptureProcessorOptions,
  CaptureRecycleMessage,
  CaptureWorkletMessage,
} from '../../../worklets/capture-protocol';
import { AudioFrame } from '../audio-frame';
import {
  AudioFrameListener,
  AudioInputDevice,
  AudioSource,
  AudioSourceError,
  AudioSourceState,
  AudioStateListener,
} from '../audio-source';
import { mapCaptureError } from './media-errors';

/** Browser APIs the microphone source needs; injectable for tests. */
export interface MicrophoneEnvironment {
  readonly isSecureContext: boolean;
  readonly mediaDevices: MediaDevices | undefined;
  createContext(): AudioContext;
  createWorkletNode(context: AudioContext, options: AudioWorkletNodeOptions): AudioWorkletNode;
  /** URL of the bundled capture worklet (same origin, see scripts/build-worklets.mjs). */
  readonly workletUrl: string;
}

export function browserMicrophoneEnvironment(win: Window): MicrophoneEnvironment {
  return {
    isSecureContext: win.isSecureContext,
    mediaDevices: win.navigator.mediaDevices,
    createContext: () => new AudioContext({ latencyHint: 'interactive' }),
    createWorkletNode: (ctx, options) => new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME, options),
    workletUrl: new URL('worklets/capture-processor.js', win.document.baseURI).href,
  };
}

export const MICROPHONE_BLOCK_SIZE = 1024;
const RESUME_TIMEOUT_MS = 2000;

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

/**
 * Microphone capture: getUserMedia → MediaStreamSource → AudioWorklet → frames.
 * Browser voice processing (echo cancellation, noise suppression, AGC) is disabled because it
 * distorts tones and keying envelopes.
 */
export class BrowserMicrophoneSource implements AudioSource {
  private currentState: AudioSourceState = { status: 'idle' };
  private readonly frameListeners = new Set<AudioFrameListener>();
  private readonly stateListeners = new Set<AudioStateListener>();
  private readonly deviceListeners = new Set<() => void>();
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private port: MessagePort | null = null;
  private generation = 0;
  private readonly frame: { samples: Float32Array; sampleRate: number; timestamp: number } = {
    samples: new Float32Array(0),
    sampleRate: 48000,
    timestamp: 0,
  };

  constructor(private readonly env: MicrophoneEnvironment) {
    env.mediaDevices?.addEventListener?.('devicechange', () => {
      for (const l of this.deviceListeners) l();
    });
  }

  get state(): AudioSourceState {
    return this.currentState;
  }

  async listDevices(): Promise<AudioInputDevice[]> {
    const devices = (await this.env.mediaDevices?.enumerateDevices?.()) ?? [];
    return (
      devices
        // before permission some browsers return entries without id/label – they are not selectable
        .filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
        .map((d, i) => ({
          id: d.deviceId,
          label:
            d.label || (d.deviceId === 'default' ? 'Default microphone' : `Microphone ${i + 1}`),
          isDefault: d.deviceId === 'default',
        }))
    );
  }

  onDevicesChanged(listener: () => void): () => void {
    this.deviceListeners.add(listener);
    return () => this.deviceListeners.delete(listener);
  }

  async start(deviceId?: string): Promise<void> {
    if (this.currentState.status === 'running') return;
    const generation = ++this.generation;
    const { mediaDevices } = this.env;
    if (!this.env.isSecureContext) return this.fail({ kind: 'insecure-context' });
    if (!mediaDevices?.getUserMedia) return this.fail({ kind: 'unsupported' });

    this.setState({ status: 'requesting-permission' });
    // Create and resume the context *before* the first await: WebKit/Safari only lets an
    // AudioContext start inside the user gesture that called start().
    let context: AudioContext;
    let resumed: Promise<void>;
    try {
      context = this.env.createContext();
      resumed = context.resume().catch(() => undefined);
    } catch (err: unknown) {
      return this.fail(mapCaptureError(err));
    }
    this.context = context;
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 1 },
        },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop()); // stopped while the prompt was open
        return;
      }
      this.stream = stream;
      await context.audioWorklet.addModule(this.env.workletUrl);
      const source = context.createMediaStreamSource(stream);
      const node = this.env.createWorkletNode(context, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          blockSize: MICROPHONE_BLOCK_SIZE,
          // ≈ 1.4 s of reserve at 48 kHz: a busy main thread (slow machine, heavy rendering)
          // must not cost audio – blocks are only dropped after that
          poolSize: 64,
        } satisfies CaptureProcessorOptions,
      });
      // The processor writes silence; connecting to the destination keeps the graph pulled in all engines.
      source.connect(node);
      node.connect(context.destination);
      this.nodes = [source, node];
      this.port = node.port;
      this.port.onmessage = (e: MessageEvent<CaptureWorkletMessage>) =>
        this.onWorkletMessage(e.data);
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (this.currentState.status === 'running') {
            this.release();
            this.setState({ status: 'error', error: { kind: 'device-lost' } });
          }
        });
      }
      // Firefox keeps resume() pending (no rejection) while autoplay is blocked – never hang
      await withTimeout(resumed, RESUME_TIMEOUT_MS);
      if (context.state === 'suspended')
        await withTimeout(
          context.resume().catch(() => undefined),
          RESUME_TIMEOUT_MS,
        );
      if (generation !== this.generation) return;
      if (context.state !== 'running') {
        this.release();
        return this.fail({ kind: 'audio-blocked' });
      }
      this.frame.sampleRate = context.sampleRate;
      const settings = stream.getAudioTracks()[0]?.getSettings?.();
      this.setState({
        status: 'running',
        deviceId: settings?.deviceId ?? deviceId,
        sampleRate: context.sampleRate,
      });
    } catch (err: unknown) {
      this.release();
      return this.fail(mapCaptureError(err));
    }
  }

  async stop(): Promise<void> {
    this.generation++;
    const wasActive =
      this.currentState.status === 'running' ||
      this.currentState.status === 'requesting-permission';
    await this.release();
    if (wasActive) this.setState({ status: 'stopped' });
  }

  subscribe(listener: AudioFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onStateChange(listener: AudioStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private onWorkletMessage(msg: CaptureWorkletMessage): void {
    if (msg.type !== 'block') return; // overruns are expected after tab throttling; nothing to log
    const frame = this.frame;
    frame.samples = new Float32Array(msg.buffer);
    frame.timestamp = msg.frame / frame.sampleRate;
    for (const l of this.frameListeners) l(frame as AudioFrame);
    this.port?.postMessage(
      { type: 'recycle', buffer: msg.buffer } satisfies CaptureRecycleMessage,
      [msg.buffer],
    );
  }

  private async release(): Promise<void> {
    if (this.port) this.port.onmessage = null;
    this.port = null;
    for (const n of this.nodes) n.disconnect();
    this.nodes = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const ctx = this.context;
    this.context = null;
    if (ctx && ctx.state !== 'closed') {
      try {
        await ctx.close();
      } catch {
        // already closing
      }
    }
  }

  private fail(error: AudioSourceError): Promise<never> {
    this.setState({ status: 'error', error });
    return Promise.reject(error);
  }

  private setState(state: AudioSourceState): void {
    this.currentState = state;
    for (const l of this.stateListeners) l(state);
  }
}
