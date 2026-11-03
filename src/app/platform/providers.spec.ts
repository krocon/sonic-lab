import { TestBed } from '@angular/core/testing';
import { BrowserFileExport, FileExportAdapter, provideFileExport } from './file-export';
import { BrowserPlatformAdapter } from './browser-platform-adapter';
import { PlatformAdapter } from './platform-adapter';
import { providePlatformAdapter } from './platform-adapter.provider';
import { tauri } from './tauri-bridge';
import { TauriFileExport } from './file-export';
import { TauriPlatformAdapter } from './tauri-platform-adapter';

describe('platform providers', () => {
  it('choose the browser implementations outside Tauri', () => {
    TestBed.configureTestingModule({ providers: [providePlatformAdapter(), provideFileExport()] });
    expect(TestBed.inject(PlatformAdapter)).toBeInstanceOf(BrowserPlatformAdapter);
    expect(TestBed.inject(FileExportAdapter)).toBeInstanceOf(BrowserFileExport);
  });

  it('choose the Tauri implementations in the desktop app', () => {
    const spy = vi.spyOn(tauri, 'isTauri').mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [providePlatformAdapter(), provideFileExport()] });
    expect(TestBed.inject(PlatformAdapter)).toBeInstanceOf(TauriPlatformAdapter);
    expect(TestBed.inject(FileExportAdapter)).toBeInstanceOf(TauriFileExport);
    spy.mockRestore();
  });
});
