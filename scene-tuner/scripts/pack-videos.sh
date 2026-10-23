#!/usr/bin/env bash
# Stack two renders (glass on top, glow underneath) into ONE web video so the
# two layers can never drift out of sync in the browser.
#
# Usage:
#   scripts/pack-videos.sh TOP BOTTOM OUT.mp4 [WIDTH] [CRF]
#
# TOP / BOTTOM can be video files or image sequences, e.g.
#   scripts/pack-videos.sh glass.mov glow.mov hero.mp4
#   scripts/pack-videos.sh "renders/glass_%04d.png" "renders/glow_%04d.png" hero.mp4 1920 22
#
# WIDTH defaults to 1920 (each half keeps its aspect ratio). CRF: lower =
# better quality + bigger file (18–28 is sensible, default 22). Image
# sequences are read at FPS (default 30, override with FPS=24 env var).
#
# In Scene Tuner, load OUT.mp4 with "Packed video…".
set -euo pipefail

if [ $# -lt 3 ]; then sed -n '2,17p' "$0"; exit 1; fi
TOP=$1; BOTTOM=$2; OUT=$3; WIDTH=${4:-1920}; CRF=${5:-22}; FPS=${FPS:-30}

input() {
  if [[ "$1" == *%* ]]; then echo "-framerate $FPS -i $1"; else echo "-i $1"; fi
}

# shellcheck disable=SC2046
ffmpeg -y $(input "$TOP") $(input "$BOTTOM") \
  -filter_complex "[0:v]scale=${WIDTH}:-2,setsar=1[a];[1:v]scale=${WIDTH}:-2,setsar=1[b];[a][b]vstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -preset slow -crf "$CRF" -profile:v high -movflags +faststart \
  -shortest "$OUT"

echo "Packed -> $OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$OUT" | sed 's/^/  size,fps: /'
du -h "$OUT" | cut -f1 | sed 's/^/  file size: /'
