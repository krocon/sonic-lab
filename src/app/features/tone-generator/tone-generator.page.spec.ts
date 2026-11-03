import { TestBed } from '@angular/core/testing';
import { ToneGeneratorPage, generatorContext } from './tone-generator.page';

describe('ToneGeneratorPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ToneGeneratorPage] });
  });

  it('shows the controls that fit the waveform and persists settings', async () => {
    const fixture = TestBed.createComponent(ToneGeneratorPage);
    const el: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    const key = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
        (r) => r.textContent?.trim() === label,
      );
    expect(el.textContent).toContain('Frequency');
    expect(el.querySelector('.vfo-main')?.textContent).toBe('1\u2009000 Hz');
    key('DTMF')?.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.keys button').length).toBe(16);
    key('#')?.click();
    await fixture.whenStable();
    expect(el.querySelector('.vfo-main')?.textContent).toBe('KEY #');
    expect(JSON.parse(localStorage.getItem('audiolab.generator') ?? '{}').data).toMatchObject({
      waveform: 'dtmf',
      dtmfKey: '#',
    });
    key('Sweep log')?.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('End frequency');
    expect(el.textContent).toContain('Sweep duration');
  });

  it('reports a missing audio output', async () => {
    const original = generatorContext.create;
    generatorContext.create = () => {
      throw new Error('no audio');
    };
    const fixture = TestBed.createComponent(ToneGeneratorPage);
    await fixture.whenStable();
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes('Play'))
      ?.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Audio output is not available.');
    generatorContext.create = original;
  });
});
