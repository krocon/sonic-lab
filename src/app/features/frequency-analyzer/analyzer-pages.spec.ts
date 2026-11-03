import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { render, tone } from '../../audio/synthesis/signal';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { SignalMonitorPage } from '../signal-monitor/signal-monitor.page';
import { SpectrumAnalyzerPage } from '../spectrum-analyzer/spectrum-analyzer.page';
import { FrequencyAnalyzerPage } from './frequency-analyzer.page';

async function runWithTone<T>(page: Type<T>, frequency: number, amplitude = 0.5) {
  const source = new FakeAudioSource();
  TestBed.configureTestingModule({ imports: [page] });
  TestBed.overrideComponent(page, {
    set: { providers: [{ provide: AUDIO_SOURCE, useValue: source }, CaptureSession] },
  });
  const fixture = TestBed.createComponent(page);
  await fixture.whenStable();
  (fixture.debugElement.injector.get(CaptureSession) as CaptureSession).start();
  await fixture.whenStable();
  const samples = render(tone({ frequency, amplitude }), 1.5, 48000);
  for (let i = 0; i < samples.length; i += 1024) source.emit(samples.slice(i, i + 1024), i / 48000);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('analyzer pages', () => {
  beforeEach(() => localStorage.clear());

  it('frequency analyzer shows frequency and note', async () => {
    const { el } = await runWithTone(FrequencyAnalyzerPage, 440);
    expect(el.querySelector('.big .value')?.textContent?.trim()).toMatch(/^4(39\.\d|40\.\d)$/);
    expect(el.textContent).toContain('A4');
  });

  it('spectrum analyzer reports the peak and persists settings', async () => {
    const { el, fixture } = await runWithTone(SpectrumAnalyzerPage, 1000);
    expect(el.textContent).toMatch(/(999|1000)\.\d Hz/);
    const size = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (r) => r.textContent?.trim() === '8192',
    ) as HTMLButtonElement;
    size.click();
    await fixture.whenStable();
    expect(size.getAttribute('aria-checked')).toBe('true');
    expect(JSON.parse(localStorage.getItem('audiolab.spectrum') ?? '{}').data.size).toBe(8192);
  });

  it('signal monitor shows level, frequency and a clipping warning', async () => {
    const { el } = await runWithTone(SignalMonitorPage, 2000, 1);
    expect(el.textContent).toMatch(/2000 Hz/);
    expect(el.textContent).toContain('Clipping detected.');
    expect(el.textContent).toMatch(/-3\.0 dBFS/);
  });
});
