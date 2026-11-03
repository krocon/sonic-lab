import { KeyedTonePlayer } from './keyed-tone-player';

class FakeParam {
  value = 0;
  calls: string[] = [];
  setValueAtTime(v: number, t: number) {
    this.calls.push(`set ${v}@${t.toFixed(3)}`);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(`ramp ${v}@${t.toFixed(3)}`);
  }
  cancelScheduledValues() {
    this.calls.push('cancel');
  }
  setTargetAtTime(v: number) {
    this.calls.push(`target ${v}`);
  }
}

function fakeContext() {
  const gain = { gain: new FakeParam(), connect: () => undefined };
  const osc = {
    type: '',
    frequency: { value: 0 },
    onended: null as null | (() => void),
    started: -1,
    stopped: -1,
    connect: () => undefined,
    start(t: number) {
      this.started = t;
    },
    stop(t: number) {
      this.stopped = t;
    },
  };
  const ctx = {
    currentTime: 1,
    closed: false,
    destination: {},
    resume: () => Promise.resolve(),
    close() {
      this.closed = true;
      return Promise.resolve();
    },
    createOscillator: () => osc,
    createGain: () => gain,
  };
  return { ctx, osc, gain };
}

describe('KeyedTonePlayer', () => {
  it('schedules ramped edges on the audio clock and finishes', async () => {
    const f = fakeContext();
    const player = new KeyedTonePlayer(() => f.ctx as unknown as AudioContext);
    const done = player.play([{ start: 0, end: 0.06 }], 0.2, { frequency: 650, volume: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.osc.frequency.value).toBe(650);
    // starts 60 ms in the future, volume capped at 0.8, 5 ms ramps
    expect(f.gain.gain.calls).toEqual([
      'set 0@1.060',
      'set 0@1.060',
      'ramp 0.8@1.065',
      'set 0.8@1.120',
      'ramp 0@1.125',
    ]);
    expect(f.osc.started).toBeCloseTo(1.06, 6);
    expect(player.playing).toBe(true);
    f.ctx.currentTime = 1.1;
    expect(player.position).toBeCloseTo(0.04, 6);
    f.osc.onended?.();
    await done;
    expect(player.playing).toBe(false);
    expect(f.ctx.closed).toBe(true);
  });

  it('stops immediately with a fade', async () => {
    const f = fakeContext();
    const player = new KeyedTonePlayer(() => f.ctx as unknown as AudioContext);
    const done = player.play([{ start: 0, end: 1 }], 2, { frequency: 700, volume: 0.3 });
    await Promise.resolve();
    await Promise.resolve();
    await player.stop();
    await done;
    expect(f.gain.gain.calls.slice(-2)).toEqual(['cancel', 'target 0']);
    expect(player.position).toBeNull();
  });
});
