# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting
("Security" tab → "Report a vulnerability") or contact the maintainer privately.

Helpful details: affected version and platform (browser or desktop OS), steps to reproduce,
impact. You will get an answer within two weeks.

## Scope notes

Sonic Lab processes audio locally. Relevant areas include: the desktop shell's commands and
capabilities (`src-tauri/`), the web permission policy, file export, the Content Security Policy
and anything that could make audio leave the device or open the microphone without a user action.
