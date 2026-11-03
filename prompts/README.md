# AudioLab – Folge-Prompts

Jede Datei ist ein eigenständiger Arbeitsauftrag für eine Coding-KI. Die Prompts bauen
aufeinander auf, prüfen aber jeweils zuerst den tatsächlichen Projektzustand.

## Empfohlene Reihenfolge

| #   | Datei                                   | Abhängig von   | Ergebnis                                             |
| --- | --------------------------------------- | -------------- | ---------------------------------------------------- |
| 00  | `00-project-setup.md`                   | –              | ✅ erledigt (Angular 22 + Tauri 2, Tooling, Shell)   |
| 01  | `01-architecture-and-foundation.md`     | 00             | Interfaces, Schichtgrenzen, Settings, Session-Modell |
| 02  | `02-audio-capture-and-visualization.md` | 01             | Mikrofon, AudioWorklet, Lifecycle, Waveform, Pegel   |
| 03  | `03-morse-decoder.md`                   | 02             | erster funktionierender Morse-Decoder (MVP)          |
| 04  | `04-morse-decoder-robustness.md`        | 03             | adaptive Schwellen, Rauschen, WPM, Störimpulse       |
| 10  | `10-testing-and-quality.md`             | 04             | Test- und Performance-Härtung des MVP                |
| 09  | `09-tauri-desktop-integration.md`       | 02 (besser 04) | Mikrofon in Tauri auf macOS/Windows/Linux            |
| 05  | `05-morse-encoder.md`                   | 03             | Text → Morse → Ton                                   |
| 06  | `06-frequency-and-spectrum-analyzer.md` | 02             | Frequenz, FFT, Spektrum/Spektrogramm, Signal Monitor |
| 07  | `07-dtmf-decoder.md`                    | 06             | DTMF via Goertzel                                    |
| 08  | `08-tone-generator-and-recorder.md`     | 02, 05         | Testtöne, lokale Aufnahme + Export                   |
| 11  | `11-release-and-distribution.md`        | 09, 10         | CI-Matrix, Releases, Versionierung                   |
| 12  | `12-documentation-and-open-source.md`   | laufend        | README, Doku, Lizenz, Beitragsrichtlinien            |

Die Nummern sind Kennungen, nicht zwingend die Ausführungsreihenfolge: 10 und 09 lohnen sich
direkt nach dem MVP (03/04), bevor weitere Module (05–08) dazukommen. 12 kann nach jedem
Meilenstein erneut ausgeführt werden.

## Gemeinsame Regeln (gelten für jeden Prompt)

1. Zuerst den Projektzustand prüfen (`git status`, `git log`, relevante Dateien lesen). Nichts neu
   erzeugen, was schon existiert; Abweichungen vom Prompt benennen und sinnvoll anpassen.
2. Kleine, überprüfbare Schritte; keine monolithischen Dateien oder Komponenten.
3. TypeScript strict, kein `any`. Audio- und Decoder-Code (`src/app/audio`, `src/app/decoders`)
   bleibt frei von Angular, RxJS und Tauri (ESLint erzwingt das).
4. Audio-Hot-Path außerhalb der Angular Change Detection; keine großen `Float32Array`s in Signals.
5. Keine neuen Abhängigkeiten ohne konkrete Begründung in `docs/ARCHITECTURE.md`.
6. Nach jeder sinnvollen Änderung: `pnpm format:check && pnpm lint && pnpm test && pnpm build`,
   bei Rust-Änderungen zusätzlich `pnpm rust:fmt && pnpm rust:lint && pnpm rust:test`.
   `pnpm check` führt alles aus. E2E: `pnpm e2e`.
7. Nie behaupten, ein Test/Build sei erfolgreich, wenn er nicht ausgeführt wurde. Fehler beheben,
   Tests nicht deaktivieren.
8. Datenschutz: Mikrofon nur nach Nutzeraktion, keine Übertragung, keine Audioinhalte in Logs.
9. `CHANGELOG.md` (Abschnitt „Unreleased") und betroffene Dokumente in `docs/` aktualisieren.
10. Am Ende: knappe Zusammenfassung mit geänderten Dateien, ausgeführten Befehlen und deren
    tatsächlichem Ergebnis sowie offenen Punkten.
