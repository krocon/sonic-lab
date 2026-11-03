import { TestBed } from '@angular/core/testing';
import { frontPanel } from '../../../testing/front-panel';
import { PanelChoice } from '../../core/panel/front-panel';
import { ToneGeneratorPage, generatorContext } from './tone-generator.page';
import { waveformPath } from './waveform-preview';

describe('ToneGeneratorPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ToneGeneratorPage] });
  });

  it('assigns the soft keys to the waveform and persists settings', async () => {
    const fixture = TestBed.createComponent(ToneGeneratorPage);
    const el: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    const hw = frontPanel();
    const wave = hw.soft('Waveform') as PanelChoice;
    expect(el.querySelector('.main')?.textContent).toBe('1 000 Hz');
    expect(hw.softNames()[2]).toBe('Second frequency');
    expect(hw.disabled('Second frequency')).toBe(true);

    hw.panel.step(wave, 9); // → DTMF
    await fixture.whenStable();
    expect(hw.softNames()[2]).toBe('DTMF key');
    hw.panel.digit('8');
    await fixture.whenStable();
    expect(el.querySelector('.main')?.textContent).toBe('KEY 8');
    expect(JSON.parse(localStorage.getItem('audiolab.generator') ?? '{}').data).toMatchObject({
      waveform: 'dtmf',
      dtmfKey: '8',
    });

    hw.panel.step(wave, -2); // → sweep log
    await fixture.whenStable();
    expect(hw.disabled('Sweep duration')).toBe(false);
    expect(hw.knob(1)?.name).toBe('Sweep duration');
    expect(el.querySelector('.sub')?.textContent).toContain('in 10 s');
  });

  it('enters a frequency on the keypad', async () => {
    const fixture = TestBed.createComponent(ToneGeneratorPage);
    await fixture.whenStable();
    const hw = frontPanel();
    hw.press('Frequency');
    for (const d of '440') hw.panel.digit(d);
    hw.panel.enter();
    await fixture.whenStable();
    expect(hw.text('Frequency')).toBe('440 Hz');
    hw.press('Level');
    for (const d of '30') hw.panel.digit(d);
    hw.panel.enter();
    expect(hw.text('Level')).toBe('-30 dBFS');
  });

  it('reports a missing audio output', async () => {
    const original = generatorContext.create;
    generatorContext.create = () => {
      throw new Error('no audio');
    };
    const fixture = TestBed.createComponent(ToneGeneratorPage);
    await fixture.whenStable();
    const hw = frontPanel();
    await hw.run('play');
    expect(hw.message()?.text).toBe('Audio output is not available.');
    generatorContext.create = original;
  });

  it('draws a preview path for every waveform', () => {
    const square = waveformPath('square');
    expect(square.startsWith('M0.0 7.5')).toBe(true);
    expect(waveformPath('white-noise')).toBe(waveformPath('white-noise'));
    expect(waveformPath('dtmf', 1.7).split('L')).toHaveLength(301);
  });
});
