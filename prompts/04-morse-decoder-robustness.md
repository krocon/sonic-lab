# 04 – Morse-Decoder: Robustheit

## Ziel und Kontext

Der MVP-Decoder (03) funktioniert mit sauberen Signalen. Reale Signale haben Rauschen, QSB
(schwankende Stärke), Störimpulse, Frequenzdrift und ungleichmäßige „Handschrift". Ziel ist ein
Decoder, der unter diesen Bedingungen messbar besser wird – belegt durch Regressionstests.

## Zuerst prüfen

- Struktur in `src/app/decoders/morse/` und vorhandene Signaltests.
- Baseline erheben: aktuelle Erkennungsrate je Testszenario (Zeichenfehlerrate, CER) notieren,
  **bevor** etwas geändert wird.

## Aufgaben

1. **Testsignal-Generator erweitern** (`src/testing/signals/`): seedbares weißes/rosa Rauschen
   (SNR in dB), QSB (langsame Amplitudenmodulation), Störimpulse (Klicks, kurze Bursts),
   Frequenzdrift, Timing-Jitter (± x % pro Element), Gewichtung (Dah/Dit-Verhältnis 2,5–4),
   „Farnsworth"-Abstände, lange Aufnahmen (≥ 5 min). Deterministisch.
2. **Metrik:** CER (Levenshtein) zwischen Soll- und Ist-Text; Hilfsfunktion + Tabellen-Tests mit
   Mindestwerten pro Szenario (z. B. CER ≤ 2 % bei 10 dB SNR, 20 WPM).
3. **Adaptive Schwellen:** Noise-Floor- und Signal-Level getrennt schätzen (z. B. Perzentile
   oder asymmetrische Attack/Release-Filter), Schwelle dazwischen mit Hysterese; AGC-unabhängig.
4. **Störimpulse:** Marks/Spaces unterhalb eines Bruchteils der Zeiteinheit verwerfen bzw. mit
   Nachbarn zusammenführen (Glitch-Filter), ohne schnelle Dits zu verlieren.
5. **WPM-Schätzung:** robuste Zeiteinheit (z. B. Clustering der Mark-Dauern in zwei Gruppen,
   gleitend gewichtet), Anzeige nur bei ausreichender Konfidenz; schnelle Anpassung bei
   Tempowechsel. WPM nach PARIS-Norm (50 Einheiten).
6. **Frequenz-Tracking:** automatische Zielfrequenz mit Nachführung bei Drift (± 50 Hz), manuelle
   Fixierung möglich.
7. **Konfidenz/Mehrdeutigkeit:** Elemente nahe der Dit/Dah-Grenze bzw. Pausen nahe der
   Zeichen/Wort-Grenze als unsicher kennzeichnen; UI kann diese hervorheben.
8. **UI:** Anzeige von Rauschpegel, Schwelle, Signalpegel im Pegelmeter; erkannte Frequenz;
   Empfindlichkeits-Preset (niedrig/mittel/hoch) statt Rohparametern als Standard, Rohparameter
   unter „Erweitert".

## Technische Leitplanken

- Algorithmen bleiben in `decoders/morse` und framework-frei; keine ML-Bibliotheken.
- Performance: Verarbeitung von 1 s Audio (48 kHz) < 5 ms auf dem Main Thread bzw. im Worker;
  Benchmark-Test (Vitest `bench` oder einfacher Zeittest mit großzügiger Grenze).
- Jede Algorithmusänderung muss die Regressionstabelle verbessern oder halten.

## Erwartete Dateien

`src/testing/signals/{noise,impairments,cer}.ts`, Erweiterungen in `decoders/morse/*`,
`src/app/decoders/morse/robustness.spec.ts`.

## Akzeptanzkriterien

- Dokumentierte Baseline- und Endwerte (CER je Szenario) in `docs/AUDIO-PIPELINE.md`.
- Mindestens: SNR 10 dB / 20 WPM CER ≤ 2 %, SNR 3 dB / 15 WPM CER ≤ 10 %,
  Tempowechsel 15 → 30 WPM innerhalb von 10 Zeichen eingeschwungen, 5-min-Aufnahme ohne Drift
  der Zeiteinheit oder Speicherwachstum.
- `pnpm check` grün.

## Dokumentation

`docs/AUDIO-PIPELINE.md`: Algorithmen, Parameter, Grenzen (z. B. mehrere Sender, sehr starkes
QRM), Messwerte.

## Ausdrücklich nicht umsetzen

Kein neuronales Netz, keine Mehrkanal-/Multi-Signal-Dekodierung, kein Encoder.
