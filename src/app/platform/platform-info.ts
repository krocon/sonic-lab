/** Runtime the Angular app is hosted in. */
export type PlatformKind = 'web' | 'desktop';

/**
 * Host description shown in the status bar.
 * The desktop fields mirror `PlatformInfo` in `src-tauri/src/platform.rs`.
 */
export interface PlatformInfo {
  readonly kind: PlatformKind;
  /** Human-readable runtime label, e.g. "Web browser" or "Desktop · macos aarch64". */
  readonly label: string;
  /** Microphone access via getUserMedia needs a secure context (HTTPS or localhost). */
  readonly secureContext: boolean;
  readonly mediaDevicesAvailable: boolean;
  readonly appVersion?: string;
}

/** Shape returned by the Tauri command `platform_info`. */
export interface NativePlatformInfo {
  readonly os: string;
  readonly arch: string;
  readonly appVersion: string;
}
