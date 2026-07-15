# Garmin Ping/Pull Rebuild — Cutover Runbook (sole-user fast path)

> **STATUS: FROZEN — CUTOVER NOT EXECUTED (decision 2026-07-14).**
> The legacy stack remains the production path and Garmin sync works; the
> decision is to leave it alone. This runbook is preserved for a future
> *deliberate* cutover only — do not execute it opportunistically, in whole
> or in part. Note one stale claim below: `garmin2-pull` is **not** registered
> in `vercel.json` on main, so flipping the portal to PING today would
> silently stop sync. See the "Garmin sync — dual stack, FROZEN" section in
> `CLAUDE.md` for the verified current state and the rules.

> **Updated 2026-05-30 for the sole-user case.** Earlier draft assumed a
> second Garmin consumer key + per-user flag rollout; we're taking the
> straight cutover instead because Travis is effectively the only active
> Garmin user.

## Why this is now small

Originally the cutover meant repointing the entire frontend to the new
`garmin2-*` endpoints AND running a require-reconnect SQL AND flipping the
portal. But the frontend isn't actually on the critical path — the legacy
endpoints still read the same DB columns and call the same OAuth flow.
What changes when Garmin flips from PUSH to PING is what arrives in
`garmin_webhook_events`, and that's handled by the new `garmin2-pull` cron
(already registered, dormant in production).

So the entire cutover collapses to **three steps**: deploy, flip, ride.

The legacy frontend keeps working unchanged. The flag pattern (Builder 2.0
style) is still the right answer for the *eventual* Settings UI rebuild,
but it's not a prerequisite — we can ship that incrementally after the
pipeline is verified.

## What's in the deploy (branch `garmin-ping-pull-rebuild`)

| Commit | What |
|---|---|
| `a8f3a43` | Hotfix: dropped the phantom `status` filter from Phase 7 endpoints |
| `16ee6f3` | Phase 0: `deriveTss`, `pingQueue` |
| `36c8916` | Phase 1: `pullActivity`, `writeActivity`, `garmin2-pull` cron |
| `f7c97ef` | Phase 2: `pingParser`, `garmin2-ping` receiver, **Cloudflare worker rewrite** |
| `7e73fda` | Phase 3: `garmin2-auth`, `garmin2-token-maintenance` (dormant) |
| `cb62e37` | Phase 4: `garmin2-route-push`, health-ping dispatch, `garmin2-backfill` (dormant) |
| `9cd91f3` | `vercel.json` registers `garmin2-pull` (every 5 min, currently no-op) |
| **(this commit)** | Legacy processor patched to skip ping event types — prevents racing `garmin2-pull` post-flip |

1450 tests passing. All Phase 3/4 endpoints are dormant in this deploy —
they exist but nothing calls them yet.

## The three-step cutover

### Step 1 — Deploy

Merge `garmin-ping-pull-rebuild` to `main`. Vercel deploys:
- `api/garmin2-pull.js` continues running every 5 min (still claims 0 rows
  until the portal flips)
- The Cloudflare worker code update is **not** deployed by Vercel — you
  deploy it separately via wrangler. See Step 2.

### Step 2 — Deploy the Cloudflare worker

```bash
cd cloudflare-workers/garmin-webhook
npm install   # if needed
npx wrangler deploy
```

Verify the worker version bumped:
```bash
curl https://garmin-webhook.tribos.workers.dev/   # GET healthcheck
# expect: { ... "version": "4.0.0", "model": "ping-primary, push-fallback-during-cutover" ... }
```

If you can't deploy the worker right now: the Vercel fallback
`api/garmin2-ping.js` will catch pings if you reconfigure the portal
endpoint URL to point at it. The worker is preferred (decoupling from
Vercel deploys is the whole point of having it).

### Step 3 — Flip the Garmin Developer Portal

1. Log into the Garmin Developer Portal for your production consumer key.
2. For the Activity API → **Activity Details** notification type, change
   the delivery mode from **PUSH** to **PING**. Endpoint URL stays the
   same (worker URL).
3. Optionally do the same for Health notification types — the pipeline
   handles both push and ping for health.

### Step 4 — Ride

Do a real ride on your Garmin device. Wait for it to sync to Garmin
Connect (typically <60 s after the device finishes recording).

Within ~1 min of the upload, the ping should land:

