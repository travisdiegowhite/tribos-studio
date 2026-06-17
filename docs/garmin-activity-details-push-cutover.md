# Garmin — Activity Details PUSH cutover (the Edge 540 fix)

> **Supersedes** `docs/garmin-rebuild-cutover.md` (ping/pull) and the §7.3
> pull-token recovery line of work. Those got stuck on
> `InvalidPullTokenException` (OAuth Bearer is not valid for §7.3 pulls). This
> design avoids pulls and FIT files entirely for the steady state.

## What changed and why

The "full data" path used to depend on **FIT files** (Activity API §7.4),
which are Ping-only, delivered for only ~25–30 % of activities, and must be
binary-parsed. Edge 540 FIT files broke the parser → rides stranded as
`data_completeness = 'summary_only'`. The watch happened to get FIT pings /
parse cleanly, so it looked fine.

We now consume **Activity Details Summaries** (§7.3) delivered via **PUSH**:
Garmin puts the activity summary **and** the per-second `samples[]` (GPS, HR,
power, cadence) directly in the webhook body. No FIT file, no pull token, no
binary parsing — device-agnostic, so Edge 540 and the watch behave identically.

The converter `extractStreamsFromActivityDetails()`
(`api/utils/garmin/activityDetailsParser.js`) already turned §7.3 samples into
the exact shape the writer needs; it was previously wired only to the dead
Bearer-pull path. It now runs on the pushed samples.

## Code (already shipped on this branch)

| File | Change |
|---|---|
| `cloudflare-workers/garmin-webhook/src/index.js` | `activityDetails` push (no callbackURL) → `PUSH_ACTIVITY_DETAIL`, stored as `event_type='ACTIVITY_DETAIL_PUSH'` with the **item (samples included)** as payload. Worker `version` → `5.0.0`. |
| `api/utils/garmin2/pingParser.js` | Same classification (canonical mirror of the worker). |
| `api/garmin-webhook-process.js` | New detail branch: `extractStreamsFromActivityDetails(payload)` → `applyParsedResultToActivity()` (shared writer, dual-writes canonical+legacy metrics, refreshes completeness). Works for new, existing, takeover and merge rows. No FIT download, no pull, no backfill nudge for these events. |
| `api/utils/garmin/activityBuilder.js` | Read §7.3 cadence field names (`average{Bike,Run}Cadence…`). |

Tests: `api/utils/garmin/activityDetailsPush.test.js` proves an Edge 540-style
push lands `full`. Full suite green (1510 tests).

## Deploy steps

1. **Vercel** — merge this branch; the processor cron (`garmin-webhook-process`,
   every 5 min) already handles `ACTIVITY_DETAIL_PUSH`.
2. **Cloudflare worker** — deploy separately (Vercel does not):
   ```bash
   cd cloudflare-workers/garmin-webhook && npx wrangler deploy
   curl https://garmin-webhook.tribos.workers.dev/   # expect version "5.0.0"
   ```
3. **Garmin Developer Portal** (`https://apis.garmin.com/tools/endpoints`,
   log in with consumer key/secret) — **the linchpin**:
   - Set **`activityDetails` = Enabled, PUSH**, URL = the worker
     (`https://garmin-webhook.tribos.workers.dev`). (Vercel push fallback is
     `/api/garmin-webhook`, not the ping receiver.)
   - Keep **`activities` = PUSH** (lightweight summary fallback for
     manual/no-sample rides; the detail push upgrades the row to `full`).
   - **`activityFiles` (FIT) can be disabled** — no longer used in steady state.
   - Record the prior config before changing anything.

## Verify (end-to-end gate)

Ride the Edge 540 → sync to Garmin Connect. Within ~1 min:

```sql
SELECT event_type, activity_id, processed
FROM garmin_webhook_events
WHERE event_type = 'ACTIVITY_DETAIL_PUSH'
ORDER BY created_at DESC LIMIT 5;
```
Then within a cron tick:
```sql
SELECT type, name, data_completeness, device_watts, normalized_power,
       effective_power, power_curve_summary IS NOT NULL AS has_pcurve,
       activity_streams IS NOT NULL AS has_streams,
       map_summary_polyline IS NOT NULL AS has_polyline
FROM activities WHERE provider='garmin'
ORDER BY created_at DESC LIMIT 3;
```
Expect `data_completeness='full'`, streams/polyline/pcurve all true. Open the
ride in the Training dashboard / `RideAnalysisModal` — map, power curve, NP all
render. **This is the gate that was failing for the Edge 540.** Confirm a watch
ride still lands `full` too.

## Rollback

Flip the portal `activityDetails` back to its prior config. The legacy
push/FIT processor is still in place (cleanup is deferred), so rides revert to
prior behavior with no data loss.

## Follow-ups (after a ≥48 h soak)

- Delete the dead Bearer §7.3 pull (`fetchActivityDetailsByUploadRange`,
  `garmin-reconcile.js`, `scripts/garmin-pull-backfill.js`), the dormant
  `garmin2-*` set, and the FIT-primary path + backfill nudging.
- Recover historical `summary_only` rides by requesting a §8 backfill for the
  date range (Garmin re-pushes `activityDetails`) or via the portal Summary
  Resender. The old Bearer-pull backfill script stays dead.
