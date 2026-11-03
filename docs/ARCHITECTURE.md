# Architecture

AudioLab is one Angular application that runs in two hosts: a web browser and a Tauri 2
WebView. All audio capture and signal processing happen in the frontend; the Rust side only
hosts the window and exposes a small, explicit command surface.

## Layers

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation   src/app/shell, src/app/features/*, shared/     │  Angular components, signals,
│                                                              │  Canvas/SVG visualisations
├──────────────────────────────────────────────────────────────┤
│ Application    src/app/core/*                                 │  module catalog, theme, capture
│                                                              │  session, settings (Angular DI)
├───────────────────────────────┬──────────────────────────────┤
│ Audio   src/app/audio/*       │ Decoders  src/app/decoders/* │  framework-free TypeScript
│ capture, worklet, DSP         │ Morse, DTMF, …               │  (ESLint-enforced)
├───────────────────────────────┴──────────────────────────────┤
│ Platform       src/app/platform/*                             │  PlatformAdapter:
│                Browser… / Tauri…Adapter                       │  browser vs. Tauri commands
├──────────────────────────────────────────────────────────────┤
│ Desktop shell  src-tauri/ (Rust)                              │  window, commands, capabilities
└──────────────────────────────────────────────────────────────┘
```

Dependency direction is top-down only. `audio/` and `decoders/` must not import Angular, RxJS
or `@tauri-apps/*`; `eslint.config.js` fails the lint otherwise. Features never import
`@tauri-apps/*` directly – they use an adapter from `platform/`.

## Current structure

```text
src/
├── app/
│   ├── app.ts, app.config.ts, app.routes.ts
│   ├── shell/               app frame: top bar, navigation, outlet, status bar
│   ├── core/
│   │   ├── modules/         AnalysisModule type + module catalog (single source of truth)
│   │   └── theme/           ThemeService (system / light / dark)
│   ├── platform/            PlatformAdapter + browser/Tauri implementations
│   ├── features/
│   │   ├── overview/
│   │   ├── morse-decoder/   layout preview (audio arrives with prompts/02)
│   │   └── module-placeholder/
│   └── shared/icon/         inline SVG icon set
├── styles/                  tokens.css (design tokens), base.css
e2e/                         Playwright tests
src-tauri/                   Tauri 2 crate (audiolab_lib), capabilities, icons, plists
prompts/                     development roadmap as work orders
```

Planned (see prompts 01–08): `src/app/audio/` (AudioSource, microphone, worklet, DSP,
synthetic source), `src/app/decoders/` (SignalDecoder, morse, dtmf), `src/app/core/capture/`,
`src/app/core/settings/`, `src/testing/` (fakes and signal generators).

## Key contracts (planned in prompts/01)

```ts
interface AudioFrame {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
}
interface AudioSource {
  listDevices(): Promise<AudioInputDevice[]>;
  start(deviceId?: string): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (frame: AudioFrame) => void): () => void;
}
interface SignalDecoder<TConfig, TResult> {
  readonly id: string;
  readonly name: string;
  configure(config: TConfig): void;
  process(frame: AudioFrame): TResult[];
  reset(): void;
}
```

Data flow: microphone → AudioWorklet (blocks via transferable buffers) → ring buffer →
decoders and visualisations (outside change detection) → condensed results → signals → UI.

## Adding a module

1. Add an entry to `src/app/core/modules/module-catalog.ts` (status `planned` creates a
   placeholder route automatically).
2. Implement the algorithm in `src/app/audio` or `src/app/decoders` with tests.
3. Add a feature page under `src/app/features/<module>/` and a dedicated route in
   `app.routes.ts`; switch the status to `in-development` / `available`.

## Desktop shell

- Crate `audiolab` with library `audiolab_lib` (`src-tauri/src/lib.rs`).
- Commands: `platform_info` (OS, arch, app version).
- Capability `default`: `core:default` only. No plugins.
- CSP: `script-src 'self'` (no eval, no inline scripts), `connect-src` limited to Tauri IPC,
  `media-src`/`worker-src` prepared for audio and worklets.
- macOS: `Info.plist` (microphone usage description) and `Entitlements.plist`
  (`com.apple.security.device.audio-input`) for hardened-runtime builds.

## Decision records

### ADR-001 – One Angular app, two hosts

Web and desktop share the same build (`dist/audiolab/browser`). Runtime differences are
isolated in `PlatformAdapter` implementations chosen at startup via `isTauri()`.

### ADR-002 – Audio processing in the WebView, not in Rust

`getUserMedia` + Web Audio/AudioWorklet are available in all target WebViews and in browsers,
so one implementation serves both. Native Rust capture (e.g. `cpal`) is only considered if a
platform's WebView cannot capture audio reliably (to be verified in prompts/09).

### ADR-003 – No UI or audio libraries

Native browser APIs, CSS custom properties and a small inline icon set keep the bundle small
(initial ≈ 70 kB transferred) and avoid dependency churn. A new dependency needs a written
justification here.

### ADR-004 – Hash-based routing

`withHashLocation()` behaves identically on `ng serve`, static hosting (GitHub Pages) and in the
Tauri asset protocol without server rewrites.

### ADR-005 – Zoneless Angular with signals and OnPush

Change detection runs only when signals change. Audio frames never flow through signals; only
condensed results (state, levels, decoded text) do. This keeps high-rate processing off the
change-detection path.

### ADR-006 – Tooling versions

Angular CLI defaults (Vitest through `@angular/build:unit-test`, TypeScript ~6.0) are kept
instead of newer standalone releases (e.g. TypeScript 7) until Angular supports them.
