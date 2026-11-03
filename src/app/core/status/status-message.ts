import { AudioSourceError, AudioSourceState } from '../../audio/audio-source';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** A user-facing status or error line, rendered by `app-status-banner`. */
export interface StatusMessage {
  readonly tone: StatusTone;
  readonly text: string;
  /** Optional hint what the user can do about it. */
  readonly hint?: string;
}

const ERROR_TEXT: Record<AudioSourceError['kind'], StatusMessage> = {
  'permission-denied': {
    tone: 'danger',
    text: 'Microphone access was denied.',
    hint: 'Allow microphone access in the browser or system settings, then press Start again.',
  },
  'no-device': {
    tone: 'danger',
    text: 'No microphone was found.',
    hint: 'Connect an input device or select another one.',
  },
  'device-busy': {
    tone: 'danger',
    text: 'The microphone could not be opened.',
    hint: 'Another application may be using it exclusively. Close it and try again.',
  },
  'device-lost': {
    tone: 'warning',
    text: 'The microphone was disconnected.',
    hint: 'Reconnect it or choose another input, then press Start.',
  },
  'audio-blocked': {
    tone: 'warning',
    text: 'The browser did not allow audio processing to start.',
    hint: 'Click Start again; check that autoplay is not blocked for this site.',
  },
  'insecure-context': {
    tone: 'danger',
    text: 'Microphone access needs a secure connection.',
    hint: 'Open AudioLab via https:// or http://localhost.',
  },
  unsupported: {
    tone: 'danger',
    text: 'This browser does not support audio capture.',
    hint: 'Use a current version of Chrome, Edge, Firefox or Safari.',
  },
  unknown: { tone: 'danger', text: 'Audio capture failed unexpectedly.' },
};

export function describeSourceError(error: AudioSourceError): StatusMessage {
  return ERROR_TEXT[error.kind];
}

export function describeSourceState(state: AudioSourceState): StatusMessage {
  switch (state.status) {
    case 'idle':
      return { tone: 'neutral', text: 'Idle – microphone is off' };
    case 'requesting-permission':
      return { tone: 'info', text: 'Waiting for microphone permission…' };
    case 'running':
      return { tone: 'success', text: `Listening · ${(state.sampleRate / 1000).toFixed(1)} kHz` };
    case 'stopped':
      return { tone: 'neutral', text: 'Stopped – microphone is off' };
    case 'error':
      return describeSourceError(state.error);
  }
}
