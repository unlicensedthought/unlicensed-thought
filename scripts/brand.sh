#!/usr/bin/env bash
# Regenerates the raster brand assets from brand/*.svg (needs rsvg-convert).
set -euo pipefail
cd "$(dirname "$0")/.."
rsvg-convert -w 180 -h 180 static/favicon.svg -o static/apple-touch-icon.png
rsvg-convert -w 512 -h 512 brand/avatar.svg -o brand/avatar-512.png
rsvg-convert -w 1200 -h 630 brand/og.svg -o static/og.png
rsvg-convert -w 1280 -h 640 brand/wordmark.svg -o brand/wordmark.png
rsvg-convert -w 1024 -h 1024 brand/avatar.svg -o brand/icon-1024.png
rsvg-convert -w 1024 -h 1024 brand/eye.svg -o brand/mark-1024-transparent.png
