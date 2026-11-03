import { CaptureWorkletMessage } from '../../../worklets/capture-protocol';
import { BrowserMicrophoneSource, MicrophoneEnvironment } from './browser-microphone-source';
import { mapCaptureError } from './media-errors';

class FakeTrack extends EventTarget {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
  getSettings(): { deviceId: string } {
    return { deviceId: 'mic-1' };
  }
}

class FakePort {
  onmessage: ((e: MessageEvent<CaptureWorkletMessage>) => void) | null = null;
  posted: unknown[] = [];
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
}

function setup(overrides: Partial<MicrophoneEnvironment> = {}) {
  const track = new FakeTrack();
  const port = new FakePort();
  const disconnects: string[] = [];
  let closed = false;
  let constraints: MediaStreamConstraints | undefined;
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const node = (name: string) => ({
    connect: () => undefined,
    disconnect: () => disconnects.push(name),
  });
  const context = {
    sampleRate: 44100,
    state: 'running',
    destination: {},
    audioWorklet: { addModule: () => Promise.resolve() },
    createMediaStreamSource: () => node('source'),
    resume: () => Promise.resolve(),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  };
  const env: MicrophoneEnvironment = {
    isSecureContext: true,
    mediaDevices: {
      getUserMedia: (c: MediaStreamConstraints) => {
        constraints = c;
        return Promise.resolve(stream);
      },
      enumerateDevices: () =>
        Promise.resolve([
          { kind: 'audioinput', deviceId: 'default', label: '' },
          { kind: 'videoinput', deviceId: 'cam', label: 'Cam' },
          { kind: 'audioinput', deviceId: '', label: '' },
          { kind: 'audioinput', deviceId: 'usb', label: 'USB' },
        ]),
      addEventListener: () => undefined,
    } as unknown as MediaDevices,
    createContext: () => context as unknown as AudioContext,
    createWorkletNode: () => ({ ...node('worklet'), port }) as unknown as AudioWorkletNode,
    workletUrl: '/worklets/capture-processor.js',
    ...overrides,
  };
  return { env, track, port, disconnects, isClosed: () => closed, constraints: () => constraints };
}

describe('BrowserMicrophoneSource', () => {
  it('captures with browser voice processing disabled and delivers frames', async () => {
    const t = setup();
    const src = new BrowserMicrophoneSource(t.env);
    const states: string[] = [];
    src.onStateChange((s) => states.push(s.status));
    const frames: number[] = [];
    src.subscribe((f) => frames.push(f.samples.length, f.sampleRate, f.timestamp));

    await src.start('mic-1');
    expect(states).toEqual(['requesting-permission', 'running']);
    const audio = t.constraints()?.audio as MediaTrackConstraints;
    expect(audio.echoCancellation).toBe(false);
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.autoGainControl).toBe(false);
    expect(audio.deviceId).toEqual({ exact: 'mic-1' });

    const buffer = new Float32Array(1024).buffer;
    t.port.onmessage?.({
      data: { type: 'block', buffer, frame: 44100 },
    } as MessageEvent<CaptureWorkletMessage>);
    expect(frames).toEqual([1024, 44100, 1]);
    expect(t.port.posted).toEqual([{ type: 'recycle', buffer }]);
  });

  it('releases everything on stop', async () => {
    const t = setup();
    const src = new BrowserMicrophoneSource(t.env);
    await src.start();
    await src.stop();
    expect(t.track.stopped).toBe(true);
    expect(t.isClosed()).toBe(true);
    expect(t.disconnects.sort()).toEqual(['source', 'worklet']);
    expect(src.state.status).toBe('stopped');
  });

  it('reports a lost device when the track ends', async () => {
    const t = setup();
    const src = new BrowserMicrophoneSource(t.env);
    await src.start();
    t.track.dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(src.state).toEqual({ status: 'error', error: { kind: 'device-lost' } });
    expect(t.track.stopped).toBe(true);
  });

  it('rejects insecure contexts and missing APIs without prompting', async () => {
    await expect(
      new BrowserMicrophoneSource(setup({ isSecureContext: false }).env).start(),
    ).rejects.toEqual({
      kind: 'insecure-context',
    });
    await expect(
      new BrowserMicrophoneSource(setup({ mediaDevices: undefined }).env).start(),
    ).rejects.toEqual({
      kind: 'unsupported',
    });
  });

  it('maps a denied permission', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const t = setup();
    (t.env.mediaDevices as unknown as { getUserMedia: () => Promise<never> }).getUserMedia = () =>
      Promise.reject(denied);
    const src = new BrowserMicrophoneSource(t.env);
    await expect(src.start()).rejects.toMatchObject({ kind: 'permission-denied' });
    expect(src.state.status).toBe('error');
  });

  it('lists only audio inputs with fallback labels', async () => {
    const devices = await new BrowserMicrophoneSource(setup().env).listDevices();
    expect(devices).toEqual([
      { id: 'default', label: 'Default microphone', isDefault: true },
      { id: 'usb', label: 'USB', isDefault: false },
    ]);
  });
});

describe('mapCaptureError', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'device-busy'],
    ['NotSupportedError', 'unsupported'],
    ['Weird', 'unknown'],
  ])('%s → %s', (name, kind) => {
    expect(mapCaptureError({ name }).kind).toBe(kind);
  });
});
