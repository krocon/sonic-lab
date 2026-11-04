# Testing

All automated tests run without a microphone, without network access and without manual input.

| Layer               | Tool                                                                                 | Where                                       | Command                               |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------- |
| Unit                | Vitest (Angular `unit-test` builder, jsdom)                                          | `src/**/*.spec.ts`                          | `pnpm test`                           |
| Integration         | Vitest with fakes (`FakeAudioSource`, `SyntheticAudioSource`)                        | capture session, Morse session, Morse page  | `pnpm test`                           |
| Signal / robustness | Vitest with synthetic, impaired signals and CER limits                               | `src/app/decoders/morse/robustness.spec.ts` | `pnpm test:signals`                   |
| Coverage            | `@vitest/coverage-v8`, thresholds in `angular.json` (`test.configurations.coverage`) | `coverage/`                                 | `pnpm test:coverage`                  |
| End to end          | Playwright                                                                           | `e2e/`                                      | `pnpm e2e` (Chromium), `pnpm e2e:all` |
| Accessibility       | `@axe-core/playwright` (WCAG 2.1 AA), keyboard tests                                 | `e2e/accessibility.spec.ts`                 | part of `pnpm e2e`                    |
| Rust                | `cargo test`, `clippy -D warnings`, `fmt`                                            | `src-tauri/`                                | `pnpm rust:test` …                    |

`pnpm check` runs format, lint, unit tests, web build and the Rust checks.

## Synthetic signals

- `src/app/audio/synthesis/` – deterministic generators (sine, keyed tone, seeded noise, mix).
- `src/testing/signals/morse-signal.ts` – clean Morse at a given speed, frequency, amplitude, sample rate.
- `src/testing/signals/impaired-morse.ts` – noise at an SNR in a 500 Hz reference band (white or
  pink), QSB, clicks, bursts, on-frequency glitches, drift, timing jitter, weighting, Farnsworth,
  room reverberation (`room-reverb.ts`).
- `src/testing/signals/cer.ts` – character error rate.

New scenario: add a row to `SCENARIOS` in `robustness.spec.ts` with a CER limit you have
measured; never loosen an existing limit to make a change pass – improve the decoder or document
the trade-off in `docs/AUDIO-PIPELINE.md`.

## Real recordings (`morse-training/`)

Recordings with their reference text: `<name>.mp3|opus|m4a|…` plus `<name>.txt` (for
`<name>WPM.mp3`, `<name>.txt` also matches). `<` in a text is AR.

```bash
pnpm morse:convert   # ffmpeg → morse-training/wav/*.wav (16 bit mono, ≤ 16 kHz; git-ignored)
pnpm morse:corpus    # decoder over every WAV: CER, speed, frequency per file and overall
```

`morse:corpus` options: `--filter <name>`, `--rate 48000` (the app's rate), `--snr <dB>`
(broadband white noise), `--reverb <RT60 s> --wet <0..1> --room <n>` (simulated loudspeaker in a
room, `src/testing/signals/room-reverb.ts`), `--sensitivity low|medium|high`,
`--config '<json>'`, `--out <dir>` (decoded text and events), `--json`. Results depend strongly
on the simulated room – compare several `--room` values before drawing conclusions. A reference
text that paraphrases the QSO (e.g. subtitles) gives only a rough CER.

```bash
pnpm morse:sweep     # synthetic QSO text through simulated rooms: CER matrix (≈ 1 min)
```

`morse:sweep` sends a ≈ 200-character text (letters, digits, punctuation, prosigns) at 12, 18, 25,
30 and 40 WPM through RT60 0.3/0.6 s rooms with 25/50 % reverberant energy, six impulse responses
each, and prints the mean CER per cell, the number of rooms below 5 % and an overall score. The
keying is known exactly, so the numbers compare decoder versions directly. Options: `--speeds`,
`--rooms`, `--reverbs 0.3/0.25,0.6/0.5` (`0/0` = no reverb), `--snr <dB, 500 Hz>`, `--rate`,
`--frequency <Hz>` (tone; 712 is 12 Hz off the analysis bins), `--sensitivity`,
`--config '<json>'`, `--text`, `--json`, `--verbose` (decoded text per case). The experimental
room equalizer is measured with `--config '{"roomEqualizer":true}'` (sweep and corpus).

## Unit tests share modules – no module mocks

The Angular `unit-test` builder runs Vitest without isolation (`isolate: false`): spec files in a
worker share one module registry, and which files share a worker depends on their number and
duration. A `vi.mock()` of a module is therefore not seen by code that another spec loaded first –
it passes locally and fails in CI. Replace behaviour through objects instead:

- Tauri: `platform/tauri-bridge.ts` holds `invoke`/`isTauri`; specs use
  `vi.spyOn(tauri, 'invoke')` and `vi.restoreAllMocks()`.
- Audio output: the `createAudioContext` / `generatorContext` / `playbackContext` factories.
- Pages are driven through the front panel (`src/testing/front-panel.ts`): soft keys by name,
  transport keys, knobs, the message line.

## Microphone in E2E tests

`e2e/fixtures/fake-microphone.ts` replaces `getUserMedia` with a Web Audio generated
`MediaStream` (oscillator → gain → `MediaStreamDestination`), optionally keyed with a Morse
schedule. The app's real pipeline (`MediaStreamAudioSourceNode` → AudioWorklet → decoder) runs
unchanged. Chromium's `--use-fake-device-for-media-stream` is not used because headless browsers on
macOS cannot obtain the OS microphone permission and hang in `getUserMedia`.

## Coverage

Thresholds (global): statements 85 %, branches 75 %, functions 80 %, lines 88 %. Measured on
2026-11-03: lines 91.5 % overall, `audio/` 94 %, `decoders/` 95.5 %. Canvas drawing components
(`src/app/shared/visualization/*-canvas.ts`) are excluded from unit coverage because jsdom has no
canvas; they are exercised by the E2E tests (pixels of the waveform are checked, spectrum and
spectrogram are rendered). The robustness suite is excluded from the coverage
run because instrumentation makes it ~10× slower.

## Known gaps

- **Real recordings in CI:** the recordings in `morse-training/` are run by hand
  (`pnpm morse:corpus`), not by `pnpm test` – they need ffmpeg and take minutes. Short recordings
  with an exact transcript (not a paraphrase) would be good candidates for golden-file unit tests.
- **Firefox E2E** could not be launched in the local development sandbox; it runs green in CI
  (the job starts a PulseAudio null sink – runners have no sound card, and Firefox's Web Audio needs
  an output device). WebKit runs locally (29 tests incl. axe, 2 workers stable); the fake
  microphone patches `MediaDevices.prototype` because WebKit may return a fresh `MediaDevices`
  object, and the axe checks run with reduced motion so no colour is measured mid-transition.
- **Live microphone test** with a real speaker/microphone is manual.
