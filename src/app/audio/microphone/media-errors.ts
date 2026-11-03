import { AudioSourceError } from '../audio-source';

/** Maps `getUserMedia` / `AudioContext` failures to {@link AudioSourceError}. Never includes audio. */
export function mapCaptureError(err: unknown): AudioSourceError {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  const detail = err instanceof Error ? err.message : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return { kind: 'permission-denied', detail };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return { kind: 'no-device', detail };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return { kind: 'device-busy', detail };
    case 'NotSupportedError':
    case 'TypeError':
      return { kind: 'unsupported', detail };
    default:
      return { kind: 'unknown', detail };
  }
}
