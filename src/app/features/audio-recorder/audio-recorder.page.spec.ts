import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { frontPanel } from '../../../testing/front-panel';
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
    const hw = frontPanel();
    await fixture.whenStable();
    expect(hw.disabled('Export…')).toBe(true);
    expect(hw.key('play')?.disabled?.()).toBe(true);

    await hw.run('record');
    expect(hw.key('record')?.active?.()).toBe(true);
    for (let i = 0; i < 47; i++) source.emit(new Float32Array(1024).fill(0.1), i * 0.021);
    await fixture.whenStable();
    expect(el.querySelector('.time')?.textContent?.trim()).toBe('0:01.0');
    await hw.run('stop');
    expect(source.state.status).toBe('stopped');

    hw.press('Format');
    expect(hw.text('Format')).toBe('32 FLOAT');
    hw.press('Format');
    hw.press('Export…');
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    expect(exporter.saved[0]?.name).toMatch(/^sonic-lab-.*\.wav$/);
    expect(exporter.saved[0]?.size).toBe(44 + 47 * 1024 * 2);
    expect(hw.message()?.text).toBe('Saved to /tmp/x.wav');

    exporter.result = { status: 'cancelled' };
    hw.press('Export…');
    await new Promise((r) => setTimeout(r));
    expect(hw.message()?.text).toBe('Export cancelled.');

    hw.press('Discard');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(hw.message()?.text).toBe('Recording discarded.');
    expect(hw.disabled('Export…')).toBe(true);
    expect(el.textContent).toContain('No recording yet');
  });
});
