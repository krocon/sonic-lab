# Audio pipeline

> **Status:** capture (prompt 02), the Morse decoder (prompt 03) and its robustness work
> (prompt 04) are implemented.

## Capture (implemented)

```text
getUserMedia ──▶ MediaStreamAudioSourceNode ──▶ AudioWorkletNode "audiolab-capture" ──▶ destination (silent)
  (no AEC/NS/AGC)        (AudioContext, device rate)        │ 128-sample quanta → 1024-sample mono blocks
                                                             ▼ postMessage(buffer, [buffer])  (transfer, zero-copy)
                                       BrowserMicrophoneSource → AudioFrame → CaptureSession → consumers
                                                             ▲ recycle message returns the buffer to the pool
```

| Parameter                    | Value                                                                        | Where                               |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| Voice processing             | `echoCancellation`, `noiseSuppression`, `autoGainControl` = false            | `browser-microphone-source.ts`      |
| Channels                     | mixed to mono in the worklet                                                 | `src/worklets/capture-processor.ts` |
| Block size                   | 1024 samples (≈ 21 ms at 48 kHz)                                             | `MICROPHONE_BLOCK_SIZE`             |
| Buffer pool                  | 16 blocks; on exhaustion blocks are dropped and an `overrun` message is sent | worklet                             |
| Sample rate                  | whatever the `AudioContext` reports                                          | never assumed                       |
| Latency (capture → consumer) | one block + message hop, typically 25–40 ms                                  | –                                   |

- `AudioFrame.samples` is a view on the transferred buffer and valid only during the listener
  call (ADR-007). The buffer is returned to the worklet right after all consumers ran.
- The worklet is TypeScript in `src/worklets/`, bundled by `scripts/build-worklets.mjs` (esbuild)
  to `public/worklets/capture-processor.js` and loaded from the same origin – no Blob URL, so the
  CSP keeps `script-src 'self'`. `ScriptProcessorNode` is not used (deprecated).
- Device loss (`track.onended`) switches the source to `error/device-lost` and releases everything.
- `SyntheticAudioSource` produces the same frames from deterministic generators
  (`src/app/audio/synthesis/`) for tests and the "Demo signal" input.

### Visualisation

`WaveformCanvas` and `LevelMeterBar` read from a `RingBuffer` / `LevelMeter` on
`requestAnimationFrame`. They never write signals, so 47 frames/s of audio cause no change
detection. The waveform draws min/max per pixel column (16384-sample window ≈ 0.34 s at 48 kHz).

## Morse decoding (implemented)

`src/app/decoders/morse/`, wired to the UI by `features/morse-decoder/morse-session.ts`.

```text
frames ─▶ ToneDetector ─▶ EnvelopeSmoother ─▶ KeyingDetector ─▶ TimingDecoder ─▶ alphabet ─▶ events
          Goertzel bank    moving average      noise/signal       adaptive unit,
          2-hop Hann       ≈ 0.4 unit          tracking, SNR      glitch merging,
          windows, keyed-                      gate, hysteresis   adaptive word gap,
          bin tracking                                            deferred decisions
```

