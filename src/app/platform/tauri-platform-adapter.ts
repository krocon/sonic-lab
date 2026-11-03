import { DOCUMENT, Injectable, inject } from '@angular/core';
import { PlatformAdapter, webCapabilities } from './platform-adapter';
import { NativePlatformInfo, PlatformInfo } from './platform-info';
import { tauri } from './tauri-bridge';

@Injectable()
export class TauriPlatformAdapter extends PlatformAdapter {
  private readonly window = inject(DOCUMENT).defaultView;

  override async describe(): Promise<PlatformInfo> {
    const base = webCapabilities(this.window);
    try {
      const info = await tauri.invoke<NativePlatformInfo>('platform_info');
      return {
        kind: 'desktop',
        label: `Desktop · ${info.os} ${info.arch}`,
        appVersion: info.appVersion,
        ...base,
      };
    } catch {
      return { kind: 'desktop', label: 'Desktop', ...base };
    }
  }
}
