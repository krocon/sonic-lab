import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { morseSignal } from '../../../testing/signals/morse-signal';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { MorseDecoderPage } from './morse-decoder.page';
import { MorseSession } from './morse-session';

describe('MorseDecoderPage', () => {
  let source: FakeAudioSource;

  beforeEach(() => {
    localStorage.clear();
    source = new FakeAudioSource();
    TestBed.configureTestingModule({ imports: [MorseDecoderPage] });
    TestBed.overrideComponent(MorseDecoderPage, {
      set: {
        providers: [{ provide: AUDIO_SOURCE, useValue: source }, CaptureSession, MorseSession],
      },
    });
  });

  function button(el: HTMLElement, label: string): HTMLButtonElement {
    const b = Array.from(el.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(label),
    );
    if (!b) throw new Error(`no button ${label}`);
    return b;
  }

  it('starts capture, shows decoded text and speed, copies and resets', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    const el: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    expect(el.textContent).toContain('Idle – microphone is off');

    button(el, 'Start').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Listening');

    const { samples } = morseSignal('TEST 73', { wpm: 20 });
    const padded = new Float32Array(samples.length + 96000);
    padded.set(samples);
    for (let i = 0; i < padded.length; i += 1024) source.emit(padded.slice(i, i + 1024));
    await fixture.whenStable();
    expect(el.querySelector('output.text')?.textContent).toContain('TEST 73');
    expect(el.querySelector('output.morse')?.textContent).toContain('- . ... -');
    expect(el.querySelector('.stat strong')?.textContent).toMatch(/^(19|20|21) WPM$/);

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    button(el, 'Copy').click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('TEST 73');
    expect(el.textContent).toContain('Text copied to the clipboard.');

    button(el, 'Reset').click();
    await fixture.whenStable();
    expect(el.querySelector('output.text')?.textContent).toContain(
      'Decoded text will appear here.',
    );

    button(el, 'Stop').click();
    await fixture.whenStable();
    expect(source.state.status).toBe('stopped');
  });

  it('reports a failed copy', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    fixture.componentInstance['morse'].text.set('ABC');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    await fixture.whenStable();
    button(fixture.nativeElement, 'Copy').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Copying failed.');
  });

  it('switches to a fixed frequency and persists the settings', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    const el: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    const selects = el.querySelectorAll('select');
    const mode = Array.from(selects).find((s) =>
      s.querySelector('option[value="manual"]'),
    ) as HTMLSelectElement;
    mode.value = 'manual';
    mode.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const slider = el.querySelector('input[type="range"]') as HTMLInputElement;
    slider.value = '650';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).toContain('650 Hz');
    expect(JSON.parse(localStorage.getItem('audiolab.morse') ?? '{}').data).toMatchObject({
      frequencyMode: 'manual',
      frequency: 650,
    });
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

  it('ignores Space while a form control has focus', async () => {
    const fixture = TestBed.createComponent(MorseDecoderPage);
    await fixture.whenStable();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await fixture.whenStable();
    expect(source.startCalls).toBe(0);
  });

  it('shows the error from the audio source', async () => {
    source.failWith = { kind: 'permission-denied' };
    const fixture = TestBed.createComponent(MorseDecoderPage);
    await fixture.whenStable();
    button(fixture.nativeElement, 'Start').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Microphone access was denied.');
  });
});
