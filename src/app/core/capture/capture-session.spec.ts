import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { AUDIO_SOURCE, CaptureSession } from './capture-session';

describe('CaptureSession', () => {
  let source: FakeAudioSource;
  let session: CaptureSession;
  let injector: Injector;

  beforeEach(() => {
    source = new FakeAudioSource();
    TestBed.configureTestingModule({
      providers: [CaptureSession, { provide: AUDIO_SOURCE, useValue: source }],
    });
    injector = TestBed.inject(Injector);
    session = injector.get(CaptureSession);
  });

  it('starts, forwards frames to consumers and stops', async () => {
    const received: number[] = [];
    session.addConsumer((f) => received.push(f.samples.length));
    await session.start('default');
    expect(session.running()).toBe(true);
    expect(session.devices().length).toBe(1);

    source.emit(new Float32Array(128));
    expect(received).toEqual([128]);

    await session.stop();
    expect(session.state().status).toBe('stopped');
    expect(source.frameListenerCount).toBe(0);
    source.emit(new Float32Array(64));
    expect(received).toEqual([128]);
  });

  it('removes a consumer', async () => {
    let count = 0;
    const remove = session.addConsumer(() => count++);
    await session.start();
    source.emit(new Float32Array(8));
    remove();
    source.emit(new Float32Array(8));
    expect(count).toBe(1);
  });

  it('exposes source errors as state and detaches', async () => {
    source.failWith = { kind: 'permission-denied' };
    await session.start();
    const state = session.state();
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.error.kind).toBe('permission-denied');
    expect(source.frameListenerCount).toBe(0);
  });

  it('ignores a second start while running', async () => {
    await session.start();
    await session.start();
    expect(source.startCalls).toBe(1);
  });

  it('follows state changes of the source (e.g. device lost)', async () => {
    await session.start();
    source.setState({ status: 'error', error: { kind: 'device-lost' } });
    expect(session.running()).toBe(false);
  });

  it('stops the source when destroyed', async () => {
    await session.start();
    TestBed.resetTestingModule();
    expect(source.stopCalls).toBeGreaterThan(0);
  });
});
