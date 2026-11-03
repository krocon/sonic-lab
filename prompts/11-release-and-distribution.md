# 11 – Release und Distribution

## Ziel und Kontext

Reproduzierbare Releases: Web-Build (statisches Hosting) und Desktop-Artefakte für macOS
(Apple Silicon + Intel bzw. Universal), Windows (MSI/NSIS) und Linux (AppImage, deb, rpm)
über GitHub Actions und GitHub Releases.

## Zuerst prüfen

- `.github/workflows/` (CI aus 10), Versionen in `package.json`, `src-tauri/Cargo.toml`,
  `tauri.conf.json` (`version: "../package.json"`).
- Lizenz: MIT (`LICENSE`) – im Bundle über `licenseFile` enthalten.
- Vorlage: `files-and-folders-tauri/.github/workflows/release.yml` und `scripts/version.mjs`.

## Aufgaben

1. **Versionierung:** SemVer, eine Quelle der Wahrheit (`package.json`), Skript
   `scripts/version.mjs check|set` synchronisiert `Cargo.toml`/`Cargo.lock`; CI prüft Gleichstand.
2. **Release-Workflow** (`.github/workflows/release.yml`), Auslöser: Tag `v*`:
   - Matrix: `macos-latest` (aarch64 + x86_64 bzw. `universal-apple-darwin`),
     `windows-latest`, `ubuntu-22.04` (ältere glibc für AppImage-Kompatibilität).
   - `tauri-apps/tauri-action` (Version prüfen) oder eigene Schritte; Artefakte als Draft-Release.
   - Linux-Abhängigkeiten (`libwebkit2gtk-4.1-dev` usw.) gemäß offizieller Tauri-Doku.
3. **Signierung (vorbereitet, optional):** macOS Developer ID + Notarisierung, Windows
   Code-Signing – nur über GitHub Secrets, Workflow läuft ohne Secrets unsigniert durch und
   dokumentiert die Folgen (Gatekeeper/SmartScreen-Warnungen).
4. **Web-Release:** `pnpm build` → Artefakt; optional GitHub Pages (Hash-Routing macht Rewrites
   unnötig; `--base-href` beachten). HTTPS ist für Mikrofonzugriff Pflicht.
5. **Release Notes:** aus `CHANGELOG.md` (Abschnitt der Version) generieren.
6. **Checksummen** (SHA-256) für alle Artefakte.
7. Optional: Third-Party-Notices für npm- und Cargo-Abhängigkeiten.

## Technische Leitplanken

- Keine Secrets im Repo; `permissions` im Workflow minimal (`contents: write` nur im Release-Job).
- Actions auf feste Versionen/SHAs pinnen.

## Akzeptanzkriterien

- Ein Test-Tag erzeugt einen Draft-Release mit Artefakten für alle drei Plattformen
  (oder dokumentierte Begründung, welche fehlen).
- Version-Check schlägt bei Abweichung fehl.

## Dokumentation

`docs/BUILDING.md` (Release-Prozess), `CONTRIBUTING.md` (Release-Checkliste), `CHANGELOG.md`.

## Ausdrücklich nicht umsetzen

Kein Auto-Updater, keine App-Store-Distribution (Mac App Store, Microsoft Store, Flathub) –
höchstens als Roadmap-Punkt.
