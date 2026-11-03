import { FakeAudioSource } from '../../testing/fake-audio-source';
import { CompositeAudioSource } from './composite-audio-source';

describe('CompositeAudioSource', () => {
  it('lists real and virtual devices and routes start() by device id', async () => {
    const mic = new FakeAudioSource();
    const demo = new FakeAudioSource();
    const composite = new CompositeAudioSource(mic, [
      { device: { id: 'demo', label: 'Demo' }, source: demo },
    ]);
    expect((await composite.listDevices()).map((d) => d.id)).toEqual(['default', 'demo']);

    const frames: string[] = [];
    composite.subscribe((f) => frames.push(f.samples.length === 1 ? 'mic' : 'demo'));
    await composite.start();
    mic.emit(new Float32Array(1));
    demo.emit(new Float32Array(2));
    expect(frames).toEqual(['mic']);

    await composite.start('demo');
    expect(mic.stopCalls).toBe(1);
    demo.emit(new Float32Array(2));
    mic.emit(new Float32Array(1));
    expect(frames).toEqual(['mic', 'demo']);
    expect(composite.state.status).toBe('running');
    expect(composite.isVirtual('demo')).toBe(true);
  });

  it('still lists virtual devices when the microphone cannot enumerate', async () => {
    const mic = new FakeAudioSource();
    mic.listDevices = () => Promise.reject(new Error('nope'));
    const composite = new CompositeAudioSource(mic, [
      { device: { id: 'demo', label: 'Demo' }, source: new FakeAudioSource() },
    ]);
    expect((await composite.listDevices()).map((d) => d.id)).toEqual(['demo']);
  });
});
