# 03 – Morse-Decoder (MVP)

## Ziel und Kontext

Erster vollständig nutzbarer Decoder: akustische Morsezeichen (CW-Ton) werden erkannt und in
Klartext übersetzt. Audio-Grundlage (02) und Verträge (01) existieren. Robustheit gegen Rauschen,
Fading und unsaubere Gebeweise folgt in 04 – die Architektur muss das aber schon vorsehen.

## Zuerst prüfen

- `AudioSource`, `AudioFrame`, `SignalDecoder`, `CaptureSession`, `SyntheticAudioSource` vorhanden?
- Stand der Morse-Ansicht (`features/morse-decoder`) nach Prompt 02.
- Gibt es bereits Morse-Code in `src/app/decoders/morse/`? Nicht doppelt anlegen.

## Aufgaben

Verarbeitungskette strikt getrennt in kleine, einzeln testbare Stufen
(`src/app/decoders/morse/`):

1. **Alphabet** (`morse-alphabet.ts`): ITU-Morsealphabet (A–Z, 0–9, `. , ? ' ! / ( ) & : ; = + - _ " $ @`),
   bidirektional (Text → Code, Code → Text), Prosigns separat (`<AR>`, `<SK>`, `<BT>`, `<KN>`, `<SOS>`)
   als eigene Tabelle. Unbekannte Codes liefern ein explizites `unknown`-Ergebnis.
2. **Tonfilter + Hüllkurve** (`tone-detector.ts`): Goertzel bzw. Biquad-Bandpass auf
   konfigurierbare Zielfrequenz (Default 700 Hz, Bandbreite einstellbar) → Energie je Block
   (z. B. 5–10 ms Hop). Alternativ „Auto": dominante Frequenz im Bereich 300–1500 Hz suchen
   (einfach halten; Verfeinerung in 04).
3. **Keying-Detektor** (`keying-detector.ts`): Energie → Ton an/aus mit **Hysterese**
   (zwei Schwellen) und Mindestdauer; Ausgabe: Folge von `{ state: 'mark' | 'space'; durationMs; startTime }`.
   Schwellenwert in diesem Schritt: einfacher adaptiver Ansatz (gleitendes Minimum/Maximum).
4. **Timing-Klassifikator** (`timing-classifier.ts`): Dit/Dah sowie Element-, Zeichen- und
   Wortabstand relativ zur geschätzten Zeiteinheit. Zeiteinheit adaptiv (z. B. aus den
   kürzeren Marks, gleitend), Grenzen: Dit/Dah bei 2 Einheiten, Zeichenpause ≈ 3, Wortpause ≈ 7
   (Schwellen konfigurierbar, Default 2 / 5). Nicht auf feste Millisekunden bauen.
5. **Übersetzer** (`morse-translator.ts`): Symbolfolge → Zeichen/Wörter, unbekannte Sequenzen
   sichtbar markieren (z. B. `�` + Rohcode im Ergebnisobjekt).
6. **`MorseDecoder`** implementiert `SignalDecoder`, verknüpft die Stufen, liefert Ereignisse
   (`element`, `character`, `word-gap`, `unknown`, `wpm-estimate`). `reset()` und
   `configure()` wirken sofort und sind getestet.
7. **UI** (Morse-Ansicht): Controls aktivieren, Ton/Pausen-Zeitleiste (Canvas), erkannte
   Morsefolge, Klartext, WPM (nur anzeigen, wenn genügend Elemente beobachtet), Kopieren
   (Clipboard API mit Fehlerbehandlung), Zurücksetzen, Einstellungen Frequenz/Bandbreite/
   Schwelle/Empfindlichkeit (persistiert über `SettingsStore`).
8. Status `in-development` → `available` im Modulkatalog, sobald die Akzeptanzkriterien erfüllt sind.

## Technische Leitplanken

- Decoder-Code ohne Angular/RxJS/Tauri, keine Allokationen pro Sample.
- Signal-Erkennung (Stufen 2–4) und Übersetzung (1, 5) bleiben getrennte Module.
- Zeitbasis aus Sample-Zählung, nicht aus `performance.now()`.
- UI erhält verdichtete Ereignisse (gedrosselt, z. B. max. 30 Updates/s).

## Erwartete Dateien

`src/app/decoders/morse/{morse-alphabet,tone-detector,keying-detector,timing-classifier,morse-translator,morse-decoder}.ts`

- Specs, `src/testing/signals/morse-signal.ts` (Generator: Text, WPM, Frequenz, Amplitude,
  Sample-Rate → `Float32Array`), Komponenten der Morse-Ansicht.

## Akzeptanzkriterien

- Synthetisch erzeugtes „SOS", „PARIS PARIS", alle Buchstaben und Ziffern werden bei 5, 15, 25
  und 40 WPM, 500/700/1000 Hz und 44,1/48 kHz exakt dekodiert.
- Unbekannte Codes erscheinen markiert, nicht als falscher Buchstabe.
- Live: Ein Morse-Ton aus Lautsprecher/Handy (z. B. Morse-Encoder-App) wird in ruhiger Umgebung
  dekodiert (manuell geprüft, Ergebnis in der Zusammenfassung angeben).
- `pnpm check` und `pnpm e2e` grün.

## Tests

Unit-Tests je Stufe (Alphabet vollständig und bijektiv, Hysterese, Klassifikation an Grenzwerten,
Reset/Configure), Signaltests mit dem Generator (Tabellen-getrieben), E2E mit
Chromium-Fake-Audio aus einer generierten WAV-Datei (`--use-file-for-fake-audio-capture`).

## Dokumentation

`docs/AUDIO-PIPELINE.md`: Morse-Kette, Parameter, Defaults, bekannte Grenzen.
`README.md`: Feature-Liste aktualisieren.

## Ausdrücklich nicht umsetzen

Ausgefeilte Rauschunterdrückung, Fading-Kompensation, mehrere gleichzeitige Signale,
Morse-Encoder, Audioexport – das folgt in 04/05/08.
