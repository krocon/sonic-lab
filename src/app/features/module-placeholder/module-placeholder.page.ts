import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { findModule } from '../../core/modules/module-catalog';
import { Icon } from '../../shared/icon/icon';

/** Shown for modules that are on the roadmap but not implemented yet. */
@Component({
  selector: 'app-module-placeholder-page',
  imports: [RouterLink, Icon],
  template: `
    @if (module(); as m) {
      <section class="panel placeholder" aria-labelledby="placeholder-title">
        <span class="icon"><app-icon [name]="m.icon" [size]="32" /></span>
        <p class="eyebrow">Planned module</p>
        <h1 id="placeholder-title">{{ m.title }}</h1>
        <p class="text">{{ m.summary }}</p>
        <p class="text">
          This module is on the roadmap and will be built with
          <code>prompts/{{ m.prompt }}</code
          >.
        </p>
        <a class="btn" routerLink="/">Back to overview</a>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 100%;
      padding: var(--space-5);
    }
    .placeholder {
      display: grid;
      justify-items: center;
      gap: var(--space-3);
      max-width: 32rem;
      padding: var(--space-7) var(--space-6);
      text-align: center;
    }
    .icon {
      color: var(--color-text-subtle);
    }
    .text {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModulePlaceholderPage {
  /** Bound from route data via `withComponentInputBinding()`. */
  readonly moduleId = input.required<string>();
  protected readonly module = computed(() => findModule(this.moduleId()));
}
