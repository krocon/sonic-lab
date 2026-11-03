import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ANALYSIS_MODULES } from '../core/modules/module-catalog';
import { attachPanel, panelAction, panelChoice } from '../core/panel/front-panel';
import { AppShell } from './app-shell';

const mode = signal<'x' | 'y'>('x');
const pressed = vi.fn();

@Component({ template: '<h1>Test mode</h1>' })
class TestPage {
  constructor() {
    attachPanel({
      softkeys: [
        panelChoice<'x' | 'y'>({
          label: 'MODE',
          name: 'Mode',
          options: [
            { value: 'x', label: 'X-RAY' },
            { value: 'y', label: 'YANKEE' },
          ],
          value: mode,
          set: (v) => mode.set(v),
        }),
        null,
        panelAction({ label: 'GO', name: 'Go', run: pressed }),
      ],
      message: () => ({ tone: 'success', text: 'All good.' }),
    });
  }
}

describe('AppShell', () => {
  beforeEach(() => {
    mode.set('x');
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [provideRouter([{ path: 'morse-decoder', component: TestPage }])],
    });
  });

  it('has an F key for every analysis module, named after the module', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const keys = Array.from(el.querySelectorAll<HTMLAnchorElement>('nav a.hk-f'));
    const legends = Array.from(el.querySelectorAll('.flabels .fl')).map((l) => l.textContent);
    expect(keys.length).toBe(ANALYSIS_MODULES.length);
    keys.forEach((key, i) => {
      expect(key.getAttribute('aria-label')).toBe(ANALYSIS_MODULES[i]?.title);
      expect(key.textContent?.trim()).toBe(`F${i + 1}`);
    });
    expect(legends).toEqual(ANALYSIS_MODULES.map((m) => m.key));
  });

  it('labels the six soft keys from the page and routes presses', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await TestBed.inject(Router).navigateByUrl('/morse-decoder');
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const keys = Array.from(el.querySelectorAll<HTMLButtonElement>('.sidekeys button'));
    expect(keys.length).toBe(6);
    expect(keys.map((k) => k.getAttribute('aria-label'))).toEqual([
      'Mode: X-RAY',
      'Soft key 2 (not used)',
      'Go',
      'Soft key 4 (not used)',
      'Soft key 5 (not used)',
      'Soft key 6 (not used)',
    ]);
    expect(keys[1]?.getAttribute('aria-disabled')).toBe('true');
    keys[0]?.click();
    keys[2]?.click();
    await fixture.whenStable();
    expect(mode()).toBe('y');
    expect(pressed).toHaveBeenCalled();
    expect(el.querySelector('.softlabels')?.textContent).toContain('YANKEE');
    expect(el.querySelector('.message')?.textContent).toContain('All good.');
    expect(el.querySelector('.mode')?.textContent).toBe('Morse Decoder');
    expect(el.querySelector('a[aria-current="page"]')?.getAttribute('aria-label')).toBe(
      'Morse Decoder',
    );
  });

  it('opens the menu and closes it with Escape', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    el.querySelector<HTMLButtonElement>('button[aria-label="Menu"]')?.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Front panel');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
