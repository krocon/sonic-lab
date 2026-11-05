import { Routes } from '@angular/router';
import { ANALYSIS_MODULES } from './core/modules/module-catalog';

const placeholderRoutes: Routes = ANALYSIS_MODULES.filter((m) => m.status === 'planned').map(
  (m) => ({
    path: m.path,
    title: `${m.title} · Sonic Lab`,
    data: { moduleId: m.id },
    loadComponent: () =>
      import('./features/module-placeholder/module-placeholder.page').then(
        (c) => c.ModulePlaceholderPage,
      ),
  }),
);

export const routes: Routes = [
  // like a radio, the app opens in a mode – there is no start page
  { path: '', pathMatch: 'full', redirectTo: 'morse-decoder' },
  {
    path: 'morse-decoder',
    title: 'Morse Decoder · Sonic Lab',
    loadComponent: () =>
      import('./features/morse-decoder/morse-decoder.page').then((c) => c.MorseDecoderPage),
  },
  {
    path: 'morse-encoder',
    title: 'Morse Encoder · Sonic Lab',
    loadComponent: () =>
      import('./features/morse-encoder/morse-encoder.page').then((c) => c.MorseEncoderPage),
  },
  {
    path: 'frequency-analyzer',
    title: 'Frequency Analyzer · Sonic Lab',
    loadComponent: () =>
      import('./features/frequency-analyzer/frequency-analyzer.page').then(
        (c) => c.FrequencyAnalyzerPage,
      ),
  },
  {
    path: 'spectrum-analyzer',
    title: 'Spectrum Analyzer · Sonic Lab',
    loadComponent: () =>
      import('./features/spectrum-analyzer/spectrum-analyzer.page').then(
        (c) => c.SpectrumAnalyzerPage,
      ),
  },
  {
    path: 'signal-monitor',
    title: 'Signal Monitor · Sonic Lab',
    loadComponent: () =>
      import('./features/signal-monitor/signal-monitor.page').then((c) => c.SignalMonitorPage),
  },
  {
    path: 'dtmf-decoder',
    title: 'DTMF Decoder · Sonic Lab',
    loadComponent: () =>
      import('./features/dtmf-decoder/dtmf-decoder.page').then((c) => c.DtmfDecoderPage),
  },
  {
    path: 'tone-generator',
    title: 'Tone Generator · Sonic Lab',
    loadComponent: () =>
      import('./features/tone-generator/tone-generator.page').then((c) => c.ToneGeneratorPage),
  },
  {
    path: 'audio-recorder',
    title: 'Audio Recorder · Sonic Lab',
    loadComponent: () =>
      import('./features/audio-recorder/audio-recorder.page').then((c) => c.AudioRecorderPage),
  },
  ...placeholderRoutes,
  { path: '**', redirectTo: '' },
];
