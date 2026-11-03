import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ANALYSIS_MODULES } from '../core/modules/module-catalog';
import { PlatformAdapter } from '../platform/platform-adapter';
import { PlatformInfo } from '../platform/platform-info';
import { AppShell } from './app-shell';

class FakePlatformAdapter extends PlatformAdapter {
  override async describe(): Promise<PlatformInfo> {
    return { kind: 'web', label: 'Test runtime', secureContext: true, mediaDevicesAvailable: true };
  }
}

describe('AppShell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [provideRouter([]), { provide: PlatformAdapter, useClass: FakePlatformAdapter }],
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

  it('shows the platform and microphone status', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    fixture.detectChanges();
    const status: HTMLElement = fixture.nativeElement.querySelector('.statusbar');
    expect(status.textContent).toContain('Test runtime');
    expect(status.textContent).toContain('Microphone API available');
    expect(status.textContent).toContain('Microphone off');
    expect(status.textContent).toContain('Local only');
  });
});