| Stage            | What it does                                                                                                                                                                                                                                                                                                   | Defaults                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ToneDetector`   | Goertzel filters every 50 Hz in 300–1500 Hz (auto) or at f ± 50 Hz (manual). Windows are two hops long, Hann-weighted, 50 % overlap → one amplitude per hop. Auto mode tracks the bin that is most often the strongest (switches only at 1.5× score).                                                          | hop 6 ms, window 12 ms (≈ 125 Hz bandwidth), sidelobes −31 dB                                  |
| `KeyingDetector` | Noise = mean envelope of clear key-up hops; signal = peak follower (attack 10 ms, release 2 s). A tone counts only if signal ≥ `minSnr` × noise. Key-down above `noise + onRatio·(signal−noise)`, key-up below `offRatio`. Changes must persist `minElementMs`; the boundary is placed where the change began. | onRatio 0.5, offRatio 0.3, minSnr 4 (12 dB), minElementMs 10                                   |
| `TimingDecoder`  | Clusters recent mark and space durations (2-means on log scale) to estimate the unit (dit length). Until the estimate is confident, segments are buffered and re-classified; afterwards a character is committed as soon as its following gap exceeds the character threshold.                                 | history 24, dah ≥ 2 units, char gap ≥ 2, word gap ≥ 5, flush after 1.5 s silence, prior 20 WPM |
| Alphabet         | ITU letters, digits, punctuation, prosigns (`<SK>`, `<KN>`, …). Unknown sequences → `�` + raw code.                                                                                                                                                                                                            | –                                                                                              |

WPM = 1.2 s / unit (PARIS standard). The UI shows it only once the estimate is confident.

Sensitivity presets (`morse-settings.ts`): low = onRatio 0.55 / minSnr 3.5 / glitch 14 ms,
medium = 0.5 / 2.5 / 10 ms, high = 0.45 / 2.2 / 10 ms (offRatio 0.35 / 0.3 / 0.3).

### Verified with synthetic signals (`morse-decoder.spec.ts`)

- Exact decoding of SOS, PARIS, all letters and digits, punctuation and prosigns at 5, 15, 25
  and 40 WPM; 500/700/850/1000 Hz; 44.1 and 48 kHz; amplitudes 0.02–0.95.
- No characters from pure white noise (rms 0.001–0.1, 8 s), no invented elements in a 1.5 s noisy
  lead-in.
- Two simultaneous stations 600 Hz apart are separated by a fixed frequency.
- Unknown codes (e.g. seven dits) are reported, not guessed.

### Robustness (prompt 04)

Realistic signals come from `src/testing/signals/impaired-morse.ts` (seeded): white or pink
noise at an SNR measured in a **500 Hz reference bandwidth** around the tone, QSB, broadband
clicks, off-frequency bursts, 5 ms on-frequency glitches, linear drift, timing jitter, weighting
and Farnsworth spacing. Quality metric: character error rate (CER, Levenshtein, whitespace
normalised). `robustness.spec.ts` runs every scenario with 3 seeds on a 90-character QSO text.

| Scenario                                  | Baseline (after prompt 03) | After prompt 04 | Limit in test      |
| ----------------------------------------- | -------------------------- | --------------- | ------------------ |
| clean / SNR 20 / SNR 10 dB, 20 WPM        | 0 %                        | 0 %             | 0 / 0 / 2 %        |
| SNR 6 dB, 20 WPM                          | 137 %                      | 0.7 %           | 5 %                |
| SNR 3 dB, 15 WPM (default sensitivity)    | 94 %                       | 16 %            | 20 %               |
| SNR 3 dB, 15 WPM, sensitivity _high_      | –                          | 1.5 %           | 10 %               |
| pink noise, SNR 10 dB                     | 0 %¹                       | 1.1 %           | 3 %                |
| QSB 10 dB / 3 s, SNR 20 dB                | –                          | 0 %             | 5 %                |
| QSB 20 dB / 4 s, SNR 15 dB (trough −5 dB) | 58 %                       | 50 %            | 60 % (known limit) |
| clicks 2/s · off-frequency bursts 3/s     | 0 %                        | 0 %             | 3 %                |
| on-frequency glitches 1/s                 | 12 %                       | 0 %             | 5 %                |
| drift +60 Hz · weight 1:4 / 1:2.5         | 0 %                        | 0 %             | 2–3 %              |
| hand keying ±15 % / ±25 %                 | 0 %                        | 0 %             | 3 / 8 %            |
| Farnsworth 18/8 WPM                       | 50 %                       | 2.2 %           | 3 %                |
| 35 WPM / 8 WPM                            | 0 %                        | 0.7 % / 0 %     | 3 / 2 %            |

¹ The first pink-noise generator was miscalibrated (in-band noise ≈ 8 dB too high); the
baseline row uses the corrected generator.

Additional checks: a tempo change 15 → 30 WPM is followed within 10 characters; a 5-minute
transmission decodes with CER ≤ 0.5 % and a stable speed estimate; pure noise (8 s, several
levels, also with sensitivity _high_) produces no characters; one second of 48 kHz audio takes a
few milliseconds (test limit 25 ms for slow CI machines).

What did not help (kept out): a per-bin whitening of the auto-frequency search, a median
noise floor, a longer smoothing window (0.5 unit) and a faster signal release while key-up.

## Testing approach

Deterministic synthetic signals (text, WPM, frequency, amplitude, sample rate, seeded noise,
fading, glitches, timing jitter) generated in `src/testing/signals/`. Quality metric: character
error rate (CER). See prompts/10.

## Known limits

- One Morse signal at a time. With a fixed frequency two stations ≥ 600 Hz apart are separated;
  closer stations and pile-ups are out of scope.
- Below ≈ 3 dB SNR (500 Hz) the default sensitivity misses elements; _high_ helps down to ≈ 3 dB,
  below 0 dB decoding is unreliable. Deep fading that takes the signal below the noise loses
  those parts.
- The first one or two characters of a transmission can be wrong while speed and frequency are
  learned (especially with Farnsworth spacing or coloured noise).
- The test signals are synthetic; real recordings (prompts/10) are needed to confirm the numbers.
- Browser and OS input processing that cannot be disabled (some devices, Bluetooth headsets)
  may affect detection.
