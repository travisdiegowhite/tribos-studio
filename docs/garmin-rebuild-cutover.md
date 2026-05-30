# Garmin Ping/Pull Rebuild — Cutover Runbook

> **Status:** Phases 0–4 shipped on branch `garmin-ping-pull-rebuild`
> (the new pipeline is code-complete and tested, 1450 tests passing, but
> dormant — not wired into the frontend, portal still on PUSH).
> **This doc covers the operational steps (Phases 5–7) to make it live.**
> **Owner:** travisdiegowhite
> **Related:** `docs/garmin-integration-context.md` (legacy architecture),
> the plan file for the rebuild.

---

## What's already done (Phases 0–4)

New pipeline, all under the `garmin2-*` / `api/utils/garmin2/` namespace:

| Concern | New code | Replaces |
|---|---|---|
| Ping receipt | Cloudflare worker (updated) + `api/garmin2-ping.js` | `api/garmin-webhook.js` |
| Activity pull + write | `api/garmin2-pull.js`, `api/utils/garmin2/{pullActivity,writeActivity,pingQueue,deriveTss,pingParser}.js` | `api/garmin-webhook-process.js` + `api/garmin-reconcile.js` |
| OAuth | `api/garmin2-auth.js` | auth actions of `api/garmin-auth.js` |
| Token maintenance | `api/garmin2-token-maintenance.js` | `api/garmin-token-maintenance.js` |
| Route push | `api/garmin2-route-push.js` | `pushRoute` in `api/garmin-auth.js` |
| Health pings | health dispatch in `api/garmin2-pull.js` (reuses `healthDataProcessor.js`) | health path of `garmin-webhook-process.js` |
| Historical backfill | `api/garmin2-backfill.js` | backfill actions of `api/garmin-activities.js` |

The `garmin2-pull` cron is **already in `vercel.json`** (every 5 min). It's a
no-op in current production because no `ACTIVITY_DETAIL_PING` rows exist until
the portal flips. Zero risk; it just claims 0 rows and returns.

**Key architectural facts to remember during cutover:**
- The Cloudflare worker handles BOTH push and ping payloads (it classifies by
  shape). So during the transition it keeps storing legacy push rows AND new
  ping rows; they're partitioned by `event_type` so the old processor and new
  puller never double-process.
- `bike_computer_integrations` has **no `status` column** — every reader filters
  on `sync_enabled` + `refresh_token_invalid`. Do not reintroduce `status`.
- No new migrations. The whole rebuild reuses existing tables.

---

## Phase 5 — Staging verification (do this FIRST, before any prod cutover)

The Garmin Developer Portal's PUSH-vs-PING config is **global per consumer
key**, so you can't run push and ping in parallel on the production key. Verify
on a separate key first.

### 5.1 Set up a staging Garmin app
1. In the Garmin Developer Portal, request/create a **second consumer key**
   for staging (Garmin permits dev keys).
2. Configure its Activity API endpoints as **PING** (not PUSH), pointing at a
   staging worker route (or the Vercel `/api/garmin2-ping` endpoint on a preview
   deployment). For Activity Details, the ping config should target the
   `activityDetails` notification type.
3. Set the staging worker's env (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `GARMIN_WEBHOOK_SECRET`) to a **staging Supabase project** if you have one,
   or accept that staging writes land in prod tables (tag test users clearly).

### 5.2 Connect a test account & ride
1. Connect a real Garmin account through the staging OAuth flow
   (`garmin2-auth`). Confirm:
   ```sql
   SELECT provider_user_id, sync_enabled, refresh_token_invalid
   FROM bike_computer_integrations
   WHERE user_id = '<test-user>' AND provider = 'garmin';
   ```
   `provider_user_id` MUST be populated (the linchpin). If it's null, the OAuth
   flow failed its hard-fail guard — investigate before proceeding.
2. Do a real ride on a Garmin device (or use Garmin's Data Generator / Summary
   Resender web tool to replay a historical activity).
3. Within ~1 min, confirm a ping row landed:
   ```sql
   SELECT id, event_type, activity_id, file_url IS NOT NULL AS has_callback,
          processed, retry_count, process_error
   FROM garmin_webhook_events
   WHERE garmin_user_id = '<provider_user_id>'
   ORDER BY received_at DESC LIMIT 5;
   ```
   Expect `event_type='ACTIVITY_DETAIL_PING'`, `has_callback=t`, `processed=f`.
