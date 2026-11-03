# Contributing to AudioLab

Thanks for your interest! AudioLab is in early development; the roadmap lives in
[docs/ROADMAP.md](docs/ROADMAP.md) and, in more detail, in [prompts/](prompts/README.md).

## Setup

```bash
pnpm install
pnpm start        # web
pnpm tauri:dev    # desktop (needs Rust + Tauri prerequisites, see docs/BUILDING.md)
```

## Before you open a pull request

```bash
pnpm check        # format, lint, unit tests, web build, Rust fmt/clippy/test
pnpm e2e          # Playwright (run `pnpm e2e:install` once if Chromium is missing)
```

All checks must pass. Do not disable or skip tests to make them green – fix the cause.

## Code rules

- **Layers** (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)): `src/app/audio` and
  `src/app/decoders` are framework-free TypeScript – no Angular, RxJS or Tauri imports (ESLint
  enforces this). Platform-specific code goes through adapters in `src/app/platform`.
- **Strict typing:** no `any`; prefer discriminated unions for states.
- **Performance:** keep per-sample/per-frame work out of Angular change detection; do not put
  large `Float32Array`s into signals; avoid allocations in the audio hot path.
- **Privacy:** never open the microphone without a user action, never log audio content, never
  send audio anywhere. Exports only on explicit request.
- **Dependencies:** prefer browser APIs. A new dependency needs a short justification in the PR
  and in `docs/ARCHITECTURE.md`.
- **Tests:** algorithms need deterministic tests with synthetic signals before they count as
  done. No microphone or manual input in automated tests.
- Angular components: standalone, `OnPush`, signals for local state, small files.

## Commits and changelog

- Small, focused commits with descriptive messages (imperative mood).
- Add user-visible changes to `CHANGELOG.md` under **Unreleased**.

## Reporting bugs

Please include OS, browser or desktop build, audio input device and – for decoder issues – a
description of the signal (speed, tone frequency, noise). Never attach recordings that contain
private conversations.
