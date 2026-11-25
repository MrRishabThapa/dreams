#!/usr/bin/env bash
# Builds every icon, launch image and in-app logo from Rishab's official logo (public/logo.png).
# The logo is only cropped, padded and resized: never redrawn. Its soft dark glow is
# semi-transparent, so it sits on a solid backing that matches the glow (#160E20).
# Requires ImageMagick 7 (`magick`).
set -euo pipefail
cd "$(dirname "$0")/../public"
SRC=logo.png
BG='#160E20'          # backing colour sampled from the logo's glow
CX=635; CY=607        # centre of the mark in logo.png (mark is 513×469 px)

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
magick "$SRC" -background "$BG" -flatten "$tmp/flat.png"

# square crop of side $1 around the mark, onto the backing (pads if it runs past the edge)
crop() { local s=$1; magick "$tmp/flat.png" -gravity NorthWest -background "$BG" -extent 2000x2000-373-373 \
  -crop "${s}x${s}+$((CX + 373 - s / 2))+$((CY + 373 - s / 2))" +repage "$2"; }

crop 740 "$tmp/icon.png"        # mark ≈ 69% of the icon (iOS rounds the corners itself)
crop 1000 "$tmp/maskable.png"   # mark ≈ 51%: well inside the 80% maskable safe circle

magick "$tmp/icon.png" -resize 180x180 -strip apple-touch-icon.png
magick "$tmp/icon.png" -resize 192x192 -strip icon-192.png
magick "$tmp/icon.png" -resize 512x512 -strip icon-512.png
magick "$tmp/maskable.png" -resize 512x512 -strip icon-maskable-512.png
magick "$tmp/icon.png" -resize 64x64 -strip favicon.png
# in-app logo: 128 pt shown at most, so 384 px covers 3x displays
magick "$tmp/icon.png" -resize 384x384 -strip logo-mark.png

# iPhone X launch images (1125×2436): a rounded logo tile on the app background
tile=300; r=68
magick "$tmp/icon.png" -resize ${tile}x${tile} \
  \( -size ${tile}x${tile} xc:none -fill white -draw "roundrectangle 0,0,$((tile-1)),$((tile-1)),$r,$r" \) \
  -compose DstIn -composite "$tmp/tile.png"
for mode in light dark; do
  bg=$([ $mode = light ] && echo '#F2F2F7' || echo '#000000')
  magick -size 1125x2436 "xc:$bg" "$tmp/tile.png" -gravity center -compose Over -composite -strip "splash-iphonex-$mode.png"
done
echo "icons written from $SRC"
