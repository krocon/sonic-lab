# 01 – Architektur und Fundament

## Ziel und Kontext

Das Setup (Prompt 00) liefert App-Shell, Modulkatalog, Theme und einen Plattform-Adapter.
Jetzt werden die **fachlichen Verträge** der Schichten festgelegt, damit Audioaufnahme (02) und
Decoder (03+) unabhängig von Angular und Tauri entwickelt und getestet werden können.

Schichten (siehe `docs/ARCHITECTURE.md`):

1. Presentation – `src/app/features/*`, `src/app/shell`, `src/app/shared`
2. Application – `src/app/core/*` (Use Cases, Sessions, Settings)
3. Audio – `src/app/audio/*` (framework-frei)
4. Decoder – `src/app/decoders/*` (framework-frei)
5. Platform – `src/app/platform/*` (Browser-/Tauri-Adapter)

## Zuerst prüfen

- Existieren `src/app/audio`, `src/app/decoders` oder Interfaces wie `AudioFrame` bereits?
- ESLint-Regel `no-restricted-imports` für `audio/` und `decoders/` in `eslint.config.js`.
- `PlatformAdapter` in `src/app/platform/` und der Provider in `app.config.ts`.

## Aufgaben

1. **Audio-Verträge** in `src/app/audio/audio-source.ts` (oder sinnvoll aufgeteilt):
   - `AudioInputDevice { id; label; isDefault? }`
   - `AudioFrame { samples: Float32Array; sampleRate; timestamp /* s, AudioContext-Zeit */ }`
   - `AudioSource { listDevices(); start(deviceId?); stop(); subscribe(listener) → unsubscribe; readonly state }`
   - `AudioSourceState` als diskriminierte Union: `idle | requesting-permission | running |
stopped | error` mit Fehlerart (`permission-denied`, `no-device`, `device-lost`,
     `insecure-context`, `unsupported`, `unknown`).
   - Dokumentiere Ownership: Frames sind nur während des Listener-Aufrufs gültig (Buffer-Reuse),
     wer sie behalten will, kopiert.
2. **Decoder-Vertrag** in `src/app/decoders/signal-decoder.ts`:
   `SignalDecoder<TConfig, TResult> { id; name; configure(config); process(frame): TResult[]; reset() }`
   plus `DecoderEvent`-Basistyp mit `timestamp`.
3. **Application Layer:** `CaptureSession` (Angular-Service in `src/app/core/capture/`), der eine
   `AudioSource` hält, Decoder registriert, Frames außerhalb der Change Detection verteilt und nur
   **verdichtete** Ergebnisse (Status, Pegel, Textausgabe) als Signals veröffentlicht. In diesem
   Prompt nur Skelett + Tests mit einer Fake-`AudioSource`; die echte Quelle folgt in 02.
4. **Settings-Persistenz:** kleiner `SettingsStore<T>` (versioniertes JSON in `localStorage`,
   try/catch, Schema-Validierung ohne Bibliothek, Defaults bei Fehlern). Desktop später über
   Adapter austauschbar.
5. **Modulregistrierung:** Prüfen, ob `module-catalog.ts` + Routen reichen. Nur erweitern, wenn
   nötig (z. B. Feature-Flag oder `requiresMicrophone`).
6. **Schichtgrenzen:** ESLint-Regel um `src/app/platform` → nur von `core`/`features` importierbar
   erweitern, falls ohne großen Aufwand möglich; sonst in `docs/ARCHITECTURE.md` festhalten.
7. **Fehlerdarstellung:** Ein gemeinsames Muster (z. B. `StatusMessage { tone; text; action? }`)
   für Status- und Fehlermeldungen in der UI.

## Technische Leitplanken

- Keine Abhängigkeiten hinzufügen.
- Keine `Float32Array`s in Signals oder `@Input`s.
- `audio/` und `decoders/` dürfen nur Web-Standard-APIs bzw. reines TypeScript nutzen.
- Fakes für Tests unter `src/testing/` ablegen (z. B. `fake-audio-source.ts`).

## Erwartete Dateien

`src/app/audio/audio-source.ts`, `src/app/audio/audio-frame.ts`,
`src/app/decoders/signal-decoder.ts`, `src/app/core/capture/capture-session.ts`,
`src/app/core/settings/settings-store.ts`, `src/testing/fake-audio-source.ts`, Specs dazu.

## Akzeptanzkriterien

- Interfaces sind dokumentiert (TSDoc) und ohne Angular importierbar.
- `CaptureSession` lässt sich mit der Fake-Quelle starten/stoppen; Listener werden beim Stop
  entfernt; Fehlerzustände werden als Signal sichtbar.
- `SettingsStore` übersteht kaputtes JSON, fehlenden Storage und alte Versionen.
- `pnpm check` grün.

## Tests

Unit-Tests für `CaptureSession` (Lifecycle, Fehler, Unsubscribe), `SettingsStore`
(Defaults, Migration, Storage-Ausnahmen) und einen Typ-Test, dass Decoder ohne Angular
instanziierbar sind.

## Dokumentation

`docs/ARCHITECTURE.md`: Schichtdiagramm aktualisieren, neue Interfaces und Datenfluss
(Frame → Decoder → Ergebnis → Signal) beschreiben, ADR für Frame-Ownership.

## Ausdrücklich nicht umsetzen

Kein `getUserMedia`, kein AudioWorklet, keine Visualisierung, kein Morse-Algorithmus.
