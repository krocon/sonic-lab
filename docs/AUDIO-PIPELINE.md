# Audio pipeline

> **Status:** capture (prompt 02) and the Morse decoder (prompt 03) are implemented.

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
frames ─▶ ToneDetector ─▶ KeyingDetector ─▶ TimingDecoder ─▶ alphabet ─▶ events (character, word-gap, wpm)
          Goertzel bank    noise/signal      adaptive unit,
          2-hop Hann       tracking,         deferred decisions
          windows          hysteresis,
                           glitch filter
```

| Stage            | What it does                                                                                                                                                                                                                                                                                                   | Defaults                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ToneDetector`   | Goertzel filters every 50 Hz in 300–1500 Hz (auto) or at f ± 50 Hz (manual). Windows are two hops long, Hann-weighted, 50 % overlap → one amplitude per hop. Auto mode tracks the bin that is most often the strongest (switches only at 1.5× score).                                                          | hop 6 ms, window 12 ms (≈ 125 Hz bandwidth), sidelobes −31 dB                                  |
| `KeyingDetector` | Noise = mean envelope of clear key-up hops; signal = peak follower (attack 10 ms, release 2 s). A tone counts only if signal ≥ `minSnr` × noise. Key-down above `noise + onRatio·(signal−noise)`, key-up below `offRatio`. Changes must persist `minElementMs`; the boundary is placed where the change began. | onRatio 0.5, offRatio 0.3, minSnr 4 (12 dB), minElementMs 10                                   |
| `TimingDecoder`  | Clusters recent mark and space durations (2-means on log scale) to estimate the unit (dit length). Until the estimate is confident, segments are buffered and re-classified; afterwards a character is committed as soon as its following gap exceeds the character threshold.                                 | history 24, dah ≥ 2 units, char gap ≥ 2, word gap ≥ 5, flush after 1.5 s silence, prior 20 WPM |
| Alphabet         | ITU letters, digits, punctuation, prosigns (`<SK>`, `<KN>`, …). Unknown sequences → `�` + raw code.                                                                                                                                                                                                            | –                                                                                              |

WPM = 1.2 s / unit (PARIS standard). The UI shows it only once the estimate is confident.

Sensitivity presets (`morse-settings.ts`): low = onRatio 0.55 / minSnr 6 / glitch 14 ms,
medium = 0.5 / 4 / 10 ms, high = 0.45 / 3 / 8 ms.

### Verified with synthetic signals (`morse-decoder.spec.ts`)

- Exact decoding of SOS, PARIS, all letters and digits, punctuation and prosigns at 5, 15, 25
  and 40 WPM; 500/700/850/1000 Hz; 44.1 and 48 kHz; amplitudes 0.02–0.95.
- No characters from pure white noise (rms 0.001–0.1, 8 s), no invented elements in a 1.5 s noisy
  lead-in.
- Two simultaneous stations 600 Hz apart are separated by a fixed frequency.
- Unknown codes (e.g. seven dits) are reported, not guessed.

Robustness against low SNR, fading, glitches, drift and sloppy timing is the subject of
prompt 04.

## Testing approach

Deterministic synthetic signals (text, WPM, frequency, amplitude, sample rate, seeded noise,
fading, glitches, timing jitter) generated in `src/testing/signals/`. Quality metric: character
error rate (CER). See prompts/10.

## Known limits (expected)

- One Morse signal at a time; several simultaneous stations are out of scope.
- Very low SNR (< 0 dB) and heavy fading will degrade results.
- Browser and OS input processing that cannot be disabled (some devices, Bluetooth headsets)
  may affect detection.
