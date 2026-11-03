import { TestBed } from '@angular/core/testing';
import { BrowserFileExport, TauriFileExport } from './file-export';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => false }));

describe('BrowserFileExport', () => {
  afterEach(() => delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker);

  it('downloads via a link when no file picker exists', async () => {
    TestBed.configureTestingModule({ providers: [BrowserFileExport] });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const result = await TestBed.inject(BrowserFileExport).save(
      new Blob(['a']),
      'rec.wav',
      'audio/wav',
    );
    expect(result).toEqual({ status: 'saved' });
    expect(click).toHaveBeenCalled();
  });

  it('uses the file picker and reports a cancelled dialog', async () => {
    TestBed.configureTestingModule({ providers: [BrowserFileExport] });
    const write = vi.fn(() => Promise.resolve());
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi
      .fn()
      .mockResolvedValueOnce({
        createWritable: () => Promise.resolve({ write, close: () => Promise.resolve() }),
      })
      .mockRejectedValueOnce(new DOMException('cancel', 'AbortError'));
    const adapter = TestBed.inject(BrowserFileExport);
    expect(await adapter.save(new Blob(['a']), 'rec.wav', 'audio/wav')).toEqual({
      status: 'saved',
    });
    expect(write).toHaveBeenCalled();
    expect(await adapter.save(new Blob(['a']), 'rec.wav', 'audio/wav')).toEqual({
      status: 'cancelled',
    });
  });
});

describe('TauriFileExport', () => {
  it('sends raw bytes with the suggested name and maps the result', async () => {
    TestBed.configureTestingModule({ providers: [TauriFileExport] });
    const adapter = TestBed.inject(TauriFileExport);
    invoke.mockResolvedValueOnce('/Users/me/rec.wav').mockResolvedValueOnce(null);
    expect(await adapter.save(new Blob([new Uint8Array([1, 2])]), 'rec.wav', 'audio/wav')).toEqual({
      status: 'saved',
      location: '/Users/me/rec.wav',
    });
    expect(invoke).toHaveBeenCalledWith('export_file', new Uint8Array([1, 2]), {
      headers: { 'x-file-name': 'rec.wav' },
    });
    expect(await adapter.save(new Blob([]), 'x.wav', 'audio/wav')).toEqual({ status: 'cancelled' });
  });
});
