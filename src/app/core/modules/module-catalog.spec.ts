import { ANALYSIS_MODULES, MODULE_GROUPS, findModule, modulesInGroup } from './module-catalog';

describe('module catalog', () => {
  it('has unique ids and paths', () => {
    const ids = new Set(ANALYSIS_MODULES.map((m) => m.id));
    const paths = new Set(ANALYSIS_MODULES.map((m) => m.path));
    expect(ids.size).toBe(ANALYSIS_MODULES.length);
    expect(paths.size).toBe(ANALYSIS_MODULES.length);
  });

  it('assigns every module to a known group', () => {
    const groups = new Set(MODULE_GROUPS.map((g) => g.id));
    for (const m of ANALYSIS_MODULES) {
      expect(groups.has(m.group)).toBe(true);
    }
    const total = MODULE_GROUPS.reduce((n, g) => n + modulesInGroup(g.id).length, 0);
    expect(total).toBe(ANALYSIS_MODULES.length);
  });

  it('references an existing follow-up prompt file name', () => {
    for (const m of ANALYSIS_MODULES) {
      expect(m.prompt).toMatch(/^\d{2}-[a-z-]+\.md$/);
    }
  });

  it('finds modules by id', () => {
    expect(findModule('morse-decoder')?.title).toBe('Morse Decoder');
    expect(findModule('nope')).toBeUndefined();
  });
});
