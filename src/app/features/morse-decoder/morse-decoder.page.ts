import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { RingBuffer } from '../../audio/ring-buffer';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import {
  PanelOption,
  attachPanel,
  panelAction,
  panelChoice,
  panelValue,
} from '../../core/panel/front-panel';
import { StatusMessage } from '../../core/status/status-message';
import { FileExportAdapter } from '../../platform/file-export';
import { KeyingTimelineCanvas } from '../../shared/visualization/keying-timeline-canvas';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';
import { WaveformCanvas } from '../../shared/visualization/waveform-canvas';
import { formatLogDate, formatLogTime } from './morse-log';
import { MorseSession } from './morse-session';
import { FREQUENCY_RANGE, MorseSettings, Sensitivity } from './morse-settings';

const MODES: readonly PanelOption<MorseSettings['frequencyMode']>[] = [
  { value: 'auto', label: 'AUTO' },
  { value: 'manual', label: 'FIXED' },
];

const SENSITIVITIES: readonly PanelOption<Sensitivity>[] = [
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
];

type View = 'live' | 'log';
const VIEWS: readonly PanelOption<View>[] = [
  { value: 'live', label: 'LIVE' },
  { value: 'log', label: 'LOG' },
];

/** The log view follows new lines while it is scrolled to (nearly) the end. */
const FOLLOW_SLACK_PX = 8;

/**
 * Morse decoder: live signal, key-down timeline and decoded output on the display; the LOG view
 * lists everything decoded, line by line with time and speed.
 */
