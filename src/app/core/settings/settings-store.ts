/**
 * Versioned JSON settings in `localStorage`. Never throws: broken JSON, an invalid shape,
 * a blocked storage or an unknown version all fall back to the defaults.
 */
export interface SettingsStoreOptions<T> {
  readonly key: string;
  readonly version: number;
  readonly defaults: T;
  /** Returns a valid value (may fill gaps from defaults) or `null` if unusable. */
  readonly validate: (raw: unknown) => T | null;
  /** Upgrades data of an older version to the raw shape of the current version. */
  readonly migrate?: (raw: unknown, fromVersion: number) => unknown;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

interface Envelope {
  readonly v: number;
  readonly data: unknown;
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { v?: unknown }).v === 'number' &&
    'data' in value
  );
}

function defaultStorage(): SettingsStoreOptions<unknown>['storage'] {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class SettingsStore<T> {
  private readonly storage: SettingsStoreOptions<T>['storage'];

  constructor(private readonly options: SettingsStoreOptions<T>) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
  }

  load(): T {
    const { defaults, validate, migrate, version } = this.options;
    let text: string | null;
    try {
      text = this.storage?.getItem(this.options.key) ?? null;
    } catch {
      return defaults;
    }
    if (text === null) return defaults;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return defaults;
    }
    if (!isEnvelope(parsed) || parsed.v > version) return defaults;
    const data = parsed.v < version ? (migrate?.(parsed.data, parsed.v) ?? null) : parsed.data;
    return validate(data) ?? defaults;
  }

  save(value: T): boolean {
    try {
      this.storage?.setItem(
        this.options.key,
        JSON.stringify({ v: this.options.version, data: value } satisfies Envelope),
      );
      return this.storage != null;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.options.key);
    } catch {
      // nothing to do
    }
  }
}

/** Helpers for hand-written validators (no schema library). */
export const read = {
  number(
    obj: Record<string, unknown>,
    key: string,
    fallback: number,
    min = -Infinity,
    max = Infinity,
  ): number {
    const v = obj[key];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  },
  string(obj: Record<string, unknown>, key: string, fallback: string): string {
    const v = obj[key];
    return typeof v === 'string' ? v : fallback;
  },
  boolean(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
    const v = obj[key];
    return typeof v === 'boolean' ? v : fallback;
  },
  oneOf<V extends string>(
    obj: Record<string, unknown>,
    key: string,
    allowed: readonly V[],
    fallback: V,
  ): V {
    const v = obj[key];
    return typeof v === 'string' && (allowed as readonly string[]).includes(v)
      ? (v as V)
      : fallback;
  },
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
