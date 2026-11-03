import { TestBed } from '@angular/core/testing';
import { FakeAudioSource } from '../../../testing/fake-audio-source';
import { AUDIO_SOURCE, CaptureSession } from '../../core/capture/capture-session';
import { FrontPanel } from '../../core/panel/front-panel';
import { DisplayOverlay } from './display-overlay';

describe('DisplayOverlay', () => {
  function setup(withCapture: boolean) {
    const source = new FakeAudioSource();
    source.devices = [
      { id: 'default', label: 'Fake microphone', isDefault: true },
      { id: 'usb', label: 'USB interface', isDefault: false },
    ];
    TestBed.configureTestingModule({
      providers: [{ provide: AUDIO_SOURCE, useValue: source }, CaptureSession],
    });
    const capture = TestBed.inject(CaptureSession);
    const panel = TestBed.inject(FrontPanel);
    panel.attach(withCapture ? { capture } : {});
    const fixture = TestBed.createComponent(DisplayOverlay);
    return { fixture, el: fixture.nativeElement as HTMLElement, panel, capture };
  }

  it('lists the inputs, focuses the current one and switches device', async () => {
    const { fixture, el, panel, capture } = setup(true);
    await capture.refreshDevices();
    panel.toggleOverlay('input');
    await fixture.whenStable();
    const options = Array.from(el.querySelectorAll<HTMLButtonElement>('.option'));
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Default input', 'USB interface']);
    expect(document.activeElement).toBe(options[0]);
    options[1]?.click();
    await fixture.whenStable();
    expect(capture.selectedDeviceId()).toBe('usb');
    expect(panel.overlay()).toBeNull();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('explains when a mode has no input, shows the menu and value pop-ups', async () => {
    const { fixture, el, panel } = setup(false);
    panel.toggleOverlay('input');
    await fixture.whenStable();
    expect(el.textContent).toContain('This mode does not use an audio input.');
    panel.toggleOverlay('menu');
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"] h2')?.textContent).toBe('Front panel');
    panel.notify('LEVEL', '-20 dB', 0.5);
    await fixture.whenStable();
    expect(el.querySelector('.toast')?.textContent).toContain('-20 dB');
    expect(el.querySelector<HTMLElement>('.track i')?.style.width).toBe('50%');
  });
});
