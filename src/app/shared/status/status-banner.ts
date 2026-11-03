import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StatusMessage } from '../../core/status/status-message';

/** Renders a {@link StatusMessage}; announced politely to screen readers. */
@Component({
  selector: 'app-status-banner',
  template: `
    <p class="status" role="status" [attr.data-tone]="message().tone">
      <span class="dot" aria-hidden="true"></span>
      <span>
        {{ message().text }}
        @if (message().hint; as hint) {
          <span class="hint">{{ hint }}</span>
        }
      </span>
    </p>
  `,
  styles: `
    .status {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      margin: 0;
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    /* indicator LED */
    .dot {
      flex: none;
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--led-off);
      box-shadow: var(--led-off-shadow);
      transform: translateY(-0.05rem);
    }
    .hint {
      display: block;
      color: var(--color-text-subtle);
    }
    [data-tone='success'] .dot,
    [data-tone='info'] .dot {
      background: var(--led-green);
      box-shadow: 0 0 6px var(--led-green);
    }
    [data-tone='warning'] {
      color: var(--color-warning);
    }
    [data-tone='warning'] .dot {
      background: var(--led-amber);
      box-shadow: 0 0 6px var(--led-amber);
    }
    [data-tone='danger'] {
      color: var(--color-danger);
    }
    [data-tone='danger'] .dot {
      background: var(--led-red);
      box-shadow: 0 0 7px var(--led-red);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBanner {
  readonly message = input.required<StatusMessage>();
}
