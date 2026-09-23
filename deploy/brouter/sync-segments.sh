#!/bin/sh
# Download (or refresh) the BRouter .rd5 tiles for the contiguous United
# States into $SEGMENTSPATH. Tiles are 5° squares named by their south-west
# corner; ocean squares don't exist upstream and are skipped. `curl -z`
# only downloads a tile when the upstream copy is newer, so a weekly run is
# a few hundred MB, not three GB.
#
#   SEGMENTS_SOURCE  upstream directory (default brouter.de/brouter/segments4)
#   SEGMENTSPATH     destination (default /segments4)
set -u
SRC="${SEGMENTS_SOURCE:-https://brouter.de/brouter/segments4}"
DEST="${SEGMENTSPATH:-/segments4}"
mkdir -p "$DEST"

downloaded=0; fresh=0; missing=0; failed=0
for lon in 125 120 115 110 105 100 95 90 85 80 75 70; do
  for lat in 25 30 35 40 45; do
    tile="W${lon}_N${lat}.rd5"
    url="$SRC/$tile"
    out="$DEST/$tile"
    code=$(curl -fsS -L --retry 3 --retry-delay 5 -z "$out" -o "$out.part" -w '%{http_code}' "$url" 2>/dev/null) || code="000"
    case "$code" in
      200) mv -f "$out.part" "$out"; downloaded=$((downloaded + 1)); echo "  fetched $tile" ;;
      304) rm -f "$out.part"; fresh=$((fresh + 1)) ;;
      404) rm -f "$out.part"; missing=$((missing + 1)) ;;
      *)   rm -f "$out.part"; failed=$((failed + 1)); echo "  FAILED $tile ($code)" ;;
    esac
  done
done
echo "segments: $downloaded downloaded, $fresh up to date, $missing not on upstream (ocean), $failed failed"
echo "segments: $(du -sh "$DEST" 2>/dev/null | cut -f1) in $DEST"
[ "$failed" -eq 0 ]