@Component({
  selector: 'app-morse-decoder-page',
  imports: [WaveformCanvas, LevelMeterBar, KeyingTimelineCanvas],
  providers: [provideAudioCapture(), MorseSession],
  templateUrl: './morse-decoder.page.html',
  styleUrl: './morse-decoder.page.css',
  host: { '(document:keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorseDecoderPage {
  protected readonly session = inject(CaptureSession);
  protected readonly morse = inject(MorseSession);
  protected readonly log = this.morse.log;
  private readonly exporter = inject(FileExportAdapter);
  /** ~1.4 s of history at 48 kHz for the scope. */
  protected readonly scope = new RingBuffer(65536);
  protected readonly meter = new LevelMeter();
  protected readonly status = signal<StatusMessage | null>(null);
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly view = signal<View>('live');
  protected readonly formatTime = formatLogTime;
  private readonly logScroll = viewChild<ElementRef<HTMLElement>>('logScroll');
  private followLog = true;

  protected readonly wpmText = computed(() => {
    const wpm = this.morse.wpm();
    return wpm === null ? '–' : String(wpm);
  });
  protected readonly snrText = computed(() => {
    const snr = this.morse.snrDb();
    return snr === null ? '–' : String(snr);
  });
  protected readonly toneText = computed(() => {
    const s = this.morse.settings();
    if (s.frequencyMode === 'manual') return String(s.frequency);
    const f = this.morse.frequency();
    return f === null ? '–' : String(f);
  });

  constructor() {
    this.session.addConsumer((frame) => {
      this.scope.write(frame.samples);
      this.meter.process(frame.samples, frame.sampleRate);
    });

    const settings = this.morse.settings;
    const update = (patch: Partial<MorseSettings>) => this.morse.updateSettings(patch);
    const tone = panelValue({
      label: 'FIXED',
      name: 'Fixed tone',
      value: () => settings().frequency,
      // turning to a frequency means listening for exactly that tone
      set: (frequency) => update({ frequency, frequencyMode: 'manual' }),
      scale: () => ({ ...FREQUENCY_RANGE, log: false }),
      format: (v) => `${v} Hz`,
    });
    const speed = panelValue({
      label: 'START',
      name: 'Start speed',
      value: () => settings().initialWpm,
      set: (initialWpm) => update({ initialWpm }),
      scale: () => ({ min: 5, max: 50, step: 1, log: false }),
      format: (v) => `${v} WPM`,
    });
    const mode = panelChoice({
      label: 'TONE',
      name: 'Tone frequency',
      options: MODES,
      value: () => settings().frequencyMode,
      set: (frequencyMode) => update({ frequencyMode }),
    });
    const sensitivity = panelChoice({
      label: 'SENS',
      name: 'Sensitivity',
      options: SENSITIVITIES,
      value: () => settings().sensitivity,
      set: (sensitivity) => update({ sensitivity }),
    });
    const view = panelChoice({
      label: 'VIEW',
      name: 'View',
      options: VIEWS,
      value: this.view,
      set: (v) => this.showView(v),
    });
    const noLog = () => this.log.entries().length === 0;
    const liveKeys = [
      mode,
      tone,
      sensitivity,
      speed,
      panelAction({
        label: 'RESET',
        name: 'Reset',
        run: () => this.reset(),
        disabled: () => !this.morse.hasOutput(),
      }),
      view,
    ];
    const logKeys = [
      mode,
      tone,
      sensitivity,
      panelAction({ label: 'SAVE', name: 'Save log', run: () => this.saveLog(), disabled: noLog }),
      panelAction({
        label: 'CLEAR',
        name: 'Clear log',
        run: () => this.clearLog(),
        disabled: noLog,
      }),
      view,
    ];
    const inLog = () => this.view() === 'log';
    attachPanel({
      softkeys: () => (inLog() ? logKeys : liveKeys),
      knobs: [tone, speed, null],
      multi: tone,
      capture: this.session,
      copy: {
        get name() {
          return inLog() ? 'Copy log' : 'Copy text';
        },
        run: () => (inLog() ? this.copyLog() : this.copy()),
        disabled: () => (inLog() ? noLog() : !this.morse.text()),
      },
      message: () => {
        const unknown = this.morse.unknownCount();
        return (
          this.status() ??
          (unknown > 0
            ? {
                tone: 'neutral',
                text: `� marks ${unknown} sequence(s) that are not valid Morse characters.`,
              }
            : null)
        );
      },
    });

    // keep the newest log line in view, unless the user scrolled back
    afterRenderEffect(() => {
      this.log.entries();
      const el = this.logScroll()?.nativeElement;
      if (el && this.followLog) el.scrollTop = el.scrollHeight;
    });
  }

  protected copy(): Promise<void> {
    return this.writeClipboard(this.morse.text().trim(), 'Text copied to the clipboard.');
  }

  protected copyLog(): Promise<void> {
    return this.writeClipboard(this.log.toText(), 'Log copied to the clipboard.');
  }

  protected async saveLog(): Promise<void> {
    const now = this.log.now();
    const stamp = `${formatLogDate(now)}-${formatLogTime(now).replace(/:/g, '-')}`;
    try {
      const result = await this.exporter.save(
        new Blob([this.log.toText() + '\n'], { type: 'text/plain;charset=utf-8' }),
        `sonic-lab-morse-log-${stamp}.txt`,
        'text/plain',
      );
      this.flash(
        result.status === 'saved'
          ? {
              tone: 'success',
              text: result.location ? `Log saved to ${result.location}` : 'Log saved.',
            }
          : { tone: 'neutral', text: 'Saving cancelled.' },
        6000,
      );
    } catch {
      this.flash({
        tone: 'danger',
        text: 'Saving the log failed.',
        hint: 'Check the target folder and free space.',
      });
    }
  }

  protected clearLog(): void {
    this.log.clear();
    this.flash({ tone: 'neutral', text: 'Log cleared.' });
  }

  protected showView(view: View): void {
    this.followLog = true;
    this.view.set(view);
  }

  protected onLogScroll(el: HTMLElement): void {
    this.followLog = el.scrollTop + el.clientHeight >= el.scrollHeight - FOLLOW_SLACK_PX;
  }

  private async writeClipboard(text: string, done: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.flash({ tone: 'success', text: done });
    } catch {
      this.flash({
        tone: 'danger',
        text: 'Copying failed.',
        hint: 'Select the text and copy it manually.',
      });
    }
  }

  /** Shows a result in the message line for a while. */
  private flash(message: StatusMessage, ms = 3000): void {
    clearTimeout(this.statusTimer);
    this.status.set(message);
    this.statusTimer = setTimeout(() => this.status.set(null), ms);
  }

  /** Space = start/stop, Ctrl/⌘+K = reset – unless the user is typing or on a control. */
  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest(
      'input, select, textarea, button, a, [role="slider"], [contenteditable]',
    );
    if (event.key === ' ' && !interactive && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      void this.session.toggle();
    } else if (
      event.key.toLowerCase() === 'k' &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      this.reset();
    }
  }

  protected reset(): void {
    this.morse.reset();
    clearTimeout(this.statusTimer);
    this.status.set(null);
  }
}
