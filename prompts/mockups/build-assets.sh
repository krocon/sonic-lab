#!/usr/bin/env bash
# Cuts the hardware parts for the look & feel mockups out of the reference photo
# (prompts/kenwood.png) and the template (prompts/template.psd).
# Needs ImageMagick 7 (`magick`). Run from anywhere: prompts/mockups/build-assets.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
K="$here/../kenwood.png"
out="$here/assets"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

magick "$here/../template.psd[0]" "$tmp/template.png"
T="$tmp/template.png"

# crop <src> <WxH+X+Y> <name>
crop() { magick "$1" -crop "$2" +repage "$tmp/$3.png"; }

# Copies one clean pixel column over a range of columns – wipes a printed legend
# while keeping the vertical shading of the key face.
# wipe_cols <name> <clean col> <first col> <width> [<first row> <height>]
wipe_cols() {
  local f="$tmp/$1.png" h y
  h="${6:-$(magick identify -format %h "$f")}"
  y="${5:-0}"
  magick "$f" \( +clone -crop "1x${h}+$2+${y}" +repage -scale "${4}x${h}!" \) \
    -geometry "+$3+${y}" -composite "$f"
}

# Same with one clean row over a range of rows.
# wipe_rows <name> <clean row> <first row> <height>
wipe_rows() {
  local f="$tmp/$1.png" w
  w="$(magick identify -format %w "$f")"
  magick "$f" \( +clone -crop "${w}x1+0+$2" +repage -scale "${w}x${4}!" \) \
    -geometry "+0+$3" -composite "$f"
}

# Knobs and the jog dial
crop "$K" 166x158+524+163 dial
crop "$K" 66x60+686+16 knob-arc
crop "$K" 78x66+737+128 knob-multi
crop "$K" 78x65+849+130 knob-scale

# F key: "F1" wiped, the white bar stays
crop "$K" 42x60+49+260 key-f
wipe_rows key-f 22 23 11

# Plain key ("MONI" wiped)
crop "$K" 32x21+740+92 key
wipe_cols key 4 5 24 5 11

# Number key with purple tag ("1" / "1.8" wiped)
crop "$K" 38x28+479+33 key-num
wipe_cols key-num 7 9 22 2 9
wipe_cols key-num 7 9 22 12 13

# Keys whose printing we keep
crop "$K" 38x21+689+111 key-menu
crop "$K" 28x26+9+284 key-esc
crop "$K" 24x18+480+142 key-rec
crop "$K" 24x18+509+142 key-stop
crop "$K" 24x18+538+142 key-play
crop "$T" 30x26+447+29 key-side

# Plain faceplate (right part of the template)
crop "$T" 250x300+482+6 faceplate

# Upscale 4× with a sharper filter than the browser's bilinear scaling
for f in "$tmp"/*.png; do
  name="$(basename "$f")"
  [[ "$name" == template.png ]] && continue
  magick "$f" -filter Lanczos -resize 400% -unsharp 0x1.5+0.7+0 "$out/$name"
done

ls -1 "$out"
