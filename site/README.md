# Sonic Lab — promo site

A single static page: `index.html`, one stylesheet, one script, self-hosted fonts and media.
No framework and no third-party requests (no CDN, no Google Fonts, no analytics). The sources run
as they are; the build only produces a lean, checked copy for the upload.

```
site/
├── index.html
├── assets/
│   ├── css/site.css        design tokens (taken from the app), layout, motion
│   ├── js/site.js          motion engine: scope, scroll scenes, modules, encoder, …
│   ├── fonts/              Archivo + JetBrains Mono (variable WOFF2, SIL OFL 1.1)
│   └── media/              stills, live captures and posters from the real app
└── tools/
    ├── build.mjs           pnpm site:build
    ├── deploy.mjs          pnpm site:deploy
    ├── serve.mjs           pnpm site:serve / site:preview
    └── capture-media.mjs   pnpm site:media
```

## Scripts

| Script              | What it does                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm site:build`   | Builds `dist/site`: copy without `tools/` and this README, JS and CSS minified with esbuild, a content hash on both in `index.html` (`?v=…`), the web app in `app/` with base href `/products/sonic-lab/app/`, and a check that every file referenced by `index.html` and the stylesheet exists – the build fails otherwise. `--no-app` skips the app. Also part of `pnpm check`. |
| `pnpm site:deploy`  | Builds, then uploads `dist/site` by FTPS (see below). `--dry-run` only shows what would happen, `--prune` also deletes remote files that are not part of the build.                                                                                                                                                                                                               |
| `pnpm site:serve`   | Serves the sources from `site/` at http://localhost:4330/products/sonic-lab/ – edit and reload.                                                                                                                                                                                                                                                                                   |
| `pnpm site:preview` | Builds, then serves `dist/site` at http://localhost:4331/products/sonic-lab/ (app: …/app/) – exactly what gets uploaded.                                                                                                                                                                                                                                                          |
| `pnpm site:media`   | Records stills and live display captures from the running app (see below).                                                                                                                                                                                                                                                                                                        |

`node site/tools/build.mjs <dir>` builds into another folder.

## Deployment

| URL                                       | What                                         |
| ----------------------------------------- | -------------------------------------------- |
| https://krocon.de/products/sonic-lab/     | promo page                                   |
| https://krocon.de/products/sonic-lab/app/ | the web app (needs HTTPS for the microphone) |

Both come from one build: upload the **contents** of `dist/site` into the folder the web server
publishes as `/products/sonic-lab/` – by hand, or with `pnpm site:deploy`:

1. `cp .env.deploy.example .env.deploy` (repository root, git-ignored – never commit credentials,
   this repository is public) and fill in host, user and `SITE_FTP_DIR`. Leave the password empty
   to be asked for it on every deploy.
2. `pnpm site:deploy --dry-run` – connects, lists what would be uploaded and which remote files are
   not part of the build.
3. `pnpm site:deploy` uploads (FTPS with explicit TLS; `index.html` last, so the new page goes live
   only when its assets are there) and checks that the live page serves this build. Add `--prune`
   to delete leftovers; it refuses to run in a folder that is not named `sonic-lab`.

Do not upload `dist/audiolab/browser` (the plain `pnpm build`) there: it is built for `/` and
looks for its files in the server root.

The page says where it lives in `<base href="/products/sonic-lab/">`; canonical, `og:url` and
`og:image` use the full URL. To move it, change those four places in `index.html` (and `PREFIX` in
`tools/serve.mjs`) – the app's base href follows from the page's. In-page links (`#privacy` …) and
the SVG ring text are kept on the current document by `site.js`, so `…/index.html` works as well.

Because of the base href the site must be served from `/products/sonic-lab/`, locally too: opening
`index.html` from disk or a static server on the `site` folder itself will not find the assets. The
`site` configuration in `.claude/launch.json` runs `site/tools/serve.mjs`.

## What moves

| Section     | Motion                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Boot        | LED → scan line → wordmark decodes → the screen opens (once per session)                                                        |
| Hero        | Canvas oscilloscope keys `CQ CQ DE SONIC LAB K`, a decoder types it out; pointer retunes, ▶ Listen plays it in sync (Web Audio) |
| Front panel | Pinned scroll scene: panel tips up, OLED powers on (real capture), spotlight tour of six controls, dive into the display        |
| Modules     | Pinned: scrolling presses F1–F8, the display repaints, titles decode                                                            |
| Morse       | Six live impairment scopes (noise, fading, clicks, hand keying, Farnsworth, reverb) with measured CER                           |
| Try it      | Morse encoder with click-free audio scheduled on the audio clock                                                                |
| Elsewhere   | Velocity-driven marquee, count-ups, contained privacy rings, tilt cards, blinking finale                                        |

`prefers-reduced-motion` gets still frames, no pinning and no autoplay. Canvases sleep off screen.

## Numbers on the page

All figures come from the project's own documentation, mainly `docs/AUDIO-PIPELINE.md`
(seeded robustness suite and the real-recording corpus). Update them together.

## Regenerating the media

1. `pnpm start` (web app on :1420).
2. `pnpm site:media` – or `node site/tools/capture-media.mjs <appUrl> <outDir>`; defaults are
   `http://localhost:1420` and `/tmp/sonic-lab-media`.
3. Convert (cwebp, ffmpeg):

```bash
M=$PWD/site/assets/media   # run from the repository root
cd /tmp/sonic-lab-media
for n in morse-decoder dtmf-decoder frequency-analyzer spectrum-analyzer signal-monitor morse-encoder tone-generator audio-recorder; do
  cwebp -q 82 -resize 1600 0 $n-oled.png -o $M/$n.webp
done
cwebp -q 84 -resize 2400 0 morse-decoder.png -o $M/device-morse.webp
# live display: crop the 2× frames to the display box (x37 y33 w1018 h747 at 1×)
ffmpeg -f concat -safe 0 -i cast-morse/list.txt -vf "crop=2036:1492:74:66,fps=30,format=yuv420p" -c:v libx264 -crf 14 morse-full.mp4
ffmpeg -i morse-full.mp4 -t 14.35 -vf "scale=1600:-2:flags=lanczos:in_range=pc:out_range=tv,fade=t=in:st=0:d=0.3,fade=t=out:st=13.95:d=0.4,format=yuv420p" \
  -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:v libx264 -crf 27 -preset slow -tune animation -movflags +faststart -an $M/live-morse.mp4
```

The same two ffmpeg steps with `cast-spectrum`, `-t 12` and a fade-out at 11.6 s give
`live-spectrum.mp4`; posters are single frames of the full-quality clips saved as WebP.

The Morse loop ends after `…SONIC LAB K` (≈ 14.3 s); the spectrum loop runs 12 s.
