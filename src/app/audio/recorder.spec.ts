import { AudioRecorder } from './recorder';

describe('AudioRecorder', () => {
  it('copies frames, reports duration and encodes WAV', () => {
    const r = new AudioRecorder(10);
    const buf = new Float32Array([0.5, -0.5]);
    r.push(buf, 8000);
    buf.fill(0); // capture buffers are reused – the recording must not change
    expect(Array.from(r.samples())).toEqual([0.5, -0.5]);
    expect(r.seconds).toBeCloseTo(2 / 8000, 10);
    expect(new DataView(r.toWav()).getUint32(24, true)).toBe(8000);
    r.clear();
    expect(r.isEmpty).toBe(true);
  });

  it('stops at the maximum length', () => {
    const r = new AudioRecorder(1);
    r.push(new Float32Array(600), 1000);
    expect(r.full).toBe(false);
    r.push(new Float32Array(600), 1000);
    expect(r.full).toBe(true);
    expect(r.seconds).toBe(1);
    expect(r.fill).toBe(1);
    r.push(new Float32Array(10), 1000);
    expect(r.seconds).toBe(1);
  });
});
