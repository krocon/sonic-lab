import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MODULE_GROUPS, modulesInGroup } from '../core/modules/module-catalog';
import { Icon } from '../shared/icon/icon';

/**
 * Application frame, drawn as the front panel of a radio: a top row with the mode keys and a
 * speaker grille, and below it the workspace of the selected module.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  protected readonly groups = MODULE_GROUPS.map((g) => ({ ...g, modules: modulesInGroup(g.id) }));
}
