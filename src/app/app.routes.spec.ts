import { ANALYSIS_MODULES } from './core/modules/module-catalog';
import { routes } from './app.routes';

describe('routes', () => {
  it('has a route for every analysis module', () => {
    const paths = new Set(routes.map((r) => r.path));
    for (const m of ANALYSIS_MODULES) {
      expect(paths.has(m.path)).toBe(true);
    }
  });

  it('opens the Morse decoder at the root and for unknown paths', () => {
    expect(routes[0]).toEqual({ path: '', pathMatch: 'full', redirectTo: 'morse-decoder' });
    expect(routes.at(-1)).toEqual({ path: '**', redirectTo: '' });
  });
});
