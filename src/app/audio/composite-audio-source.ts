import {
  AudioFrameListener,
  AudioInputDevice,
  AudioSource,
  AudioSourceState,
  AudioStateListener,
} from './audio-source';

export interface VirtualInput {
  readonly device: AudioInputDevice;
  readonly source: AudioSource;
}

/**
 * Presents a primary source (microphone) plus virtual inputs (e.g. a demo signal) as one
 * {@link AudioSource}. The device id passed to `start()` selects the child.
 */
export class CompositeAudioSource implements AudioSource {
  private active: AudioSource;
  private readonly frameListeners = new Set<AudioFrameListener>();
  private readonly stateListeners = new Set<AudioStateListener>();

  constructor(
    private readonly primary: AudioSource,
    private readonly virtualInputs: readonly VirtualInput[],
  ) {
    this.active = primary;
    for (const child of this.children()) {
      child.subscribe((frame) => {
        if (child === this.active) for (const l of this.frameListeners) l(frame);
      });
      child.onStateChange((state) => {
        if (child === this.active) for (const l of this.stateListeners) l(state);
      });
    }
  }

  get state(): AudioSourceState {
    return this.active.state;
  }

  isVirtual(deviceId: string | undefined): boolean {
    return this.virtualInputs.some((v) => v.device.id === deviceId);
  }

  async listDevices(): Promise<AudioInputDevice[]> {
    let real: AudioInputDevice[];
    try {
      real = await this.primary.listDevices();
    } catch {
      real = [];
    }
    return [...real, ...this.virtualInputs.map((v) => v.device)];
  }

  async start(deviceId?: string): Promise<void> {
    const next = this.virtualInputs.find((v) => v.device.id === deviceId)?.source ?? this.primary;
    if (next !== this.active) {
      await this.active.stop();
      this.active = next;
    }
    await next.start(deviceId);
  }

  async stop(): Promise<void> {
    await this.active.stop();
  }

  subscribe(listener: AudioFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onStateChange(listener: AudioStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onDevicesChanged(listener: () => void): () => void {
    return this.primary.onDevicesChanged?.(listener) ?? (() => undefined);
  }

  private children(): AudioSource[] {
    return [this.primary, ...this.virtualInputs.map((v) => v.source)];
  }
}
