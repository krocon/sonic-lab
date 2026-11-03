import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { CaptureSession } from '../capture/capture-session';
import { StatusMessage } from '../status/status-message';
import { KnobScale, fromPosition, nudge, toPosition } from './panel-scale';

/**
 * A numeric setting. Knobs and the MULTI dial turn it; on a soft key, pressing selects it so the
 * MULTI dial and the keypad edit it.
 */
export interface PanelValue {
  readonly kind: 'value';
  /** Short legend in the display, e.g. "TONE". */
  readonly label: string;
  /** Accessible name, e.g. "Tone frequency". */
  readonly name: string;
  readonly value: () => number;
  set(value: number): void;
  readonly scale: () => KnobScale;
  readonly format: (value: number) => string;
  readonly disabled?: () => boolean;
}

export interface PanelOption<T> {
  readonly value: T;
  /** Legend in the display, e.g. "AUTO". */
  readonly label: string;
}

/** A one-of-many setting; its soft key steps through the options. */
export interface PanelChoice<T = unknown> {
  readonly kind: 'choice';
  readonly label: string;
  readonly name: string;
  readonly options: readonly PanelOption<T>[];
  readonly value: () => T;
  set(value: T): void;
  readonly disabled?: () => boolean;
}

/** A soft key that does something (reset, export, …). */
export interface PanelAction {
  readonly kind: 'action';
  readonly label: string;
  readonly name: string;
  run(): unknown;
  readonly disabled?: () => boolean;
}

export type PanelControl = PanelValue | PanelChoice | PanelAction;
export type PanelTarget = PanelValue | PanelChoice;

/** What a hardware key (▶ ■ ● COPY) does on the current page. */
export interface PanelKey {
  /** Accessible name, e.g. "Start" or "Play". */
  readonly name: string;
  run(): unknown;
  /** Lights the key's LED. */
  readonly active?: () => boolean;
  readonly disabled?: () => boolean;
}

/** Output state of a page without capture, shown in the status line ("Playing"). */
export interface PanelState {
  readonly text: string;
  readonly live: boolean;
}

/**
 * How a page uses the constant hardware. Everything is optional: unused keys and knobs stay in
 * place and do nothing.
 */
export interface PanelBinding {
  /**
   * Soft keys right of the display, top to bottom (six at most); null leaves a key unused. A
   * function lets the assignment follow the page state – return the same control objects.
   */
  readonly softkeys?: readonly (PanelControl | null)[] | (() => readonly (PanelControl | null)[]);
  /** The TONE, SPEED and LEVEL knobs (a function, like `softkeys`, may follow the state). */
  readonly knobs?: readonly (PanelValue | null)[] | (() => readonly (PanelValue | null)[]);
  /** What the MULTI dial changes while no soft-key value is selected. */
  readonly multi?: PanelTarget;
  /** Capture pages: ▶/■ start and stop listening, INPUT chooses the device. */
  readonly capture?: CaptureSession;
  readonly play?: PanelKey;
  readonly stop?: PanelKey;
  readonly record?: PanelKey;
  readonly copy?: PanelKey;
  /** Digit keys while no soft-key value is selected. */
  readonly digit?: (digit: string) => void;
  /** CLR while nothing is being typed (e.g. delete the last character). */
  readonly clear?: () => void;
  readonly state?: () => PanelState;
  /** Result or error of the last action, shown in the display. */
  readonly message?: () => StatusMessage | null;
}

export interface PanelToast {
  readonly label: string;
  readonly text: string;
  /** Position 0…1 for a bar under the value. */
  readonly fraction?: number;
}

export const SOFTKEY_COUNT = 6;
export const KNOB_LEGENDS = ['TONE', 'SPEED', 'LEVEL'] as const;
const TOAST_MS = 1400;
const MAX_ENTRY = 7;

/** Text of a choice's current option. */
export function choiceText(c: PanelChoice): string {
  const v = c.value();
  return c.options.find((o) => o.value === v)?.label ?? '';
}

/** Current value of a value or choice as display text. */
export function targetText(t: PanelTarget): string {
  return t.kind === 'value' ? t.format(t.value()) : choiceText(t);
}

const resolve = <T>(list: readonly T[] | (() => readonly T[]) | undefined): readonly T[] =>
  (typeof list === 'function' ? list() : list) ?? [];

const isDisabled = (c: { readonly disabled?: () => boolean } | null | undefined) =>
  !c || (c.disabled?.() ?? false);

/**
 * The front panel as an application service: feature pages describe what the hardware does for
 * them ({@link PanelBinding}); the shell draws keys and knobs and routes presses here. Holds the
 * panel's own state – selected soft key, keypad entry, the short value pop-up, open overlay.
 */
@Injectable({ providedIn: 'root' })
export class FrontPanel {
  private readonly bound = signal<PanelBinding>({});
  readonly binding = this.bound.asReadonly();
  /** Soft-key value or choice that the MULTI dial and keypad edit; null = the page default. */
  readonly selected = signal<PanelTarget | null>(null);
  /** Digits typed for the selected value. */
  readonly entry = signal('');
  readonly toast = signal<PanelToast | null>(null);
  readonly overlay = signal<'input' | 'menu' | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  readonly softkeys = computed(() => {
    const keys = resolve(this.bound().softkeys);
    return Array.from({ length: SOFTKEY_COUNT }, (_, i) => keys[i] ?? null);
  });
  readonly knobs = computed(() => {
    const knobs = resolve(this.bound().knobs);
    return KNOB_LEGENDS.map((_, i) => knobs[i] ?? null);
  });
  readonly multiTarget = computed(() => this.selected() ?? this.bound().multi ?? null);
  readonly playKey = computed<PanelKey | null>(() => {
    const b = this.bound();
    if (b.play) return b.play;
    const capture = b.capture;
    return capture
      ? {
          name: 'Start',
          run: () => capture.start(),
          active: capture.running,
        }
      : null;
  });
  readonly stopKey = computed<PanelKey | null>(() => {
    const b = this.bound();
    if (b.stop) return b.stop;
    const capture = b.capture;
    return capture
      ? { name: 'Stop', run: () => capture.stop(), disabled: () => !capture.running() }
      : null;
  });

