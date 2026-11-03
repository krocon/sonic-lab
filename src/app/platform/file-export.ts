import { DOCUMENT, Injectable, Provider, inject } from '@angular/core';
import { tauri } from './tauri-bridge';

export type ExportResult =
  { readonly status: 'saved'; readonly location?: string } | { readonly status: 'cancelled' };

/**
 * Saves a file the user explicitly asked to export. Web: file picker (File System Access API) or a
 * download; desktop: the `export_file` command, which opens the native save dialog in Rust.
 */
export abstract class FileExportAdapter {
  abstract save(data: Blob, suggestedName: string, mimeType: string): Promise<ExportResult>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

@Injectable()
export class BrowserFileExport extends FileExportAdapter {
  private readonly document = inject(DOCUMENT);

  override async save(data: Blob, suggestedName: string, mimeType: string): Promise<ExportResult> {
    const win = this.document.defaultView as (Window & SaveFilePickerWindow) | null;
    if (win?.showSaveFilePicker) {
      try {
        const ext = suggestedName.includes('.') ? `.${suggestedName.split('.').pop()}` : '';
        const handle = await win.showSaveFilePicker({
          suggestedName,
          types: ext
            ? [
                {
                  description: suggestedName.split('.').pop()?.toUpperCase() ?? 'File',
                  accept: { [mimeType]: [ext] },
                },
              ]
            : undefined,
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        return { status: 'saved' };
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError')
          return { status: 'cancelled' };
        // fall through to a plain download (e.g. picker blocked in an iframe)
      }
    }
    const url = URL.createObjectURL(data);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.rel = 'noopener';
    this.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { status: 'saved' };
  }
}

@Injectable()
export class TauriFileExport extends FileExportAdapter {
  override async save(
    data: Blob,
    suggestedName: string,
    _mimeType?: string,
  ): Promise<ExportResult> {
    const bytes = new Uint8Array(await data.arrayBuffer());
    const path = await tauri.invoke<string | null>('export_file', bytes, {
      headers: { 'x-file-name': suggestedName },
    });
    return path ? { status: 'saved', location: path } : { status: 'cancelled' };
  }
}

export function provideFileExport(): Provider {
  return {
    provide: FileExportAdapter,
    useClass: tauri.isTauri() ? TauriFileExport : BrowserFileExport,
  };
}
