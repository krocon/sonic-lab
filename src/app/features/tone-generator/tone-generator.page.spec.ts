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
    expect(el.textContent).toContain('Frequency');
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'dtmf';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelectorAll('.keys button').length).toBe(16);
    (Array.from(el.querySelectorAll('.keys button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.trim() === '#')
      ?.click();
    await fixture.whenStable();
    expect(JSON.parse(localStorage.getItem('audiolab.generator') ?? '{}').data).toMatchObject({
      waveform: 'dtmf',
      dtmfKey: '#',
    });
    select.value = 'sweep-log';
    select.dispatchEvent(new Event('change'));
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
