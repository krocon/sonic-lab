import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('rejects invalid capacities', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });

  it('pads missing history with zeros', () => {
    const rb = new RingBuffer(8);
    rb.write([1, 2, 3]);
    const out = new Float32Array(5);
    expect(rb.readLatest(out)).toBe(3);
    expect(Array.from(out)).toEqual([0, 0, 1, 2, 3]);
  });

  it('wraps around and keeps the newest samples', () => {
    const rb = new RingBuffer(4);
    rb.write([1, 2, 3]);
    rb.write([4, 5, 6]);
    const out = new Float32Array(4);
    rb.readLatest(out);
    expect(Array.from(out)).toEqual([3, 4, 5, 6]);
    expect(rb.size).toBe(4);
    expect(rb.totalWritten).toBe(6);
  });

  it('handles writes larger than the capacity', () => {
    const rb = new RingBuffer(3);
    rb.write([1, 2, 3, 4, 5]);
    const out = new Float32Array(3);
    rb.readLatest(out);
    expect(Array.from(out)).toEqual([3, 4, 5]);
  });

  it('clears', () => {
    const rb = new RingBuffer(3);
    rb.write([1]);
    rb.clear();
    expect(rb.size).toBe(0);
    expect(rb.totalWritten).toBe(0);
  });
});
