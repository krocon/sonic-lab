import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { AudioRecorder } from '../../audio/recorder';
import { RingBuffer } from '../../audio/ring-buffer';
import { WavFormat } from '../../audio/wav';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { PanelOption, attachPanel, panelAction, panelChoice } from '../../core/panel/front-panel';
import { StatusMessage } from '../../core/status/status-message';
import { FileExportAdapter } from '../../platform/file-export';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';
import { WaveformCanvas } from '../../shared/visualization/waveform-canvas';

/** Playback context factory; tests replace it. */
export const playbackContext = { create: (): AudioContext => new AudioContext() };

const MAX_MINUTES = 10;

const FORMATS: readonly PanelOption<WavFormat>[] = [
  { value: 'pcm16', label: '16-BIT' },
  { value: 'float32', label: '32 FLOAT' },
];
const FORMAT_NAMES: Record<WavFormat, string> = {
  pcm16: 'WAV 16-bit PCM',
  float32: 'WAV 32-bit float',
};

/** Records the input into memory; exports WAV only when asked to. */
@Component({
  selector: 'app-audio-recorder-page',
  imports: [LevelMeterBar, WaveformCanvas],
  providers: [provideAudioCapture()],
  templateUrl: './audio-recorder.page.html',
  styles: `
    .screen {
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    .top {
      align-items: center;
      gap: 4cqw;
    }
    .time.recording {
      color: var(--oled-bad);
    }
    .states {
      flex-direction: column;
      align-items: flex-end;
    }
    .input {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 6px;
      padding: 12px 8px 8px;
    }
    .scope {
      min-height: 0;
    }
    .result {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.6cqh 2.4cqw;
      padding: 2.4cqh 1.4cqw 1.4cqh;
    }
    .result strong {
      font-size: clamp(13px, 3cqh, 20px);
      font-weight: 400;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioRecorderPage {
  protected readonly session = inject(CaptureSession);
  private readonly exporter = inject(FileExportAdapter);
  private readonly recorder = new AudioRecorder(MAX_MINUTES * 60);
  protected readonly meter = new LevelMeter();
  protected readonly scope = new RingBuffer(32768);
  protected readonly recording = signal(false);
  protected readonly seconds = signal(0);
  protected readonly hasRecording = signal(false);
  protected readonly nearlyFull = signal(false);
  protected readonly playing = signal(false);
  protected readonly format = signal<WavFormat>('pcm16');
  protected readonly formatName = computed(() => FORMAT_NAMES[this.format()]);
  protected readonly status = signal<StatusMessage | null>(null);
  protected readonly maxMinutes = MAX_MINUTES;
  protected readonly time = computed(() => {
    const s = this.seconds();
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  });
  private playback: AudioContext | null = null;

  constructor() {
    this.session.addConsumer((frame) => {
      this.scope.write(frame.samples);
      this.meter.process(frame.samples, frame.sampleRate);
      if (!this.recording()) return;
      this.recorder.push(frame.samples, frame.sampleRate);
      const s = Math.floor(this.recorder.seconds * 10) / 10;
      if (s !== this.seconds()) this.seconds.set(s);
      if (this.recorder.fill > 0.9 && !this.nearlyFull()) this.nearlyFull.set(true);
      if (this.recorder.full) void this.stopRecording();
    });
    inject(DestroyRef).onDestroy(() => void this.stopPlayback());

    const idle = () => !this.hasRecording() || this.recording();
    attachPanel({
      softkeys: [
        panelChoice({
          label: 'FORMAT',
          name: 'Format',
          options: FORMATS,
          value: this.format,
          set: (format) => this.format.set(format),
        }),
        panelAction({ label: 'EXPORT', name: 'Export…', run: () => this.export(), disabled: idle }),
        panelAction({
          label: 'DISCARD',
          name: 'Discard',
          run: () => this.discard(),
          disabled: idle,
        }),
      ],
      capture: this.session,
      record: {
        name: 'Record',
        run: () => this.startRecording(),
        active: this.recording,
        disabled: this.recording,
      },
      stop: {
        name: 'Stop',
        run: () => (this.recording() ? this.stopRecording() : this.stopPlayback()),
        disabled: () => !this.recording() && !this.playing(),
      },
      play: {
        name: 'Play recording',
        run: () => this.togglePlayback(),
        active: this.playing,
        disabled: () => idle() || this.playing(),
      },
      message: () =>
        this.status() ??
        (this.nearlyFull() && this.recording()
          ? { tone: 'warning', text: `The ${MAX_MINUTES}-minute limit is almost reached.` }
          : null),
    });
  }

  protected async startRecording(): Promise<void> {
    await this.stopPlayback();
    this.recorder.clear();
    this.seconds.set(0);
    this.nearlyFull.set(false);
    this.hasRecording.set(false);
    this.status.set(null);
    await this.session.start();
    if (this.session.running()) this.recording.set(true);
  }

  protected async stopRecording(): Promise<void> {
    this.recording.set(false);
    await this.session.stop();
    this.hasRecording.set(!this.recorder.isEmpty);
    if (this.recorder.full) {
      this.status.set({
        tone: 'warning',
        text: `Recording stopped at the ${MAX_MINUTES}-minute limit.`,
      });
    }
  }

  protected async togglePlayback(): Promise<void> {
    if (this.playing()) return this.stopPlayback();
    const ctx = playbackContext.create();
    this.playback = ctx;
    const data = this.recorder.samples();
    const buffer = ctx.createBuffer(1, data.length, this.recorder.sampleRate);
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => void this.stopPlayback();
    this.playing.set(true);
    await ctx.resume();
    src.start();
  }

  protected async export(): Promise<void> {
    const wav = this.recorder.toWav(this.format());
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      const result = await this.exporter.save(
        new Blob([wav], { type: 'audio/wav' }),
        `sonic-lab-${stamp}.wav`,
        'audio/wav',
      );
      this.status.set(
        result.status === 'saved'
          ? {
              tone: 'success',
              text: result.location ? `Saved to ${result.location}` : 'Recording exported.',
            }
          : { tone: 'neutral', text: 'Export cancelled.' },
      );
    } catch {
      this.status.set({
        tone: 'danger',
        text: 'Export failed.',
        hint: 'Check the target folder and free space.',
      });
    }
  }

  protected async discard(): Promise<void> {
    await this.stopPlayback();
    this.recorder.clear();
    this.seconds.set(0);
    this.hasRecording.set(false);
    this.status.set({ tone: 'neutral', text: 'Recording discarded.' });
  }

  private async stopPlayback(): Promise<void> {
    const ctx = this.playback;
    this.playback = null;
    this.playing.set(false);
    if (ctx) await ctx.close().catch(() => undefined);
  }
}
