# 08 – Tone Generator und Audio Recorder

## Ziel und Kontext

Zwei Werkzeugmodule: ein Testton-Generator (für Kalibrierung und Decoder-Tests) und ein lokaler
Recorder mit Export. Export ist die erste Funktion, die Daten das Gerät „verlassen" lässt –
nur auf ausdrückliche Nutzeraktion, Web und Desktop über einen Plattform-Adapter.

## Zuerst prüfen

- Synthese-Code (05), Audio-Pipeline (02), `PlatformAdapter` und Tauri-Capabilities.
- `docs/PRIVACY.md` – Export-Regeln.

## Aufgaben

### Tone Generator

1. Wellenformen: Sinus, Rechteck, Dreieck, Sägezahn, weißes/rosa Rauschen, Sweep (linear/log),
   optional DTMF-Taste und Zwei-Ton.
2. Frequenz, Pegel (dBFS) mit Sicherheitsgrenze und sanftem Ein-/Ausblenden, Stereo-Balance
   optional. Start nur per Klick, deutlicher „Spielt"-Status, Stop beim Verlassen der Seite.

### Audio Recorder

3. Aufnahme aus der bestehenden `AudioSource` (gleiche Geräteauswahl), Pegelanzeige, Dauer,
   maximale Länge (Speicherschutz), Hinweis, dass Aufnahme nur im Arbeitsspeicher liegt.
4. Export als **WAV (PCM 16 bit oder 32 bit float)** mit eigenem, getestetem Encoder
   (kein `MediaRecorder`-Zwang, da Formate je Browser variieren); optional Opus/WebM über
   `MediaRecorder`, wenn verfügbar, klar gekennzeichnet.
5. **Export-Adapter** (`src/app/platform/`): `FileExportAdapter.save(blob, suggestedName)`:
   - Web: Download per `<a download>` bzw. File System Access API, wenn vorhanden.
   - Desktop: Speichern-Dialog über `tauri-plugin-dialog` + Schreiben über `tauri-plugin-fs`
     **mit minimalem Scope** – oder ein eigener Rust-Command, der nur in den vom Dialog
     gewählten Pfad schreibt. Entscheidung + Capability-Änderung dokumentieren.
6. Aufnahme verwerfen; nichts wird automatisch gespeichert.

## Technische Leitplanken

- Neue Tauri-Plugins nur mit Begründung; Capabilities so eng wie möglich (keine `fs:default`
  mit breiten Pfaden).
- Speichergrenze (z. B. 10 min Mono 48 kHz) und Warnung vor Erreichen.

## Akzeptanzkriterien

- WAV-Export lässt sich in gängigen Programmen öffnen; Header-Test gegen Spezifikation.
- Generator → Decoder-Loopback (synthetisch) funktioniert für Morse- und DTMF-Signale.
- Kein Export ohne Klick; Abbruch des Dialogs ist kein Fehler.
- `pnpm check` grün, E2E für Generator-Start/Stop und Web-Download.

## Tests

WAV-Encoder (Header, Byte-Order, Clipping), Generator-Wellenformen (RMS, Frequenz),
Recorder-Lifecycle mit Synthetic-Source, Export-Adapter mit Fakes.

## Dokumentation

`docs/PRIVACY.md` (Export), `docs/ARCHITECTURE.md` (Export-Adapter, ggf. neue Plugins),
README.

## Ausdrücklich nicht umsetzen

Kein Cloud-Upload, keine Bibliothek gespeicherter Aufnahmen, kein Hintergrund-Recording.
