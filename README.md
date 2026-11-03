# AudioLab

**Local, privacy-first audio signal analyzer for the web and the desktop.**

AudioLab captures audio from your microphone, visualises it in real time and decodes signals –
starting with acoustic Morse code. Everything runs on your device: no server, no cloud, no
telemetry. The same Angular application ships as a web app and as a [Tauri 2](https://tauri.app)
desktop app for macOS, Windows and Linux.

> **Status: early development.** The Morse decoder works end to end in the browser; more modules
> follow – see [docs/ROADMAP.md](docs/ROADMAP.md).

<!-- Screenshots: replace with real captures once audio is connected (prompts/12). -->
<!-- ![Morse decoder](docs/images/morse-decoder.png) -->

## Features

| Module             | Status    |
| ------------------ | --------- |
| Morse Decoder      | Available |
| DTMF Decoder       | Available |
| Frequency Analyzer | Available |
| Spectrum Analyzer  | Available |
| Signal Monitor     | Available |
| Morse Encoder      | Available |
| Tone Generator     | Planned   |
| Audio Recorder     | Planned   |

**Morse decoder:** microphone or demo input, live waveform, level meter and key-down timeline,
automatic or fixed tone frequency, adaptive threshold and speed (WPM) detection, decoded Morse and
plain text, copy and reset. Unknown sequences are marked instead of guessed.

## Privacy

- Audio is processed locally and is never uploaded.
- The microphone is only opened after you press **Start** and is released when you stop or
  leave the view.
- Nothing is recorded or exported unless you explicitly ask for it.

Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Getting started

Prerequisites: Node.js 22.22+ or 24.15+, pnpm 10, and for the desktop app Rust (stable) plus the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS. See
[docs/BUILDING.md](docs/BUILDING.md).

```bash
pnpm install
pnpm start          # web app on http://localhost:1420
pnpm tauri:dev      # desktop app (Tauri 2) with live reload
```

Microphone access in browsers requires a secure context: `http://localhost` works for
development, deployed builds must be served over HTTPS.

## Development

```bash
pnpm test           # unit tests (Vitest via Angular CLI)
pnpm lint           # ESLint (Angular, TypeScript, template a11y, layer boundaries)
pnpm format:check   # Prettier
pnpm e2e            # Playwright end-to-end tests (Chromium)
pnpm check          # everything above except e2e, plus web build and Rust fmt/clippy/test
pnpm tauri:build    # desktop bundle for the current OS
```

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
Audio pipeline: [docs/AUDIO-PIPELINE.md](docs/AUDIO-PIPELINE.md) ·
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

The `prompts/` folder contains the step-by-step development roadmap as self-contained work
orders for coding assistants ([prompts/README.md](prompts/README.md)).

## Browser support

Current desktop versions of Chromium-based browsers, Firefox and Safari. AudioLab relies on
`getUserMedia`, the Web Audio API and `AudioWorklet`; unsupported environments get a clear
message instead of a broken page.

## License

[MIT](LICENSE) © 2026 Marc Kronberg
