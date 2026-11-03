import { TestBed } from '@angular/core/testing';
import { BrowserFileExport, FileExportAdapter, provideFileExport } from './file-export';
import { BrowserPlatformAdapter } from './browser-platform-adapter';
import { PlatformAdapter } from './platform-adapter';
import { providePlatformAdapter } from './platform-adapter.provider';

describe('platform providers', () => {
  it('choose the browser implementations outside Tauri', () => {
    TestBed.configureTestingModule({ providers: [providePlatformAdapter(), provideFileExport()] });
    expect(TestBed.inject(PlatformAdapter)).toBeInstanceOf(BrowserPlatformAdapter);
    expect(TestBed.inject(FileExportAdapter)).toBeInstanceOf(BrowserFileExport);
  });
});
