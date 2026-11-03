# 10 – Tests und Qualität

## Ziel und Kontext

Nach dem MVP (02–04) wird die Testbasis systematisch gehärtet: Unit-, Signal-, Integrations-,
E2E- und Performance-Tests sowie CI-Qualitätsschranken. Ziel ist Vertrauen in Änderungen an
Algorithmen und Lifecycle.

## Zuerst prüfen

- Vorhandene Specs (`find src -name '*.spec.ts'`), `e2e/`, `playwright.config.ts`,
  Testsignal-Generatoren in `src/testing/`.
- Testlauf und Dauer: `pnpm test`, `pnpm e2e`. Lücken auflisten, bevor Neues geschrieben wird.
- `.github/workflows/` (existiert evtl. noch nicht).

## Aufgaben

1. **Abdeckung messen:** Vitest-Coverage (`ng test --coverage`) einrichten, Schwellen für
   `src/app/audio` und `src/app/decoders` (z. B. ≥ 90 % Lines), für UI moderat.
2. **Signaltests vervollständigen:** SOS, alle Zeichen, WPM-Matrix, Frequenzen, Amplituden,
   Rauschen, unregelmäßige Pausen, Störimpulse, lange Aufnahmen – tabellengetrieben,
   deterministisch (Seeds), ohne Mikrofon.
3. **Golden Files:** einige kurze reale Aufnahmen (eigene, lizenzfreie) als WAV unter
   `test-data/` mit erwarteter Ausgabe; Größe begrenzen (< 2 MB gesamt), Lizenz dokumentieren.
4. **Integration:** `CaptureSession` + `SyntheticAudioSource` + Decoder End-to-End im Unit-Test.
5. **E2E (Playwright):** Start/Stop, Berechtigung verweigert, Gerätewechsel, Decoder-Ergebnis
   mit Fake-Audio-Datei, Kopieren (Clipboard-Permission), Theme, Tastaturbedienung, Firefox und
   WebKit zusätzlich, soweit Fake-Media dort unterstützt wird (sonst dokumentiert überspringen).
6. **Barrierefreiheit:** `@axe-core/playwright` (Begründung dokumentieren) für Kernseiten,
   Fokus-Reihenfolge, Kontraste beider Themes.
7. **Performance:** Benchmarks für FFT, Morse-Kette, Ringpuffer; Langzeittest (simulierte 30 min)
   ohne Speicherwachstum; Frame-Budget der Visualisierung (Playwright Performance-Trace grob).
8. **CI** (`.github/workflows/ci.yml`): Frontend-Job (format, lint, test + coverage, build, e2e
   Chromium) und Rust-Job (fmt, clippy, test) auf ubuntu/macos/windows. Vorlage:
   `files-and-folders-tauri/.github/workflows/ci.yml`.

## Technische Leitplanken

- Tests deterministisch, keine Netzwerkzugriffe, keine echten Geräte.
- Flaky Tests reparieren statt `retry` hochzudrehen oder zu überspringen.

## Akzeptanzkriterien

- `pnpm check` und `pnpm e2e` grün, Coverage-Schwellen erfüllt.
- CI-Workflow läuft auf GitHub grün (oder lokal mit `act` geprüft – Ergebnis angeben).

## Dokumentation

`CONTRIBUTING.md` (Tests ausführen, neue Signaltests anlegen), `docs/BUILDING.md`.

## Ausdrücklich nicht umsetzen

Keine Release-Workflows (→ 11), keine neuen Features.
