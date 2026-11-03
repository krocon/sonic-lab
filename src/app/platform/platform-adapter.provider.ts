import { Provider } from '@angular/core';
import { BrowserPlatformAdapter } from './browser-platform-adapter';
import { PlatformAdapter } from './platform-adapter';
import { tauri } from './tauri-bridge';
import { TauriPlatformAdapter } from './tauri-platform-adapter';

/** Picks the adapter at startup: one build, two runtimes. */
export function providePlatformAdapter(): Provider {
  return {
    provide: PlatformAdapter,
    useClass: tauri.isTauri() ? TauriPlatformAdapter : BrowserPlatformAdapter,
  };
}
