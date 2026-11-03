# 07 – DTMF-Decoder

## Ziel und Kontext

Telefon-Tastentöne (DTMF, ITU-T Q.23/Q.24) erkennen: 4 Zeilenfrequenzen (697, 770, 852, 941 Hz)
× 4 Spaltenfrequenzen (1209, 1336, 1477, 1633 Hz) → `0–9 * # A–D`. Der Decoder ist ein
unabhängiges Modul nach dem `SignalDecoder`-Vertrag.

## Zuerst prüfen

- `SignalDecoder`, `CaptureSession`, vorhandener Goertzel-Code (03/06) – wiederverwenden.
- Testsignal-Generatoren in `src/testing/signals/`.

## Aufgaben

1. **Goertzel-Bank** für die 8 Grundfrequenzen (optional 2. Harmonische zur Sprachunterscheidung),
   Blocklänge passend zur Sample-Rate (≈ 10–13 ms), generisch für beliebige Sample-Raten.
2. **Validierung:** Je eine dominante Zeilen- und Spaltenfrequenz, Mindestenergie, Twist-Grenzen
   (normal ≤ 8 dB, reverse ≤ 4 dB), Abstand zur zweitstärksten Frequenz, Mindestdauer
   (≥ 40 ms) und Pausenerkennung; Entprellung (eine Taste = ein Ereignis).
3. **`DtmfDecoder`** (`src/app/decoders/dtmf/`) mit Ereignissen `key-down`/`key-up` inkl. Dauer.
4. **UI** (`features/dtmf-decoder`): Tastenfeld, das erkannte Tasten aufleuchten lässt,
   Ziffernfolge, Kopieren, Zurücksetzen, Frequenz-Energie-Balken (8 Werte).
5. Modulkatalog auf `available`.

## Technische Leitplanken

Framework-frei, keine Allokationen pro Block, Sample-Rate-unabhängig.

## Akzeptanzkriterien

- Alle 16 Tasten werden synthetisch bei 8/16/44,1/48 kHz erkannt; Ziffernfolgen mit 50 ms
  Ton/50 ms Pause exakt.
- Keine Fehlerkennung bei Sprache/Musik-Ersatzsignalen (Mehrton-Rauschen, Sweep) und reinen
  Einzeltönen.
- Robust bei Twist innerhalb der Grenzen und SNR ≥ 15 dB.
- `pnpm check` grün.

## Tests

Goertzel gegen FFT-Referenz, Tabellen-Tests für alle Tasten und Grenzfälle (Twist, Dauer,
Frequenzabweichung ±1,5 %, die erkannt werden muss, ±3,5 %, die abgelehnt werden muss).

## Dokumentation

`docs/AUDIO-PIPELINE.md` (DTMF), README.

## Ausdrücklich nicht umsetzen

Keine DTMF-Erzeugung (kann später im Tone Generator kommen), kein Caller-ID/FSK.
