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

  it('lists every analysis module in the navigation', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    for (const m of ANALYSIS_MODULES) {
      expect(nav.textContent).toContain(m.title);
    }
  });

  it('shows the platform and microphone status', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    fixture.detectChanges();
    const status: HTMLElement = fixture.nativeElement.querySelector('.statusbar');
    expect(status.textContent).toContain('Test runtime');
    expect(status.textContent).toContain('Microphone API available');
    expect(status.textContent).toContain('Microphone off');
  });
});
