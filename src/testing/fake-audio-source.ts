import { AudioFrame } from '../app/audio/audio-frame';
import {
  AudioFrameListener,
  AudioInputDevice,
  AudioSource,
  AudioSourceError,
  AudioSourceState,
  AudioStateListener,
} from '../app/audio/audio-source';

/** Scriptable {@link AudioSource} for tests: emits frames on demand, can fail on start. */
export class FakeAudioSource implements AudioSource {
  state: AudioSourceState = { status: 'idle' };
  devices: AudioInputDevice[] = [{ id: 'default', label: 'Fake microphone', isDefault: true }];
  failWith: AudioSourceError | null = null;
  sampleRate = 48000;
  startCalls = 0;
  stopCalls = 0;
  private readonly frameListeners = new Set<AudioFrameListener>();
  private readonly stateListeners = new Set<AudioStateListener>();

  get frameListenerCount(): number {
    return this.frameListeners.size;
  }

  async listDevices(): Promise<AudioInputDevice[]> {
    return this.devices;
  }

  async start(deviceId?: string): Promise<void> {
    this.startCalls++;
    this.setState({ status: 'requesting-permission' });
    if (this.failWith) {
      const error = this.failWith;
      this.setState({ status: 'error', error });
      throw error;
    }
    this.setState({ status: 'running', deviceId, sampleRate: this.sampleRate });
  }

  async stop(): Promise<void> {
    this.stopCalls++;
    if (this.state.status === 'running' || this.state.status === 'requesting-permission') {
      this.setState({ status: 'stopped' });
    }
  }

  subscribe(listener: AudioFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onStateChange(listener: AudioStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  emit(samples: Float32Array, timestamp = 0): void {
    const frame: AudioFrame = { samples, sampleRate: this.sampleRate, timestamp };
    for (const l of this.frameListeners) l(frame);
  }

  setState(state: AudioSourceState): void {
    this.state = state;
    for (const l of this.stateListeners) l(state);
  }
}
