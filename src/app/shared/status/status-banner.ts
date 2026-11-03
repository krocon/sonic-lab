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
    .dot {
      flex: none;
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 50%;
      background: var(--color-text-subtle);
      transform: translateY(0.05rem);
    }
    .hint {
      display: block;
      color: var(--color-text-subtle);
    }
    [data-tone='success'] .dot {
      background: var(--color-success);
    }
    [data-tone='info'] .dot {
      background: var(--color-signal);
    }
    [data-tone='warning'] {
      color: var(--color-warning);
    }
    [data-tone='warning'] .dot {
      background: var(--color-warning);
    }
    [data-tone='danger'] {
      color: var(--color-danger);
    }
    [data-tone='danger'] .dot {
      background: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBanner {
  readonly message = input.required<StatusMessage>();
}
