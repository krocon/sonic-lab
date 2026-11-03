# 06 – Frequency Analyzer, Spectrum Analyzer und Signal Monitor

## Ziel und Kontext

Drei Analyse-Ansichten auf Basis der Audio-Pipeline (02): dominante Frequenz, FFT-Spektrum/
Spektrogramm und ein kompakter Signal Monitor (Pegel, Frequenz, Verlauf). Sie teilen sich
eine FFT-Implementierung und Visualisierungsbausteine.

## Zuerst prüfen

- Ringpuffer, `CaptureSession`, Visualisierungskomponenten aus 02.
- Gibt es bereits FFT/Goertzel-Code (z. B. aus 03/04)? Wiederverwenden.
- Modulkatalog-Einträge `frequency-analyzer`, `spectrum-analyzer`, `signal-monitor`.

## Aufgaben

1. **DSP** (`src/app/audio/dsp/`): Radix-2-FFT (in-place, vorberechnete Twiddles, Float32),
   Fensterfunktionen (Hann, Blackman-Harris), Magnitude in dBFS, Overlap, Mittelung/Peak-Hold.
   Entscheidung dokumentieren: eigene FFT vs. `AnalyserNode` (AnalyserNode ist bequem, aber
   ungenau steuerbar; für Tests ist reine TS-FFT nötig).
2. **Frequenzschätzung:** Peak-Bin + parabolische Interpolation; optional YIN/Autokorrelation für
   tiefe Frequenzen; Stabilitätsanzeige.
3. **Spectrum Analyzer:** FFT-Größe 512–16384, logarithmische/lineare Frequenzachse,
   dB-Bereich, Peak-Marker mit Frequenzangabe, Spektrogramm (Wasserfall) mit Canvas
   (`ImageData`/Scroll-Blit) bzw. OffscreenCanvas im Worker, falls nötig.
4. **Frequency Analyzer:** große Frequenzanzeige, Notenname/Cent optional, Verlauf.
5. **Signal Monitor:** Pegel (RMS/Peak), dominante Frequenz, Clipping-Warnung, Verlauf über
   z. B. 30 s.
6. Achsen, Gitter und Beschriftungen in SVG über Canvas; Theme-Farben aus CSS-Variablen.

## Technische Leitplanken

- FFT ohne Allokationen pro Aufruf; Visualisierung per `requestAnimationFrame`, gedrosselt bei
  verdecktem Tab. Keine Chart-Bibliothek.
- Gleiche Daten nicht mehrfach berechnen: eine Analyse-Stufe, mehrere Ansichten.

## Akzeptanzkriterien

- Synthetischer Sinus 50 Hz – 20 kHz wird auf ±1 Hz (bei ≥ 4096er FFT, 48 kHz, Interpolation)
  bestimmt; Zwei-Ton-Signal zeigt zwei Peaks.
- Spektrogramm läuft flüssig (≥ 30 fps) bei 4096er FFT.
- `pnpm check` grün; E2E mit Fake-Audio prüft, dass eine Frequenz angezeigt wird.

## Tests

FFT gegen DFT-Referenz (kleine N), Parseval, Fensterkoeffizienten, Frequenzschätzung
tabellarisch, Performance-Test für 4096er FFT.

## Dokumentation

`docs/AUDIO-PIPELINE.md` (FFT, Fenster, Auflösung vs. Latenz), README-Features.

## Ausdrücklich nicht umsetzen

Kein DTMF (→ 07), kein Export von Messdaten, keine Oktavband-/Akustikmessung nach Norm.
