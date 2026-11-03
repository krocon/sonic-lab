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
import { SettingsStore, isRecord, read } from '../../core/settings/settings-store';
import { StatusMessage } from '../../core/status/status-message';
import { DTMF_KEYS, dtmfFrequencies, isDtmfKey } from '../../decoders/dtmf/dtmf-tones';
import { KeyOption, KeySelector } from '../../shared/controls/key-selector';
import { Knob } from '../../shared/controls/knob';
import { Icon } from '../../shared/icon/icon';
import { StatusBanner } from '../../shared/status/status-banner';

/** Factory for the output context; tests replace it. */
export const generatorContext = {
  create: (): AudioContext => new AudioContext({ latencyHint: 'interactive' }),
};

const WAVEFORMS: readonly KeyOption<GeneratorWaveform>[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'white-noise', label: 'White noise' },
  { value: 'pink-noise', label: 'Pink noise' },
  { value: 'sweep-linear', label: 'Sweep lin' },
  { value: 'sweep-log', label: 'Sweep log' },
  { value: 'two-tone', label: 'Two tones' },
  { value: 'dtmf', label: 'DTMF' },
];

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
  imports: [Icon, KeySelector, Knob, StatusBanner],
  templateUrl: './tone-generator.page.html',
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 16rem;
      gap: var(--groove);
    }
    /* main display, like the frequency readout of a transceiver */
    .vfo {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: 'mode main out' 'mode sub out';
      align-items: center;
      column-gap: var(--space-4);
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-sm);
      background-color: var(--display-bg);
      background-image: var(--display-reflection);
      box-shadow: var(--display-inset);
      font-family: var(--font-mono);
    }
    .vfo-mode,
    .vfo-out {
      padding: 1px var(--space-2);
      border: 1px solid currentColor;
      border-radius: 2px;
      font-size: var(--text-2xs);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .vfo-mode {
      grid-area: mode;
      color: var(--display-cyan);
    }
    .vfo-main {
      grid-area: main;
      justify-self: end;
      font-size: clamp(1.75rem, 4vw, 2.75rem);
      line-height: 1.1;
      color: var(--display-text);
      text-shadow: var(--display-glow);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .vfo-sub {
      grid-area: sub;
      justify-self: end;
      min-height: 1.2em;
      font-size: var(--text-xs);
      color: var(--display-text-dim);
    }
    .vfo-out {
      grid-area: out;
      color: var(--display-text-dim);
      opacity: 0.6;
    }
    .vfo-out.on {
      color: var(--display-mark);
      opacity: 1;
    }
    .knob-row {
      justify-content: space-evenly;
      padding-top: var(--space-1);
    }
    .keys {
      max-width: 15rem;
    }
    .play {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .playing-badge::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--led-red);
      box-shadow: 0 0 8px var(--led-red);
    }
    .playing-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-xs);
      color: var(--color-danger);
      font-weight: var(--weight-bold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .btn-play {
      min-width: 7rem;
    }
    @media (max-width: 860px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToneGeneratorPage {
  private readonly settingsStore = store();
  private readonly generator = new ToneGenerator(() => generatorContext.create());
  protected readonly waveforms = WAVEFORMS;
  protected readonly dtmfKeys: readonly KeyOption<string>[] = DTMF_KEYS.flat().map((k) => ({
    value: k,
    label: k,
  }));
  protected readonly settings = signal(this.settingsStore.load());
  protected readonly playing = signal(false);
  protected readonly status = signal<StatusMessage | null>(null);
  protected readonly minLevel = MIN_LEVEL_DB;
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
  /** Start/stop/restart run one after another – a Stop during a restart must win. */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
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
