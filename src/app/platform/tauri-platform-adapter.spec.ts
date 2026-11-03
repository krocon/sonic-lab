import { TestBed } from '@angular/core/testing';
import { tauri } from './tauri-bridge';
import { TauriPlatformAdapter } from './tauri-platform-adapter';

describe('TauriPlatformAdapter', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [TauriPlatformAdapter] }));
  afterEach(() => vi.restoreAllMocks());

  it('describes the desktop runtime from the platform_info command', async () => {
    const invoke = vi
      .spyOn(tauri, 'invoke')
      .mockResolvedValueOnce({ os: 'macos', arch: 'aarch64', appVersion: '0.1.0' });
    const info = await TestBed.inject(TauriPlatformAdapter).describe();
    expect(invoke).toHaveBeenCalledWith('platform_info');
    expect(info).toMatchObject({
      kind: 'desktop',
      label: 'Desktop · macos aarch64',
      appVersion: '0.1.0',
    });
  });

  it('falls back when the command fails', async () => {
    vi.spyOn(tauri, 'invoke').mockRejectedValueOnce(new Error('no ipc'));
    const info = await TestBed.inject(TauriPlatformAdapter).describe();
    expect(info.label).toBe('Desktop');
  });
});
