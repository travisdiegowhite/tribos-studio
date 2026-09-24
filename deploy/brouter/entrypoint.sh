#!/bin/sh
# Sync tiles when the volume is empty (first boot) or when asked, start the
# server, and keep a weekly refresh running beside it.
set -u
DEST="${SEGMENTSPATH:-/segments4}"
mkdir -p "$DEST" "${CUSTOMPROFILESPATH:-/customprofiles}"

if [ "${SYNC_ON_START:-0}" = "1" ] || [ -z "$(ls -A "$DEST" 2>/dev/null | grep '\.rd5$')" ]; then
  echo "entrypoint: syncing segments before start"
  /app/sync-segments.sh || echo "entrypoint: initial sync had failures; starting anyway"
fi

(
  while true; do
    sleep "${RESYNC_INTERVAL_S:-604800}"
    echo "entrypoint: weekly segment refresh"
    /app/sync-segments.sh || echo "entrypoint: refresh had failures; will retry next interval"
  done
) &

exec /app/server.sh