```sql
SELECT id, event_type, garmin_user_id, activity_id,
       file_url IS NOT NULL AS has_callback,
       processed, retry_count
FROM garmin_webhook_events
ORDER BY received_at DESC LIMIT 5;
```
Expect: `event_type='ACTIVITY_DETAIL_PING'`, `has_callback=t`, `processed=f` (briefly).

Within 5 min (next `garmin2-pull` tick), the activity should land full:

```sql
SELECT type, name, start_date, data_completeness, device_watts,
       normalized_power, effective_power, tss, rss,
       intensity_factor, ride_intensity,
       activity_streams IS NOT NULL AS has_streams,
       map_summary_polyline IS NOT NULL AS has_polyline,
       power_curve_summary IS NOT NULL AS has_pcurve
FROM activities
WHERE provider='garmin'
ORDER BY created_at DESC LIMIT 3;
```
Expect: `data_completeness='full'`, streams/polyline/pcurve all true,
dual-write columns equal (`normalized_power = effective_power`, etc.).

Open the ride in the Training dashboard / `RideAnalysisModal`. Map renders.
Power curve renders. NP shows. **That's the end-to-end gate.** If it
passes, ping/pull is verified.

## If something breaks

### Pings aren't arriving

- Verify the worker deploy bumped version (`GET /` on the worker URL).
- Check worker logs: `npx wrangler tail garmin-webhook` from
  `cloudflare-workers/garmin-webhook/`. Watch for HMAC failures or
  parser errors when you ride.
- Check the portal config — sometimes Garmin's flip takes a few minutes
  to propagate.

### Pings arrive but `garmin2-pull` doesn't process them

- Check the cron is running: Vercel dashboard → Functions → Crons. Look
  for `/api/garmin2-pull` invocations every 5 min.
- Manually invoke:
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    https://www.tribos.studio/api/garmin2-pull
  ```
  Response shows counters; non-zero `errors` or `no_match` tells you why.
- Sentry tags: `garmin.pull_cron_*`, `garmin.consent_revoked`,
  `garmin.pull_write_error`.

### Activity imports but data is incomplete

- Compare `data_completeness` to the dual-write columns. If `tss` is null
  but `normalized_power` is present, athlete FTP is unset (expected —
  `deriveTss` returns nulls without FTP, and completeness doesn't require
  TSS). Set FTP in user_profiles and the next ride will derive it.
- If `activity_streams` is missing, the §7.3 response had no `samples[]`
  — possibly a manually-entered Garmin activity. Indoor rides without
  power meter / HR can land summary-only legitimately.

### Need to roll back

1. **Flip the portal back to PUSH.** The legacy processor cron is still
   running (it just stopped grabbing ping rows; legacy push rows still
   flow). Within ~5 min, new rides go back to the old behavior.
2. **Optionally** revert the legacy-processor patch — strict narrowing of
   the filter is harmless to leave in place. Without it, the legacy
   processor would claim any leftover ping rows post-rollback (which
   would fail to process and mark as failed — not data loss, since the
   rows were already imported by `garmin2-pull` before the rollback).
3. The deployed `garmin2-pull` cron continues running but claims 0 rows.

## After the gate passes

Once a real ride lands `full` end-to-end and renders correctly, the
combined Phase 5/6 is done. What's left:

1. **Soak ≥48 h** with the portal on PING. Watch the
   `garmin_webhook_events` processed rate and Sentry. Run a couple more
   rides to confirm stability.
2. **Phase 7 cleanup** (separate PR after soak): delete the legacy
   `garmin-auth.js` / `garmin-webhook.js` / `garmin-webhook-process.js` /
   `garmin-activities.js` / `garmin-token-maintenance.js` /
   `garmin-reconcile.js` / `garmin-resync-activity.js` /
   `garmin-webhook-status.js` / `admin-garmin-health.js`. Drop the
   `garmin-webhook-process` and `garmin-reconcile` cron entries. Remove
   `garmin-token-maintenance` cron and swap to
   `garmin2-token-maintenance`.
3. **Frontend Settings rebuild** (separate work, flag-gated per the
   Builder 2.0 pattern): new connection panel reading the richer
   `garmin2-auth get_connection_status` response, replacing the legacy
   diagnose / repair / backfill-GPS / backfill-streams / sync UI
   affordances that are obsolete under ping/pull.

The frontend rebuild can take as long as it needs — the pipeline doesn't
depend on it.
