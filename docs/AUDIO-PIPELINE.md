# Audio pipeline

> **Status:** capture (prompt 02) is implemented; the Morse decoder sections describe the design
> for prompts 03–04 and are updated as they land.

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

## Morse decoding (prompts/03, hardened in 04)

1. Optional band-pass / Goertzel at the tone frequency (default 700 Hz, auto search 300–1500 Hz).
2. Envelope: energy per hop (5–10 ms).
3. Adaptive noise floor and signal level, threshold in between with hysteresis.
4. Mark/space detection, glitch suppression (pulses far shorter than one unit).
5. Duration measurement from sample counts (not wall clock).
6. Adaptive time unit (dit length), WPM by the PARIS standard (50 units per word).
7. Classification: dit/dah boundary ≈ 2 units, character gap ≈ 3, word gap ≈ 7 (configurable).
8. Translation with the ITU alphabet; unknown sequences are marked, never guessed.

Signal detection (1–7) and translation (8) are separate modules so that each can be tested in
isolation with synthetic signals.

## Testing approach

Deterministic synthetic signals (text, WPM, frequency, amplitude, sample rate, seeded noise,
fading, glitches, timing jitter) generated in `src/testing/signals/`. Quality metric: character
error rate (CER). See prompts/10.

## Known limits (expected)

- One Morse signal at a time; several simultaneous stations are out of scope.
- Very low SNR (< 0 dB) and heavy fading will degrade results.
- Browser and OS input processing that cannot be disabled (some devices, Bluetooth headsets)
  may affect detection.
