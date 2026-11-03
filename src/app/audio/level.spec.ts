import { LevelMeter, MIN_DBFS, toDbfs } from './level';
import { render, tone } from './synthesis/signal';

describe('level', () => {
  it('converts to dBFS', () => {
    expect(toDbfs(1)).toBe(0);
    expect(toDbfs(0.5)).toBeCloseTo(-6.02, 2);
    expect(toDbfs(0)).toBe(MIN_DBFS);
  });

  it('measures RMS and peak of a sine', () => {
    const meter = new LevelMeter();
    meter.process(render(tone({ frequency: 1000, amplitude: 0.5 }), 0.1, 48000), 48000);
    const r = meter.reading;
    expect(r.peakDb).toBeCloseTo(-6.02, 1);
    expect(r.rmsDb).toBeCloseTo(-9.03, 1); // 0.5/√2
    expect(r.clipped).toBe(false);
  });

  it('detects clipping and holds/decays the peak', () => {
    const meter = new LevelMeter(0.5, 20);
    meter.process(new Float32Array([1, -1]), 48000);
    expect(meter.reading.clipped).toBe(true);
    const silence = new Float32Array(4800); // 0.1 s
    for (let i = 0; i < 4; i++) meter.process(silence, 48000);
    expect(meter.reading.peakHoldDb).toBe(0); // still held
    for (let i = 0; i < 10; i++) meter.process(silence, 48000);
    expect(meter.reading.peakHoldDb).toBeLessThan(-5);
    meter.reset();
    expect(meter.reading.peakHoldDb).toBe(MIN_DBFS);
  });
});
