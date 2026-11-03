import { SettingsStore, isRecord, read } from '../settings/settings-store';

export interface CaptureSettings {
  /** Last chosen input; empty = system default. */
  readonly deviceId: string;
}

export const captureSettingsStore = () =>
  new SettingsStore<CaptureSettings>({
    key: 'audiolab.capture',
    version: 1,
    defaults: { deviceId: '' },
    validate: (raw) => (isRecord(raw) ? { deviceId: read.string(raw, 'deviceId', '') } : null),
  });
