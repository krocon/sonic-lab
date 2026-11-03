import { SyntheticAudioSource, SyntheticClock } from './synthetic-audio-source';
import { tone } from '../synthesis/signal';

class ManualClock implements SyntheticClock {
  time = 0;
  callback: (() => void) | null = null;
  now(): number {
    return this.time;
  }
  setInterval(cb: () => void): unknown {
    this.callback = cb;
    return 1;
  }
  clearInterval(): void {
    this.callback = null;
  }
  advance(ms: number): void {
    this.time += ms;
    this.callback?.();
  }
}

describe('SyntheticAudioSource', () => {
  it('emits deterministic frames on pump()', async () => {
    const make = () =>
      new SyntheticAudioSource({
        generator: () => tone({ frequency: 1000 }),
        clock: null,
        blockSize: 256,
      });
    const collect = async (src: SyntheticAudioSource) => {
      const values: number[] = [];
      src.subscribe((f) => values.push(...Array.from(f.samples.subarray(0, 4)), f.timestamp));
      await src.start();
      src.pump(3);
      return values;
    };
    expect(await collect(make())).toEqual(await collect(make()));
  });

  it('paces frames with the clock and stops cleanly', async () => {
    const clock = new ManualClock();
    const src = new SyntheticAudioSource({
      generator: () => tone({ frequency: 500 }),
      clock,
      sampleRate: 48000,
      blockSize: 480,
    });
    let frames = 0;
    src.subscribe(() => frames++);
    await src.start('x');
    expect(src.state).toEqual({ status: 'running', deviceId: 'x', sampleRate: 48000 });
    clock.advance(100); // 4800 samples = 10 blocks
    expect(frames).toBe(10);
    await src.stop();
    expect(clock.callback).toBeNull();
    expect(src.state.status).toBe('stopped');
  });

  it('skips ahead instead of flooding after a long pause', async () => {
    const clock = new ManualClock();
    const src = new SyntheticAudioSource({
      generator: () => tone({ frequency: 500 }),
      clock,
      blockSize: 480,
    });
    let frames = 0;
    src.subscribe(() => frames++);
    await src.start();
    clock.advance(60_000);
    expect(frames).toBeLessThanOrEqual(250);
  });
});
