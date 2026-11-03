import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { CaptureSession } from '../../core/capture/capture-session';
import { Icon } from '../icon/icon';
import { StatusBanner } from '../status/status-banner';

let nextId = 0;

/** Input selection, Start/Stop and capture status for any page that provides a {@link CaptureSession}. */
@Component({
  selector: 'app-capture-controls',
  imports: [Icon, StatusBanner],
  template: `
    <label class="field device">
      <span class="label">Audio input</span>
      <select
        #select
        [id]="selectId"
        [disabled]="session.busy()"
        (change)="session.selectDevice($any($event.target).value)"
      >
        <option value="" [selected]="session.selectedDeviceId() === ''">Default input</option>
        @for (d of devices(); track d.id) {
          <option [value]="d.id" [selected]="d.id === session.selectedDeviceId()">
            {{ d.label }}
          </option>
        }
      </select>
    </label>
    <div class="buttons">
      <button
        type="button"
        class="btn"
        [class.btn-primary]="!session.running()"
        [attr.aria-disabled]="session.busy()"
        (click)="session.toggle()"
        [attr.aria-pressed]="session.running()"
      >
        <app-icon [name]="session.running() ? 'stop' : 'play'" [size]="16" />
        {{ session.running() ? 'Stop' : 'Start' }}
      </button>
      <ng-content />
    </div>
    <div class="state">
      <app-status-banner [message]="session.status()" />
      @if (session.notice(); as notice) {
        <app-status-banner [message]="notice" />
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--space-2) var(--space-4);
    }
    .device {
      display: grid;
      gap: var(--space-1);
      flex: 1 1 15rem;
      max-width: 24rem;
    }
    .label {
      font-size: var(--text-2xs);
      font-weight: var(--weight-bold);
      letter-spacing: var(--tracking-caps);
      text-transform: uppercase;
      color: var(--silkscreen);
      text-shadow: var(--silkscreen-shadow);
    }
    .buttons {
      display: flex;
      gap: var(--space-2);
    }
    .btn {
      min-width: 6.5rem;
    }
    .state {
      display: grid;
      gap: var(--space-1);
      flex: 1 1 12rem;
      align-self: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureControls implements OnInit {
  protected readonly session = inject(CaptureSession);
  protected readonly selectId = `capture-device-${nextId++}`;
  protected readonly devices = computed(() =>
    this.session.devices().filter((d) => d.id !== 'default'),
  );
  private readonly select = viewChild.required<ElementRef<HTMLSelectElement>>('select');

  constructor() {
    // Options arrive asynchronously; some engines (WebKit) ignore `selected` on options that are
    // inserted later, so the value is written explicitly after every render.
    afterRenderEffect(() => {
      this.devices();
      this.select().nativeElement.value = this.session.selectedDeviceId();
    });
  }

  ngOnInit(): void {
    void this.session.refreshDevices();
  }
}
