# 05 – Morse-Encoder

## Ziel und Kontext

Text soll in Morsecode umgewandelt und optional als Ton ausgegeben werden. Das Alphabet aus
Prompt 03 wird wiederverwendet. Der Encoder dient auch als Signalquelle für manuelle Tests des
Decoders (Loopback über Lautsprecher/Mikrofon).

## Zuerst prüfen

- `src/app/decoders/morse/morse-alphabet.ts` (wiederverwenden, nicht duplizieren).
- `src/testing/signals/morse-signal.ts`: Lässt sich der Generator in eine produktive,
  framework-freie Funktion überführen (ohne Testabhängigkeiten)? Dann extrahieren nach
  `src/app/audio/synthesis/` und Tests darauf umstellen.
- Modulkatalog-Eintrag `morse-encoder` (Status `planned`).

## Aufgaben

1. **Encoder-Logik** (`src/app/decoders/morse/morse-encoder.ts` o. ä.): Text → Elementfolge mit
   Timing (Einheiten), Prosigns in spitzen Klammern, nicht kodierbare Zeichen gemeldet.
2. **Timing-Modell:** WPM, Farnsworth-WPM, Gewichtung; Berechnung nach PARIS-Norm.
3. **Audioausgabe:** Web Audio `OscillatorNode` + `GainNode` mit Hüllkurven-Rampen (≈ 5 ms
   Anstieg/Abfall gegen Klicks), präzise über `AudioContext.currentTime` geplant; Stop jederzeit.
   Frequenz und Lautstärke einstellbar. Ausgabe nur nach Klick (Autoplay-Policy).
4. **UI** (`features/morse-encoder`): Texteingabe, Live-Morsevorschau, Play/Stop, aktuelles
   Zeichen hervorheben, Kopieren des Codes, Einstellungen (WPM, Farnsworth, Frequenz, Lautstärke).
5. Modulkatalog auf `available` setzen.

## Technische Leitplanken

- Keine Audio-Bibliothek. Kein `setTimeout`-Timing für Töne.
- Gemeinsame Synthese-Funktion für Tests und Encoder, damit Testsignale realistisch bleiben.

## Akzeptanzkriterien

- Round-Trip-Test: Encoder → synthetisches Audio → Decoder ergibt den Ausgangstext
  (alle Zeichen des Alphabets, 10/20/30 WPM).
- Wiedergabe ohne hörbare Klicks; Stop beendet sofort.
- `pnpm check` und E2E (Seite lädt, Vorschau aktualisiert sich, Play-Button vorhanden) grün.

## Tests

Unit (Timing-Berechnung, Prosigns, unbekannte Zeichen), Round-Trip, E2E-Smoke.

## Dokumentation

`README.md` Features, `docs/AUDIO-PIPELINE.md` (Synthese), `CHANGELOG.md`.

## Ausdrücklich nicht umsetzen

Kein Export als WAV (→ 08), kein Tastenmorsen per Tastatur/Maus (später, Roadmap).
