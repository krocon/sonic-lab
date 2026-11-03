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
│   │   ├── capture/         CaptureSession, capture providers, demo signals, microphone activity
│   │   ├── settings/        SettingsStore (versioned JSON in localStorage, never throws)
│   │   ├── status/          StatusMessage + mapping of audio states/errors to user text
│   │   └── theme/           ThemeService (system / light / dark)
│   ├── audio/               framework-free
│   │   ├── microphone/      BrowserMicrophoneSource (getUserMedia → AudioWorklet), error mapping
│   │   ├── synthetic/       SyntheticAudioSource (demo input, tests)
│   │   ├── synthesis/       deterministic generators (tone, keyed tone, noise, mix), PRNG
│   │   ├── dsp/             FFT, windows, spectrum + peaks, Goertzel, biquad, notes
│   │   ├── output/          KeyedTonePlayer (Morse playback), ToneGenerator
│   │   └── *.ts             AudioFrame/AudioSource contracts, ring buffer, level meter,
│   │                        time series, recorder, WAV encoder, composite source
│   ├── decoders/            framework-free: SignalDecoder contract
│   │   ├── morse/           alphabet, timing/synthesis, tone/keying/timing stages, decoder
│   │   └── dtmf/            tones/keys, DtmfDecoder
│   ├── platform/            PlatformAdapter, FileExportAdapter (browser / Tauri)
│   ├── features/            one folder per page: overview, morse-decoder, morse-encoder,
│   │                        dtmf-decoder, frequency-analyzer, spectrum-analyzer,
│   │                        signal-monitor, tone-generator, audio-recorder, module-placeholder
│   └── shared/              icons, capture controls, status banner, canvas visualisations
├── worklets/                AudioWorklet processors (TypeScript, bundled by scripts/build-worklets.mjs)
├── testing/                 fakes and impaired-signal generators for tests (not in the app build)
└── styles/                  tokens.css (design tokens), base.css (elements, shared page styles)
e2e/                         Playwright tests (+ fixtures/fake-microphone.ts)
scripts/                     worklet build, version sync, release notes, screenshots
src-tauri/                   Tauri 2 crate (audiolab_lib): platform, permissions, window state, export
prompts/                     development roadmap as work orders (all executed)
```

## Key contracts

Defined in `src/app/audio/audio-source.ts`, `src/app/audio/audio-frame.ts` and
`src/app/decoders/signal-decoder.ts`:

```ts
interface AudioFrame {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
}
type AudioSourceState =
  | { status: 'idle' }
  | { status: 'requesting-permission' }
  | { status: 'running'; deviceId?: string; sampleRate: number }
  | { status: 'stopped' }
  | { status: 'error'; error: AudioSourceError };
interface AudioSource {
  readonly state: AudioSourceState;
  listDevices(): Promise<AudioInputDevice[]>;
  start(deviceId?: string): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (frame: AudioFrame) => void): () => void;
  onStateChange(listener: (state: AudioSourceState) => void): () => void;
}
interface SignalDecoder<TConfig, TResult extends DecoderEvent> {
  readonly id: string;
  readonly name: string;
  configure(config: Partial<TConfig>): void;
  process(frame: AudioFrame): TResult[];
  reset(): void;
}
```

### Data flow

```text
AudioSource ──frames──▶ CaptureSession ──▶ consumers (decoders, ring buffers)   no signals
     │                        │                         │
     └──state──▶ state signal ┘          condensed results (text, level, WPM) ──▶ signals ──▶ UI
```

`CaptureSession` is provided per feature page, so leaving the page destroys it and stops the
source. The concrete source is injected via the `AUDIO_SOURCE` token.

## Adding a module

1. Add an entry to `src/app/core/modules/module-catalog.ts` (status `planned` creates a
   placeholder page and route automatically).
2. Implement the algorithm in `src/app/audio` or `src/app/decoders` with tests.
3. Add a feature page under `src/app/features/<module>/` and a dedicated route in
   `app.routes.ts`; switch the status to `in-development` / `available`.

## Desktop shell

- Crate `audiolab` with library `audiolab_lib` (`src-tauri/src/lib.rs`).
- The main window is declared in `tauri.conf.json` with `create: false` and built in `setup()`
  so the permission policy (`permissions.rs`) is attached before the webview exists; it is shown
  after the saved geometry was restored (`window_state.rs`, JSON in the app config dir,
  validated against connected monitors).
- Linux: WebKitGTK media streams are enabled via `PlatformWebview::inner()` (webkit2gtk 2.0.2,
  already in the tree).
- Commands: `platform_info` (OS, arch, app version), `export_file` (raw bytes + suggested name →
  native save dialog → write; returns the path or `null` when cancelled).
- Capability `default`: `core:default` only. The dialog plugin is registered for use from Rust;
  no plugin permission is granted to the webview.
- CSP: `script-src 'self'` (no eval, no inline scripts; the AudioWorklet is a same-origin file),
  `connect-src` limited to Tauri IPC, `media-src`/`worker-src` for audio and worklets.
  `style-src 'self' 'unsafe-inline'` is needed for the `<style>` elements Angular inserts for
  component styles, so Tauri must not add hashes to it (`dangerousDisableAssetCspModification:
["style-src"]` – a hash makes browsers ignore `'unsafe-inline'`), and the production build does
  not inline critical CSS (no inline `<style>`/`<script>` in `index.html`). Guarded by
  `e2e/desktop-csp.spec.ts`, which loads the production build under this CSP.
- macOS: `Info.plist` (microphone usage description) and `Entitlements.plist`
  (`com.apple.security.device.audio-input`) for hardened-runtime builds; the default macOS app menu
  (About, Edit with copy/paste, Quit) comes from Tauri.
- Keyboard: Space = start/stop, Ctrl/⌘+K = reset (implemented in the page, works on the web too).

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

### ADR-007 – Frame ownership and buffer reuse

`AudioFrame.samples` is valid only during the listener call; sources reuse buffers. Consumers
that need data later copy it (or write it into a ring buffer). This avoids per-frame
allocations and GC pauses in the audio path.

### ADR-008 – Enforced layer boundaries

ESLint `no-restricted-imports`: `audio/` and `decoders/` may not import Angular, RxJS, Tauri,
`core/` or `platform/`; features, shell and shared UI may not import `@tauri-apps/*`.

### ADR-009 – Explicit webview permission policy, no window-state plugin

Platform defaults for web permissions differ and are too permissive on macOS; an explicit
allow-list (microphone only) keeps behaviour equal and minimal. Window geometry is ~100 lines of
Rust instead of `tauri-plugin-window-state`, which would need an extra capability and stores more
than needed.

### ADR-010 – Own FFT instead of AnalyserNode

See docs/AUDIO-PIPELINE.md: deterministic, testable without a browser, identical on all engines.

### ADR-011 – Export through one Rust command

Saving needs a native dialog and a file write. Granting the webview `dialog:allow-save` plus a
scoped `fs` write would let compromised page code write wherever the user once clicked; instead
`export_file` opens the dialog itself and writes only there (`tauri-plugin-dialog` 2.8 as a Rust
dependency, no capability). On the web, `FileExportAdapter` uses the File System Access API or a
download link. Recording uses the app's own WAV encoder (16-bit PCM or 32-bit float), not
`MediaRecorder`, whose formats differ per browser.

### ADR-006 – Tooling versions

Angular CLI defaults (Vitest through `@angular/build:unit-test`, TypeScript ~6.0) are kept
instead of newer standalone releases (e.g. TypeScript 7) until Angular supports them.
