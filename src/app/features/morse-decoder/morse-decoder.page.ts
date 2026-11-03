import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LevelMeter } from '../../audio/level';
import { RingBuffer } from '../../audio/ring-buffer';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { CaptureControls } from '../../shared/capture/capture-controls';
import { Icon } from '../../shared/icon/icon';
import { LevelMeterBar } from '../../shared/visualization/level-meter-bar';
import { WaveformCanvas } from '../../shared/visualization/waveform-canvas';

/**
 * Morse decoder workspace. Capture and visualisation are live; decoding arrives with prompt 03.
 */
@Component({
  selector: 'app-morse-decoder-page',
  imports: [Icon, CaptureControls, WaveformCanvas, LevelMeterBar],
  providers: [provideAudioCapture()],
  templateUrl: './morse-decoder.page.html',
  styleUrl: './morse-decoder.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorseDecoderPage {
  protected readonly session = inject(CaptureSession);
  /** ~1.4 s of history at 48 kHz for the scope. */
  protected readonly scope = new RingBuffer(65536);
  protected readonly meter = new LevelMeter();

  constructor() {
    this.session.addConsumer((frame) => {
      this.scope.write(frame.samples);
      this.meter.process(frame.samples, frame.sampleRate);
    });
  }
}
