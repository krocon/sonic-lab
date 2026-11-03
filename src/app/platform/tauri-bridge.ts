import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * The Tauri core API as one object whose members tests replace (`vi.spyOn(tauri, 'invoke')`).
 * The unit-test runner shares modules between spec files (no isolation), so a module mock of
 * `@tauri-apps/api/core` is not seen by an adapter that another spec loaded first.
 */
export const tauri = {
  invoke: invoke as typeof invoke,
  isTauri: (): boolean => isTauri(),
};
