export type WavFormat = 'pcm16' | 'float32';

/**
 * Encodes mono samples as a RIFF/WAVE file (little endian). PCM 16 bit is clipped to ±1 and
 * rounded; 32-bit float keeps the samples exactly (WAVE_FORMAT_IEEE_FLOAT, with a `fact` chunk).
 */
export function encodeWav(
  chunks: readonly Float32Array[],
  sampleRate: number,
  format: WavFormat = 'pcm16',
): ArrayBuffer {
  const frames = chunks.reduce((n, c) => n + c.length, 0);
  const bytesPerSample = format === 'pcm16' ? 2 : 4;
  const dataBytes = frames * bytesPerSample;
  const isFloat = format === 'float32';
  const fmtSize = isFloat ? 18 : 16;
  const factBytes = isFloat ? 12 : 0;
  const headerBytes = 12 + 8 + fmtSize + factBytes + 8;
  const buffer = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(buffer);
  let o = 0;
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i));
  };
  const u32 = (v: number) => {
    view.setUint32(o, v, true);
    o += 4;
  };
  const u16 = (v: number) => {
    view.setUint16(o, v, true);
    o += 2;
  };
  str('RIFF');
  u32(buffer.byteLength - 8);
  str('WAVE');
  str('fmt ');
  u32(fmtSize);
  u16(isFloat ? 3 : 1); // 1 = PCM, 3 = IEEE float
  u16(1); // mono
  u32(sampleRate);
  u32(sampleRate * bytesPerSample);
  u16(bytesPerSample);
  u16(bytesPerSample * 8);
  if (isFloat) {
    u16(0); // cbSize
    str('fact');
    u32(4);
    u32(frames);
  }
  str('data');
  u32(dataBytes);
  for (const chunk of chunks) {
    for (const s of chunk) {
      if (isFloat) {
        view.setFloat32(o, s, true);
        o += 4;
      } else {
        const c = Math.max(-1, Math.min(1, s));
        view.setInt16(o, Math.round(c < 0 ? c * 0x8000 : c * 0x7fff), true);
        o += 2;
      }
    }
  }
  return buffer;
}
