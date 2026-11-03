import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FrontPanel, KNOB_LEGENDS, PanelKey } from '../../core/panel/front-panel';
import { HardwareKnob } from './hardware-knob';
import { JogDial } from './jog-dial';

/** Letters printed on the purple tags (multi-tap text entry where a page supports it). */
const KEYPAD = [
  { key: '1', tag: '. , ?' },
  { key: '2', tag: 'ABC' },
  { key: '3', tag: 'DEF' },
  { key: '4', tag: 'GHI' },
  { key: '5', tag: 'JKL' },
  { key: '6', tag: 'MNO' },
  { key: '7', tag: 'PQRS' },
  { key: '8', tag: 'TUV' },
  { key: '9', tag: 'WXYZ' },
] as const;

/**
 * Right-hand side of the front panel: knobs, keypad, input and transport keys, the MULTI dial and
 * MENU/COPY/ESC. Fixed width and fixed hardware; what the controls do comes from {@link FrontPanel}.
 */
@Component({
  selector: 'app-control-panel',
  imports: [HardwareKnob, JogDial],
  templateUrl: './control-panel.html',
  styleUrl: './control-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlPanel {
  protected readonly panel = inject(FrontPanel);
  protected readonly legends = KNOB_LEGENDS;
  protected readonly keypad = KEYPAD;
  protected readonly record = computed(() => this.panel.binding().record ?? null);
  protected readonly copy = computed(() => this.panel.binding().copy ?? null);
  protected readonly hasInput = computed(() => !!this.panel.binding().capture);

  protected unusable(key: PanelKey | null): boolean {
    return !key || (key.disabled?.() ?? false);
  }

  protected run(key: PanelKey | null): void {
    if (key && !this.unusable(key)) void key.run();
  }

  protected input(): void {
    if (this.hasInput()) this.panel.toggleOverlay('input');
  }
}
