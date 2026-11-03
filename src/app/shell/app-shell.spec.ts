import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ANALYSIS_MODULES } from '../core/modules/module-catalog';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [provideRouter([])],
    });
  });

  it('has a mode key for every analysis module, named after the module', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const keys = Array.from(
      fixture.nativeElement.querySelectorAll('nav a.mode-key'),
    ) as HTMLAnchorElement[];
    expect(keys.length).toBe(ANALYSIS_MODULES.length);
    ANALYSIS_MODULES.forEach((m, i) => {
      expect(keys[i]?.querySelector('.visually-hidden')?.textContent).toBe(m.title);
      expect(keys[i]?.querySelector('.mode-legend')?.textContent).toBe(m.key);
    });
  });
});
