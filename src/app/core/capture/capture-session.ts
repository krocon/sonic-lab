import { DestroyRef, InjectionToken, computed, inject, signal } from '@angular/core';
import { AudioFrame } from '../../audio/audio-frame';
import {
  AudioInputDevice,
  AudioSource,
  AudioSourceState,
  isAudioSourceError,
} from '../../audio/audio-source';

/** The audio source a capture session drives (microphone in the app, fakes in tests). */
export const AUDIO_SOURCE = new InjectionToken<AudioSource>('AUDIO_SOURCE');

export type FrameConsumer = (frame: AudioFrame) => void;

/**
 * Application-layer use case "capture audio and feed consumers".
 *
 * Frames go straight from the source to registered consumers (decoders, ring buffers) without
 * touching signals, so per-frame work never triggers change detection. Only the lifecycle
 * state and the device list are exposed as signals.
 *
 * Provide it per feature page (`providers: [CaptureSession]`) so leaving the page stops capture.
 */
export class CaptureSession {
  private readonly source = inject(AUDIO_SOURCE);
  private readonly consumers = new Set<FrameConsumer>();
  private unsubscribeFrames: (() => void) | null = null;

  private readonly stateSignal = signal<AudioSourceState>(this.source.state);
  readonly state = this.stateSignal.asReadonly();
  readonly running = computed(() => this.state().status === 'running');
  readonly busy = computed(() => this.state().status === 'requesting-permission');
  readonly devices = signal<readonly AudioInputDevice[]>([]);

  constructor() {
    const offState = this.source.onStateChange((s) => this.stateSignal.set(s));
    inject(DestroyRef).onDestroy(() => {
      offState();
      void this.stop();
      this.consumers.clear();
    });
  }

  /** Registers a frame consumer; returns its removal function. */
  addConsumer(consumer: FrameConsumer): () => void {
    this.consumers.add(consumer);
    return () => this.consumers.delete(consumer);
  }

  async refreshDevices(): Promise<void> {
    try {
      this.devices.set(await this.source.listDevices());
    } catch {
      this.devices.set([]);
    }
  }

  async start(deviceId?: string): Promise<void> {
    if (this.state().status === 'running' || this.busy()) return;
    this.unsubscribeFrames ??= this.source.subscribe((frame) => {
      for (const consumer of this.consumers) consumer(frame);
    });
    try {
      await this.source.start(deviceId);
      await this.refreshDevices(); // labels become available after permission
    } catch (err: unknown) {
      this.detachFrames();
      if (!isAudioSourceError(err) && this.state().status !== 'error') {
        this.stateSignal.set({ status: 'error', error: { kind: 'unknown' } });
      }
    }
  }

  async stop(): Promise<void> {
    this.detachFrames();
    await this.source.stop();
  }

  private detachFrames(): void {
    this.unsubscribeFrames?.();
    this.unsubscribeFrames = null;
  }
}
