import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
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
import { Knob } from '../../shared/controls/knob';
import { Icon } from '../../shared/icon/icon';
import { StatusBanner } from '../../shared/status/status-banner';

/** Factory for the output context; tests replace it. */
export const generatorContext = {
  create: (): AudioContext => new AudioContext({ latencyHint: 'interactive' }),
};

const WAVEFORMS: readonly { id: GeneratorWaveform; label: string }[] = [
  { id: 'sine', label: 'Sine' },
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sawtooth', label: 'Sawtooth' },
  { id: 'white-noise', label: 'White noise' },
  { id: 'pink-noise', label: 'Pink noise' },
  { id: 'sweep-linear', label: 'Sweep (linear)' },
  { id: 'sweep-log', label: 'Sweep (logarithmic)' },
  { id: 'two-tone', label: 'Two tones' },
  { id: 'dtmf', label: 'DTMF key' },
];

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
              WAVEFORMS.map((w) => w.id),
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
  imports: [Icon, Knob, StatusBanner],
  templateUrl: './tone-generator.page.html',
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-4);
    }
    .knobs {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-around;
      gap: var(--space-5);
      padding: var(--space-3) 0;
    }
    .play {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .playing-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-danger);
      font-weight: var(--weight-bold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .keys {
      display: grid;
      grid-template-columns: repeat(4, 2.5rem);
      gap: var(--space-1);
    }
    .keys .btn {
      min-height: 2.5rem;
      padding: 0;
    }
    .note {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--color-text-subtle);
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
  protected readonly dtmfKeys = DTMF_KEYS.flat();
  protected readonly settings = signal(this.settingsStore.load());
  protected readonly playing = signal(false);
  protected readonly status = signal<StatusMessage | null>(null);
  protected readonly minLevel = MIN_LEVEL_DB;
  protected readonly maxLevel = MAX_LEVEL_DB;
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

  protected num(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected waveform(event: Event): GeneratorWaveform {
    const v = (event.target as HTMLSelectElement).value;
    return WAVEFORMS.find((w) => w.id === v)?.id ?? 'sine';
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
