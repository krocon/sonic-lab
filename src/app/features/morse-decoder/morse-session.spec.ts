import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { morseSignal } from '../../../testing/signals/morse-signal';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { MorseLog } from './morse-log';
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

  it('logs decoded text line by line: a long pause, a reset or a capture restart starts a line', async () => {
    const log = TestBed.inject(MorseLog);
    let now = Date.UTC(2026, 10, 4, 13, 2, 31);
    log.now = () => new Date(now);
    const capture = TestBed.inject(CaptureSession);
    const feed = (samples: Float32Array) => {
      for (let i = 0; i < samples.length; i += 1024) source.emit(samples.slice(i, i + 1024));
    };
    const signal = (text: string) => morseSignal(text, { wpm: 20, sampleRate: 48000 }).samples;
    const silence = (seconds: number) => new Float32Array(seconds * 48000);

    await capture.start();
    feed(signal('CQ CQ'));
    feed(silence(8));
    feed(signal('DE DL1ABC'));
    feed(silence(2));
    expect(log.entries().map((e) => e.text)).toEqual(['CQ CQ', 'DE DL1ABC']);
    expect(log.entries()[1]?.wpm).toBeGreaterThanOrEqual(19);
    expect(log.entries()[1]?.wpm).toBeLessThanOrEqual(21);

    // stopped and started again: no long silence in the audio, but a new line
    await capture.stop();
    now += 5000;
    await capture.start();
    feed(signal('K'));
    feed(silence(2));
    expect(log.entries().map((e) => e.text)).toEqual(['CQ CQ', 'DE DL1ABC', 'K']);
    expect(log.entries()[2]?.time.getTime()).toBe(now);

    // reset clears the output, the log keeps it
    session.reset();
    session.handle([{ type: 'character', timestamp: 0, code: '-', text: 'T', known: true }]);
    expect(session.text()).toBe('T');
    expect(log.entries().map((e) => e.text)).toEqual(['CQ CQ', 'DE DL1ABC', 'K', 'T']);
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
