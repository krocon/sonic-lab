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
  ...placeholderRoutes,
  { path: '**', redirectTo: '' },
];
