import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoDtmfSignal } from '../../core/capture/demo-signal';
import { StatusMessage } from '../../core/status/status-message';
import { DtmfDecoder } from '../../decoders/dtmf/dtmf-decoder';
import { DTMF_COLUMNS, DTMF_KEYS, DTMF_ROWS, DtmfKey } from '../../decoders/dtmf/dtmf-tones';
import { CaptureControls } from '../../shared/capture/capture-controls';
import { Icon } from '../../shared/icon/icon';
import { StatusBanner } from '../../shared/status/status-banner';

const LEVEL_UPDATE_SECONDS = 0.05;
const MAX_DIGITS = 5000;

/** Telephone keypad tones → digits, with a live keypad and tone levels. */
@Component({
  selector: 'app-dtmf-decoder-page',
  imports: [CaptureControls, Icon, StatusBanner],
  providers: [provideAudioCapture({ demo: demoDtmfSignal })],
  templateUrl: './dtmf-decoder.page.html',
  styleUrl: './dtmf-decoder.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DtmfDecoderPage {
  protected readonly session = inject(CaptureSession);
  private readonly decoder = new DtmfDecoder();
  protected readonly keys = DTMF_KEYS;
  protected readonly rowFreqs = DTMF_ROWS;
  protected readonly colFreqs = DTMF_COLUMNS;
  protected readonly digits = signal('');
  protected readonly pressed = signal<DtmfKey | null>(null);
  protected readonly rowLevels = signal<readonly number[]>([-100, -100, -100, -100]);
  protected readonly colLevels = signal<readonly number[]>([-100, -100, -100, -100]);
  protected readonly status = signal<StatusMessage | null>(null);
  private lastLevels = -Infinity;

  constructor() {
    this.session.addConsumer((frame) => {
      for (const e of this.decoder.process(frame)) {
        if (e.type === 'key-down') {
          this.pressed.set(e.key);
          this.digits.update((d) => (d + e.key).slice(-MAX_DIGITS));
        } else if (e.type === 'key-up') {
          this.pressed.set(null);
        } else if (frame.timestamp - this.lastLevels >= LEVEL_UPDATE_SECONDS) {
          this.lastLevels = frame.timestamp;
          this.rowLevels.set(e.rows);
          this.colLevels.set(e.columns);
        }
      }
    });
  }

  /** Bar height in % for a level in dBFS (−60…0). */
  protected bar(db: number): number {
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  }

  protected reset(): void {
    this.decoder.reset();
    this.digits.set('');
    this.pressed.set(null);
    this.status.set(null);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.digits());
      this.status.set({ tone: 'success', text: 'Digits copied to the clipboard.' });
    } catch {
      this.status.set({
        tone: 'danger',
        text: 'Copying failed.',
        hint: 'Select the digits and copy them manually.',
      });
    }
  }
}
