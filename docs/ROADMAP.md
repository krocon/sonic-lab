# Roadmap

Work orders live in [`prompts/`](../prompts/README.md); all of 00–12 have been executed.

## Done

- **Foundation:** Angular 22 + Tauri 2 from one codebase, design tokens, light/dark theme,
  navigation, platform adapters, status bar (00, 01).
- **Audio:** microphone capture via AudioWorklet, device handling, waveform and level meter,
  synthetic/demo inputs (02).
- **Morse decoder** with robustness work and measured CER per scenario (03, 04).
- **Quality:** coverage thresholds, accessibility checks, cross-browser E2E, CI (10).
- **Desktop:** permission policy, Linux media streams, window state, shortcuts (09).
- **Modules:** Morse encoder (05), frequency/spectrum analyzer and signal monitor (06), DTMF
  decoder (07), tone generator and recorder with export (08).
- **Releases:** version sync, draft releases for macOS/Windows/Linux/web, checksums (11).
- **Documentation and community files** (12). License: MIT.

## Needs verification

- Microphone capture and file export in the **desktop app** on macOS (interactive check), Windows
  and Linux (no machines available so far) – see the table in [PRIVACY.md](PRIVACY.md).
- Morse and DTMF decoding with **real recordings** (golden files) – the measured numbers come from
  synthetic, impaired signals.
- The CI and release workflows on GitHub (they have not run yet).

## Ideas

- Manual keying (straight key / paddle via keyboard or mouse) with a practice mode
- Decode audio files (WAV) instead of the microphone
- RTTY / PSK31 / SSTV decoders
- Signed and notarised builds, auto-update
- Localisation (German UI)

## Open decisions

- **Repository name.** The working directory is `sonic-lab`; product, package and crate are
  named `audiolab`, bundle identifier `io.github.krocon.audiolab`, homepage
  `https://github.com/krocon/audiolab`. Adjust before the first public release if the repository
  gets a different name.
- **Code signing** for macOS and Windows (certificates and secrets).
