import { TestBed } from '@angular/core/testing';
import { BrowserPlatformAdapter } from './browser-platform-adapter';
import { webCapabilities } from './platform-adapter';

describe('BrowserPlatformAdapter', () => {
  it('describes the web runtime', async () => {
    TestBed.configureTestingModule({ providers: [BrowserPlatformAdapter] });
    const info = await TestBed.inject(BrowserPlatformAdapter).describe();
    expect(info.kind).toBe('web');
    expect(info.label).toBe('Web browser');
    expect(typeof info.secureContext).toBe('boolean');
  });
});

describe('webCapabilities', () => {
  it('reports nothing available without a window', () => {
    expect(webCapabilities(null)).toEqual({ secureContext: false, mediaDevicesAvailable: false });
  });

  it('detects getUserMedia', () => {
    const fakeWindow = {
      isSecureContext: true,
      navigator: { mediaDevices: { getUserMedia: () => Promise.resolve() } },
    } as unknown as Window;
    expect(webCapabilities(fakeWindow)).toEqual({
      secureContext: true,
      mediaDevicesAvailable: true,
    });
  });
});
