#!/usr/bin/env bash
# Copies the native static assets (JS, CSS, sound clips) into public/ so the
# repository is fully self-contained. The PHP handlers (serve.php and
# voice/check.php) intentionally stay in the native tree — nginx still executes
# them from /home/user/queue/app/sound/ while every static file is served from
# the repo.
set -euo pipefail

SRC=/home/user/queue
PUB="$(cd "$(dirname "$0")/.." && pwd)/public"

cp -a "$SRC/js/." "$PUB/js/"
cp -a "$SRC/css/." "$PUB/css/"
mkdir -p "$PUB/app/sound"
cp -a "$SRC/app/sound/." "$PUB/app/sound/"
rm -f "$PUB/app/sound/serve.php" "$PUB/app/sound/voice/check.php"

echo "static assets synced to $PUB"