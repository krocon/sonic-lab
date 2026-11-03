# 12 – Dokumentation und Open Source

## Ziel und Kontext

AudioLab soll als professionelles Open-Source-Projekt nutzbar und beitragsfreundlich sein.
Dieser Prompt bringt die Dokumentation auf den aktuellen Stand des Codes. Er kann nach jedem
Meilenstein erneut ausgeführt werden.

## Zuerst prüfen

- Alle Dokumente: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE` (falls vorhanden),
  `docs/*.md`.
- Tatsächlichen Funktionsumfang (Modulkatalog-Status, Tests, Workflows) – Dokumentation darf
  nichts versprechen, was nicht existiert.

## Aufgaben

1. **README.md:** Kurzbeschreibung, Screenshots (echte Screenshots erzeugen, z. B. per
   Playwright-Skript nach `docs/images/`), Features mit Status, Datenschutz-Kurzfassung,
   Installation (Web/Desktop), Entwicklung, Tests, Browser-Kompatibilität, Lizenz.
2. **docs/ARCHITECTURE.md:** Schichten, Module, Datenfluss, ADRs aktuell halten.
3. **docs/AUDIO-PIPELINE.md:** Algorithmen, Parameter, Messwerte, bekannte Grenzen.
4. **docs/PRIVACY.md:** Was passiert mit Audio, Berechtigungen je Plattform, Export, keine
   Telemetrie; Secure-Context-Erklärung.
5. **docs/BUILDING.md:** Voraussetzungen je OS, Befehle, Versionen, Troubleshooting.
6. **docs/ROADMAP.md:** erledigt / in Arbeit / geplant, offene Entscheidungen.
7. **CONTRIBUTING.md:** Setup, Branch-/Commit-Konventionen, Code-Regeln (Schichten, kein `any`,
   Tests vor „fertig"), PR-Checkliste, Verhaltenskodex (Verweis oder `CODE_OF_CONDUCT.md`).
8. **LICENSE:** MIT ist entschieden. Prüfen, dass `LICENSE`, `package.json`, `src-tauri/Cargo.toml`
   und `tauri.conf.json` (`bundle.license`, `licenseFile`) übereinstimmen und das Copyright-Jahr stimmt.
9. GitHub-Vorlagen: `.github/ISSUE_TEMPLATE/` (Bug mit Plattform/Browser/Gerät, Feature),
   `.github/pull_request_template.md`, optional `SECURITY.md`.
10. Links und Befehle in allen Dokumenten prüfen (Befehle tatsächlich ausführen).

## Technische Leitplanken

Dokumentation auf Englisch (Open-Source-Zielgruppe), Prompts in `prompts/` auf Deutsch.
Prettier für Markdown verwenden.

## Akzeptanzkriterien

- Keine Aussage in der Doku widerspricht dem Code; alle genannten Befehle funktionieren.
- `pnpm format:check` grün (inkl. Markdown, falls in das Skript aufgenommen).

## Ausdrücklich nicht umsetzen

Keine Code-Features; keine Website/Landing Page (höchstens Roadmap).