4. Within 5 min (next `garmin2-pull` tick), confirm the activity imported full:
   ```sql
   SELECT type, data_completeness, device_watts,
          normalized_power, effective_power, tss, rss,
          intensity_factor, ride_intensity,
          activity_streams IS NOT NULL AS has_streams,
          map_summary_polyline IS NOT NULL AS has_polyline,
          power_curve_summary IS NOT NULL AS has_pcurve
   FROM activities
   WHERE provider='garmin' AND provider_activity_id='<summaryId>';
   ```
   Expect `data_completeness='full'`, streams/polyline/pcurve present, and the
   dual-write columns equal (`normalized_power=effective_power`, `tss=rss`,
   `intensity_factor=ride_intensity`).
5. Open the ride in `RideAnalysisModal` → map renders, power curve renders, NP
   shows. This is the end-to-end gate.

### 5.3 Verify health + backfill (optional but recommended)
- Trigger a health sync on the device; confirm a `HEALTH_*_PING` row appears and
  a `health_metrics` row lands after the next puller tick.
- Call `POST /api/garmin2-backfill { action: 'start', yearsBack: 1 }` for the
  test user; confirm `garmin_backfill_chunks` rows are created and historical
  activities trickle in over the following hours.

**Do not proceed to Phase 6 until 5.2 passes cleanly for at least one real ride.**

---

## Phase 6 — Production cutover

### 6.1 Frontend repoint (code change — stage as a commit on this branch)

`src/utils/garminService.js` currently points every method at the legacy
endpoints. Repoint the ones that have garmin2 equivalents:

| garminService method | Old endpoint | New endpoint |
|---|---|---|
| `getAuthorizationUrl`, `exchangeToken`, `getConnectionStatus`, `disconnect` | `/api/garmin-auth` | `/api/garmin2-auth` |
| `pushRoute` | `/api/garmin-auth` (action push_route) | `/api/garmin2-route-push` (body `{ routeData }`) |
| `backfillHistorical`, `getBackfillStatus`, `resetFailedBackfillChunks` | `/api/garmin-activities` | `/api/garmin2-backfill` (actions start/status/reset_failed) |

**Leave pointing at legacy during soak** (no garmin2 equivalent built; they
become obsolete once ping/pull is steady-state and can be removed in Phase 7):
- `resyncActivity` (`/api/garmin-resync-activity`) — in ping/pull there are no
  stranded `summary_only` rows to resync, but the `RideAnalysisModal` button is
  harmless. The hotfix (commit a8f3a43) made it functional again.
- `getWebhookStatus` (`/api/garmin-webhook-status`) — diagnostic only.
- `syncActivities`, `backfillGps`, `backfillStreams`, `repairConnection`,
  `reprocessFailedEvents`, `diagnose` — obsolete in ping/pull (every activity
  arrives full). Remove the UI affordances in Phase 7.

Note the request-shape differences: `garmin2-route-push` takes `{ routeData }`
directly (not `{ action: 'push_route', routeData }`); `garmin2-backfill` uses
`{ action: 'start'|'status'|'reset_failed' }`.

### 6.2 Cron swap (`vercel.json`)

At cutover, swap the token-maintenance cron and **keep the legacy processors
running for the soak** so any in-flight legacy push rows drain:

```jsonc
// Replace the old token-maintenance path:
{ "path": "/api/garmin2-token-maintenance", "schedule": "0 */6 * * *" }
// (remove "/api/garmin-token-maintenance" — running both double-refreshes;
//  the mutex protects correctness but it's wasteful)

// KEEP during soak (they drain legacy push rows, harmless once empty):
//   /api/garmin-webhook-process  (every 5 min)
//   /api/garmin-reconcile        (every 15 min)
// garmin2-pull is already present (every 5 min).
```

Add the maxDuration entry for `api/garmin2-token-maintenance.js` (60s).

### 6.3 Flip the Garmin portal (the actual switch)

In the **production** Garmin Developer Portal:
1. Change the Activity API configuration from **PUSH** to **PING** for the
   Activity Details notification type. Keep the endpoint URL = the Cloudflare
   worker URL (it now handles pings).
