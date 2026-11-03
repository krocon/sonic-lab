import { SettingsStore, isRecord, read } from '../../core/settings/settings-store';

export interface EncoderSettings {
  readonly text: string;
  readonly wpm: number;
  /** Overall speed for Farnsworth spacing; equal to `wpm` = off. */
  readonly farnsworthWpm: number;
  readonly frequency: number;
  /** 0..0.8 */
  readonly volume: number;
}

export const DEFAULT_ENCODER_SETTINGS: EncoderSettings = {
  text: 'CQ CQ DE AUDIOLAB K',
  wpm: 20,
  farnsworthWpm: 20,
  frequency: 700,
  volume: 0.3,
};

export const encoderSettingsStore = () =>
  new SettingsStore<EncoderSettings>({
    key: 'audiolab.encoder',
    version: 1,
    defaults: DEFAULT_ENCODER_SETTINGS,
    validate: (raw) => {
      if (!isRecord(raw)) return null;
      const wpm = read.number(raw, 'wpm', 20, 5, 60);
      return {
        text: read.string(raw, 'text', DEFAULT_ENCODER_SETTINGS.text).slice(0, 2000),
        wpm,
        farnsworthWpm: read.number(raw, 'farnsworthWpm', wpm, 3, wpm),
        frequency: read.number(raw, 'frequency', 700, 300, 1500),
        volume: read.number(raw, 'volume', 0.3, 0, 0.8),
      };
    },
  });
