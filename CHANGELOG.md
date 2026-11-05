# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project foundation: Angular 22 (standalone, zoneless, signals, strict TypeScript) and
  Tauri 2 desktop shell from one codebase.
- App shell with module navigation, placeholder pages for planned modules and a layout preview
  of the Morse decoder workspace.
- Design tokens (CSS custom properties).
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

- Frequency analyzer (dominant frequency, note and cents, stability, 10 s history), spectrum
  analyzer (FFT 1024–16384, Hann/Blackman-Harris, log/linear axis, averaging, peak hold,
  spectrogram) and signal monitor (RMS/peak, clipping warning, dominant frequency, 30 s history);
  own FFT with tests; analysis demo input (gliding tone).

- DTMF decoder: decimation with a Butterworth anti-alias filter, windowed Goertzel bank with
  frequency estimation, ITU-style validation (frequency tolerance, twist, group separation, tone
  energy ratio), debounced key events; keypad UI with tone levels, copy and reset; DTMF demo input.

- Tone generator (sine, square, triangle, sawtooth, white/pink noise, linear/log sweep, two-tone,
  DTMF; level ≤ −3 dBFS with fades, balance) and audio recorder (in memory, 10-minute limit,
  playback, WAV export 16-bit/32-bit float, discard). Export through a platform adapter: file
  picker/download on the web, native save dialog via the `export_file` command on the desktop.

- Release automation: version sync script (package.json ↔ Cargo.toml/Cargo.lock), CHANGELOG cut
  and release notes, tag-triggered draft releases with macOS universal, Windows and Linux bundles,
  web zip, optional GitHub Pages and optional macOS signing, SHA-256 checksums; actions pinned to
  commit SHAs.

- Documentation: README with real screenshots (`pnpm screenshots`), updated architecture and
  roadmap, code of conduct, security policy, issue and pull-request templates.
- Morse decoder log: soft key VIEW switches between the live display and a log of everything
  decoded, one line per transmission with time and speed (a pause of 6 s, a capture restart or
  RESET starts a new line). In the log view COPY copies the log, SAVE writes it to a `.txt` file
  and CLEAR empties it. The log lives in memory only and survives switching modes.
- `pnpm morse:sweep`: synthetic Morse through simulated rooms (RT60, reverberant share, six
  impulse responses) at 12–40 WPM, CER matrix and score for comparing decoder versions.
- Morse decoder room mode, experimental and off by default (soft key ROOM in the live view,
  persisted): a room equalizer for Morse from a loudspeaker in a reverberant room. It learns the
  room's complex response from the signal and detects the keying from the tone's phase as well
  as its level, so rooms whose reverberation cancels the direct sound – where whole characters
  merged into one mark – decode again. The display shows "Room mode", lit as "Room active" once
  the room is learned (after ≈ 5–10 s of Morse). The tone detector now also reports the complex
  amplitude.

### Changed

- The app is now called Sonic Lab: nameplate, window and page titles, desktop product name, the
  demo transmission and the encoder's default text (`CQ CQ DE SONIC LAB K`), release titles, the
  web build archive (`sonic-lab-web-<version>.zip`), exported files (`sonic-lab-<time>.wav`,
  `sonic-lab-morse-log-<time>.txt`) and the documentation. Package names, bundle identifier and
  settings keys keep `audiolab`, so saved settings and window state survive.

- New front panel: a transceiver with a large OLED. Eight F keys under the display choose the
  module, six soft keys next to it carry the module's settings and actions (legends in the
  display), and a fixed control panel holds TONE/SPEED/LEVEL knobs, a keypad 0–9 with CLR/ENT,
  INPUT, ▶ ■ ●, a MULTI jog dial and MENU/COPY/ESC. Only the display grows with the window;
  below 1180 × 720 the whole device scales down. Soft-key values take keypad entries (ENT) and
  the MULTI dial; the Morse encoder accepts multi-tap text from the keypad. INPUT and MENU open
  lists in the display. Replaces the mode-key row, the LCD panels, key selectors, knobs and
  capture controls of the previous design (ADR-013).
- The window is now the front panel of an SDR transceiver: a row of mode keys with LEDs replaces
  the sidebar navigation; the nameplate, the page titles and the status bar are gone (each module
  shows its own capture state). The window is one black metal faceplate (9-slice image);
  sections are transparent with engraved outlines, 1px apart, and fill the window; displays are
  backlit blue-grey LCDs; keys and knobs cast shadows; red LEDs and a blue accent; an analog VU
  meter.
- Hardware controls everywhere: latching key selectors (ARIA radio groups) replace drop-downs
  and the peak-hold checkbox; machined rotary knobs with a lit scale arc replace all sliders
  (Morse decoder, Morse encoder, tone generator); the tone generator has a tuning dial and a
  frequency display.
- Dark only: the light (aluminium) finish and the theme toggle are gone; the UI ignores the
  system theme.
- No overview page: the app opens in the Morse decoder; unknown paths lead there too.
- Morse decoder: the start speed is set with the SPEED knob; its soft key in the live view now
  switches the room mode.

### Fixed

- Morse decoding through a loudspeaker in a reverberant room: elements whose gap stays above the
  off-threshold started late (dahs read as dits) or not at all – a fast 4 dB rise now starts
  them; tail swells right after a key-up no longer start pseudo-marks once the speed is known; one
  stray short gap no longer drags the speed estimate up (a 30 WPM recording was read at 44–50 WPM).
  Simulated-room score 44 → 35 % CER, W1AW recordings in a RT60 0.3 s room 5.1 → 3.1 %; clean
  and noisy recordings unchanged.
- Insufficient colour contrast of secondary text and the light accent colour (WCAG AA).
- Keyboard focus was lost while the microphone permission was requested (button got disabled).
- The selected input device was not restored in WebKit when the device list loaded late.
- Safari/WebKit refused to start capture ("access denied") because the AudioContext was created
  after awaiting `getUserMedia`, outside the user gesture; it is now created first.
- Desktop app rendered without component styles: Tauri added hashes for the inlined critical CSS
  to `style-src`, which disables `'unsafe-inline'` and blocked Angular's component `<style>`
  elements. Style-src is no longer modified, critical CSS is no longer inlined; an E2E test loads
  the production build under the desktop CSP.
- Firefox kept audio processing suspended without error and the app waited forever; capture now
  reports "audio blocked" after 2 s instead.
- The level meter (`role="meter"`) could lack `aria-valuenow`; it is now a bound, throttled
  attribute with a value text, covered by a unit test.
- Audio blocks were dropped when the main thread was busy for more than ~0.3 s (slow machines,
  heavy rendering); the capture buffer now holds ~1.4 s and the demo input catches up for ~5 s.
- Export file names: directory parts with `\` were only stripped on Windows.
- Tone generator: a restart reported "stopped" while the new signal was playing, and Stop during
  a restart was ignored.
