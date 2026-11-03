import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { SettingsStore } from '../settings/settings-store';
import { AUDIO_SOURCE, CAPTURE_SETTINGS, CaptureSession } from './capture-session';
import { CaptureSettings } from './capture-settings';

function memorySettings(deviceId = ''): SettingsStore<CaptureSettings> {
  const data = new Map<string, string>();
  const store = new SettingsStore<CaptureSettings>({
    key: 'test',
    version: 1,
    defaults: { deviceId: '' },
    validate: (raw) => raw as CaptureSettings,
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    },
  });
  if (deviceId) store.save({ deviceId });
  return store;
}

describe('CaptureSession', () => {
  let source: FakeAudioSource;
  let session: CaptureSession;
  let settings: SettingsStore<CaptureSettings>;

  function setup(remembered = '') {
    source = new FakeAudioSource();
    source.devices = [
      { id: 'default', label: 'Default', isDefault: true },
      { id: 'usb', label: 'USB mic' },
      { id: 'demo', label: 'Demo' },
    ];
    settings = memorySettings(remembered);
    TestBed.configureTestingModule({
      providers: [
        CaptureSession,
        { provide: AUDIO_SOURCE, useValue: source },
        { provide: CAPTURE_SETTINGS, useValue: settings },
      ],
    });
    session = TestBed.inject(CaptureSession);
  }

  beforeEach(() => setup());

  it('starts, forwards frames to consumers and stops', async () => {
    const received: number[] = [];
    session.addConsumer((f) => received.push(f.samples.length));
    await session.start();
    expect(session.running()).toBe(true);
    expect(session.devices().length).toBe(3);

    source.emit(new Float32Array(128));
    expect(received).toEqual([128]);

    await session.stop();
    expect(session.state().status).toBe('stopped');
    expect(source.frameListenerCount).toBe(0);
    source.emit(new Float32Array(64));
    expect(received).toEqual([128]);
  });

  it('removes a consumer', async () => {
    let count = 0;
    const remove = session.addConsumer(() => count++);
    await session.start();
    source.emit(new Float32Array(8));
    remove();
    source.emit(new Float32Array(8));
    expect(count).toBe(1);
  });

  it('exposes source errors as state and status message, and detaches', async () => {
    source.failWith = { kind: 'permission-denied' };
    await session.start();
    const state = session.state();
    expect(state.status === 'error' && state.error.kind).toBe('permission-denied');
    expect(session.status().tone).toBe('danger');
    expect(source.frameListenerCount).toBe(0);
  });

  it('ignores a second start while running', async () => {
    await session.start();
    await session.start();
    expect(source.startCalls).toBe(1);
  });

  it('follows state changes of the source (e.g. device lost)', async () => {
    await session.start();
    source.setState({ status: 'error', error: { kind: 'device-lost' } });
    expect(session.running()).toBe(false);
    expect(source.frameListenerCount).toBe(0);
  });

  it('remembers the selected device and restarts with it while running', async () => {
    await session.start();
    session.selectDevice('usb');
    expect(settings.load().deviceId).toBe('usb');
    await vi.waitFor(() => expect(source.startCalls).toBe(2));
    expect(source.state.status === 'running' && source.state.deviceId).toBe('usb');
  });

  it('falls back to the default input when the remembered device is gone', async () => {
    TestBed.resetTestingModule();
    setup('vanished');
    expect(session.selectedDeviceId()).toBe('vanished');
    await session.refreshDevices();
    expect(session.selectedDeviceId()).toBe('');
    expect(session.notice()?.tone).toBe('warning');
  });

  it('stops the source when destroyed and on pagehide', async () => {
    await session.start();
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(() => expect(source.stopCalls).toBeGreaterThan(0));
    await session.start();
    const before = source.stopCalls;
    TestBed.resetTestingModule();
    expect(source.stopCalls).toBeGreaterThan(before);
  });
});
