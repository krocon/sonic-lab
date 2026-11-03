import { PlatformInfo } from './platform-info';

/**
 * Platform layer boundary. Everything OS- or runtime-specific (Tauri commands, native
 * dialogs, file export) goes through an adapter; features never import `@tauri-apps/*`.
 */
export abstract class PlatformAdapter {
  abstract describe(): Promise<PlatformInfo>;
}

/** Capabilities that are identical in browser and WebView. */
export function webCapabilities(
  win: Window | null,
): Pick<PlatformInfo, 'secureContext' | 'mediaDevicesAvailable'> {
  return {
    secureContext: win?.isSecureContext ?? false,
    mediaDevicesAvailable: typeof win?.navigator.mediaDevices?.getUserMedia === 'function',
  };
}
