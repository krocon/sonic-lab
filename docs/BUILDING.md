# Building AudioLab

## Versions in use

Recorded on 2026-11-03 (Phase A/B). Keep this table in sync when upgrading.

| Tool / package            | Version                  | Notes                                           |
| ------------------------- | ------------------------ | ----------------------------------------------- |
| Node.js                   | 24.21.0                  | supported: ^22.22 · ^24.15 · ≥26 (`engines`)    |
| pnpm                      | 10.25.0                  | pinned via `packageManager`                     |
| Angular (core / CLI)      | 22.2.4 / 22.2.5          | standalone, zoneless, `@angular/build`          |
| TypeScript                | 6.0.3                    | Angular 22 range (~6.0); TS 7 not yet supported |
| RxJS                      | 7.8.2                    |                                                 |
| Vitest                    | 5.1.0                    | via `@angular/build:unit-test`, jsdom           |
| Playwright                | 1.64.1                   | `@playwright/test`, Chromium                    |
| ESLint / angular-eslint   | 10.14.0 / 22.6.0         | typescript-eslint 8.72.1                        |
| Prettier                  | 3.9.10                   |                                                 |
| Rust                      | 1.99.1                   | edition 2024, `rust-version = 1.85`             |
| Tauri (crate / CLI / API) | 2.12.5 / 2.12.4 / 2.12.4 | tauri-build 2.7.4                               |

## Prerequisites

All platforms: Node.js, pnpm (`corepack enable` or a standalone install), and for the desktop
app Rust stable (`rustup`). Follow the official
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS:

- **macOS:** Xcode or the Command Line Tools. For a universal build:
  `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
- **Windows:** Microsoft C++ Build Tools ("Desktop development with C++") and WebView2
  (preinstalled on Windows 10 1803+/11).
- **Linux (Debian/Ubuntu):**
  `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.

Tauri's CLI is a project dev dependency (`pnpm tauri …`); no global `cargo tauri` install is
needed.

## Commands

| Command                                     | What it does                                              |
| ------------------------------------------- | --------------------------------------------------------- |
| `pnpm install`                              | install dependencies                                      |
| `pnpm start`                                | web dev server on http://localhost:1420                   |
| `pnpm build`                                | production web build → `dist/audiolab/browser`            |
| `pnpm test`                                 | unit tests once (`pnpm test:watch` for watch mode)        |
| `pnpm lint`                                 | ESLint for TypeScript and templates                       |
| `pnpm format` / `format:check`              | Prettier write / check                                    |
| `pnpm e2e`                                  | Playwright tests (starts the dev server)                  |
| `pnpm e2e:install`                          | download Playwright's Chromium                            |
| `pnpm tauri:dev`                            | desktop app with live reload (runs `pnpm start` itself)   |
| `pnpm tauri:build`                          | desktop bundles for the current OS                        |
| `pnpm tauri:build:mac`                      | universal macOS `.app` + `.dmg`                           |
| `pnpm tauri:build:linux`                    | `.deb`, `.rpm`, `.AppImage`                               |
| `pnpm tauri:build:windows`                  | `.msi`, NSIS installer                                    |
| `pnpm rust:fmt` / `rust:lint` / `rust:test` | cargo fmt --check / clippy -D warnings / test             |
| `pnpm check`                                | format, lint, unit tests, web build, Rust fmt/clippy/test |

## Notes

- The web build is static and needs no server-side rewrites (hash routing). Serve it over
  HTTPS so that browsers allow microphone access.
- `pnpm-workspace.yaml` allows install scripts only for the Angular build toolchain
  (`esbuild`, `@parcel/watcher`, `lmdb`, `msgpackr-extract`).
- App icons are generated from `src-tauri/icons/source/app-icon.svg` with
  `pnpm tauri icon src-tauri/icons/source/app-icon.svg` (delete the generated `android/` and
  `ios/` folders afterwards – mobile is not a target).
- Code signing and notarisation are not configured yet (prompts/11). Unsigned macOS builds
  must be opened via right-click → Open; Windows SmartScreen may warn.
