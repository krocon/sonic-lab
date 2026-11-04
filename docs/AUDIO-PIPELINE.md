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

| Stage            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Defaults                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ToneDetector`   | Goertzel filters every 50 Hz in 300–1500 Hz (auto) or at f ± 50 Hz (manual). Windows are two hops long, Hann-weighted, 50 % overlap → one amplitude per hop. Auto mode prefers bins whose envelope looks keyed (std/mean > 0.75) and that are spectral peaks – the skirts of a reverberant tone can look more keyed than the tone itself – and switches only at 1.5× score. A switch drops the running mark (it belonged to the old signal, e.g. hum).                                                                                                                                                                                                                                                                                          | hop 6 ms, window 12 ms (≈ 125 Hz bandwidth), sidelobes −31 dB                                  |
| `KeyingDetector` | Noise = mean envelope of clear key-up hops; signal = peak follower (attack 10 ms, release 2 s). A tone counts only if signal ≥ `minSnr` × noise. Key-down above `noise + onRatio·(signal−noise)`, key-up below `offRatio` – or when the level drops 6 dB below the running peak of the mark (element gaps that never reach the noise floor: speaker ringing, room reverberation). In the tail after such a key-up only a rise out of the gap minimum, within 10 dB of recent marks, starts the next mark: 8 dB above the valley, or 4 dB within one settling time from half a unit on. Once the speed is known, no key-down within half a unit of a key-up. Changes must persist `minElementMs`; the boundary is placed where the change began. | onRatio 0.5, offRatio 0.3, minSnr 4 (12 dB), minElementMs 10                                   |
| `TimingDecoder`  | Clusters recent mark and space durations (2-means on log scale) to estimate the unit (dit length). Until the estimate is confident, segments are buffered and re-classified; afterwards a character is committed as soon as its following gap exceeds the character threshold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | history 24, dah ≥ 2 units, char gap ≥ 2, word gap ≥ 5, flush after 1.5 s silence, prior 20 WPM |
| Alphabet         | ITU letters, digits, punctuation, prosigns (`<SK>`, `<KN>`, …). Unknown sequences → `�` + raw code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | –                                                                                              |

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

### Real recordings and reverberation

The synthetic suite missed what breaks the decoder in practice: Morse played through a loudspeaker
and picked up by a microphone. The tone rings on and the room adds a reverberant tail, so element
gaps fall only 7–15 dB below the marks instead of to the noise floor. With thresholds relative to
noise and signal level alone, whole characters merged into one mark and the speed estimate
collapsed (a 27 WPM recording was read as 2 WPM). Three changes address this: the relative 6 dB
drop / 8 dB rise edges in `KeyingDetector`, spectral-peak tracking in `ToneDetector`, and a
glitch filter in `TimingDecoder` that is capped by the prior speed until the unit estimate is
confident (a first dah taken for a dit had made 0.3 unit long enough to swallow real dits).
`unitEstimator` also accepts element gaps down to a third of the mark-derived unit – the tail
shortens them – for its δ-free sums dit + gap = 2 and dah + gap = 4 units.

Measured with `pnpm morse:corpus` (see `docs/TESTING.md`), 5/10/18 WPM W1AW recordings,
RT60 0.3 s, 6 simulated rooms:

| Reverberant energy | Rooms with CER < 5 %, before | after |
| ------------------ | ---------------------------- | ----- |
| 25 %               | 3 of 6                       | 5 / 6 |
| 50 %               | 0 of 6                       | 4 / 6 |

Clean recordings stay at 0.3 % CER, white noise at −3 dB broadband (8 kHz) at 0.7–0.8 %.

#### Tail swells, slow build-up, stray gaps

`pnpm morse:sweep` (synthetic text, exact keying, 6 rooms per cell) showed three more failure
modes, each fixed separately:

- **Late or lost elements.** When the gap stays above the noise-relative off-threshold, a new mark
  could only start 8 dB above the gap minimum. The next element's direct sound adds only a few dB
  at once; the rest builds up at the room's pace while the valley creeps up – dahs were read as
  dits, some elements never started. A fast rise of 4 dB within one settling time (smoothing +
  analysis window), above the on-threshold and from half a unit after the key-up, now starts it.
- **Tail swells.** Right after the direct sound stops, early reflections can lift the tail again
  above the on-threshold for 10–20 ms – a pseudo-mark in the middle of an element gap. Once the
  speed is known, `KeyingDetector` accepts no key-down within half a unit of a key-up (not
  before: a prior far below the real speed would swallow the gaps of fast CW).
- **Speed collapse.** One such 18 ms gap among a dozen 42 ms element gaps formed a 2-means cluster
  of its own; the δ-free sums then took it as the element gap and the unit fell from 40 to 27 ms
  (a 30 WPM recording read at 44–50 WPM, every element gap a character gap). The element gap is
  now the median of the spaces below two units.

| Measurement (CER)                              | before        | after         |
| ---------------------------------------------- | ------------- | ------------- |
| `morse:sweep` score (20 cells × 6 rooms)       | 44.0 %        | 34.8 %        |
| – RT60 0.3 s / 25 %, 18 WPM (rooms < 5 %)      | 5 / 6         | 6 / 6         |
| – RT60 0.3 s / 50 %, 12 WPM                    | 3 / 6         | 6 / 6         |
| – RT60 0.6 s / 25 %, 12 WPM                    | 4 / 6         | 6 / 6         |
| W1AW corpus + RT60 0.3 s / 50 % (room 1)       | 5.1 %         | 3.1 %         |
| W1AW corpus + RT60 0.6 s / 50 % (room 1)       | 47.9 %        | 37.5 %        |
| W1AW corpus, clean / white noise −3 dB (8 kHz) | 2.9 % / 4.1 % | 2.9 % / 3.9 % |
| clean 35–55 WPM                                | 0 %           | 0 %           |

Known limits:

- **Rooms that cancel the direct sound** (level detector). In about half of the simulated rooms
  with ≥ 25 % reverberant energy, the reverberant field at the tone frequency is partly opposite
  in phase to the direct sound: the steady tone is as loud as – or quieter than – the tail, and at
  a key-up the level stays flat or even rises. Whole characters merge into one mark (`morse:sweep`
  breakdown: every element gap missed, character gaps always found). The key-up is visible only
  in the _phase_ of the tone – see the room equalizer below.
- 30–40 WPM with more than ≈ 10 % reverberant energy: 30–40 ms gaps vanish inside the tail and
  the 0.4-unit smoothing; a wrong (too slow) unit estimate then widens the smoothing further.
- The SNR gate compares the signal level with the _mean_ noise envelope (`minSnr` 2.5, ×1.2 until
  confident). Averaging lowers the noise fluctuation but not its mean, so below ≈ 8–10 dB in the
  125 Hz detector bandwidth nothing starts at all. A gate on noise mean + k·σ of the smoothed
  envelope, and a detector bandwidth that narrows with the speed, are the next steps.

What did not help (kept out): a provisional key-up that is undone when the level returns to the
mark level (helps 30/40 WPM, but couples with the unit estimate into merging at slow speeds), and
a rise-based key-down outside the tail (spurious marks in noise).

### Room equalizer (experimental, `roomEqualizer: true`)

`room-equalizer.ts`, off by default (`MorseDecoderConfig.roomEqualizer`, no UI yet). For Morse from
a loudspeaker in a room whose reverberant field cancels the direct sound, it detects the keying
from the _complex_ tone amplitude: `ToneDetector` reports the tracked bin's Goertzel result with
its phase referenced to the sample clock, and the equalizer models it per hop as

```text
Y(t) = Σₑ cₑ · (S(t − startₑ) − S(t − endₑ))
```

– S the room's complex step response at the hop rate (direct sound and build-up, 48 taps ≈ 0.3 s),
cₑ each element's complex amplitude (its own phase: generators that restart the phase per element
work too). Every hop is decided two hops late: "no change" against "an element starts/ends at one
of the last three hops", the tails of all earlier elements included; a new element must be about
as strong as the previous ones (0.7–2×), transitions cost a little.

Learning S blindly: the level detector's character onsets (a mark after ≥ 2 prior units of gap)
are aligned on the complex step of the direct sound and averaged phase-normalised – S for the
first unit. A first decode shows which first elements were dahs, which extends S to three units;
the speed comes from the decoded elements; two least-squares refinements of all 48 taps use only
characters whose decoded timing is plausible (marks ≈ 1/3 units, gaps ≈ 1 unit). The frequency
offset from the bin must be removed to a fraction of a hertz – a dah's tail is predicted hundreds
of ms ahead –, but a phase tracker is biased by the room's own build-up by up to 4 Hz; the
learning chain is therefore run for offsets of ±5 Hz (0.5 Hz steps), the three most plausible
decodes are compared by model fit, then a ±0.4 Hz fine search. Online, S and the offset are
refined every 2 s; a model error above −5 dB starts learning again.

The decoder hands over to the equalizer in a character gap once it has been refined at least once
and the room visibly shapes the tone (mean change of S after the direct sound ≥ 15 %; ≈ 5 %
without a room, also in strong noise), and hands back below 10 %. The first ≈ 6–10 s of a
transmission (six character onsets, ≥ 4 s) still come from the level detector.

Measured (`morse:sweep`, `morse:corpus`, CER):

| Case                                                  | level detector | with equalizer |
| ----------------------------------------------------- | -------------- | -------------- |
| `morse:sweep` score, tone 700 Hz                      | 34.8 %         | 10.9 %         |
| `morse:sweep` score, tone 712 Hz (12 Hz off the bins) | 35.8 %         | 23.1 %         |
| `morse:sweep` score, SNR 10 dB                        | 39.8 %         | 22.4 %         |
| W1AW corpus + RT60 0.6 s / 50 % (room 1)              | 37.5 %         | 3.6 %          |
| W1AW corpus + RT60 0.3 s / 50 %                       | 3.1 %          | 3.4 %          |
| W1AW corpus + RT60 0.3 s / 25 %                       | 2.9 %          | 3.0 %          |
| W1AW corpus + RT60 0.6 s / 25 %                       | 3.3 %          | 2.9 %          |
| W1AW corpus clean                                     | 2.9 %          | 2.8 %          |
| W1AW corpus, white noise −3 dB (8 kHz)                | 3.9 %          | 3.9 %          |

At 700 Hz, 12 WPM decodes in every room up to RT60 0.6 s / 25 % and 0.3 s / 50 %, 18 WPM in every
room at 0.3 s / 25 %; most remaining errors are the first seconds before the handover. Weak
spots: 12 WPM at RT60 0.6 s with the tone off the analysis bins (68 % instead of 35–48 %), 40 WPM
at 50 % reverberant energy, and noise plus heavy reverberation, where it hands over less often.

Cost: ≈ 11 ms per second of 48 kHz audio (level detector alone ≈ 4 ms); a learning attempt blocks
for ≈ 0.2 s once (the capture buffer holds 1.4 s).

Before it is switched on by default or offered in the UI: real loudspeaker recordings, the first
seconds (re-decoding them after the handover would recover them for files, not live), and the
learning cost on slow machines.

## DTMF decoding (implemented)

`src/app/decoders/dtmf/dtmf-decoder.ts`, keypad UI in `features/dtmf-decoder`.

1. 4th-order Butterworth low-pass (3.2 kHz, flat across 697–1633 Hz) and decimation to ≈ 8 kHz
   (factor ⌊rate / 8000⌋ – works for 8, 16, 44.1, 48 kHz and others).
2. Every 10 ms a 30 ms Hann window (three staggered accumulator sets) feeds a Goertzel bank: each of
   the 8 DTMF tones on a grid from −4 % to +4 % in 1 % steps; the actual frequency is the
   parabolic peak of the grid (dB).
3. A window is a key when: one row and one column tone exceed the other tones of their group _at
   their nominal frequency_ by 8 dB; both frequency errors ≤ 2.5 % (ITU: accept ±1.5 %, reject
   ±3.5 %); twist ≤ 8 dB normal / ≤ 4 dB reverse; the two tones hold ≥ 60 % of the window energy
   (rejects speech, music, noise, chords); level ≥ −45 dBFS.
4. Debounce: key-down when three windows of the same key reach ≥ 60 % of the press's peak level
   (≈ 40 ms plateau – 20 ms blips are rejected), key-up after two invalid windows; repeated keys
   need a pause ≥ 40 ms.

Tests (`dtmf-decoder.spec.ts`): all 16 keys at 8/16/44.1/48 kHz; 50 ms tone / 50 ms pause
sequences; repeated keys; ±1.5 % accepted, ±3.5 % rejected; twist limits; 15 dB SNR; no detections
from single tones, sweeps, white noise, chords or a speech-like harmonic signal. `goertzel()` is
checked against the FFT.

## Spectrum and frequency analysis

`src/app/audio/dsp/`:

- `FFT` – in-place radix-2 complex FFT, precomputed twiddles and bit reversal, no allocations per
  transform (4096 points ≪ 1 ms). Verified against a direct DFT and Parseval's theorem.
- `makeWindow` – Hann (sidelobes −31 dB, 1.5 bins noise bandwidth) and 4-term Blackman-Harris
  (−92 dB, 2 bins); amplitudes are divided by the coherent gain, so a full-scale sine reads 0 dBFS.
- `SpectrumAnalyzer` – streaming frames with overlap (75 % in the UI), exponential power averaging,
  peak hold; `db`/`peakHold` arrays are reused and read by the canvases on animation frames.
- `findPeak` / `findPeaks` – strongest bin(s), refined by parabolic interpolation of the dB values
  (error < 1 Hz from 50 Hz to 20 kHz at 4096 points, 48 kHz – tested).
- `frequencyToNote` – equal temperament, A4 = 440 Hz, cents.

**Own FFT instead of `AnalyserNode`:** the analyser node hides window, scaling and smoothing
details, differs between browsers and cannot be unit-tested without a browser. The own FFT runs on
the frames the app already receives, so analysis is identical in tests, web and desktop.

**Resolution vs. latency:** bin width = sample rate / FFT size (4096 @ 48 kHz → 11.7 Hz bins,
85 ms window; 16384 → 2.9 Hz, 341 ms). The frequency analyzer uses 8192 points with interpolation;
the spectrum analyzer lets you choose 1024–16384.

Views: `SpectrumCanvas` (log/linear axis, dB grid, peak marker), `SpectrogramCanvas` (scrolling
waterfall via self-blit + one `ImageData` column, theme-independent colour map), `HistoryCanvas`
(trend line of a `TimeSeries`).

## Tone generator and recorder

- `ToneGenerator` (`audio/output/tone-generator.ts`): sine/square/triangle/sawtooth oscillators,
  white/pink noise from a looping 2 s seeded buffer, linear/logarithmic sweeps (audio-clock
  automation), two-tone and DTMF (two oscillators at half level each) → gain (20 ms fade in/out,
  level capped at −3 dBFS) → stereo panner. Level and balance change without restarting; other
  changes restart the graph (serialised in the page so a Stop always wins).
- `AudioRecorder` (`audio/recorder.ts`): copies captured frames into memory up to 10 minutes,
  warns at 90 %, stops at the limit. `encodeWav` writes RIFF/WAVE mono, 16-bit PCM (clipped,
  rounded) or 32-bit IEEE float with a `fact` chunk – header layout covered by tests and checked
  on a real E2E download.

## Synthesis and playback (Morse encoder)

- `scheduleMorse()` (`decoders/morse/morse-timing.ts`) turns text into key-down intervals: PARIS
  timing, optional Farnsworth spacing (ARRL formula: extra time spread over the 19 gap units of
  PARIS), weighting; unsupported characters are reported and skipped.
- `morseTone()` (`morse-synthesis.ts`) renders that schedule as a phase-continuous sine with
  raised-cosine edges – used by the demo input, the tests and the encoder's offline path, so test
  signals equal what Sonic Lab sends.
- `KeyedTonePlayer` (`audio/output/`) plays it live: one `OscillatorNode` + `GainNode`, every edge
  scheduled on the `AudioContext` clock with 5 ms linear ramps (no key clicks, no `setTimeout`
  jitter), volume capped at 0.8, stop fades out within ~10 ms and closes the context.
- Round trip (encoder → audio → decoder) is tested for every character at 10/20/30 WPM.

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