  /** Called by a page (see {@link attachPanel}); returns the detach function. */
  attach(binding: PanelBinding): () => void {
    this.bound.set(binding);
    this.selected.set(null);
    this.entry.set('');
    this.overlay.set(null);
    return () => {
      if (this.bound() !== binding) return;
      this.bound.set({});
      this.selected.set(null);
      this.entry.set('');
      this.overlay.set(null);
    };
  }

  /** A soft key was pressed. */
  press(control: PanelControl | null): void {
    if (!control || isDisabled(control)) return;
    switch (control.kind) {
      case 'action':
        void control.run();
        break;
      case 'choice':
        this.step(control, 1, true);
        break;
      case 'value': {
        const selected = this.selected() === control;
        this.selected.set(selected ? null : control);
        this.entry.set('');
        this.show(control, selected ? 'released' : undefined);
        break;
      }
    }
  }

  /** Sets a value (knob drag) and shows it. */
  setValue(target: PanelValue, value: number): void {
    if (isDisabled(target)) return;
    const s = target.scale();
    const v = fromPosition(toPosition(value, s), s);
    if (v !== target.value()) target.set(v);
    this.show(target);
  }

  /** Knob wheel/keys and the MULTI dial: move a value by steps or a choice by options. */
  step(target: PanelTarget, steps: number, wrap = false, coarse = false): void {
    if (isDisabled(target) || steps === 0) return;
    if (target.kind === 'value') {
      let v = target.value();
      const direction = steps > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(steps); i++) v = nudge(v, target.scale(), direction, coarse);
      if (v !== target.value()) target.set(v);
    } else {
      const n = target.options.length;
      const i = target.options.findIndex((o) => o.value === target.value());
      const next = wrap ? (((i + steps) % n) + n) % n : Math.max(0, Math.min(n - 1, i + steps));
      const option = target.options[next];
      if (option && next !== i) target.set(option.value);
    }
    this.show(target);
  }

  /** MULTI dial detents. */
  turnMulti(steps: number): void {
    const target = this.multiTarget();
    if (target) this.step(target, steps);
    else this.notify('MULTI', 'not used here');
  }

  digit(d: string): void {
    const selected = this.selected();
    if (selected?.kind === 'value') {
      const entry = (this.entry() + d).slice(-MAX_ENTRY);
      this.entry.set(entry);
      this.notify(selected.label, `${this.entryValue(selected, entry)} …`);
      return;
    }
    const handler = this.bound().digit;
    if (handler) handler(d);
    else this.notify('ENTRY', 'select a value first');
  }

  /** CLR: drops the keypad entry, or lets the page clear something. */
  clear(): void {
    if (this.entry()) {
      this.entry.set('');
      const selected = this.selected();
      if (selected) this.show(selected);
      return;
    }
    this.bound().clear?.();
  }

  /** ENT: applies the keypad entry to the selected value. */
  enter(): void {
    const selected = this.selected();
    const entry = this.entry();
    if (selected?.kind !== 'value' || !entry) return;
    this.entry.set('');
    this.setValue(selected, this.entryValue(selected, entry));
  }

  /** ESC: closes overlays, drops the entry and the selection. */
  escape(): void {
    this.overlay.set(null);
    this.entry.set('');
    this.selected.set(null);
    this.toast.set(null);
  }

  toggleOverlay(overlay: 'input' | 'menu'): void {
    this.overlay.update((o) => (o === overlay ? null : overlay));
  }

  /** Shows a short value pop-up in the display. */
  notify(label: string, text: string, fraction?: number): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ label, text, fraction });
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_MS);
  }

  private show(target: PanelTarget, text?: string): void {
    const fraction =
      target.kind === 'value' ? toPosition(target.value(), target.scale()) : undefined;
    this.notify(target.label, text ?? targetText(target), fraction);
  }

  /** Keypad digits as a value of the target; ranges entirely below zero take them as negative. */
  private entryValue(target: PanelValue, entry: string): number {
    const n = Number(entry);
    return target.scale().max <= 0 ? -n : n;
  }
}

/** Binds a page to the front panel for its lifetime (call in the constructor). */
export function attachPanel(binding: PanelBinding): FrontPanel {
  const panel = inject(FrontPanel);
  inject(DestroyRef).onDestroy(panel.attach(binding));
  return panel;
}

/* ── small builders, so pages read like a key map ───────────────────────────────────────── */
export const panelValue = (spec: Omit<PanelValue, 'kind'>): PanelValue => ({
  kind: 'value',
  ...spec,
});
export const panelChoice = <T>(spec: Omit<PanelChoice<T>, 'kind'>): PanelChoice<T> => ({
  kind: 'choice',
  ...spec,
});
export const panelAction = (spec: Omit<PanelAction, 'kind'>): PanelAction => ({
  kind: 'action',
  ...spec,
});
