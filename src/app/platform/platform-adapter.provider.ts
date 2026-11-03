import { Provider } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { BrowserPlatformAdapter } from './browser-platform-adapter';
import { PlatformAdapter } from './platform-adapter';
import { TauriPlatformAdapter } from './tauri-platform-adapter';

/** Picks the adapter at startup: one build, two runtimes. */
export function providePlatformAdapter(): Provider {
  return {
    provide: PlatformAdapter,
    useClass: isTauri() ? TauriPlatformAdapter : BrowserPlatformAdapter,
  };
}
