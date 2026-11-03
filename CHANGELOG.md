# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project foundation: Angular 22 (standalone, zoneless, signals, strict TypeScript) and
  Tauri 2 desktop shell from one codebase.
- App shell with module navigation, overview page, placeholder pages for planned modules and a
  layout preview of the Morse decoder workspace.
- Design tokens (CSS custom properties) with light and dark theme, theme toggle.
- Platform adapter (browser / Tauri) and status bar showing runtime, secure context and
  microphone API availability.
- Tauri command `platform_info`, least-privilege capability (`core:default` only), CSP, macOS
  microphone usage description and audio-input entitlement.
- Tooling: ESLint (incl. layer-boundary rule), Prettier, Vitest, Playwright, Rust fmt/clippy/test,
  `pnpm check`.
- Documentation and the follow-up prompt roadmap in `prompts/`.
- MIT license.
- Architecture contracts: `AudioFrame`, `AudioSource` (state union, error kinds),
  `SignalDecoder`, `CaptureSession`, `SettingsStore`, status messages and status banner;
  stricter layer-boundary lint rules.
- Microphone capture via AudioWorklet (voice processing off, transferable buffer pool), device
  selection with persistence, device-change and device-loss handling, release on stop / page
  leave / `pagehide`, clear error messages.
- Synthetic audio source and deterministic signal generators; "Demo signal" input.
- Live waveform (min/max per pixel) and RMS/peak level meter outside change detection; status bar
  shows whether a microphone is open.
- Morse decoder: Goertzel tone detection (auto/fixed frequency), adaptive noise/signal tracking
  with hysteresis and glitch filter, adaptive time unit with deferred decisions, ITU alphabet with
  prosigns, unknown-code marking, WPM; UI with key-down timeline, settings (persisted), copy and
  reset; the demo input now sends a Morse message.
- Morse robustness: envelope smoothing matched to the unit, keyed-bin frequency tracking (robust
  against coloured noise), SNR start gate, fading-aware signal level, unit-relative glitch merging,
  bias-free speed estimate, learned word gaps (Farnsworth), tempo changes; realistic impaired test
  signals with CER metrics; signal-above-noise readout and "Advanced" setting for the expected
  speed.
- Quality: coverage thresholds, component tests for all pages, axe accessibility checks (light and
  dark), keyboard tests, Firefox/WebKit E2E projects, CI workflow (frontend, signal suite, E2E
  matrix, Rust on Linux/macOS/Windows), docs/TESTING.md.

- Desktop: explicit webview permission policy (microphone only), WebKitGTK media streams enabled
  on Linux, window position/size restored (validated against monitors), keyboard shortcuts
  Space (start/stop) and Ctrl/⌘+K (reset).

- Morse encoder: text → Morse with live preview, unsupported characters flagged, audible playback
  scheduled on the audio clock (ramped, click-free), Farnsworth spacing, tone and volume, current
  character highlighted, copy code; shared synthesis for encoder, demo and tests; round-trip tests.

### Fixed

- Insufficient colour contrast of secondary text and the light accent colour (WCAG AA).
- Keyboard focus was lost while the microphone permission was requested (button got disabled).
- The selected input device was not restored in WebKit when the device list loaded late.
