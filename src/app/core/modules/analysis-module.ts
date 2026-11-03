import { IconName } from '../../shared/icon/icon-paths';

/**
 * Lifecycle of an analysis module in the navigation.
 * - `available`: usable end to end
 * - `in-development`: route exists, functionality is being built (MVP)
 * - `planned`: only a placeholder page, see docs/ROADMAP.md
 */
export type ModuleStatus = 'available' | 'in-development' | 'planned';

export type ModuleGroup = 'decode' | 'analyze' | 'generate';

/** Static description of one analysis module. Pure data – no Angular, no audio. */
export interface AnalysisModule {
  readonly id: string;
  /** Route path below the app root (no leading slash). */
  readonly path: string;
  readonly title: string;
  readonly summary: string;
  readonly group: ModuleGroup;
  readonly icon: IconName;
  readonly status: ModuleStatus;
  /** Follow-up prompt in `prompts/` that implements the module. */
  readonly prompt: string;
}
