import { Routes } from '@angular/router';
import { ANALYSIS_MODULES } from './core/modules/module-catalog';

const placeholderRoutes: Routes = ANALYSIS_MODULES.filter((m) => m.status === 'planned').map(
  (m) => ({
    path: m.path,
    title: `${m.title} · AudioLab`,
    data: { moduleId: m.id },
    loadComponent: () =>
      import('./features/module-placeholder/module-placeholder.page').then(
        (c) => c.ModulePlaceholderPage,
      ),
  }),
);

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'AudioLab',
    loadComponent: () => import('./features/overview/overview.page').then((c) => c.OverviewPage),
  },
  {
    path: 'morse-decoder',
    title: 'Morse Decoder · AudioLab',
    loadComponent: () =>
      import('./features/morse-decoder/morse-decoder.page').then((c) => c.MorseDecoderPage),
  },
  {
    path: 'morse-encoder',
    title: 'Morse Encoder · AudioLab',
    loadComponent: () =>
      import('./features/morse-encoder/morse-encoder.page').then((c) => c.MorseEncoderPage),
  },
  {
    path: 'frequency-analyzer',
    title: 'Frequency Analyzer · AudioLab',
    loadComponent: () =>
      import('./features/frequency-analyzer/frequency-analyzer.page').then(
        (c) => c.FrequencyAnalyzerPage,
      ),
  },
  {
    path: 'spectrum-analyzer',
    title: 'Spectrum Analyzer · AudioLab',
    loadComponent: () =>
      import('./features/spectrum-analyzer/spectrum-analyzer.page').then(
        (c) => c.SpectrumAnalyzerPage,
      ),
  },
  {
    path: 'signal-monitor',
    title: 'Signal Monitor · AudioLab',
    loadComponent: () =>
      import('./features/signal-monitor/signal-monitor.page').then((c) => c.SignalMonitorPage),
  },
  {
    path: 'dtmf-decoder',
    title: 'DTMF Decoder · AudioLab',
    loadComponent: () =>
      import('./features/dtmf-decoder/dtmf-decoder.page').then((c) => c.DtmfDecoderPage),
  },
  {
    path: 'tone-generator',
    title: 'Tone Generator · AudioLab',
    loadComponent: () =>
      import('./features/tone-generator/tone-generator.page').then((c) => c.ToneGeneratorPage),
  },
  {
    path: 'audio-recorder',
    title: 'Audio Recorder · AudioLab',
    loadComponent: () =>
      import('./features/audio-recorder/audio-recorder.page').then((c) => c.AudioRecorderPage),
  },
  ...placeholderRoutes,
  { path: '**', redirectTo: '' },
];
