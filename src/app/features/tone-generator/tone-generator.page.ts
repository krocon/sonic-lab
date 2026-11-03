import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  GeneratorSettings,
  GeneratorWaveform,
  MAX_LEVEL_DB,
  MIN_LEVEL_DB,
  ToneGenerator,
} from '../../audio/output/tone-generator';
import { PanelOption, attachPanel, panelChoice, panelValue } from '../../core/panel/front-panel';
import { SettingsStore, isRecord, read } from '../../core/settings/settings-store';
import { StatusMessage } from '../../core/status/status-message';
import { DTMF_KEYS, dtmfFrequencies, isDtmfKey } from '../../decoders/dtmf/dtmf-tones';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, waveformPath } from './waveform-preview';

/** Factory for the output context; tests replace it. */
export const generatorContext = {
  create: (): AudioContext => new AudioContext({ latencyHint: 'interactive' }),
};

const WAVEFORMS: readonly PanelOption<GeneratorWaveform>[] = [
  { value: 'sine', label: 'SINE' },
  { value: 'square', label: 'SQUARE' },
  { value: 'triangle', label: 'TRIANGLE' },
  { value: 'sawtooth', label: 'SAWTOOTH' },
  { value: 'white-noise', label: 'WHITE NOISE' },
  { value: 'pink-noise', label: 'PINK NOISE' },
  { value: 'sweep-linear', label: 'SWEEP LIN' },
  { value: 'sweep-log', label: 'SWEEP LOG' },
  { value: 'two-tone', label: 'TWO TONES' },
  { value: 'dtmf', label: 'DTMF' },
];
const DTMF_OPTIONS: readonly PanelOption<string>[] = DTMF_KEYS.flat().map((k) => ({
  value: k,
  label: k,
}));

