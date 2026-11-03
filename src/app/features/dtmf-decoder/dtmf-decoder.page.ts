import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { provideAudioCapture } from '../../core/capture/audio-capture.providers';
import { CaptureSession } from '../../core/capture/capture-session';
import { demoDtmfSignal } from '../../core/capture/demo-signal';
import { attachPanel, panelAction } from '../../core/panel/front-panel';
import { StatusMessage } from '../../core/status/status-message';
import { DtmfDecoder } from '../../decoders/dtmf/dtmf-decoder';
import {
  DTMF_COLUMNS,
  DTMF_KEYS,
  DTMF_ROWS,
  DtmfKey,
  dtmfFrequencies,
} from '../../decoders/dtmf/dtmf-tones';

const LEVEL_UPDATE_SECONDS = 0.05;
const MAX_DIGITS = 5000;

/** Telephone keypad tones → digits, with a live keypad and tone levels. */
@Component({
  selector: 'app-dtmf-decoder-page',
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
  /** Row + column tone of the key being held. */
  protected readonly pair = computed(() => {
    const key = this.pressed();
    return key ? dtmfFrequencies(key) : null;
  });
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
    attachPanel({
      softkeys: [
        panelAction({
          label: 'CLEAR',
          name: 'Clear digits',
          run: () => this.reset(),
          disabled: () => !this.digits(),
        }),
      ],
      capture: this.session,
      copy: { name: 'Copy digits', run: () => this.copy(), disabled: () => !this.digits() },
      message: this.status,
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
