import { AudioSourceErrorKind } from '../../audio/audio-source';
import { describeSourceError, describeSourceState } from './status-message';

describe('status messages', () => {
  it('has a message with hint for every actionable error', () => {
    const kinds: AudioSourceErrorKind[] = [
      'permission-denied',
      'no-device',
      'device-busy',
      'device-lost',
      'insecure-context',
      'unsupported',
    ];
    for (const kind of kinds) {
      const m = describeSourceError({ kind });
      expect(m.text.length).toBeGreaterThan(0);
      expect(m.hint).toBeDefined();
    }
  });

  it('describes every state', () => {
    expect(describeSourceState({ status: 'idle' }).tone).toBe('neutral');
    expect(describeSourceState({ status: 'requesting-permission' }).text).toContain('permission');
    expect(describeSourceState({ status: 'stopped' }).text).toContain('Stopped');
    expect(describeSourceState({ status: 'error', error: { kind: 'unknown' } }).tone).toBe(
      'danger',
    );
  });

  it('describes the running state with the sample rate', () => {
    expect(describeSourceState({ status: 'running', sampleRate: 44100 }).text).toContain(
      '44.1 kHz',
    );
  });
});
