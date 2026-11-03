import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MODULE_GROUPS, modulesInGroup } from '../core/modules/module-catalog';
import { CaptureActivity } from '../core/capture/capture-activity';
import { ThemeService } from '../core/theme/theme.service';
import { PlatformAdapter } from '../platform/platform-adapter';
import { Icon } from '../shared/icon/icon';
import { IconName } from '../shared/icon/icon-paths';

const THEME_ICONS: Record<string, IconName> = { system: 'system', light: 'sun', dark: 'moon' };

/** Application frame: brand bar, module navigation, workspace outlet, status bar. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  protected readonly theme = inject(ThemeService);
  protected readonly capture = inject(CaptureActivity);
  private readonly platform = inject(PlatformAdapter);

  protected readonly groups = MODULE_GROUPS.map((g) => ({ ...g, modules: modulesInGroup(g.id) }));
  protected readonly platformInfo = resource({ loader: () => this.platform.describe() });
  protected readonly themeIcon = computed(() => THEME_ICONS[this.theme.preference()] ?? 'system');
  protected readonly themeLabel = computed(() => `Theme: ${this.theme.preference()} (change)`);
}
