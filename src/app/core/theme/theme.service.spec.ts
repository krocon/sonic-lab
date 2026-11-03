import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/core';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('defaults to system and leaves data-theme unset', () => {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.preference()).toBe('system');
    expect(TestBed.inject(DOCUMENT).documentElement.dataset['theme']).toBeUndefined();
  });

  it('cycles system → light → dark → system and persists the choice', () => {
    const service = TestBed.inject(ThemeService);
    service.cycle();
    TestBed.tick();
    expect(service.preference()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('audiolab.theme')).toBe('light');

    service.cycle();
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('dark');

    service.cycle();
    TestBed.tick();
    expect(service.preference()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('ignores an invalid stored value', () => {
    localStorage.setItem('audiolab.theme', 'neon');
    expect(TestBed.inject(ThemeService).preference()).toBe('system');
  });
});
