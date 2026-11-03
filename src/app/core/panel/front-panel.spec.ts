import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FrontPanel, panelAction, panelChoice, panelValue, targetText } from './front-panel';

describe('FrontPanel', () => {
  let panel: FrontPanel;
  const level = signal(-20);
  const mode = signal<'a' | 'b' | 'c'>('a');
  const runs = vi.fn();
  const levelValue = panelValue({
    label: 'LEVEL',
    name: 'Level',
    value: level,
    set: (v) => level.set(v),
    scale: () => ({ min: -60, max: -3, step: 1, log: false }),
    format: (v) => `${v} dB`,
  });
  const modeChoice = panelChoice<'a' | 'b' | 'c'>({
    label: 'MODE',
    name: 'Mode',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ],
    value: mode,
    set: (v) => mode.set(v),
  });
  const action = panelAction({ label: 'GO', name: 'Go', run: runs });

  beforeEach(() => {
    vi.useFakeTimers();
    level.set(-20);
    mode.set('a');
    runs.mockClear();
    panel = TestBed.inject(FrontPanel);
    panel.attach({ softkeys: [modeChoice, levelValue, null, action], multi: modeChoice });
  });

  afterEach(() => vi.useRealTimers());

  it('pads the soft keys to six and the knobs to three', () => {
    expect(panel.softkeys()).toEqual([modeChoice, levelValue, null, action, null, null]);
    expect(panel.knobs()).toEqual([null, null, null]);
  });

  it('cycles a choice, runs an action and selects a value', () => {
    panel.press(modeChoice);
    panel.press(modeChoice);
    panel.press(modeChoice);
    expect(mode()).toBe('a');
    panel.press(action);
    expect(runs).toHaveBeenCalledTimes(1);
    panel.press(levelValue);
    expect(panel.selected()).toBe(levelValue);
    expect(panel.multiTarget()).toBe(levelValue);
    panel.press(levelValue);
    expect(panel.selected()).toBeNull();
    expect(panel.multiTarget()).toBe(modeChoice);
  });

  it('ignores disabled controls', () => {
    const off = panelAction({ label: 'X', name: 'X', run: runs, disabled: () => true });
    panel.press(off);
    expect(runs).not.toHaveBeenCalled();
  });

  it('steps values (clamped) and choices (clamped on the dial)', () => {
    panel.step(levelValue, 3);
    expect(level()).toBe(-17);
    panel.step(levelValue, 30);
    expect(level()).toBe(-3);
    panel.turnMulti(5);
    expect(mode()).toBe('c');
    expect(panel.toast()).toEqual({ label: 'MODE', text: 'C', fraction: undefined });
    vi.advanceTimersByTime(2000);
    expect(panel.toast()).toBeNull();
  });

  it('applies keypad entries to the selected value; negative ranges take them as negative', () => {
    panel.press(levelValue);
    panel.digit('4');
    panel.digit('2');
    expect(panel.entry()).toBe('42');
    panel.enter();
    expect(level()).toBe(-42);
    expect(panel.entry()).toBe('');
    panel.digit('9');
    panel.clear();
    expect(panel.entry()).toBe('');
    panel.digit('9');
    panel.digit('9');
    panel.enter();
    expect(level()).toBe(-60); // clamped
  });

  it('hands digits and CLR to the page while nothing is selected', () => {
    const digits: string[] = [];
    const clear = vi.fn();
    panel.attach({ digit: (d) => digits.push(d), clear });
    panel.digit('7');
    panel.clear();
    expect(digits).toEqual(['7']);
    expect(clear).toHaveBeenCalled();
  });

  it('ESC closes overlays and drops entry and selection', () => {
    panel.toggleOverlay('menu');
    panel.press(levelValue);
    panel.digit('1');
    panel.escape();
    expect(panel.overlay()).toBeNull();
    expect(panel.selected()).toBeNull();
    expect(panel.entry()).toBe('');
  });

  it('detaches only its own binding', () => {
    const first = panel.attach({ softkeys: [action] });
    const second = { softkeys: [modeChoice] };
    panel.attach(second);
    first();
    expect(panel.binding()).toBe(second);
  });

  it('formats targets for the display', () => {
    expect(targetText(levelValue)).toBe('-20 dB');
    expect(targetText(modeChoice)).toBe('A');
  });
});
