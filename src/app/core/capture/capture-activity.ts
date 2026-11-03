import { Injectable, computed, signal } from '@angular/core';

/** App-wide view of whether a real microphone is open (for the status bar). */
@Injectable({ providedIn: 'root' })
export class CaptureActivity {
  private readonly openSessions = signal(0);
  readonly microphoneOpen = computed(() => this.openSessions() > 0);

  /** Called by a capture session when its microphone opens (+1) or closes (-1). */
  adjust(delta: 1 | -1): void {
    this.openSessions.update((n) => Math.max(0, n + delta));
  }
}
