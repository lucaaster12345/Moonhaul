#!/usr/bin/env bash
set -euo pipefail

: "${TWITCH_STREAM_KEY:?TWITCH_STREAM_KEY is required}"
STREAM_URL="${STREAM_URL:-http://127.0.0.1:3000/stream}"
STREAM_WIDTH="${STREAM_WIDTH:-1280}"
STREAM_HEIGHT="${STREAM_HEIGHT:-720}"
STREAM_FPS="${STREAM_FPS:-15}"
STREAM_BITRATE="${STREAM_BITRATE:-1800k}"
DISPLAY="${DISPLAY:-:99}"
export DISPLAY

cleanup() {
  kill "${CHROMIUM_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

Xvfb "$DISPLAY" -screen 0 "${STREAM_WIDTH}x${STREAM_HEIGHT}x24" -nolisten tcp &
XVFB_PID=$!
sleep 1
chromium --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-software-rasterizer=false --window-size="${STREAM_WIDTH},${STREAM_HEIGHT}" --window-position=0,0 --kiosk "$STREAM_URL" &
CHROMIUM_PID=$!

ffmpeg -hide_banner -loglevel warning -f x11grab -draw_mouse 0 -video_size "${STREAM_WIDTH}x${STREAM_HEIGHT}" -framerate "$STREAM_FPS" -i "$DISPLAY" \
  -an -c:v libx264 -preset veryfast -tune stillimage -pix_fmt yuv420p -b:v "$STREAM_BITRATE" -maxrate "$STREAM_BITRATE" -bufsize 3600k -g "$((STREAM_FPS * 2))" \
  -f flv "rtmp://live.twitch.tv/app/${TWITCH_STREAM_KEY}"
