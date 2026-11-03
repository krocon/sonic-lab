import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Knob } from './knob';
import { fromPosition, nudge, toAngle, toPosition } from './knob-math';

describe('knob math', () => {
  const lin = { min: -60, max: -3, step: 1, log: false };
  const log = { min: 20, max: 20000, step: 1, log: true };

  it('maps values to positions and angles', () => {
    expect(toPosition(-60, lin)).toBe(0);
    expect(toAngle(-3, lin)).toBe(135);
    expect(toPosition(632, log)).toBeCloseTo(0.5, 2); // geometric middle of 20 Hz … 20 kHz
    expect(toAngle(20, log)).toBe(-135);
  });

  it('round-trips, clamps and snaps', () => {
    expect(fromPosition(toPosition(1000, log), log)).toBe(1000);
    expect(fromPosition(2, lin)).toBe(-3);
    expect(fromPosition(0.501, { min: 0, max: 1, step: 0.05, log: false })).toBe(0.5);
  });

  it('nudges by step (linear) or by 1 % of travel (log)', () => {
    expect(nudge(-20, lin, 1)).toBe(-19);
    expect(nudge(-20, lin, -1, true)).toBe(-30);
    expect(nudge(-3, lin, 1)).toBe(-3);
    expect(nudge(1000, log, 1)).toBeGreaterThan(1060);
    expect(nudge(1000, log, 1)).toBeLessThan(1080);
  });
});

@Component({
  imports: [Knob],
  template: `<app-knob
    label="Level"
    unit="dB"
    [min]="-60"
    [max]="-3"
    [value]="v()"
    [defaultValue]="-20"
    (valueChange)="v.set($event)"
  />`,
})
class Host {
  readonly v = signal(-20);
}

describe('Knob', () => {
  it('is an accessible slider operated by keyboard, wheel and double-click', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('[role="slider"]') as HTMLElement;
    expect(el.getAttribute('aria-valuenow')).toBe('-20');
    expect(el.getAttribute('aria-valuetext')).toBe('-20 dB');
    expect(document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Level',
    );

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await fixture.whenStable();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.v()).toBe(-9);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.v()).toBe(-3);
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.v()).toBe(-4);
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.v()).toBe(-20);
    expect(el.getAttribute('aria-valuenow')).toBe('-20');
  });
});

@Component({
  imports: [Knob],
  template: `<app-knob
    label="Volume"
    [max]="0.8"
    [step]="0.01"
    [format]="percent"
    [value]="0.3"
  />`,
})
class FormattedHost {
  readonly percent = (v: number) => `${Math.round(v * 100)} %`;
}

describe('Knob value text', () => {
  it('uses a custom format for the display and screen readers', async () => {
    const fixture = TestBed.createComponent(FormattedHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="slider"]')?.getAttribute('aria-valuetext')).toBe('30 %');
    expect(el.querySelector('.value')?.textContent).toBe('30 %');
  });
});

describe('meterAngle', () => {
  it('spans −50° … +50° and spreads the top of the scale', async () => {
    const { meterAngle } = await import('../visualization/analog-meter');
    expect(meterAngle(-100)).toBe(-50);
    expect(meterAngle(-40)).toBeCloseTo(-50, 6);
    expect(meterAngle(0)).toBeCloseTo(50, 6);
    expect(meterAngle(6)).toBeCloseTo(50, 6);
    expect(meterAngle(-3) - meterAngle(-6)).toBeGreaterThan(12);
  });
});
