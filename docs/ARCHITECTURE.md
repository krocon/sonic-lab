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
│ Application    src/app/core/*                                 │  module catalog, capture
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
│   ├── shell/               front panel: OLED with soft keys and F keys, outlet; display/
│   │                        (value pop-up, INPUT/MENU sheets); hardware/ (control panel,
│   │                        knobs, MULTI dial)
│   ├── core/
│   │   ├── modules/         AnalysisModule type + module catalog (single source of truth)
│   │   ├── panel/           FrontPanel: what keys, knobs and the dial do on the current page
│   │   ├── capture/         CaptureSession, capture providers, demo signals
│   │   ├── settings/        SettingsStore (versioned JSON in localStorage, never throws)
│   │   └── status/          StatusMessage + mapping of audio states/errors to user text
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
│   ├── features/            one folder per page: morse-decoder, morse-encoder,
│   │                        dtmf-decoder, frequency-analyzer, spectrum-analyzer,
│   │                        signal-monitor, tone-generator, audio-recorder, module-placeholder
│   └── shared/              icons, canvas visualisations
├── worklets/                AudioWorklet processors (TypeScript, bundled by scripts/build-worklets.mjs)
├── testing/                 fakes and impaired-signal generators for tests (not in the app build)
└── styles/                  tokens.css (design tokens), base.css (elements), hardware.css
                             (keys, LEDs, silkscreen), oled.css (building blocks of the screens)
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

### ADR-012 – SDR front-panel design, dark only

_Superseded by ADR-013._

The window imitates the front panel of an SDR transceiver instead of a web page. The shell is a
top row with the mode keys (grouped under printed brackets) and a speaker grille, and below it
the workspace of the selected module. There is no overview page, nameplate or status bar: `/`
redirects to the Morse decoder, the lit mode key names the module (its `<h1>` is visually
hidden), and each module shows its own capture state. Mode keys are router links with a short
legend from the module catalog (`AnalysisModule.key`) and the full module name as their
accessible name.

Controls are hardware, not form widgets:

- **Keys** (`.btn`): black keycaps with a skirt, a cast shadow and an indicator LED;
  `aria-pressed` latches the key down and lights the LED red; a primary key shows a blue ready
  LED. The accent (knob arcs, selected legends) is blue.
- **Key selectors** (`shared/controls/key-selector.ts`): one-of-many choices as joined keys or a
  keypad, an ARIA radio group with roving tab stop and arrow keys. They replace `<select>` for
  every fixed set of options; only the input-device list (dynamic) stays a drop-down.
- **Knobs** (`shared/controls/knob.ts`): knurled skirt and index turn, the light on the machined
  cap stays put, a scale arc lights up to the value, and the knob casts a shadow down and to the
  right; `variant="dial"` is a large tuning dial with a ribbed ring, a spun-metal disc and a
  finger dimple. ARIA slider, drag/wheel/keyboard, optional log scale and value format. They
  replace every `input[type=range]`.
- **Displays** (`.lcd`, `--display-*` tokens): backlit blue-grey LCDs with dark segments behind
  a black frame; canvases read the same tokens. The VU meter
  (`shared/visualization/analog-meter.ts`) is decorative and `aria-hidden`.

The whole window is one faceplate: `shell/faceplate.png`, cut from a reference rendering into a
9-slice image (side edges and bottom lip keep their size, the plate stretches) and drawn as the
shell's `border-image`. The reference's top rail and top edge are cut out – the plate starts
under the title bar with its light band fading in – the corners are square (the bottom lip runs
straight to both sides), and the left edge is the mirrored right edge so the slices meet without
a seam. Sections have no surface of their own, only an engraved outline
(`--section-line`), and sit 1px apart (`--groove`). Module pages fill the workspace height.
Everything else is CSS custom properties, gradients and inline SVG – no other images, no fonts or
UI libraries. There is a single dark finish (`color-scheme: dark`), independent of
`prefers-color-scheme`, like real equipment; this replaced the graphite/aluminium themes and the
theme toggle. Contrast is verified by the axe E2E checks on every module.

### ADR-013 – Transceiver with an OLED: constant hardware, flexible display

The front panel follows a transceiver with a large display; the look was agreed on an HTML
mockup built from a reference photo and a template. All hardware is
always present and never changes size or place; only the OLED adapts to the mode and grows with
the window. Below 1180 × 720 the whole device is zoomed out instead of reflowing.

- **Display** (`shell/`): a true-black OLED behind glass – status line (module, input, capture
  or output state as a live region), the module's screen (a size container: text scales with
  `cqh`/`cqw`), a message line for results and errors, the legends of the six soft keys on the
  right and the eight F-key legends with DECODE / ANALYZE / GENERATE · RECORD brackets at the
  bottom. Emissive colours: white, cyan, amber, green, red (`--oled-*`); canvases read the
  `--display-*` tokens.
- **Hardware**: six soft keys right of the glass, F1–F8 below it (router links named after the
  modules), and a fixed 300 px control panel (`shell/hardware/`) with the TONE, SPEED and LEVEL
  knobs, a keypad 0–9 with CLR/ENT (purple letter tags: multi-tap text entry in the Morse
  encoder), INPUT, ▶ ■ ●, the MULTI jog dial and MENU, COPY, ESC. Everything is drawn in CSS – photo
  crops of the reference were too soft (it is only 927 px wide) and come from a product photo.
- **Binding** (`core/panel/front-panel.ts`): a page describes what the hardware does for it with
  `attachPanel({...})` – soft keys as choices (step through options), values (selected for the
  MULTI dial and keypad entry, ENT applies) or actions; knobs as values; ▶/■ from its
  `CaptureSession` or its own play/stop/record keys; COPY, digits, CLR, its output state and
  messages. Unused keys stay in place and are `aria-disabled` (focusable, ignored), so focus is
  never lost when a key has nothing to do. Pages keep only what they show; the controls moved out
  of them (key selectors, knobs and capture controls are gone).
- Accessibility: soft keys are named after their setting ("Tone frequency: AUTO"), values are
  toggle buttons while selected, knobs and the dial are ARIA sliders, INPUT and MENU open dialogs
  that ESC closes. Verified by the axe E2E checks on every module.

### ADR-006 – Tooling versions

Angular CLI defaults (Vitest through `@angular/build:unit-test`, TypeScript ~6.0) are kept
instead of newer standalone releases (e.g. TypeScript 7) until Angular supports them.
