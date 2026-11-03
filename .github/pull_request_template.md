## What and why

<!-- Short description of the change and the motivation. Link issues with "Fixes #…". -->

## Checklist

- [ ] `pnpm check` passes (version sync, format, lint, tests, build, Rust)
- [ ] `pnpm e2e` passes, or the change cannot affect the UI
- [ ] Algorithms changed? Tests with synthetic signals added/updated; CER limits not loosened
- [ ] Layer rules kept (`audio/`, `decoders/` framework-free; no `@tauri-apps/*` in features)
- [ ] No new dependency – or it is justified here and in `docs/ARCHITECTURE.md`
- [ ] Privacy: no audio leaves the device, no audio in logs, microphone only after user action
- [ ] `CHANGELOG.md` (Unreleased) and affected docs updated
