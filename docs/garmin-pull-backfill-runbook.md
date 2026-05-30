# Garmin Pull Backfill — Runbook

> **Status:** Code shipped in PR #772 (Phase 7). Backfill script NOT yet run
> against production. ~377 stranded `summary_only` activities remain.
> **Owner:** travisdiegowhite
> **Last updated:** 2026-05-30
> **Related docs:**
> - `docs/garmin-integration-context.md` — full Garmin architecture & history
> - `docs/garmin-webhook-refactoring.md` — Phase 0–3 refactor notes
> - `CLAUDE.md` § "Garmin reliability rollout" (implicit — this is Phase 7)

---

## Why this exists

Garmin delivers the `ACTIVITY_FILE_DATA` webhook (the one carrying the FIT
file URL) for only ~25–30% of activities. The other ~70% arrive as a
`CONNECT_ACTIVITY` summary and then nothing — leaving the row stranded
as `data_completeness = 'summary_only'` (no streams, no polyline, no power
curve). Phase 4's retry mechanism could only ask Garmin to re-emit the
missing webhook, which doesn't help when Garmin's pipeline never produced
the event in the first place.

**Phase 7** (PR #772, merged) added a direct PULL path against
`/wellness-api/rest/activityDetails` (Activity API v1.2.5 §7.3) — a
synchronous JSON endpoint that returns the same sample data the missing
webhook would have delivered. The cron and the user-button now use this
path on every recovery attempt. Steady-state new activities are now
self-healing within 15 min.

**What's left:** the ~377 rows that pre-date the merge. They sit in
`summary_only` because the old retry path never recovered them. The
one-shot script `scripts/garmin-pull-backfill.js` walks all of them and
Pulls in 24h windows.

---

## What "done" looks like

```sql
SELECT data_completeness, COUNT(*)
FROM activities
WHERE provider = 'garmin'
GROUP BY 1;
```

`summary_only` count drops from ~377 to <50 (the remainder will be
activities Garmin no longer has — older than its ~30d retention window,
or for users who revoked Activity Details consent).

---

## Prerequisites

1. **Local dev machine** with the repo cloned and `.env` containing
   `SUPABASE_URL` and **`SUPABASE_SERVICE_KEY`** (NOT the anon key — the
   script updates rows across users and needs to bypass RLS).
2. **Node ≥ 20** (uses native `--env-file` support).
3. **Fresh `node_modules`** — Phase 7 added a transitive import of
   `easy-fit` via `fitParser.js`. Stale installs throw `MODULE_NOT_FOUND`.

   ```bash
   rm -rf node_modules && npm install
   ```

4. **Production Vercel cron healthy** — verify `garmin-reconcile` has been
   running successfully since the PR #772 deploy. Check Vercel dashboard
   → Functions → Cron, or:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
        https://www.tribos.studio/api/garmin-reconcile
   ```

   Should return `{"success":true, ...}` with sane counts. If the cron is
   failing, fix that first — the script and the cron share code paths.

---

## Procedure

### 1. Dry-run first

```bash
cd ~/projects/tribos-studio
node --env-file=.env scripts/garmin-pull-backfill.js
```

Reads from production but writes nothing. Output shape per user:

```
User abc12345… (12 activities)  recovered=10 no_match=2 errors=0
```

Followed by a `Totals` JSON block. **Expected outcome:** the bulk should
land in `recovered`. A nonzero `no_match` is normal (Garmin doesn't have
the data, those rows will eventually be marked `unrecoverable`). A
nonzero `errors` warrants investigation before proceeding to commit.

### 2. Small commit batch

Validate one user end-to-end before touching all 377 rows:

```bash
node --env-file=.env scripts/garmin-pull-backfill.js --commit --limit 50
```

Then spot-check:

```sql
-- Pick any activity that just flipped to 'full'
SELECT id, data_completeness, average_watts, normalized_power,
       map_summary_polyline IS NOT NULL AS has_polyline,
       activity_streams IS NOT NULL AS has_streams
FROM activities
WHERE provider = 'garmin'
  AND updated_at > NOW() - INTERVAL '5 minutes'
ORDER BY updated_at DESC
LIMIT 10;
```

Open the same activity in the app (Training dashboard → click ride). It
should now have the GPS map, power chart, and HR/cadence streams. If
ANY of those are still missing for a row that flipped to `full`, stop
and investigate before proceeding.

### 3. Full sweep

```bash
node --env-file=.env scripts/garmin-pull-backfill.js --commit
```

Default `--limit 500` covers all 377. Sequential per-user with a 250ms
gap between Pull calls. Expect ~5–10 minutes wall-clock.

### 4. Verify

Re-run the baseline query from "What 'done' looks like" above.
`summary_only` should be in the tens.

---

## Constraints to respect (from other docs)

These are not optional — violating any of them has caused production
incidents in the past. The Phase 7 code follows all of them; if you're
adapting the script, keep doing so.

- **Supabase singleton in `api/`.** The script lives in `scripts/`, not
  `api/`, so it uses `createClient` directly. That's allowed — the
  singleton rule in `CLAUDE.md` § "Supabase Connection Hygiene"
  applies to serverless code, not one-shot scripts. Don't import
  anything from `api/utils/supabaseAdmin.js` here.
- **Dual-write canonical + legacy columns.** Per `CLAUDE.md` §
  "Metrics Rollout — FROZEN", any write that touches power-related
  columns must populate BOTH the canonical (`normalized_power`) AND
  the legacy (`effective_power`) twin. `writeStreams()` in the script
  does this; preserve it.
- **Garmin push-only / 24h FIT expiry.** See
  `docs/garmin-integration-context.md` § "Known Garmin Gotchas" #1
  and #3. The script doesn't touch FIT URLs — it uses the JSON Pull —
  so those gotchas don't apply directly, but if you change the recovery
  path, re-read those sections.
- **`maybeSingle()` vs `order().limit(1)`** (Gotcha #7). The script
  uses `.maybeSingle()` on `bike_computer_integrations` which is
  correct (one integration per user × provider). Don't extend to other
  tables without checking.
- **Garmin user ID linchpin** (Gotcha #8). The script matches by
  `provider_activity_id` (per-activity), not `provider_user_id`, so
  this is not at risk. Mentioned only because it's the #1 cause of
  silent Garmin failures historically.

---

## If something goes wrong

### "MODULE_NOT_FOUND" at startup

`npm install` in the project root. Phase 7's parser pulled in
`easy-fit` transitively.

### Many `errors` in the dry-run output

Look at the per-error log lines. Common causes:
- **Token refresh failure** for a specific user — they reconnected
  Garmin recently and the integration row is stale. Skip that user with
  `--user-id` filter on subsequent runs.
- **`ConsentRevokedError`** (HTTP 412) — user revoked Activity Details
  permission on their Garmin account. Sentry will tag these
  `garmin.consent_revoked`. The script skips remaining windows for that
  user automatically. No fix needed.
- **`BadRangeError`** — bug in window math. Don't proceed; file an issue.

### A row flipped to `full` but the app still shows no streams

Cloudflare cache. See `docs/postmortem-2026-03-13-cloudflare-pwa-outage.md`
for context. Purge the page-level cache, or just wait ~5 min for it to
expire. If still missing, query the row directly:

```sql
SELECT activity_streams IS NOT NULL,
       map_summary_polyline IS NOT NULL,
       power_curve_summary IS NOT NULL
FROM activities WHERE id = '...';
```

If those are all `false` after a `recovered_with_data` reported success,
that's a parser bug — open an issue with the activity ID.

### Need to roll back

The script is idempotent — re-running on the same rows is a no-op once
`data_completeness = 'full'` (they're excluded by the SELECT). To revert
a specific row to its prior state, the activity columns
(`activity_streams`, `map_summary_polyline`, `normalized_power`, etc.)
can be NULLed out with a direct UPDATE. There's no automatic snapshot;
take a manual dump first if you're nervous:

```sql
-- Snapshot before commit run
CREATE TABLE activities_phase7_snapshot AS
SELECT id, data_completeness, activity_streams, map_summary_polyline,
       average_watts, normalized_power, max_watts, power_curve_summary,
       kilojoules, device_watts, resync_attempt_count, updated_at
FROM activities
WHERE provider = 'garmin'
  AND data_completeness = 'summary_only';
```

---

## After running

1. **Delete this doc** if the backfill is complete and not expected to
   need a repeat. The cron handles steady-state recovery from here on.
2. **Update `docs/garmin-integration-context.md`** § "Current State" with
   the new `summary_only` count.
3. **Drop the snapshot table** (if created) after 7 days of healthy data.

---

## Open questions / known unknowns

- **Garmin's actual Activity Details retention window** — spec says 24h
  for FIT URLs but the JSON endpoint's retention isn't documented. We're
  assuming ~30 days for the `--lookback` default. If Pull returns empty
  for everything older than 7d, narrow the window.
- **Rate limits on the Pull endpoint** — undocumented. The 250ms gap is
  a guess. If you see HTTP 429s, increase it.
- **`webhook_payload_parser.js` and the spec's §7.3 `samples[]` schema**
  match for cycling but I haven't manually verified the run/swim sample
  fields (`stepsPerMinute`, `swimCadenceInStrokesPerMinute`). If a run
  recovers with no cadence stream, that's the first thing to check.
