import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { ExportResult, FileExportAdapter } from '../../platform/file-export';
import { AudioRecorderPage } from './audio-recorder.page';

class FakeExporter extends FileExportAdapter {
  saved: { name: string; size: number }[] = [];
  result: ExportResult = { status: 'saved', location: '/tmp/x.wav' };
  override async save(data: Blob, name: string): Promise<ExportResult> {
    this.saved.push({ name, size: data.size });
    return this.result;
  }
}

describe('AudioRecorderPage', () => {
  it('records frames, exports a WAV and discards', async () => {
    const source = new FakeAudioSource();
    const exporter = new FakeExporter();
    TestBed.configureTestingModule({
      imports: [AudioRecorderPage],
      providers: [{ provide: FileExportAdapter, useValue: exporter }],
    });
    TestBed.overrideComponent(AudioRecorderPage, {
      set: { providers: [{ provide: AUDIO_SOURCE, useValue: source }, CaptureSession] },
    });
    const fixture = TestBed.createComponent(AudioRecorderPage);
    const el: HTMLElement = fixture.nativeElement;
    const click = async (label: string) => {
      (Array.from(el.querySelectorAll('button')) as HTMLButtonElement[])
        .find((b) => b.textContent?.trim().startsWith(label))
        ?.click();
      await fixture.whenStable();
    };
    await fixture.whenStable();
    await click('Record');
    for (let i = 0; i < 47; i++) source.emit(new Float32Array(1024).fill(0.1), i * 0.021);
    await fixture.whenStable();
    expect(el.textContent).toContain('0:01.0');
    await click('Stop recording');
    expect(source.state.status).toBe('stopped');

    await click('Export');
    expect(exporter.saved[0]?.name).toMatch(/^audiolab-.*\.wav$/);
    expect(exporter.saved[0]?.size).toBe(44 + 47 * 1024 * 2);
    expect(el.textContent).toContain('Saved to /tmp/x.wav');

    exporter.result = { status: 'cancelled' };
    await click('Export');
    expect(el.textContent).toContain('Export cancelled.');

    await click('Discard');
    expect(el.textContent).toContain('Recording discarded.');
    expect(el.textContent).not.toContain('Export…');
  });
});
