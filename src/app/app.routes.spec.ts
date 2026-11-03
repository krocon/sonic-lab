import { ANALYSIS_MODULES } from './core/modules/module-catalog';
import { routes } from './app.routes';

describe('routes', () => {
  it('has a route for every analysis module', () => {
    const paths = new Set(routes.map((r) => r.path));
    for (const m of ANALYSIS_MODULES) {
      expect(paths.has(m.path)).toBe(true);
    }
  });

  it('falls back to the overview for unknown paths', () => {
    expect(routes.at(-1)).toEqual({ path: '**', redirectTo: '' });
  });
});
