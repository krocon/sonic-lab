import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  viewChildren,
} from '@angular/core';

let nextId = 0;

export interface KeyOption<T> {
  readonly value: T;
  readonly label: string;
}

/**
 * One-of-many selector built from hardware keys: a row of joined keys (or a keypad with
 * `columns`), the selected key latched down with its LED lit. Exposed as a radio group – arrow
 * keys, Home and End move the selection.
 */
@Component({
  selector: 'app-key-selector',
  template: `
    <span class="label" [id]="labelId">{{ label() }}</span>
    <div
      class="tray"
      role="radiogroup"
      [attr.aria-labelledby]="labelId"
      [class.keypad]="columns() > 0"
      [style.--columns]="columns() || options().length"
    >
      @for (o of options(); track o.value; let i = $index) {
        <button
          #key
          type="button"
          role="radio"
          class="key"
          [attr.aria-checked]="o.value === value()"
          [tabIndex]="i === focusIndex() ? 0 : -1"
          (click)="choose(o.value)"
          (keydown)="onKey($event, i)"
        >
          <span class="led" aria-hidden="true"></span>{{ o.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }
    .label {
      font-size: var(--text-2xs);
      font-weight: var(--weight-bold);
      letter-spacing: var(--tracking-caps);
      text-transform: uppercase;
      color: var(--silkscreen);
      text-shadow: var(--silkscreen-shadow);
    }
    /* recessed tray that holds the keys */
    .tray {
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      gap: 2px;
      padding: 3px 3px 5px;
      border-radius: 8px;
      background: #08090a;
      box-shadow:
        inset 0 2px 4px rgb(0 0 0 / 85%),
        0 1px 0 rgb(255 255 255 / 7%);
    }
    .tray.keypad {
      gap: 5px 4px;
      padding: 4px 4px 6px;
    }
    .key {
      position: relative;
      display: grid;
      place-items: center;
      gap: 2px;
      min-width: 0;
      min-height: 2.25rem;
      padding: 7px 4px 2px;
      border: 1px solid var(--key-edge);
      border-radius: 3px;
      background: var(--key-face);
      color: var(--key-text);
      font-size: var(--text-2xs);
      font-weight: 800;
      letter-spacing: 0.07em;
      line-height: 1.2;
      text-transform: uppercase;
      text-align: center;
      overflow-wrap: anywhere;
      cursor: pointer;
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 15%),
        inset 0 -2px 0 rgb(0 0 0 / 35%),
        0 2px 0 var(--key-skirt);
      transition: transform var(--duration-fast) var(--easing);
    }
    .tray:not(.keypad) .key:first-child {
      border-radius: 6px 3px 3px 6px;
    }
    .tray:not(.keypad) .key:last-child {
      border-radius: 3px 6px 6px 3px;
    }
    .tray.keypad .key {
      border-radius: 5px;
    }
    .key:hover {
      filter: brightness(1.12);
    }
    .key[aria-checked='true'] {
      background: var(--key-face-pressed);
      color: var(--color-accent-strong);
      transform: translateY(2px);
      box-shadow:
        inset 0 2px 4px rgb(0 0 0 / 70%),
        0 0 0 var(--key-skirt);
    }
    .key:focus-visible {
      outline-offset: 1px;
      z-index: 1;
    }
    .led {
      position: absolute;
      top: 4px;
      left: 50%;
      width: 12px;
      height: 3px;
      margin-left: -6px;
      border-radius: 1px;
      background: var(--led-off);
      box-shadow: var(--led-off-shadow);
    }
    .key[aria-checked='true'] .led {
      background: var(--led-green);
      box-shadow: 0 0 6px var(--led-green);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeySelector<T> {
  readonly label = input.required<string>();
  readonly options = input.required<readonly KeyOption<T>[]>();
  readonly value = input.required<T>();
  /** Keypad layout with this many columns; 0 = one row of joined keys. */
  readonly columns = input(0);
  readonly valueChange = output<T>();

  protected readonly labelId = `key-selector-${nextId++}`;
  private readonly keys = viewChildren<ElementRef<HTMLButtonElement>>('key');
  /** The selected key takes the tab stop; the first one if nothing is selected. */
  protected readonly focusIndex = computed(() =>
    Math.max(
      0,
      this.options().findIndex((o) => o.value === this.value()),
    ),
  );

  protected choose(value: T): void {
    if (value !== this.value()) this.valueChange.emit(value);
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    const n = this.options().length;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % n;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + n) % n;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const option = this.options()[next];
    if (!option) return;
    this.choose(option.value);
    this.keys()[next]?.nativeElement.focus();
  }
}
