import { DOCUMENT, Injectable, inject } from '@angular/core';
import { PlatformAdapter, webCapabilities } from './platform-adapter';
import { PlatformInfo } from './platform-info';

@Injectable()
export class BrowserPlatformAdapter extends PlatformAdapter {
  private readonly window = inject(DOCUMENT).defaultView;

  override async describe(): Promise<PlatformInfo> {
    return { kind: 'web', label: 'Web browser', ...webCapabilities(this.window) };
  }
}
