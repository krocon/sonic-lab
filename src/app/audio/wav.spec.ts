import { encodeWav } from './wav';

const text = (v: DataView, o: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)));

describe('encodeWav', () => {
  it('writes a valid 16-bit PCM header and little-endian samples with clipping', () => {
    const v = new DataView(
      encodeWav([new Float32Array([0, 1, -1]), new Float32Array([2, -0.5])], 48000),
    );
    expect(text(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(v.byteLength - 8);
    expect(text(v, 8, 8)).toBe('WAVEfmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(96000); // byte rate
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(text(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => v.getInt16(44 + 2 * i, true))).toEqual([
      0, 32767, -32768, 32767, -16384,
    ]);
  });

  it('writes 32-bit float with a fact chunk', () => {
    const v = new DataView(encodeWav([new Float32Array([0.25, -0.75])], 44100, 'float32'));
    expect(v.getUint16(20, true)).toBe(3);
    expect(v.getUint16(34, true)).toBe(32);
    expect(text(v, 38, 4)).toBe('fact');
    expect(v.getUint32(46, true)).toBe(2);
    expect(text(v, 50, 4)).toBe('data');
    expect(v.getFloat32(58, true)).toBe(0.25);
    expect(v.getFloat32(62, true)).toBe(-0.75);
  });
});
