import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KeyOption, KeySelector } from './key-selector';

@Component({
  imports: [KeySelector],
  template: `<app-key-selector
    label="Sensitivity"
    [options]="options"
    [value]="v()"
    (valueChange)="v.set($event)"
  />`,
})
class Host {
  readonly options: readonly KeyOption<string>[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];
  readonly v = signal('medium');
}

describe('KeySelector', () => {
  it('is a labelled radio group with one tab stop on the latched key', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const group = el.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Sensitivity',
    );
    const keys = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(keys.map((k) => k.textContent?.trim())).toEqual(['Low', 'Medium', 'High']);
    expect(keys.map((k) => k.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(keys.map((k) => k.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('selects by click and by arrow keys, wrapping around', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const keys = () =>
      Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
    keys()[2]?.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.v()).toBe('high');

    keys()[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.v()).toBe('low');
    expect(document.activeElement).toBe(keys()[0]);

    keys()[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.v()).toBe('high');
    expect(keys()[2]?.getAttribute('aria-checked')).toBe('true');
  });
});
