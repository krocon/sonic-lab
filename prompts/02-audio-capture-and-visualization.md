# 02 – Audioaufnahme und Visualisierung

## Ziel und Kontext

AudioLab soll Mikrofon-Audio lokal aufnehmen und live anzeigen. Grundlage sind die Verträge aus
Prompt 01 (`AudioSource`, `AudioFrame`, `CaptureSession`). Ergebnis: In der Morse-Decoder-Ansicht
kann man ein Gerät wählen, die Aufnahme starten/stoppen und sieht Waveform und Pegel.

## Zuerst prüfen

- Sind die Interfaces aus 01 vorhanden? Wenn nicht: minimal ergänzen und darauf hinweisen.
- Aktuellen Stand von `features/morse-decoder` (Layout mit deaktivierten Controls).
- CSP in `src-tauri/tauri.conf.json` (`script-src 'self'`, `worker-src`, `media-src`).
- Browser-Unterstützung von `AudioWorklet`, `MediaDevices.getUserMedia`,
  `enumerateDevices`, `devicechange` in Chromium, Firefox, Safari (MDN prüfen).

## Aufgaben

1. **BrowserMicrophoneSource** (`src/app/audio/microphone/`), implementiert `AudioSource`:
   - `getUserMedia({ audio: { deviceId, echoCancellation: false, noiseSuppression: false,
autoGainControl: false } })` – Signalverarbeitung des Browsers abschalten (Morse!).
   - Geräte erst nach erteilter Berechtigung mit Labels auflisten; `devicechange` beobachten.
   - Fehler auf die `AudioSourceState`-Fehlerarten abbilden (`NotAllowedError`,
     `NotFoundError`, `NotReadableError`, `OverconstrainedError`, fehlender Secure Context).
   - `stop()`: alle Tracks stoppen, Nodes trennen, `AudioContext.close()`. Auch bei
     `track.onended` (Gerät entfernt) sauber in `error/device-lost` wechseln.
2. **AudioWorklet** (`src/app/audio/worklet/capture-processor.ts`):
   - Sammelt 128er-Quanta zu Blöcken (z. B. 1024 Samples), schickt sie per `port.postMessage`
     mit **übertragenem** `ArrayBuffer` (Transferable) an den Main Thread; Pool zur
     Wiederverwendung, um GC-Druck zu vermeiden.
   - Build: Der Angular-Builder bündelt AudioWorklet-Module nicht. Wähle eine robuste Lösung
     und dokumentiere sie, bevorzugt: TypeScript-Quelle + kleines Build-Skript mit `esbuild`
     (explizite devDependency, Version wie in der Angular-Toolchain) nach
     `public/worklets/*.js` (generiert, in `.gitignore`), eingebunden über `prestart`/`prebuild`.
     Keine Blob-URLs (CSP). Kein `ScriptProcessorNode` (veraltet).
   - Typen für `AudioWorkletGlobalScope` lokal deklarieren, falls die DOM-Lib sie nicht liefert.
3. **SyntheticAudioSource** (`src/app/audio/synthetic/`): erzeugt deterministische Frames
   (Sinus, Rauschen mit Seed, Ein/Aus-Tastung) ohne Web Audio – für Tests und eine
   „Demo-Signal"-Option in der UI (nur in Dev-Builds oder klar gekennzeichnet).
4. **Lifecycle in der UI:** Start/Stop-Button, Geräteauswahl, Statusanzeige (inkl.
   „Berechtigung wird angefragt"), verständliche Fehlermeldungen mit Handlungshinweis.
   Mikrofon wird beim Verlassen der Route (`DestroyRef`), bei `pagehide` und beim
   Fenster-Schließen freigegeben. Statusleiste zeigt den echten Mikrofonzustand.
5. **Visualisierung** (`src/app/shared/visualization/`):
   - `WaveformCanvas`: Canvas 2D, `requestAnimationFrame`, liest aus einem Ringpuffer
     (kein Signal pro Frame), Device-Pixel-Ratio, Theme-Farben aus CSS-Variablen,
     pausiert bei `document.hidden`.
   - `LevelMeter`: RMS/Peak in dBFS mit Peak-Hold.
   - Alles mit `NgZone.runOutsideAngular` bzw. ohne Signal-Writes im Hot Path.
6. **Einstellungen:** gewähltes Gerät (deviceId) über den `SettingsStore` merken; fällt das Gerät
   weg, auf Standard zurückfallen und informieren.

## Technische Leitplanken

- Keine Audio-Bibliothek. Nur Web Audio API, MediaDevices, Canvas.
- Keine Audiodaten in Logs, kein `console.log` von Samples.
- Hot Path ohne Allokationen pro Frame (Ringpuffer, wiederverwendete Arrays).
- Sample-Rate nicht annehmen (44,1/48 kHz und andere) – immer aus `AudioContext.sampleRate`.

## Erwartete Dateien

`src/app/audio/microphone/browser-microphone-source.ts`,
`src/app/audio/worklet/capture-processor.ts`, `scripts/build-worklets.mjs`,
`src/app/audio/synthetic/synthetic-audio-source.ts`, `src/app/audio/ring-buffer.ts`,
`src/app/shared/visualization/waveform-canvas.ts`, `level-meter.ts`, Specs, E2E-Erweiterung.

## Akzeptanzkriterien

- Start fragt die Berechtigung an; Stop gibt das Mikrofon frei (Browser-Indikator erlischt).
- Kein Mikrofonzugriff ohne Klick (E2E-Test „does not request the microphone on load" bleibt grün).
- Verweigerte Berechtigung, fehlendes Gerät und unsicherer Kontext zeigen je eine klare Meldung.
- Waveform läuft flüssig (≥ 50 fps auf einem aktuellen Laptop) ohne Change-Detection-Last.
- `pnpm check` und `pnpm e2e` grün.

## Tests

- Unit: Ringpuffer, Synthetic-Source (Determinismus), Fehler-Mapping, Lifecycle mit Fake-
  `MediaDevices`/`AudioContext`.
- E2E (Chromium): `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`,
  Start/Stop, Geräteauswahl, Berechtigung verweigert (Permissions leeren bzw. `--deny-…`).

## Dokumentation

`docs/AUDIO-PIPELINE.md` (Kette Mikrofon → Worklet → Ringpuffer → Konsumenten, Blockgröße,
Latenz), `docs/PRIVACY.md` (Lifecycle), `docs/BUILDING.md` (Worklet-Build).

## Ausdrücklich nicht umsetzen

Kein Morse-Algorithmus, keine FFT/Spektrum-Ansicht, keine Aufnahme in Dateien, keine
Tauri-spezifischen Anpassungen (→ 09).
