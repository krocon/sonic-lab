import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ModuleStatus } from '../../core/modules/analysis-module';
import { MODULE_GROUPS, modulesInGroup } from '../../core/modules/module-catalog';
import { Icon } from '../../shared/icon/icon';

const STATUS_LABEL: Record<ModuleStatus, string> = {
  available: 'Available',
  'in-development': 'In development',
  planned: 'Planned',
};

@Component({
  selector: 'app-overview-page',
  imports: [RouterLink, Icon],
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPage {
  protected readonly groups = MODULE_GROUPS.map((g) => ({ ...g, modules: modulesInGroup(g.id) }));
  protected readonly statusLabel = STATUS_LABEL;
}
