# 09 – Tauri-Desktop-Integration

## Ziel und Kontext

Die Angular-App läuft bereits in Tauri 2 (Prompt 00). Jetzt wird sichergestellt, dass
**Mikrofonzugriff, Lifecycle und Desktop-UX** auf macOS, Windows und Linux funktionieren – mit
minimalen Rechten. Die WebViews unterscheiden sich: WKWebView (macOS), WebView2 (Windows),
WebKitGTK (Linux).

## Zuerst prüfen

- Installierte Versionen: `pnpm tauri --version`, `tauri` in `src-tauri/Cargo.lock`.
- `src-tauri/tauri.conf.json` (CSP, Fenster, Bundle), `capabilities/default.json`,
  `Info.plist`, `Entitlements.plist`.
- Stand der Audioaufnahme (02) im Browser.
- Offizielle Doku für die installierte Version (tauri.app, wry-Changelog) – keine APIs erfinden.

## Aufgaben

1. **Mikrofon je Plattform verifizieren** (`pnpm tauri:dev` und Release-Build):
   - macOS: TCC-Dialog erscheint mit `NSMicrophoneUsageDescription`; signierter/
     Hardened-Runtime-Build braucht `com.apple.security.device.audio-input`. Prüfen, ob wry die
     WKWebView-Medienanfrage (`requestMediaCapturePermissionFor…`) ohne Zusatzcode zulässt.
   - Windows: WebView2-Berechtigungsdialog bzw. `PermissionRequested`-Handling; Verhalten bei
     Windows-Datenschutzeinstellung „Mikrofon aus".
   - Linux: WebKitGTK benötigt ggf. aktiviertes Media-Stream-Setting und Behandlung des
     `permission-request`-Signals (über `WebviewWindow::with_webview`). Nur implementieren,
     wenn verifiziert nötig.
     Ergebnisse in `docs/BUILDING.md` / `docs/PRIVACY.md` als Tabelle dokumentieren.
2. **Lifecycle:** Beim Schließen/Minimieren und beim Beenden das Mikrofon freigeben
   (Frontend-Hook auf `onCloseRequested` über den Plattform-Adapter, keine direkten
   `@tauri-apps`-Imports in Features).
3. **Desktop-UX:** Fenstergröße/-position merken (eigener kleiner Command oder
   `tauri-plugin-window-state` mit Begründung), App-Menü (About, Beenden; macOS-Standardmenü),
   Tastenkürzel (Leertaste = Start/Stop, `Cmd/Ctrl+K` = Reset), korrekter App-Name/Icon.
4. **Plattform-Adapter erweitern:** nur Funktionen, die Features wirklich brauchen; jede neue
   Tauri-Funktion als expliziter Command mit Test und Capability-Eintrag.
5. **CSP prüfen** mit dem Worklet-Build (02): `script-src 'self'` muss reichen.
6. **Lokale Builds:** `pnpm tauri:build` auf dem verfügbaren OS, Artefakte starten und
   Mikrofon testen.

## Technische Leitplanken

- Least Privilege: jede Permission begründen. Keine Shell-, HTTP- oder breiten FS-Rechte.
- Web- und Desktop-Funktionsumfang gleichwertig halten; Unterschiede dokumentieren.

## Akzeptanzkriterien

- Morse-Decoder funktioniert in der Desktop-App auf mindestens dem Entwicklungs-OS, Ergebnis
  der anderen Plattformen (getestet/ungetestet) ehrlich dokumentiert.
- Mikrofon-Indikator des OS erlischt nach Stop und beim Schließen.
- `pnpm check` grün, Rust-Tests für neue Commands.

## Dokumentation

`docs/BUILDING.md` (Voraussetzungen je OS), `docs/PRIVACY.md` (Berechtigungen je OS),
`docs/ARCHITECTURE.md` (Commands, Capabilities).

## Ausdrücklich nicht umsetzen

Kein Signieren/Notarisieren und keine Release-Workflows (→ 11), kein Auto-Updater, keine
nativen Audio-Backends in Rust (nur falls WebView-Capture auf einer Plattform nachweislich nicht
funktioniert – dann zuerst als Entscheidungsvorlage dokumentieren).
