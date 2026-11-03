import { TestBed } from '@angular/core/testing';
import {
  FrontPanel,
  PanelControl,
  PanelKey,
  PanelValue,
  targetText,
} from '../app/core/panel/front-panel';

export type HardwareKey = 'play' | 'stop' | 'record' | 'copy';

/**
 * Test access to the hardware a page bound to the {@link FrontPanel}: soft keys and knobs by
 * accessible name, transport keys, the message line – like pressing the real keys.
 */
export function frontPanel() {
  const panel = TestBed.inject(FrontPanel);
  const soft = (name: string): PanelControl => {
    const control = panel.softkeys().find((c) => c?.name === name);
    if (!control) throw new Error(`no soft key "${name}"`);
    return control;
  };
  const key = (which: HardwareKey): PanelKey | null => {
    const b = panel.binding();
    switch (which) {
      case 'play':
        return panel.playKey();
      case 'stop':
        return panel.stopKey();
      case 'record':
        return b.record ?? null;
      case 'copy':
        return b.copy ?? null;
    }
  };
  return {
    panel,
    soft,
    /** Soft keys in order, by name (null for unused ones). */
    softNames: () => panel.softkeys().map((c) => c?.name ?? null),
    press: (name: string) => panel.press(soft(name)),
    /** Display text of a soft key's setting. */
    text: (name: string) => {
      const c = soft(name);
      return c.kind === 'action' ? '' : targetText(c);
    },
    disabled: (name: string) => soft(name).disabled?.() ?? false,
    key,
    /** Presses a hardware key; resolves when its action is done. */
    run: async (which: HardwareKey) => {
      const k = key(which);
      if (!k) throw new Error(`no ${which} key`);
      if (k.disabled?.()) throw new Error(`${which} key is disabled`);
      await k.run();
    },
    knob: (i: 0 | 1 | 2): PanelValue | null => panel.knobs()[i] ?? null,
    message: () => panel.binding().message?.() ?? null,
  };
}
