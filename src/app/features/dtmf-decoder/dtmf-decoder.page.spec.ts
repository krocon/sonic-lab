import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { frontPanel } from '../../../testing/front-panel';
import { render } from '../../audio/synthesis/signal';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { dtmfSequence } from '../../decoders/dtmf/dtmf-tones';
import { DtmfDecoderPage } from './dtmf-decoder.page';

describe('DtmfDecoderPage', () => {
  it('shows decoded digits, copies and resets', async () => {
    const source = new FakeAudioSource();
    TestBed.configureTestingModule({ imports: [DtmfDecoderPage] });
    TestBed.overrideComponent(DtmfDecoderPage, {
      set: { providers: [{ provide: AUDIO_SOURCE, useValue: source }, CaptureSession] },
    });
    const fixture = TestBed.createComponent(DtmfDecoderPage);
    const el: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    await fixture.debugElement.injector.get(CaptureSession).start();
    const { generator, duration } = dtmfSequence('0815#');
    const samples = render(generator, duration + 0.3, 48000);
    for (let i = 0; i < samples.length; i += 1024)
      source.emit(samples.slice(i, i + 1024), i / 48000);
    await fixture.whenStable();
    expect(el.querySelector('output.digits')?.textContent?.trim()).toBe('0815#');

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const hw = frontPanel();
    await hw.run('copy');
    expect(writeText).toHaveBeenCalledWith('0815#');
    expect(hw.message()?.text).toBe('Digits copied to the clipboard.');

    hw.press('Clear digits');
    await fixture.whenStable();
    expect(el.querySelector('output.digits')?.textContent?.trim()).toBe('–');
  });
});
