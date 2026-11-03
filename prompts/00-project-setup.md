# 00 – Projekt-Setup: Angular + Tauri 2 + Tooling

> **Status:** Bereits ausgeführt (Phase A/B, 2026-11-03). Diesen Prompt nur erneut
> verwenden, um ein beschädigtes oder unvollständiges Setup zu prüfen und zu reparieren.

## Ziel und Kontext

AudioLab ist eine lokale, privacy-first Audioanalyse-App, die aus **einer** Angular-Codebasis
als Webanwendung und als Tauri-2-Desktop-App (macOS, Windows, Linux) ausgeliefert wird.
Dieser Prompt stellt das lauffähige, testbare Fundament her – ohne Audiofunktionen.

## Zuerst prüfen

- `package.json`, `angular.json`, `tsconfig*.json`, `eslint.config.js`, `playwright.config.ts`
- `src-tauri/` (Cargo.toml, tauri.conf.json, capabilities, Info.plist, Entitlements.plist, icons)
- installierte Versionen: `node -v`, `pnpm -v`, `rustc --version`, `pnpm tauri --version`,
  `pnpm ng version`
- Dokumentierte Versionen in `docs/BUILDING.md` mit den tatsächlich installierten abgleichen.

## Aufgaben (nur was fehlt oder defekt ist)

1. Angular-Anwendung (aktuelle stabile Version, Standalone, zoneless, Signals, strict, OnPush
   als Schematic-Default, Hash-Routing, Dev-Server-Port 1420).
2. Tauri 2 in `src-tauri/`: Lib-Crate `audiolab_lib`, Command `platform_info`, Capability
   `default` nur mit `core:default`, CSP ohne `unsafe-eval`, keine Plugins.
3. macOS-Mikrofonvoraussetzungen: `Info.plist` mit `NSMicrophoneUsageDescription`,
   `Entitlements.plist` mit `com.apple.security.device.audio-input` (Hardened Runtime).
4. Skripte: `start`, `build`, `test`, `lint`, `format(:check)`, `e2e`, `tauri:dev`,
   `tauri:build*`, `rust:fmt|lint|test`, `check`.
5. ESLint (angular-eslint, typescript-eslint, `no-explicit-any`, Schichtgrenzen-Regel),
   Prettier, Vitest über `@angular/build:unit-test`, Playwright (Chromium).
6. App-Shell mit Navigation aus `core/modules/module-catalog.ts`, Overview-Seite,
   Platzhalterseiten, Morse-Decoder-Layout, Light/Dark-Theme über CSS Custom Properties.
7. App-Icons aus `src-tauri/icons/source/app-icon.svg` via `pnpm tauri icon`.

## Technische Leitplanken

- Keine UI-Komponentenbibliothek, keine Audio-Bibliothek.
- `pnpm-workspace.yaml` erlaubt Build-Skripte nur für die Angular-Toolchain.
- Lizenz: MIT (entschieden 2026-11-03), gesetzt in `LICENSE`, `package.json`, `Cargo.toml`, `tauri.conf.json`.

## Akzeptanzkriterien

- `pnpm check` läuft vollständig grün.
- `pnpm e2e` grün (Shell-Smoke-Tests).
- `pnpm tauri:dev` öffnet das Fenster „AudioLab" mit derselben Oberfläche wie `pnpm start`.
- Statusleiste zeigt Laufzeit (Web/Desktop) und Secure-Context-/Mikrofon-API-Status.

## Tests

Bestehende Specs: `module-catalog.spec.ts`, `theme.service.spec.ts`,
`browser-platform-adapter.spec.ts`, `app-shell.spec.ts`, `app.routes.spec.ts`,
Rust `platform::tests`, E2E `e2e/shell.spec.ts`.

## Dokumentation

`docs/BUILDING.md` (Versionen, Voraussetzungen), `docs/ARCHITECTURE.md` (ADRs).

## Ausdrücklich nicht umsetzen

Mikrofonzugriff, AudioWorklet, Decoder, CI-Workflows, Releases.
