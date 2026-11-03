import { MAX_LEVEL_DB, ToneGenerator, levelToGain, noiseBuffer } from './tone-generator';

function fakeContext() {
  const log: string[] = [];
  const param = (name: string) => ({
    value: 0,
    setValueAtTime: (v: number) => log.push(`${name}=${v}`),
    linearRampToValueAtTime: (v: number) => log.push(`${name}~${v.toFixed(3)}`),
    exponentialRampToValueAtTime: (v: number) => log.push(`${name}^${v}`),
    setTargetAtTime: (v: number) => log.push(`${name}->${v}`),
    cancelScheduledValues: () => log.push(`${name} cancel`),
  });
  const node = (name: string) => ({
    name,
    connect: (n: unknown) => n,
    disconnect: () => undefined,
  });
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    destination: node('out'),
    resume: () => Promise.resolve(),
    close: () => {
      log.push('close');
      return Promise.resolve();
    },
    createGain: () => ({ ...node('gain'), gain: param('gain') }),
    createStereoPanner: () => ({ ...node('pan'), pan: param('pan') }),
    createOscillator: () => {
      const o = {
        ...node('osc'),
        type: '',
        frequency: param('freq'),
        onended: null as null | (() => void),
        start: () => log.push(`start ${o.type}`),
        stop: () => log.push('stop'),
      };
      return o;
    },
    createBuffer: (_c: number, length: number) => ({
      length,
      copyToChannel: () => log.push(`buffer ${length}`),
    }),
    createBufferSource: () => ({
      ...node('src'),
      buffer: null,
      loop: false,
      start: () => log.push('start noise'),
      stop: () => log.push('stop'),
    }),
  };
  return { ctx: ctx as unknown as AudioContext, log };
}

const base = {
  frequency: 1000,
  frequency2: 2000,
  sweepSeconds: 5,
  levelDb: -12,
  balance: 0,
  dtmf: { row: 697, column: 1209 },
} as const;

describe('ToneGenerator', () => {
  it('caps the level at −3 dBFS', () => {
    expect(levelToGain(0)).toBeCloseTo(levelToGain(MAX_LEVEL_DB), 10);
    expect(levelToGain(-20)).toBeCloseTo(0.1, 6);
  });

  it('fades a sine in and out', async () => {
    const { ctx, log } = fakeContext();
    const g = new ToneGenerator(() => ctx);
    await g.start({ ...base, waveform: 'sine' });
    expect(log).toContain('gain=0');
    expect(log).toContain('gain~0.251');
    expect(log).toContain('start sine');
    expect(g.update({ ...base, waveform: 'sine', levelDb: -20, frequency: 1100 })).toBe(true);
    expect(log).toContain('freq->1100');
    expect(g.update({ ...base, waveform: 'square' })).toBe(false);
    vi.useFakeTimers();
    const stopped = g.stop();
    await vi.runAllTimersAsync();
    await stopped;
    vi.useRealTimers();
    expect(log.slice(-4)).toEqual(['gain cancel', 'gain->0', 'stop', 'close']);
    expect(g.playing).toBe(false);
  });

  it('builds two oscillators for DTMF and two-tone, a looping buffer for noise and a ramp for sweeps', async () => {
    for (const [waveform, expected] of [
      ['dtmf', ['start sine', 'start sine']],
      ['two-tone', ['start sine', 'start sine']],
      ['pink-noise', ['buffer 96000', 'start noise']],
      ['sweep-log', ['freq^2000', 'start sine']],
    ] as const) {
      const { ctx, log } = fakeContext();
      const g = new ToneGenerator(() => ctx);
      await g.start({ ...base, waveform });
      for (const e of expected) expect(log).toContain(e);
    }
  });

  it('does not report "ended" when restarted with a new signal', async () => {
    const { ctx } = fakeContext();
    const g = new ToneGenerator(() => ctx);
    const ended = vi.fn();
    await g.start({ ...base, waveform: 'sine' }, ended);
    vi.useFakeTimers();
    const restarted = g.start({ ...base, waveform: 'square' }, ended);
    await vi.runAllTimersAsync();
    await restarted;
    vi.useRealTimers();
    expect(ended).not.toHaveBeenCalled();
    expect(g.playing).toBe(true);
  });

  it('makes deterministic, normalised noise', () => {
    const a = noiseBuffer('pink', 4800, 3);
    expect(Array.from(a.slice(0, 5))).toEqual(Array.from(noiseBuffer('pink', 4800, 3).slice(0, 5)));
    expect(Math.max(...a.map(Math.abs))).toBeCloseTo(1, 6);
  });
});
