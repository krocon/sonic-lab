import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'audiolab.theme';
const ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Light/dark preference. `system` follows `prefers-color-scheme` purely in CSS;
 * an explicit choice sets `data-theme` on <html> (see styles/tokens.css).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly preference = signal<ThemePreference>(this.load());

  constructor() {
    effect(() => {
      const pref = this.preference();
      const root = this.document.documentElement;
      if (pref === 'system') {
        delete root.dataset['theme'];
      } else {
        root.dataset['theme'] = pref;
      }
      this.save(pref);
    });
  }

  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.preference()) + 1) % ORDER.length] ?? 'system';
    this.preference.set(next);
  }

  private load(): ThemePreference {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      return isPreference(stored) ? stored : 'system';
    } catch {
      return 'system'; // storage blocked (private mode, sandbox) – fall back silently
    }
  }

  private save(pref: ThemePreference): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // not persisted – the in-memory preference still applies
    }
  }
}
