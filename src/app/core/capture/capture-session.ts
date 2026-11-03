import { DOCUMENT, DestroyRef, InjectionToken, computed, inject, signal } from '@angular/core';
import { AudioFrame } from '../../audio/audio-frame';
import {
  AudioInputDevice,
  AudioSource,
  AudioSourceState,
  isAudioSourceError,
} from '../../audio/audio-source';
import { StatusMessage, describeSourceState } from '../status/status-message';
import { CaptureActivity } from './capture-activity';
import { CaptureSettings, captureSettingsStore } from './capture-settings';
import { SettingsStore } from '../settings/settings-store';

/** The audio source a capture session drives (microphone in the app, fakes in tests). */
export const AUDIO_SOURCE = new InjectionToken<AudioSource>('AUDIO_SOURCE');

/** Device ids that are not real microphones (they don't light up the microphone indicator). */
export const VIRTUAL_DEVICE_IDS = new InjectionToken<readonly string[]>('VIRTUAL_DEVICE_IDS', {
  factory: () => [],
});

export const CAPTURE_SETTINGS = new InjectionToken<SettingsStore<CaptureSettings>>(
  'CAPTURE_SETTINGS',
  {
    factory: captureSettingsStore,
  },
);

export type FrameConsumer = (frame: AudioFrame) => void;

/**
 * Application-layer use case "capture audio and feed consumers".
 *
 * Frames go straight from the source to registered consumers (decoders, ring buffers) without
 * touching signals, so per-frame work never triggers change detection. Only lifecycle state,
 * devices and the selected device are signals.
 *
 * Provide it per feature page (`providers: [CaptureSession]`) so leaving the page stops capture.
 */
export class CaptureSession {
  private readonly source = inject(AUDIO_SOURCE);
  private readonly activity = inject(CaptureActivity);
  private readonly virtualIds = inject(VIRTUAL_DEVICE_IDS);
  private readonly settings = inject(CAPTURE_SETTINGS);
  private readonly consumers = new Set<FrameConsumer>();
  private unsubscribeFrames: (() => void) | null = null;
  private countedAsMicrophone = false;

  private readonly stateSignal = signal<AudioSourceState>(this.source.state);
  readonly state = this.stateSignal.asReadonly();
  readonly running = computed(() => this.state().status === 'running');
  readonly busy = computed(() => this.state().status === 'requesting-permission');
  readonly status = computed<StatusMessage>(() => describeSourceState(this.state()));
  readonly devices = signal<readonly AudioInputDevice[]>([]);
  readonly selectedDeviceId = signal(this.settings.load().deviceId);
  /** Set when the remembered device vanished and the default is used instead. */
  readonly notice = signal<StatusMessage | null>(null);

  constructor() {
    const offState = this.source.onStateChange((s) => this.onState(s));
    const offDevices = this.source.onDevicesChanged?.(() => void this.refreshDevices());
    const win = inject(DOCUMENT).defaultView;
    const onPageHide = () => void this.stop();
    win?.addEventListener('pagehide', onPageHide);
    inject(DestroyRef).onDestroy(() => {
      offState();
      offDevices?.();
      win?.removeEventListener('pagehide', onPageHide);
      void this.stop();
      this.consumers.clear();
      this.setMicrophoneOpen(false);
    });
  }

  /** Registers a frame consumer; returns its removal function. */
  addConsumer(consumer: FrameConsumer): () => void {
    this.consumers.add(consumer);
    return () => this.consumers.delete(consumer);
  }

  async refreshDevices(): Promise<void> {
    let devices: AudioInputDevice[];
    try {
      devices = await this.source.listDevices();
    } catch {
      devices = [];
    }
    this.devices.set(devices);
    const selected = this.selectedDeviceId();
    const knownIds = devices.filter((d) => d.label).map((d) => d.id);
    if (selected && knownIds.length > 0 && !devices.some((d) => d.id === selected)) {
      this.selectedDeviceId.set('');
      this.notice.set({
        tone: 'warning',
        text: 'The previously used input is not available – using the default input.',
      });
    }
  }

  selectDevice(deviceId: string): void {
    this.selectedDeviceId.set(deviceId);
    this.notice.set(null);
    this.settings.save({ deviceId });
    if (this.running()) void this.restart();
  }

  async start(): Promise<void> {
    if (this.running() || this.busy()) return;
    this.unsubscribeFrames ??= this.source.subscribe((frame) => {
      for (const consumer of this.consumers) consumer(frame);
    });
    try {
      await this.source.start(this.selectedDeviceId() || undefined);
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

  async toggle(): Promise<void> {
    return this.running() ? this.stop() : this.start();
  }

  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private onState(state: AudioSourceState): void {
    this.stateSignal.set(state);
    const isMic = state.status === 'running' && !this.virtualIds.includes(this.selectedDeviceId());
    this.setMicrophoneOpen(isMic || state.status === 'requesting-permission');
    if (state.status === 'error') this.detachFrames();
  }

  private setMicrophoneOpen(open: boolean): void {
    if (open === this.countedAsMicrophone) return;
    this.countedAsMicrophone = open;
    this.activity.adjust(open ? 1 : -1);
  }

  private detachFrames(): void {
    this.unsubscribeFrames?.();
    this.unsubscribeFrames = null;
  }
}
