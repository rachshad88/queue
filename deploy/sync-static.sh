#!/usr/bin/env bash
# The system is fully Laravel: every asset the app needs already lives in
# public/ and the sound helpers are Laravel routes (SoundController). The
# native tree is archived at /home/user/archive/queue-native-*. No sync is
# performed anymore; this script exists only to avoid breaking old deploy
# playbooks. It exits successfully so automation chains keep working.
set -euo pipefail

PUB="$(cd "$(dirname "$0")/.." && pwd)/public"

if [ ! -d "$PUB/app/sound" ]; then
    echo "error: public/app/sound missing in $PUB" >&2
    exit 1
fi

echo "no-op: repo is fully self-contained (assets in public/, sound handlers are Laravel routes)."