import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ANALYSIS_MODULES } from '../../core/modules/module-catalog';
import { OverviewPage } from './overview.page';

describe('OverviewPage', () => {
  it('shows a card with status for every module', async () => {
    TestBed.configureTestingModule({ imports: [OverviewPage], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(OverviewPage);
    await fixture.whenStable();
    const cards: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('a.card'));
    expect(cards.length).toBe(ANALYSIS_MODULES.length);
    const morse = cards.find((c) => c.textContent?.includes('Morse Decoder'));
    expect(morse?.getAttribute('href')).toBe('/morse-decoder');
    expect(morse?.textContent).toContain('Available');
  });
});
