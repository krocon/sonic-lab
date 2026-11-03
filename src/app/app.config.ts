import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { providePlatformAdapter } from './platform/platform-adapter.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash routing works identically in the browser, on static hosting and in the Tauri
    // asset protocol without server-side rewrites (docs/ARCHITECTURE.md, ADR-004).
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
    providePlatformAdapter(),
  ],
};
