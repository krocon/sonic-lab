import { DOCUMENT, Provider, inject } from '@angular/core';
import { CompositeAudioSource } from '../../audio/composite-audio-source';
import {
  BrowserMicrophoneSource,
  browserMicrophoneEnvironment,
} from '../../audio/microphone/browser-microphone-source';
import { SignalGenerator } from '../../audio/synthesis/signal';
import { SyntheticAudioSource } from '../../audio/synthetic/synthetic-audio-source';
import { AUDIO_SOURCE, CaptureSession, VIRTUAL_DEVICE_IDS } from './capture-session';
import { demoSignal } from './demo-signal';

export const DEMO_DEVICE_ID = 'audiolab:demo';

export interface AudioCaptureOptions {
  /** Generator of the "Demo signal" input; defaults to a keyed Morse tone. */
  readonly demo?: () => SignalGenerator;
}

/**
 * Page-level providers for audio capture: microphone + clearly labelled demo input,
 * and a {@link CaptureSession} that is destroyed (and stops capture) with the page.
 */
export function provideAudioCapture(options: AudioCaptureOptions = {}): Provider[] {
  return [
    {
      provide: AUDIO_SOURCE,
      useFactory: () => {
        const win = inject(DOCUMENT).defaultView;
        if (!win) throw new Error('Audio capture needs a browser window');
        const microphone = new BrowserMicrophoneSource(browserMicrophoneEnvironment(win));
        const demo = new SyntheticAudioSource({ generator: options.demo ?? demoSignal });
        return new CompositeAudioSource(microphone, [
          {
            device: { id: DEMO_DEVICE_ID, label: 'Demo signal (synthetic, no microphone)' },
            source: demo,
          },
        ]);
      },
    },
    { provide: VIRTUAL_DEVICE_IDS, useValue: [DEMO_DEVICE_ID] },
    CaptureSession,
  ];
}