2. (Health + other notification types: decide per Phase 5 findings whether
   they're ping or push; the worker + puller handle both.)

After the flip, new rides arrive as pings → worker stores
`ACTIVITY_DETAIL_PING` → `garmin2-pull` imports them full. Watch the first few:
```sql
SELECT event_type, COUNT(*), SUM((processed)::int) AS processed
FROM garmin_webhook_events
WHERE received_at > NOW() - INTERVAL '30 minutes'
GROUP BY event_type;
```

### 6.4 Require-reconnect data update

Per the locked decision, existing Garmin users re-run OAuth against the new
pipeline. Park their old rows so the puller skips them and the
`IntegrationAlert` UI prompts reconnection:

```sql
-- Snapshot first (rollback insurance)
CREATE TABLE bike_computer_integrations_precutover AS
SELECT * FROM bike_computer_integrations WHERE provider = 'garmin';

-- Park all existing garmin integrations → forces reconnect via new OAuth.
UPDATE bike_computer_integrations
SET refresh_token_invalid = true, updated_at = NOW()
WHERE provider = 'garmin';
```

When a user reconnects, `garmin2-auth.exchangeToken` sets
`refresh_token_invalid=false` + `sync_enabled=true`, re-enabling them.

> **Timing:** Run this AFTER the portal flip and AFTER the frontend repoint is
> deployed, so the reconnect button uses `garmin2-auth`. Communicate to users
> (in-app banner / email) that a one-time Garmin reconnect is required.

### 6.5 Soak (≥48h)

Monitor:
```sql
-- New rides landing full without reconciler intervention?
SELECT data_completeness, COUNT(*)
FROM activities
WHERE provider='garmin' AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1;
-- expect mostly 'full', few/no 'summary_only'

-- Ping queue draining?
SELECT event_type, processed, COUNT(*)
FROM garmin_webhook_events
WHERE received_at > NOW() - INTERVAL '24 hours'
GROUP BY 1, 2;

-- Any parked (terminally-failed) pings?
SELECT id, event_type, process_error
FROM garmin_webhook_events
WHERE processed = true AND process_error LIKE 'parked after%'
ORDER BY processed_at DESC LIMIT 20;
```

Watch Sentry for `garmin.pull_cron_*`, `garmin.consent_revoked`,
`garmin.pull_write_error`.

---

## Phase 7 — Cleanup (after a clean ≥48h soak)

Delete the legacy set (≈5,800 LoC) in a **separate PR** (not the cutover branch,
so the soak coexistence stays intact until you're sure):

```
api/garmin-auth.js
api/garmin-webhook.js
api/garmin-webhook-process.js
api/garmin-activities.js
api/garmin-token-maintenance.js
api/garmin-reconcile.js
api/garmin-resync-activity.js
api/garmin-webhook-status.js
api/admin-garmin-health.js
```

Plus:
- Remove the legacy cron entries from `vercel.json`
  (`garmin-webhook-process`, `garmin-reconcile`, and the already-swapped
  `garmin-token-maintenance`) and their `functions` maxDuration entries.
- Remove the now-obsolete `garminService.js` methods (syncActivities,
  backfillGps, backfillStreams, repairConnection, reprocessFailedEvents,
  diagnose) and the Settings UI affordances that call them.
- Decide the fate of `resyncActivity` / `getWebhookStatus` — either build
  `garmin2-status` + a ping-aware resync, or drop the UI.

**Keep** (still used by the new pipeline):
- `api/utils/garmin/*` (tokenManager, completeness, activityDetailsParser,
  activityBuilder, activityFilters, healthDataProcessor, signatureVerifier,
  webhookPayloadParser)
- `api/utils/garminBackfill.js`, `api/utils/activityDedup.js`
- `api/utils/fitParser.js` (still used by `api/fit-upload.js` for manual FIT
  uploads — NOT on the ping/pull path, but don't delete it)
- The Cloudflare worker (updated, not deleted)

After deletion, run the connection-hygiene audit from CLAUDE.md:
```bash
grep -r "createClient" api/ --include="*.js"   # only supabaseAdmin.js
grep -rn "\.eq('status'" api/garmin2-*.js       # zero hits
```

---

## Rollback

If the ping/pull path misbehaves after the portal flip:
1. **Flip the portal back to PUSH.** The legacy `garmin-webhook-process` cron is
   still running (during soak) and resumes handling push rows immediately.
2. Revert the require-reconnect update:
   ```sql
   UPDATE bike_computer_integrations b
   SET refresh_token_invalid = s.refresh_token_invalid
   FROM bike_computer_integrations_precutover s
   WHERE b.id = s.id;
   ```
3. Revert the frontend repoint deploy.

Because Phases 0–4 added only dormant code and one no-op cron, **nothing before
the Phase 6 portal flip is destructive** — the rollback surface is just the
portal setting, one SQL update, and one frontend deploy.
