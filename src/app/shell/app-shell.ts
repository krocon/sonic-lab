import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MODULE_GROUPS, modulesInGroup } from '../core/modules/module-catalog';
import { CaptureActivity } from '../core/capture/capture-activity';
import { PlatformAdapter } from '../platform/platform-adapter';
import { Icon } from '../shared/icon/icon';

/**
 * Application frame, drawn as the front panel of a radio: rack handles, a console with the
 * nameplate, the mode keys and the indicator LEDs, and the workspace of the selected module.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  protected readonly capture = inject(CaptureActivity);
  private readonly platform = inject(PlatformAdapter);

  protected readonly groups = MODULE_GROUPS.map((g) => ({ ...g, modules: modulesInGroup(g.id) }));
  protected readonly platformInfo = resource({ loader: () => this.platform.describe() });
}
