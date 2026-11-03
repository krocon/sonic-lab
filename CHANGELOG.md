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
