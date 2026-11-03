import { TestBed } from '@angular/core/testing';
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
    expect(el.textContent).toContain('Not encodable, skipped: ä');
    expect(el.querySelectorAll('li.token').length).toBe(4);
    expect(JSON.parse(localStorage.getItem('audiolab.encoder') ?? '{}').data.text).toBe('SOS ä');
  });

  it('copies the code', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = TestBed.createComponent(MorseEncoderPage);
    await setText(fixture, 'AB');
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes('Copy'))
      ?.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('.- -...');
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
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes('Play'))
      ?.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Audio output is not available.');
    createAudioContext.create = original;
  });
});
