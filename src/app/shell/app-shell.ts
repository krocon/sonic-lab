import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { DEMO_DEVICE_ID } from '../core/capture/audio-capture.providers';
import { ANALYSIS_MODULES, MODULE_GROUPS, modulesInGroup } from '../core/modules/module-catalog';
import { FrontPanel, PanelControl, choiceText } from '../core/panel/front-panel';
import { DisplayOverlay } from './display/display-overlay';
import { ControlPanel } from './hardware/control-panel';

/** Below this size the whole device scales down instead of reflowing. */
const MIN_WIDTH = 1180;
const MIN_HEIGHT = 720;

/** Group captions printed over the F-key labels in the display. */
const GROUP_LEGENDS: Record<string, string> = {
  decode: 'Decode',
  analyze: 'Analyze',
  generate: 'Generate · Record',
};

/**
 * Application frame, drawn as a transceiver front panel: the OLED with soft keys on its right and
 * F keys below (one per module), and the fixed control panel on the right. Only the display grows
 * with the window; all hardware keeps its size and place.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ControlPanel, DisplayOverlay],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  protected readonly panel = inject(FrontPanel);
  protected readonly modules = MODULE_GROUPS.flatMap((g) => modulesInGroup(g.id));
  protected readonly groups = MODULE_GROUPS.map((g) => ({
    label: GROUP_LEGENDS[g.id] ?? g.label,
    span: modulesInGroup(g.id).length,
  }));
  protected readonly zoom = signal(1);

  private readonly url = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: '' },
  );
  protected readonly module = computed(() => {
    const path = this.url().replace(/^\//, '').split(/[?#]/)[0];
    return ANALYSIS_MODULES.find((m) => m.path === path) ?? null;
  });

  /** Status line: capture state, or the page's own output state. */
  protected readonly state = computed(() => {
    const b = this.panel.binding();
    if (b.capture) {
      const status = b.capture.status();
      return {
        text: status.text,
        live: b.capture.running(),
        alert: status.tone === 'danger' || status.tone === 'warning',
      };
    }
    const s = b.state?.();
    return s ? { text: s.text, live: s.live, alert: false } : null;
  });
  protected readonly inputText = computed(() => {
    const capture = this.panel.binding().capture;
    if (!capture) return '';
    const id = capture.selectedDeviceId();
    if (id === DEMO_DEVICE_ID) return 'Demo signal';
    return (id && capture.devices().find((d) => d.id === id)?.label) || 'Default input';
  });
  /** Page message, else what the capture session has to say (lost device, errors). */
  protected readonly message = computed(() => {
    const b = this.panel.binding();
    const own = b.message?.();
    if (own) return own;
    const notice = b.capture?.notice();
    if (notice) return notice;
    const status = b.capture?.status();
    return status && (status.tone === 'danger' || status.tone === 'warning') ? status : null;
  });

  constructor() {
    const win = inject(DOCUMENT).defaultView;
    if (win) {
      const fit = () =>
        this.zoom.set(Math.min(1, win.innerWidth / MIN_WIDTH, win.innerHeight / MIN_HEIGHT));
      fit();
      win.addEventListener('resize', fit);
      inject(DestroyRef).onDestroy(() => win.removeEventListener('resize', fit));
    }
    // device labels arrive after permission; refresh them whenever a capture page binds
    effect(() => void this.panel.binding().capture?.refreshDevices());
  }

  protected softText(c: PanelControl | null): string {
    if (!c) return '';
    switch (c.kind) {
      case 'action':
        return '';
      case 'choice':
        return choiceText(c);
      case 'value':
        return c.format(c.value());
    }
  }

  /** Accessible name of a soft key: what it is and its current setting. */
  protected softName(c: PanelControl | null, i: number): string {
    if (!c) return `Soft key ${i + 1} (not used)`;
    const text = this.softText(c);
    return text ? `${c.name}: ${text}` : c.name;
  }

  protected onEscape(): void {
    if (this.panel.overlay() || this.panel.selected() || this.panel.entry()) this.panel.escape();
  }
}
