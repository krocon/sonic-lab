import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { FrontPanel } from '../../core/panel/front-panel';

/**
 * What the display draws over a module's screen: the value pop-up for knobs, the dial and keypad
 * entries, and the INPUT and MENU sheets.
 */
@Component({
  selector: 'app-display-overlay',
  templateUrl: './display-overlay.html',
  styleUrl: './display-overlay.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayOverlay {
  protected readonly panel = inject(FrontPanel);
  protected readonly devices = computed(() =>
    (this.panel.binding().capture?.devices() ?? []).filter((d) => d.id !== 'default'),
  );
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');

  constructor() {
    // move focus into an opened sheet so it can be used from the keyboard
    afterRenderEffect(() => {
      const sheet = this.sheet()?.nativeElement;
      if (!sheet) return;
      const target = sheet.querySelector<HTMLElement>('[aria-pressed="true"], button, [tabindex]');
      (target ?? sheet).focus();
    });
  }

  protected chooseInput(id: string): void {
    this.panel.binding().capture?.selectDevice(id);
    this.panel.overlay.set(null);
  }
}
