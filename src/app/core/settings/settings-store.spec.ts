import { SettingsStore, isRecord, read } from './settings-store';

interface Prefs {
  freq: number;
  mode: 'a' | 'b';
}

const defaults: Prefs = { freq: 700, mode: 'a' };

function validate(raw: unknown): Prefs | null {
  if (!isRecord(raw)) return null;
  return {
    freq: read.number(raw, 'freq', defaults.freq, 100, 3000),
    mode: read.oneOf(raw, 'mode', ['a', 'b'] as const, defaults.mode),
  };
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

describe('SettingsStore', () => {
  let storage: MemoryStorage;
  const make = (extra: Partial<ConstructorParameters<typeof SettingsStore<Prefs>>[0]> = {}) =>
    new SettingsStore<Prefs>({ key: 'k', version: 2, defaults, validate, storage, ...extra });

  beforeEach(() => (storage = new MemoryStorage()));

  it('returns defaults when nothing is stored', () => {
    expect(make().load()).toEqual(defaults);
  });

  it('round-trips a value', () => {
    const store = make();
    expect(store.save({ freq: 900, mode: 'b' })).toBe(true);
    expect(store.load()).toEqual({ freq: 900, mode: 'b' });
  });

  it('survives broken JSON and wrong shapes', () => {
    storage.setItem('k', '{nope');
    expect(make().load()).toEqual(defaults);
    storage.setItem('k', JSON.stringify([1, 2]));
    expect(make().load()).toEqual(defaults);
  });

  it('clamps and repairs individual fields', () => {
    storage.setItem('k', JSON.stringify({ v: 2, data: { freq: 99999, mode: 'x' } }));
    expect(make().load()).toEqual({ freq: 3000, mode: 'a' });
  });

  it('migrates older versions and ignores newer ones', () => {
    storage.setItem('k', JSON.stringify({ v: 1, data: { frequency: 800 } }));
    const migrated = make({
      migrate: (raw) => (isRecord(raw) ? { freq: raw['frequency'], mode: 'b' } : null),
    }).load();
    expect(migrated).toEqual({ freq: 800, mode: 'b' });

    storage.setItem('k', JSON.stringify({ v: 3, data: { freq: 1000, mode: 'b' } }));
    expect(make().load()).toEqual(defaults);
  });

  it('never throws when the storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = make({ storage: throwing });
    expect(store.load()).toEqual(defaults);
    expect(store.save(defaults)).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });

  it('works without storage', () => {
    const store = make({ storage: null });
    expect(store.save(defaults)).toBe(false);
    expect(store.load()).toEqual(defaults);
  });
});
