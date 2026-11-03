# Roadmap

Detailed work orders live in [`prompts/`](../prompts/README.md).

## Done

- **License:** MIT (decided 2026-11-03).
- **Foundation (prompt 00):** Angular 22 + Tauri 2, tooling, app shell, design tokens,
  light/dark theme, module navigation, platform adapter, status bar, docs.

## Next – MVP: Morse decoder

1. Architecture contracts: AudioSource, AudioFrame, SignalDecoder, capture session, settings
   (prompt 01).
2. Microphone capture via AudioWorklet, lifecycle, waveform and level meter, synthetic source
   (prompt 02).
3. First working Morse decoder with synthetic signal tests (prompt 03).
4. Robustness: adaptive thresholds, noise, WPM estimation, glitches (prompt 04).
5. Test hardening and CI (prompt 10), desktop microphone verification (prompt 09).

## Later

- Morse encoder with audio output (prompt 05)
- Frequency analyzer, spectrum analyzer, signal monitor (prompt 06)
- DTMF decoder (prompt 07)
- Tone generator, audio recorder with local export (prompt 08)
- Release automation for macOS, Windows, Linux and the web (prompt 11)

## Ideas (not scheduled)

- Manual keying (straight key / paddle via keyboard or mouse) with practice mode
- RTTY / PSK31 / SSTV decoders
- Audio file input (decode a WAV instead of the microphone)
- Localisation (German UI)

## Open decisions

- **Repository name.** The working directory is `sonic-lab`; product, package and crate are
  named `audiolab`, bundle identifier `io.github.krocon.audiolab`. Adjust before the first
  release if the GitHub repository gets a different name.
