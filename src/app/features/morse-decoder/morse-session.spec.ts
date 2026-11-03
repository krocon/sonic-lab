import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { morseSignal } from '../../../testing/signals/morse-signal';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { MorseSession } from './morse-session';

describe('MorseSession', () => {
  let source: FakeAudioSource;
  let session: MorseSession;

  beforeEach(() => {
    localStorage.clear();
    source = new FakeAudioSource();
    TestBed.configureTestingModule({
      providers: [CaptureSession, MorseSession, { provide: AUDIO_SOURCE, useValue: source }],
    });
    session = TestBed.inject(MorseSession);
  });

  async function play(text: string, wpm = 20): Promise<void> {
    await TestBed.inject(CaptureSession).start();
    const { samples } = morseSignal(text, { wpm, sampleRate: 48000 });
    const padded = new Float32Array(samples.length + 96000);
    padded.set(samples);
    for (let i = 0; i < padded.length; i += 1024) source.emit(padded.slice(i, i + 1024), i / 48000);
  }

  it('decodes captured frames into text, Morse and speed', async () => {
    await play('HI THERE', 22);
    // a word gap after the last word is shown live as a trailing space / slash
    expect(session.text()).toBe('HI THERE ');
    expect(session.morse()).toBe('.... .. / - .... . .-. . /');
    expect(session.wpm()).toBeGreaterThanOrEqual(21);
    expect(session.wpm()).toBeLessThanOrEqual(23);
    expect(session.frequency()).toBeCloseTo(700, -2);
  });

  it('resets output and learned timing', async () => {
    await play('AB');
    session.reset();
    expect(session.text()).toBe('');
    expect(session.wpm()).toBeNull();
    expect(session.hasOutput()).toBe(false);
  });

  it('persists settings', () => {
    session.updateSettings({ frequencyMode: 'manual', frequency: 650, sensitivity: 'high' });
    const stored = JSON.parse(localStorage.getItem('audiolab.morse') ?? '{}');
    expect(stored.data).toMatchObject({
      frequencyMode: 'manual',
      frequency: 650,
      sensitivity: 'high',
    });
  });
});
