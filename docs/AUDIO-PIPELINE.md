# Audio pipeline

> **Status:** design document. Nothing below is implemented yet; prompts 02–04 build it and
> must update this file with the actual parameters and measured results.

## Capture (prompts/02)

1. `getUserMedia` with `echoCancellation`, `noiseSuppression` and `autoGainControl` **disabled**
   – browser voice processing distorts tones and keying envelopes.
2. `AudioContext` (sample rate of the device, never assumed) → `MediaStreamAudioSourceNode` →
   `AudioWorkletNode`.
3. The worklet collects 128-sample render quanta into blocks (e.g. 1024 samples) and posts them
   as transferable buffers to the main thread (buffer pool, no per-block allocation).
4. A ring buffer feeds decoders and visualisations; visualisations draw on
   `requestAnimationFrame`, decoders run per block.

No `ScriptProcessorNode` (deprecated). The worklet is built from TypeScript by a small script,
not via a Blob URL (CSP).

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
