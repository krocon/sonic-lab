import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { findModule } from '../../core/modules/module-catalog';
import { Icon } from '../../shared/icon/icon';

/** Shown for modules that are on the roadmap but not implemented yet. */
@Component({
  selector: 'app-module-placeholder-page',
  imports: [Icon],
  template: `
    @if (module(); as m) {
      <section class="placeholder" aria-labelledby="placeholder-title">
        <span class="icon"><app-icon [name]="m.icon" [size]="40" /></span>
        <p class="label">Planned module</p>
        <h1 id="placeholder-title">{{ m.title }}</h1>
        <p>{{ m.summary }}</p>
        <p class="note">
          This module is on the roadmap and will be built with
          <code>prompts/{{ m.prompt }}</code
          >.
        </p>
      </section>
    }
  `,
  styles: `
    .placeholder {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 1.6cqh;
      height: 100%;
      text-align: center;
    }
    .icon {
      color: var(--oled-accent);
    }
    h1 {
      font-size: clamp(20px, 6cqh, 40px);
      font-weight: 300;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModulePlaceholderPage {
  /** Bound from route data via `withComponentInputBinding()`. */
  readonly moduleId = input.required<string>();
  protected readonly module = computed(() => findModule(this.moduleId()));
}
