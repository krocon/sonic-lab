import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { frontPanel } from '../../../testing/front-panel';
import { morseSignal } from '../../../testing/signals/morse-signal';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { ExportResult, FileExportAdapter } from '../../platform/file-export';
import { MorseLog } from './morse-log';
import { MorseDecoderPage } from './morse-decoder.page';
import { MorseSession } from './morse-session';

class FakeExporter extends FileExportAdapter {
  saved: { name: string; type: string; text: string }[] = [];
  result: ExportResult = { status: 'saved', location: '/tmp/log.txt' };
  override async save(data: Blob, name: string, type: string): Promise<ExportResult> {
    this.saved.push({ name, type, text: await data.text() });
    return this.result;
  }
}

describe('MorseDecoderPage', () => {
  let source: FakeAudioSource;
  let exporter: FakeExporter;

  beforeEach(() => {
    localStorage.clear();
    source = new FakeAudioSource();
    exporter = new FakeExporter();
    TestBed.configureTestingModule({
      imports: [MorseDecoderPage],
      providers: [{ provide: FileExportAdapter, useValue: exporter }],
    });
    TestBed.overrideComponent(MorseDecoderPage, {
      set: {
        providers: [{ provide: AUDIO_SOURCE, useValue: source }, CaptureSession, MorseSession],
      },
    });
  });

  it('binds the soft keys, knobs and capture', async () => {
    TestBed.createComponent(MorseDecoderPage);
    const hw = frontPanel();
    expect(hw.softNames()).toEqual([
      'Tone frequency',
      'Fixed tone',
      'Sensitivity',
      'Room mode',
      'Reset',
      'View',
    ]);
    expect(hw.text('View')).toBe('LIVE');
    expect(hw.knob(0)?.name).toBe('Fixed tone');
    expect(hw.knob(1)?.name).toBe('Start speed');
    expect(hw.knob(2)).toBeNull();
    expect(hw.key('play')?.name).toBe('Start');
    expect(hw.panel.binding().capture).toBeInstanceOf(CaptureSession);
  });

  it('starts capture, shows decoded text and speed, copies and resets', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    const el: HTMLElement = fixture.nativeElement;
    const hw = frontPanel();
    await fixture.whenStable();

    await hw.run('play');
    await fixture.whenStable();
    expect(source.state.status).toBe('running');

    const { samples } = morseSignal('TEST 73', { wpm: 20 });
    const padded = new Float32Array(samples.length + 96000);
    padded.set(samples);
    for (let i = 0; i < padded.length; i += 1024) source.emit(padded.slice(i, i + 1024));
    await fixture.whenStable();
    const output = (label: string) =>
      el.querySelector(`output[aria-labelledby="${label}"]`)?.textContent ?? '';
    expect(output('text-label')).toContain('TEST 73');
    expect(output('morse-label')).toContain('- . ... -');
    expect(el.querySelector('.ro.hot dd')?.textContent).toMatch(/^(19|20|21)WPM$/);

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await hw.run('copy');
    expect(writeText).toHaveBeenCalledWith('TEST 73');
    expect(hw.message()?.text).toBe('Text copied to the clipboard.');

    hw.press('Reset');
    await fixture.whenStable();
    expect(output('text-label')).toContain('Decoded text will appear here.');
    expect(hw.disabled('Reset')).toBe(true);

    await hw.run('stop');
    expect(source.state.status).toBe('stopped');
  });

  it('reports a failed copy', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    fixture.componentInstance['morse'].text.set('ABC');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    await frontPanel().run('copy');
    expect(frontPanel().message()?.text).toBe('Copying failed.');
  });

  it('shows the log, copies, saves and clears it', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    const el: HTMLElement = fixture.nativeElement;
    const hw = frontPanel();
    const log = TestBed.inject(MorseLog);
    log.now = () => new Date(2026, 10, 4, 14, 2, 31);
    log.append('CQ', 20);
    log.endLine();
    log.append('K', null);

    hw.press('View');
    await fixture.whenStable();
    expect(hw.text('View')).toBe('LOG');
    expect(hw.softNames()).toEqual([
      'Tone frequency',
      'Fixed tone',
      'Sensitivity',
      'Save log',
      'Clear log',
      'View',
    ]);
    const lines = [...el.querySelectorAll('[role="log"] .entry')].map((p) =>
      p.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(lines).toEqual(['14:02:31 20 WPM CQ', '14:02:31 – WPM K']);
    expect(el.querySelector('app-waveform-canvas')).toBeNull();
    const text = '2026-11-04 14:02:31  20 WPM  CQ\n2026-11-04 14:02:31  -- WPM  K';

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(hw.key('copy')?.name).toBe('Copy log');
    await hw.run('copy');
    expect(writeText).toHaveBeenCalledWith(text);
    expect(hw.message()?.text).toBe('Log copied to the clipboard.');

    await (hw.soft('Save log') as { run(): Promise<void> }).run();
    expect(exporter.saved).toEqual([
      {
        name: 'sonic-lab-morse-log-2026-11-04-14-02-31.txt',
        type: 'text/plain',
        text: text + '\n',
      },
    ]);
    expect(hw.message()?.text).toBe('Log saved to /tmp/log.txt');
    exporter.result = { status: 'cancelled' };
    await (hw.soft('Save log') as { run(): Promise<void> }).run();
    expect(hw.message()?.text).toBe('Saving cancelled.');

    hw.press('Clear log');
    await fixture.whenStable();
    expect(log.entries()).toEqual([]);
    expect(hw.disabled('Save log')).toBe(true);
    expect(hw.key('copy')?.disabled?.()).toBe(true);
    expect(el.querySelector('[role="log"]')?.textContent).toContain('Everything decoded is logged');

    hw.press('View');
    await fixture.whenStable();
    expect(hw.key('copy')?.name).toBe('Copy text');
    expect(el.querySelector('app-waveform-canvas')).not.toBeNull();
  });

  it('reports a failed save', async () => {
    TestBed.createComponent(MorseDecoderPage);
    const hw = frontPanel();
    TestBed.inject(MorseLog).append('E', 20);
    hw.press('View');
    exporter.save = () => Promise.reject(new Error('disk full'));
    await (hw.soft('Save log') as { run(): Promise<void> }).run();
    expect(hw.message()?.text).toBe('Saving the log failed.');
  });

  it('switches to a fixed tone with the knob and persists the settings', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    await fixture.whenStable();
    const hw = frontPanel();
    hw.press('Sensitivity');
    hw.press('Sensitivity');
    expect(hw.text('Sensitivity')).toBe('LOW');
    hw.panel.step(hw.knob(0)!, -2, false, true);
    await fixture.whenStable();
    expect(hw.text('Tone frequency')).toBe('FIXED');
    expect(hw.text('Fixed tone')).toBe('500 Hz');
    expect(fixture.nativeElement.querySelector('.ro.accent dt')?.textContent).toContain('fixed');
    expect(JSON.parse(localStorage.getItem('audiolab.morse') ?? '{}').data).toMatchObject({
      frequencyMode: 'manual',
      frequency: 500,
      sensitivity: 'low',
    });
  });

  it('sets the start speed with the SPEED knob', async () => {
    TestBed.createComponent(MorseDecoderPage);
    const hw = frontPanel();
    const speed = hw.knob(1)!;
    hw.panel.step(speed, 5);
    expect(speed.format(speed.value())).toBe('25 WPM');
    expect(JSON.parse(localStorage.getItem('audiolab.morse') ?? '{}').data).toMatchObject({
      initialWpm: 25,
    });
  });

  it('switches the room mode, shows its state and remembers it', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const hw = frontPanel();
    const morse = fixture.componentInstance['morse'] as MorseSession;
    const chips = () => [...el.querySelectorAll('.end .chip')].map((c) => c.textContent?.trim());
    expect(hw.text('Room mode')).toBe('OFF');
    expect(chips()).not.toContain('Room mode');

    hw.press('Room mode');
    await fixture.whenStable();
    expect(hw.text('Room mode')).toBe('ON');
    expect(hw.message()?.text).toContain('Room mode (experimental)');
    expect(morse['decoder'].configuration.roomEqualizer).toBe(true);
    expect(chips()).toContain('Room mode');
    expect(JSON.parse(localStorage.getItem('audiolab.morse') ?? '{}').data).toMatchObject({
      roomMode: true,
    });

    // lit once the room is learned and the equalizer detects the keying
    morse.roomInUse.set(true);
    await fixture.whenStable();
    expect(chips()).toContain('Room active');
    expect(el.querySelector('.end .chip.ok:last-child')?.textContent?.trim()).toBe('Room active');

    hw.press('Room mode');
    await fixture.whenStable();
    expect(hw.text('Room mode')).toBe('OFF');
    expect(hw.message()?.text).toBe('Room mode off.');
    expect(morse['decoder'].configuration.roomEqualizer).toBe(false);
    expect(morse.roomInUse()).toBe(false);
    expect(chips().some((c) => c?.startsWith('Room'))).toBe(false);
  });

  it('starts/stops with Space and resets with Ctrl+K', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    await fixture.whenStable();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await fixture.whenStable();
    expect(source.state.status).toBe('running');
    fixture.componentInstance['morse'].text.set('ABC');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance['morse'].text()).toBe('');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await fixture.whenStable();
    expect(source.state.status).toBe('stopped');
  });

  it('ignores Space on a key or knob', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    await fixture.whenStable();
    const key = document.createElement('button');
    document.body.append(key);
    key.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await fixture.whenStable();
    expect(source.startCalls).toBe(0);
    key.remove();
  });

  it('shows the error from the audio source', async () => {
    source.failWith = { kind: 'permission-denied' };
    const fixture = TestBed.createComponent(MorseDecoderPage);
    await fixture.whenStable();
    await frontPanel().run('play');
    const capture = frontPanel().panel.binding().capture!;
    expect(capture.status().text).toBe('Microphone access was denied.');
  });
});
