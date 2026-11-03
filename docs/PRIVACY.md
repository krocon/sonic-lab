# Privacy

AudioLab is designed so that audio never leaves your device.

## Principles

- **Local processing only.** All capture, analysis and decoding run inside the browser or the
  desktop WebView. There is no backend server.
- **No telemetry.** AudioLab sends no analytics, crash reports or usage data. The Angular CLI
  analytics are disabled in the project configuration.
- **Microphone on user action only.** Access is requested only after you press **Start**. The
  stream is stopped when you press **Stop**, leave the view, close or hide the page
  (`pagehide`), close the window or quit the app. If the device disappears, capture stops and a
  message explains what happened. Capture belongs to the module you are in: while it runs, the
  module shows "Listening" next to its lit Stop key (the synthetic demo input never opens the
  microphone).
- **No browser voice processing.** Echo cancellation, noise suppression and automatic gain are
  switched off – not for privacy, but so that the signal is analysed as it arrives.
- **No background recording.** Nothing is captured while capture is not visibly running.
- **No audio in logs.** Sample data is never written to the console or log files.
- **Export only on request.** The Audio Recorder keeps recordings in memory only (max. 10 min);
  leaving the page discards them. A WAV file is written only when you press _Export…_ and pick a
  location – in the browser via the file picker or a download, on the desktop via the native save
  dialog opened by the Rust command `export_file`, which writes exactly to the chosen path. The
  webview itself has no file-system or dialog permission.
- **Local preferences.** The only persisted data are UI preferences in the browser's
  `localStorage`: the chosen input device id (`audiolab.capture`) and module settings
  (`audiolab.morse`, `audiolab.encoder` incl. the text to encode, `audiolab.spectrum`,
  `audiolab.generator`).

## Web: secure context

Browsers expose `getUserMedia` only in a secure context: `https://…` or `http://localhost`.
A deployed web build must therefore be served over HTTPS. In an insecure context, pressing
**Start** explains that microphone access needs a secure connection.

## Desktop permissions

The desktop app attaches an explicit web-permission policy to its webview
(`src-tauri/src/permissions.rs`): **microphone allowed, everything else denied** (camera, screen
capture, location, notifications, clipboard read, …). Without it, wry would grant every media
capture request on macOS, WebView2 would show its own prompt and WebKitGTK would decide itself
(verified in the wry 0.57.1 sources used by Tauri 2.12.5).

| Platform | Operating-system layer                                                                                                                                                                       | WebView layer                                                                             | Verified                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| macOS    | TCC prompt with `NSMicrophoneUsageDescription` (Info.plist, verified in the built bundle); hardened-runtime entitlement `com.apple.security.device.audio-input` (effective in signed builds) | WKWebView `requestMediaCapturePermission…` → policy → grant microphone only               | Build ✓, app start ✓; microphone capture in the desktop app **not yet verified** (needs an interactive session) |
| Windows  | Settings → Privacy → Microphone must allow desktop apps                                                                                                                                      | WebView2 `PermissionRequested` → policy                                                   | not verified (no Windows machine); compiled in CI                                                               |
| Linux    | PipeWire/PulseAudio device access                                                                                                                                                            | WebKitGTK: `enable-media-stream` is switched on explicitly, `permission-request` → policy | not verified; compiled in CI only                                                                               |

Capture continues while the window is minimised (decoding in the background is a use case); the
microphone is released on Stop, when leaving the view, and when the window closes (the process
ends). Tauri capabilities stay at `core:default`: no file system, shell or network plugins.
