# Sonic Lab — promo site

A single static page: `index.html`, one stylesheet, one script, self-hosted fonts and media.
No build step, no framework, no third-party requests (no CDN, no Google Fonts, no analytics).

```
site/
├── index.html
├── assets/
│   ├── css/site.css        design tokens (taken from the app), layout, motion
│   ├── js/site.js          motion engine: scope, scroll scenes, modules, encoder, …
│   ├── fonts/              Archivo + JetBrains Mono (variable WOFF2, SIL OFL 1.1)
│   └── media/              stills, live captures and posters from the real app
└── tools/
    ├── serve.mjs           local preview under the production path
    └── capture-media.mjs   Playwright script that records the media from the app
```

## Deployment

The page lives at **http://krocon.de/products/sonic-lab/** and says so in
`<base href="/products/sonic-lab/">`; canonical, `og:url` and `og:image` use the full URL. Upload
everything except `tools/` and this README into that folder. To move the site, change those four
places in `index.html` – nothing else contains the path. In-page links (`#privacy` …) and the SVG
ring text are kept on the current document by `site.js`, so `…/index.html` works as well.

## Preview

Because of the base href the site must be served from `/products/sonic-lab/`:

```bash
node site/tools/serve.mjs        # → http://localhost:4330/products/sonic-lab/
```

…or start the `site` configuration in `.claude/launch.json`. Opening `index.html` from disk or a
static server on the `site` folder itself will not find the assets.

## What moves

| Section       | Motion                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Boot          | LED → scan line → wordmark decodes → the screen opens (once per session)                        |
| Hero          | Canvas oscilloscope keys `CQ CQ DE SONIC LAB K`, a decoder types it out; pointer retunes, ▶ Listen plays it in sync (Web Audio) |
| Front panel   | Pinned scroll scene: panel tips up, OLED powers on (real capture), spotlight tour of six controls, dive into the display |
| Modules       | Pinned: scrolling presses F1–F8, the display repaints, titles decode                            |
| Morse         | Six live impairment scopes (noise, fading, clicks, hand keying, Farnsworth, reverb) with measured CER |
| Try it        | Morse encoder with click-free audio scheduled on the audio clock                                |
| Elsewhere     | Velocity-driven marquee, count-ups, contained privacy rings, tilt cards, blinking finale        |

`prefers-reduced-motion` gets still frames, no pinning and no autoplay. Canvases sleep off screen.

## Numbers on the page

All figures come from the project's own documentation, mainly `docs/AUDIO-PIPELINE.md`
(seeded robustness suite and the real-recording corpus). Update them together.

## Regenerating the media

1. `pnpm start` (web app on :1420).
2. `node site/tools/capture-media.mjs http://localhost:1420 /tmp/sonic-lab-media`
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
