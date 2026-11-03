import { AudioFrame } from './audio-frame';

export interface AudioInputDevice {
  readonly id: string;
  /** Empty until the user granted microphone access (browser privacy rule). */
  readonly label: string;
  readonly isDefault?: boolean;
}

export type AudioSourceErrorKind =
  | 'permission-denied'
  | 'no-device'
  | 'device-busy'
  | 'device-lost'
  | 'insecure-context'
  | 'unsupported'
  | 'unknown';

export interface AudioSourceError {
  readonly kind: AudioSourceErrorKind;
  /** Technical detail for diagnostics; never contains audio data. */
  readonly detail?: string;
}

/** Lifecycle of an {@link AudioSource}. */
export type AudioSourceState =
  | { readonly status: 'idle' }
  | { readonly status: 'requesting-permission' }
  | { readonly status: 'running'; readonly deviceId?: string; readonly sampleRate: number }
  | { readonly status: 'stopped' }
  | { readonly status: 'error'; readonly error: AudioSourceError };

export type AudioFrameListener = (frame: AudioFrame) => void;
export type AudioStateListener = (state: AudioSourceState) => void;

/**
 * Producer of audio frames (microphone, synthetic generator, file, …).
 * Implementations are framework-free and must release every resource in `stop()`.
 */
export interface AudioSource {
  readonly state: AudioSourceState;
  listDevices(): Promise<AudioInputDevice[]>;
  /** Starts capture. Resolves once running; on failure the state becomes `error` and the promise rejects. */
  start(deviceId?: string): Promise<void>;
  /** Stops capture and releases the device. Safe to call in any state. */
  stop(): Promise<void>;
  /** Frames are delivered synchronously; keep listeners cheap. Returns an unsubscribe function. */
  subscribe(listener: AudioFrameListener): () => void;
  onStateChange(listener: AudioStateListener): () => void;
  /** Optional: notifies when input devices are plugged in or removed. */
  onDevicesChanged?(listener: () => void): () => void;
}

export function isAudioSourceError(value: unknown): value is AudioSourceError {
  return typeof value === 'object' && value !== null && 'kind' in value;
}
