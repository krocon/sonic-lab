# Privacy

AudioLab is designed so that audio never leaves your device.

## Principles

- **Local processing only.** All capture, analysis and decoding run inside the browser or the
  desktop WebView. There is no backend server.
- **No telemetry.** AudioLab sends no analytics, crash reports or usage data. The Angular CLI
  analytics are disabled in the project configuration.
- **Microphone on user action only.** Access is requested only after you press **Start**. The
  stream is stopped when you press **Stop**, leave the view, close the window or quit the app.
- **No background recording.** Nothing is captured while capture is not visibly running.
- **No audio in logs.** Sample data is never written to the console or log files.
- **Export only on request.** Recordings or results are saved only when you explicitly export
  them; nothing is stored automatically.
- **Local preferences.** The only persisted data are UI preferences (e.g. theme) in the
  browser's `localStorage`.

## Web: secure context

Browsers expose `getUserMedia` only in a secure context: `https://…` or `http://localhost`.
A deployed web build must therefore be served over HTTPS. AudioLab shows a warning in the status
bar when it runs in an insecure context.

## Desktop permissions

| Platform | Mechanism                                                                                                                    | Status                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| macOS    | System prompt using `NSMicrophoneUsageDescription`; `com.apple.security.device.audio-input` entitlement for hardened runtime | configured, to verify (prompts/09) |
| Windows  | WebView2 permission prompt; Windows privacy setting "Microphone access" must allow desktop apps                              | to verify (prompts/09)             |
| Linux    | WebKitGTK media permission handling; PipeWire/PulseAudio device access                                                       | to verify (prompts/09)             |

Tauri capabilities follow least privilege: the main window has `core:default` only, no file
system, shell or network plugins.
