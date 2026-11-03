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
  pink), QSB, clicks, bursts, on-frequency glitches, drift, timing jitter, weighting, Farnsworth.
- `src/testing/signals/cer.ts` – character error rate.

New scenario: add a row to `SCENARIOS` in `robustness.spec.ts` with a CER limit you have
measured; never loosen an existing limit to make a change pass – improve the decoder or document
the trade-off in `docs/AUDIO-PIPELINE.md`.

## Microphone in E2E tests

`e2e/fixtures/fake-microphone.ts` replaces `getUserMedia` with a Web Audio generated
`MediaStream` (oscillator → gain → `MediaStreamDestination`), optionally keyed with a Morse
schedule. The app's real pipeline (`MediaStreamAudioSourceNode` → AudioWorklet → decoder) runs
unchanged. Chromium's `--use-fake-device-for-media-stream` is not used because headless browsers on
macOS cannot obtain the OS microphone permission and hang in `getUserMedia`.

## Coverage

Thresholds (global): statements 85 %, branches 75 %, functions 80 %, lines 88 %. Measured on
2026-11-03: lines 91.5 % overall, `audio/` 94 %, `decoders/` 95.5 %. Canvas drawing code is only
exercised by E2E tests (jsdom has no canvas). The robustness suite is excluded from the coverage
run because instrumentation makes it ~10× slower.

## Known gaps

- **Real recordings (golden files):** no recordings with a known transcript are in the repository
  yet. Contributions welcome: short (< 30 s), self-recorded or public-domain WAVs plus the
  expected text under `test-data/`, with the licence noted next to the file.
- **Firefox E2E** could not be launched in the local development sandbox (browser process start
  fails); it runs in CI. WebKit runs locally but is flaky with more than two parallel workers
  (concurrent AudioContexts), so CI uses two workers.
- **Live microphone test** with a real speaker/microphone is manual.
