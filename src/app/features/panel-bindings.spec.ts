import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../testing/fake-audio-source';
import { AUDIO_SOURCE, CaptureSession } from '../core/capture/capture-session';
import { FrontPanel, PanelControl, choiceText } from '../core/panel/front-panel';
import { FileExportAdapter } from '../platform/file-export';
import { AudioRecorderPage } from './audio-recorder/audio-recorder.page';
import { DtmfDecoderPage } from './dtmf-decoder/dtmf-decoder.page';
import { FrequencyAnalyzerPage } from './frequency-analyzer/frequency-analyzer.page';
import { MorseDecoderPage } from './morse-decoder/morse-decoder.page';
import { MorseSession } from './morse-decoder/morse-session';
import { MorseEncoderPage } from './morse-encoder/morse-encoder.page';
import { SignalMonitorPage } from './signal-monitor/signal-monitor.page';
import { SpectrumAnalyzerPage } from './spectrum-analyzer/spectrum-analyzer.page';
import { ToneGeneratorPage } from './tone-generator/tone-generator.page';

const CAPTURE_PAGES: readonly Type<unknown>[] = [
  MorseDecoderPage,
  DtmfDecoderPage,
  FrequencyAnalyzerPage,
  SpectrumAnalyzerPage,
  SignalMonitorPage,
  AudioRecorderPage,
];
const OUTPUT_PAGES: readonly Type<unknown>[] = [MorseEncoderPage, ToneGeneratorPage];

function create(page: Type<unknown>) {
  TestBed.configureTestingModule({
    imports: [page],
    providers: [{ provide: FileExportAdapter, useValue: { save: vi.fn() } }],
  });
  if (CAPTURE_PAGES.includes(page))
    TestBed.overrideComponent(page, {
      set: {
        providers: [
          { provide: AUDIO_SOURCE, useValue: new FakeAudioSource() },
          CaptureSession,
          ...(page === MorseDecoderPage ? [MorseSession] : []),
        ],
      },
    });
  TestBed.createComponent(page);
  return TestBed.inject(FrontPanel);
}

/** Every value turns both ways, every choice steps through all options back to its start. */
function exercise(panel: FrontPanel, control: PanelControl): void {
  if (control.disabled?.()) return;
  switch (control.kind) {
    case 'value': {
      const start = control.value();
      panel.step(control, 1);
      panel.step(control, -1);
      expect(control.format(control.value())).not.toBe('');
      const { min, max } = control.scale();
      if (start > min && start < max) expect(control.value()).toBeCloseTo(start, 6);
      break;
    }
    case 'choice': {
      const start = control.value();
      for (const option of control.options) {
        expect(option.label).not.toBe('');
        expect(choiceText(control)).not.toBe('');
        panel.press(control);
      }
      expect(control.value()).toBe(start);
      break;
    }
    case 'action':
      expect(control.label).not.toBe('');
      break;
  }
}

describe('front-panel bindings of every module', () => {
  beforeEach(() => localStorage.clear());

  for (const page of [...CAPTURE_PAGES, ...OUTPUT_PAGES]) {
    it(`${page.name}: soft keys, knobs and keys respond`, () => {
      const panel = create(page);
      const b = panel.binding();
      const keys = panel.softkeys();
      expect(keys).toHaveLength(6);
      for (const control of keys) if (control) exercise(panel, control);
      for (const knob of panel.knobs()) if (knob) exercise(panel, knob);
      for (const key of [panel.playKey(), panel.stopKey(), b.record, b.copy]) {
        if (!key) continue;
        expect(key.name).not.toBe('');
        key.disabled?.();
        key.active?.();
      }
      b.state?.();
      b.message?.();
      expect(!!b.capture).toBe(CAPTURE_PAGES.includes(page));
    });
  }

  it('the encoder and generator follow their settings with soft keys and knobs', () => {
    const panel = create(ToneGeneratorPage);
    const wave = panel.softkeys()[0]!;
    // walk through every waveform: the third key and the knobs follow, all still respond
    for (let i = 0; i < 10; i++) {
      for (const control of panel.softkeys()) if (control) exercise(panel, control);
      panel.press(wave);
    }
    expect(choiceText(wave as never)).toBe('SINE');
  });

  it('runs the actions that are available', async () => {
    const panel = create(MorseEncoderPage);
    const clear = panel.softkeys().find((c) => c?.name === 'Clear text');
    expect(clear?.disabled?.()).toBe(false);
    panel.press(clear!);
    expect(clear?.disabled?.()).toBe(true);
    expect(panel.binding().state?.()).toEqual({ text: 'Ready', live: false });
  });
});
