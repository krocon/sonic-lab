import { KeyingDetectorConfig } from '../../decoders/morse/keying-detector';
import { MorseDecoderConfig } from '../../decoders/morse/morse-decoder';
import { SettingsStore, isRecord, read } from '../../core/settings/settings-store';

export type Sensitivity = 'low' | 'medium' | 'high';
export const SENSITIVITIES: readonly Sensitivity[] = ['low', 'medium', 'high'];

export interface MorseSettings {
  readonly frequencyMode: 'auto' | 'manual';
  /** Used in manual mode, Hz. */
  readonly frequency: number;
  readonly sensitivity: Sensitivity;
  /** Expected speed before anything was heard. */
  readonly initialWpm: number;
  /**
   * Experimental room mode: learn the room's echo and detect the keying with it – for Morse from
   * a loudspeaker in a reverberant room (`roomEqualizer` of the decoder).
   */
  readonly roomMode: boolean;
}

export const DEFAULT_MORSE_SETTINGS: MorseSettings = {
  frequencyMode: 'auto',
  frequency: 700,
  sensitivity: 'medium',
  initialWpm: 20,
  roomMode: false,
};

export const FREQUENCY_RANGE = { min: 300, max: 1500, step: 10 } as const;

/** Sensitivity presets → keying parameters (higher = decodes weaker signals, more false marks). */
export const SENSITIVITY_PRESETS: Record<
  Sensitivity,
  Pick<KeyingDetectorConfig, 'onRatio' | 'offRatio' | 'minSnr' | 'minElementMs'>
> = {
  low: { onRatio: 0.55, offRatio: 0.35, minSnr: 3.5, minElementMs: 14 },
  medium: { onRatio: 0.5, offRatio: 0.3, minSnr: 2.5, minElementMs: 10 },
  high: { onRatio: 0.45, offRatio: 0.3, minSnr: 2.2, minElementMs: 10 },
};

export function toDecoderConfig(s: MorseSettings): Partial<MorseDecoderConfig> {
  return {
    frequency: s.frequencyMode === 'auto' ? null : s.frequency,
    initialWpm: s.initialWpm,
    roomEqualizer: s.roomMode,
    ...SENSITIVITY_PRESETS[s.sensitivity],
  };
}

export const morseSettingsStore = () =>
  new SettingsStore<MorseSettings>({
    key: 'audiolab.morse',
    version: 1,
    defaults: DEFAULT_MORSE_SETTINGS,
    validate: (raw) =>
      isRecord(raw)
        ? {
            frequencyMode: read.oneOf(raw, 'frequencyMode', ['auto', 'manual'] as const, 'auto'),
            frequency: read.number(raw, 'frequency', 700, FREQUENCY_RANGE.min, FREQUENCY_RANGE.max),
            sensitivity: read.oneOf(raw, 'sensitivity', SENSITIVITIES, 'medium'),
            initialWpm: read.number(raw, 'initialWpm', 20, 5, 60),
            roomMode: read.boolean(raw, 'roomMode', false),
          }
        : null,
  });