/** Hz with thin-space thousands groups, like a frequency display. */
function hz(f: number): string {
  return String(Math.round(f)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}

interface GeneratorUiSettings {
  readonly waveform: GeneratorWaveform;
  readonly frequency: number;
  readonly frequency2: number;
  readonly sweepSeconds: number;
  readonly levelDb: number;
  readonly balance: number;
  readonly dtmfKey: string;
}

const DEFAULTS: GeneratorUiSettings = {
  waveform: 'sine',
  frequency: 1000,
  frequency2: 4000,
  sweepSeconds: 10,
  levelDb: -20,
  balance: 0,
  dtmfKey: '5',
};

const store = () =>
  new SettingsStore<GeneratorUiSettings>({
    key: 'audiolab.generator',
    version: 1,
    defaults: DEFAULTS,
    validate: (raw) =>
      isRecord(raw)
        ? {
            waveform: read.oneOf(
              raw,
              'waveform',
              WAVEFORMS.map((w) => w.value),
              'sine',
            ),
            frequency: read.number(raw, 'frequency', 1000, 20, 20000),
            frequency2: read.number(raw, 'frequency2', 4000, 20, 20000),
            sweepSeconds: read.number(raw, 'sweepSeconds', 10, 1, 60),
            levelDb: read.number(raw, 'levelDb', -20, MIN_LEVEL_DB, MAX_LEVEL_DB),
            balance: read.number(raw, 'balance', 0, -1, 1),
            dtmfKey: isDtmfKey(read.string(raw, 'dtmfKey', '5'))
              ? read.string(raw, 'dtmfKey', '5')
              : '5',
          }
        : null,
  });

/** Test signals: tones, noise, sweeps, two-tone and DTMF. */
@Component({
  selector: 'app-tone-generator-page',
  templateUrl: './tone-generator.page.html',
  styleUrl: './tone-generator.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToneGeneratorPage {
  private readonly settingsStore = store();
  private readonly generator = new ToneGenerator(() => generatorContext.create());
  protected readonly waveforms = WAVEFORMS;
  protected readonly previewWidth = PREVIEW_WIDTH;
  protected readonly previewHeight = PREVIEW_HEIGHT;
  protected readonly settings = signal(this.settingsStore.load());
  protected readonly playing = signal(false);
  protected readonly status = signal<StatusMessage | null>(null);
  protected readonly maxLevel = MAX_LEVEL_DB;
  protected readonly balanceText = (b: number) =>
    b === 0 ? 'center' : `${Math.round(Math.abs(b) * 100)} % ${b < 0 ? 'L' : 'R'}`;
  protected readonly waveformLabel = computed(
    () => WAVEFORMS.find((w) => w.value === this.settings().waveform)?.label ?? '',
  );
  /** What the main display shows for the current waveform. */
  protected readonly readout = computed(() => {
    const s = this.settings();
    const level = `${s.levelDb} dBFS`;
    if (s.waveform === 'dtmf') {
      const key = isDtmfKey(s.dtmfKey) ? s.dtmfKey : '5';
      const { row, column } = dtmfFrequencies(key);
      return { main: `KEY ${key}`, sub: `${row} + ${column} Hz · ${level}` };
    }
    if (s.waveform.includes('noise')) return { main: 'NOISE', sub: level };
    if (s.waveform.startsWith('sweep'))
      return {
        main: `${hz(s.frequency)} Hz`,
        sub: `→ ${hz(s.frequency2)} Hz in ${s.sweepSeconds} s · ${level}`,
      };
    if (s.waveform === 'two-tone')
      return { main: `${hz(s.frequency)} Hz`, sub: `+ ${hz(s.frequency2)} Hz · ${level}` };
    return { main: `${hz(s.frequency)} Hz`, sub: level };
  });
  protected readonly preview = computed(() => {
    const s = this.settings();
    let ratio = Math.min(8, s.frequency2 / Math.max(1, s.frequency));
    if (s.waveform === 'dtmf') {
      const { row, column } = dtmfFrequencies(isDtmfKey(s.dtmfKey) ? s.dtmfKey : '5');
      ratio = column / row;
    }
    return waveformPath(s.waveform, ratio);
  });
  /** Level bar: position of the level between the minimum and the cap. */
  protected readonly levelPercent = computed(
    () => ((this.settings().levelDb - MIN_LEVEL_DB) / (MAX_LEVEL_DB - MIN_LEVEL_DB)) * 100,
  );
  /** Start/stop/restart run one after another – a Stop during a restart must win. */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    const settings = this.settings;
    const frequency = panelValue({
      label: 'FREQ',
      name: 'Frequency',
      value: () => settings().frequency,
      set: (frequency) => void this.update({ frequency }),
      scale: () => ({ min: 20, max: 20000, step: 1, log: true }),
      format: (v) => `${hz(v)} Hz`,
      disabled: () => !this.has('frequency'),
    });
    const frequency2 = panelValue({
      label: 'FREQ 2',
      name: 'Second frequency',
      value: () => settings().frequency2,
      set: (frequency2) => void this.update({ frequency2 }),
      scale: () => ({ min: 20, max: 20000, step: 1, log: true }),
      format: (v) => `${hz(v)} Hz`,
      disabled: () => !this.has('frequency2'),
    });
    const key = panelChoice({
      label: 'KEY',
      name: 'DTMF key',
      options: DTMF_OPTIONS,
      value: () => settings().dtmfKey,
      set: (dtmfKey) => void this.update({ dtmfKey }),
    });
    const sweep = panelValue({
      label: 'SWEEP',
      name: 'Sweep duration',
      value: () => settings().sweepSeconds,
      set: (sweepSeconds) => void this.update({ sweepSeconds }),
      scale: () => ({ min: 1, max: 60, step: 1, log: false }),
      format: (v) => `${v} s`,
      disabled: () => !this.has('sweep'),
    });
    const level = panelValue({
      label: 'LEVEL',
      name: 'Level',
      value: () => settings().levelDb,
      set: (levelDb) => void this.update({ levelDb }),
      scale: () => ({ min: MIN_LEVEL_DB, max: MAX_LEVEL_DB, step: 1, log: false }),
      format: (v) => `${v} dBFS`,
    });
    const balance = panelValue({
      label: 'BALANCE',
      name: 'Balance',
      value: () => settings().balance,
      set: (balance) => void this.update({ balance }),
      scale: () => ({ min: -1, max: 1, step: 0.05, log: false }),
      format: this.balanceText,
    });
    const waveform = panelChoice({
      label: 'WAVE',
      name: 'Waveform',
      options: WAVEFORMS,
      value: () => settings().waveform,
      set: (waveform) => void this.update({ waveform }),
    });
    const panel = attachPanel({
      softkeys: () => [
        waveform,
        frequency,
        this.has('dtmf') ? key : frequency2,
        sweep,
        level,
        balance,
      ],
      knobs: [frequency, sweep, level],
      multi: frequency,
      play: {
        name: 'Play',
        run: () => this.toggle(),
        active: this.playing,
        disabled: this.playing,
      },
      stop: { name: 'Stop', run: () => this.toggle(), disabled: () => !this.playing() },
      // in DTMF mode the digit keys pick the key to send
      digit: (d) => {
        if (this.has('dtmf')) void this.update({ dtmfKey: d });
        else panel.notify('ENTRY', 'select a value first');
      },
      state: () => ({ text: this.playing() ? 'Output on' : 'Output off', live: this.playing() }),
      message: this.status,
    });
    inject(DestroyRef).onDestroy(() => void this.generator.stop());
    inject(DOCUMENT).defaultView?.addEventListener('pagehide', () => void this.generator.stop());
  }

  protected has(kind: 'frequency' | 'frequency2' | 'sweep' | 'dtmf'): boolean {
    const w = this.settings().waveform;
    switch (kind) {
      case 'frequency':
        return !w.includes('noise') && w !== 'dtmf';
      case 'frequency2':
        return w === 'two-tone' || w.startsWith('sweep');
      case 'sweep':
        return w.startsWith('sweep');
      case 'dtmf':
        return w === 'dtmf';
    }
  }

  protected async update(patch: Partial<GeneratorUiSettings>): Promise<void> {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    this.settingsStore.save(next);
    if (this.playing() && !this.generator.update(this.toEngine(next)))
      await this.enqueue(() => this.start());
  }

  protected async toggle(): Promise<void> {
    if (this.playing()) {
      this.playing.set(false);
      await this.enqueue(() => this.generator.stop());
      return;
    }
    this.playing.set(true);
    await this.enqueue(() => this.start());
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  private async start(): Promise<void> {
    if (!this.playing()) return; // stopped while waiting in the queue
    this.status.set(null);
    try {
      await this.generator.start(this.toEngine(this.settings()), () => this.playing.set(false));
    } catch {
      this.playing.set(false);
      this.status.set({
        tone: 'danger',
        text: 'Audio output is not available.',
        hint: 'Check the output device and try again.',
      });
    }
  }

  private toEngine(s: GeneratorUiSettings): GeneratorSettings {
    return {
      waveform: s.waveform,
      frequency: s.frequency,
      frequency2: s.frequency2,
      sweepSeconds: s.sweepSeconds,
      levelDb: s.levelDb,
      balance: s.balance,
      dtmf: isDtmfKey(s.dtmfKey) ? dtmfFrequencies(s.dtmfKey) : dtmfFrequencies('5'),
    };
  }
}
