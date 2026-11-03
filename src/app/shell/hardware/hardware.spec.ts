import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FrontPanel, panelValue } from '../../core/panel/front-panel';
import { ControlPanel } from './control-panel';

describe('control panel hardware', () => {
  const level = signal(-20);
  const run = { play: vi.fn(), stop: vi.fn(), record: vi.fn(), copy: vi.fn() };
  const digits: string[] = [];
  const knob = panelValue({
    label: 'LEVEL',
    name: 'Level',
    value: level,
    set: (v) => level.set(v),
    scale: () => ({ min: -60, max: -3, step: 1, log: false }),
    format: (v) => `${v} dB`,
  });
  let fixture: ComponentFixture<ControlPanel>;
  let el: HTMLElement;
  let panel: FrontPanel;

  const button = (name: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) =>
        (b.getAttribute('aria-label') ?? b.querySelector('.cap')?.textContent?.trim()) === name,
    )!;
  const press = async (name: string) => {
    button(name).click();
    await fixture.whenStable();
  };
  const key = (target: Element, k: string, shiftKey = false) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));
  const wheel = (target: Element, deltaY: number) =>
    target.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
  const pointer = (target: Element, type: string, clientX: number, clientY: number) =>
    target.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));

  beforeEach(async () => {
    level.set(-20);
    digits.length = 0;
    Object.values(run).forEach((f) => f.mockClear());
    fixture = TestBed.createComponent(ControlPanel);
    el = fixture.nativeElement;
    panel = TestBed.inject(FrontPanel);
    panel.attach({
      knobs: [null, null, knob],
      multi: knob,
      play: { name: 'Play', run: run.play, active: () => true },
      stop: { name: 'Stop', run: run.stop },
      record: { name: 'Record', run: run.record, disabled: () => true },
      copy: { name: 'Copy code', run: run.copy },
      digit: (d) => digits.push(d),
    });
    await fixture.whenStable();
  });

  it('names the transport keys after the page and runs only enabled ones', async () => {
    await press('Play');
    await press('Stop');
    await press('Record');
    await press('Copy code');
    expect(run.play).toHaveBeenCalled();
    expect(run.stop).toHaveBeenCalled();
    expect(run.copy).toHaveBeenCalled();
    expect(run.record).not.toHaveBeenCalled();
    expect(button('Record').getAttribute('aria-disabled')).toBe('true');
    expect(button('Play').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.led.green')?.classList).toContain('on');
  });

  it('routes keypad, INPUT, MENU and ESC to the panel', async () => {
    await press('7');
    await press('0');
    expect(digits).toEqual(['7', '0']);
    expect(button('Audio input').getAttribute('aria-disabled')).toBe('true');
    await press('Audio input');
    expect(panel.overlay()).toBeNull();
    await press('Menu');
    expect(panel.overlay()).toBe('menu');
    await press('Escape');
    expect(panel.overlay()).toBeNull();
    panel.press(knob);
    await press('4');
    await press('2');
    await press('Clear');
    await press('9');
    await press('Enter');
    expect(level()).toBe(-9); // the range is negative: digits are taken as −9
  });

  it('turns a knob by keyboard, wheel and drag; unused knobs are hidden', async () => {
    const slider = el.querySelector<HTMLElement>('app-hardware-knob [role="slider"]')!;
    expect(slider.getAttribute('aria-label')).toBe('Level');
    expect(el.querySelectorAll('app-hardware-knob [aria-hidden="true"].knob')).toHaveLength(2);
    key(slider, 'ArrowUp');
    expect(level()).toBe(-19);
    key(slider, 'ArrowDown', true);
    expect(level()).toBe(-29);
    key(slider, 'PageUp');
    key(slider, 'PageDown');
    key(slider, 'ArrowRight');
    key(slider, 'ArrowLeft');
    expect(level()).toBe(-29);
    key(slider, 'End');
    expect(level()).toBe(-3);
    key(slider, 'Home');
    expect(level()).toBe(-60);
    key(slider, 'x');
    wheel(slider, -100);
    expect(level()).toBe(-59);
    wheel(slider, 0);
    pointer(slider, 'pointerdown', 0, 200);
    pointer(slider, 'pointermove', 0, 90); // 110 px up = half the travel
    pointer(slider, 'pointerup', 0, 90);
    expect(level()).toBeCloseTo(-30, 0);
    await fixture.whenStable();
    expect(slider.getAttribute('aria-valuetext')).toBe(`${level()} dB`);
  });

  it('turns the MULTI dial by keyboard, wheel and a circular drag', async () => {
    const dial = el.querySelector<HTMLElement>('app-jog-dial [role="slider"]')!;
    expect(dial.getAttribute('aria-label')).toBe('Multi dial: Level');
    key(dial, 'ArrowUp');
    key(dial, 'PageDown');
    expect(level()).toBe(-29);
    key(dial, 'Enter');
    wheel(dial, -1);
    wheel(dial, 1);
    wheel(dial, 0);
    expect(level()).toBe(-29);
    // the dial's centre is at (0, 0) in the test DOM: a quarter turn is 15 detents of 6°
    pointer(dial, 'pointerdown', 100, 0);
    pointer(dial, 'pointermove', 71, 71);
    pointer(dial, 'pointermove', 0, 100);
    pointer(dial, 'pointerup', 0, 100);
    expect(level()).toBe(-14);
    await fixture.whenStable();
    expect(dial.getAttribute('aria-valuetext')).toBe('-14 dB');
    panel.attach({});
    await fixture.whenStable();
    expect(dial.getAttribute('aria-valuetext')).toBe('not used in this mode');
    key(dial, 'ArrowUp');
    expect(panel.toast()?.text).toBe('not used here');
  });
});
