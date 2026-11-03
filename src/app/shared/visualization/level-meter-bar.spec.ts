import { TestBed } from '@angular/core/testing';
import { LevelMeter } from '../../audio/level';
import { LevelMeterBar } from './level-meter-bar';

describe('LevelMeterBar', () => {
  it('is a meter with all required ARIA attributes from the first render', async () => {
    const fixture = TestBed.createComponent(LevelMeterBar);
    fixture.componentRef.setInput('meter', new LevelMeter());
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('meter');
    expect(host.getAttribute('aria-valuemin')).toBe('-60');
    expect(host.getAttribute('aria-valuemax')).toBe('0');
    expect(host.getAttribute('aria-valuenow')).toBe('-60');
    expect(host.getAttribute('aria-valuetext')).toBe('no signal');
  });
});
