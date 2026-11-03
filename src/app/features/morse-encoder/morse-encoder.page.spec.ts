import { TestBed } from '@angular/core/testing';
import { frontPanel } from '../../../testing/front-panel';
import { MorseEncoderPage, createAudioContext } from './morse-encoder.page';

describe('MorseEncoderPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MorseEncoderPage] });
  });

  async function setText(
    fixture: ReturnType<typeof TestBed.createComponent<MorseEncoderPage>>,
    value: string,
  ) {
    const area = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    area.value = value;
    area.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('previews characters and code, flags unsupported characters and persists the text', async () => {
    const fixture = TestBed.createComponent(MorseEncoderPage);
    await setText(fixture, 'SOS ä');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('output.code-line')?.textContent).toBe('... --- ...');
    expect(frontPanel().message()?.text).toBe('Not encodable, skipped: ä');
    expect(el.querySelectorAll('li.token').length).toBe(4);
    expect(JSON.parse(localStorage.getItem('audiolab.encoder') ?? '{}').data.text).toBe('SOS ä');
  });

  it('binds speed, tone and volume to the knobs and copies the code', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = TestBed.createComponent(MorseEncoderPage);
    await setText(fixture, 'AB');
    const hw = frontPanel();
    expect([hw.knob(0)?.name, hw.knob(1)?.name, hw.knob(2)?.name]).toEqual([
      'Tone',
      'Speed',
      'Volume',
    ]);
    await hw.run('copy');
    expect(writeText).toHaveBeenCalledWith('.- -...');
  });

  it('types with the keypad (multi-tap) and deletes with CLR', async () => {
    const fixture = TestBed.createComponent(MorseEncoderPage);
    await setText(fixture, '');
    const { panel } = frontPanel();
    for (const d of ['4', '4', '0', '2', '2', '2']) panel.digit(d);
    panel.clear();
    panel.digit('9');
    await fixture.whenStable();
    expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'H W',
    );
  });

  it('keeps Farnsworth off while it equals the speed and never above it', async () => {
    const fixture = TestBed.createComponent(MorseEncoderPage);
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as {
      update(p: object): void;
      settings(): { wpm: number; farnsworthWpm: number };
    };
    page.update({ wpm: 30 });
    expect(page.settings().farnsworthWpm).toBe(30);
    expect(frontPanel().text('Farnsworth speed')).toBe('off');
    page.update({ farnsworthWpm: 10 });
    page.update({ wpm: 8 });
    expect(page.settings().farnsworthWpm).toBe(8);
  });

  it('reports a missing audio output', async () => {
    const original = createAudioContext.create;
    createAudioContext.create = () => {
      throw new Error('no audio');
    };
    const fixture = TestBed.createComponent(MorseEncoderPage);
    await fixture.whenStable();
    const hw = frontPanel();
    await hw.run('play');
    expect(hw.message()?.text).toBe('Audio output is not available.');
    createAudioContext.create = original;
  });
});
