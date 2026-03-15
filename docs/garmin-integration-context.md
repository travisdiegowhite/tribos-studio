# Garmin Integration — Full Context & Path Forward

> **Last updated:** 2026-03-15
> **Purpose:** Single source of truth for the Garmin integration — architecture, history, current state, and what to do next.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Complete File Inventory](#complete-file-inventory)
3. [OAuth 2.0 PKCE Flow](#oauth-20-pkce-flow)
4. [Webhook Architecture](#webhook-architecture)
5. [Activity Processing Pipeline](#activity-processing-pipeline)
6. [Token Management](#token-management)
7. [Health Data Pipeline](#health-data-pipeline)
8. [Database Schema](#database-schema)
9. [What Has Worked](#what-has-worked)
10. [What Broke and Why](#what-broke-and-why)
11. [Current State (March 15, 2026)](#current-state-march-15-2026)
12. [Known Garmin Gotchas](#known-garmin-gotchas)
13. [Path Forward](#path-forward)

---

## Architecture Overview

```
┌─────────────┐     OAuth 2.0 PKCE      ┌──────────────────┐
│   Frontend   │◄───────────────────────►│  Garmin Connect   │
│  (Settings)  │                         │  OAuth Server     │
└──────┬───────┘                         └──────────────────┘
       │                                         │
       │ Token exchange                          │ Webhooks (POST)
       ▼                                         ▼
┌──────────────┐                        ┌─────────────────────┐
│  Vercel API  │                        │  Cloudflare Worker   │
│ garmin-auth  │                        │  (webhook proxy)     │
└──────┬───────┘                        └──────────┬──────────┘
       │                                           │
       │ Store tokens                              │ Store event (raw)
       ▼                                           ▼
┌──────────────────────────────────────────────────────────┐
│                    Supabase (Postgres)                     │
│                                                            │
│  bike_computer_integrations   garmin_webhook_events        │
│  (tokens, user mapping)       (event queue)                │
│                                                            │
│  activities                   health_metrics               │
│  (imported rides)             (HR, sleep, stress)          │
└──────────────────────────────────────────────────────────┘
       ▲                                           ▲
       │                                           │
       │ Process events                            │
       └───────────────┬──────────────────────────┘
                       │
              ┌────────┴─────────┐
              │   Vercel Cron     │
              │ (every 1 minute)  │
              │ webhook-process   │
              └──────────────────┘
              ┌──────────────────┐
              │   Vercel Cron     │
              │ (every 6 hours)   │
              │ token-maintenance │
              └──────────────────┘
```

**Key design principle:** Store-and-respond. Garmin requires webhook responses within 5 seconds or it disables your endpoint. All business logic runs asynchronously via cron.

---

## Complete File Inventory

### API Endpoints (Vercel Serverless)

| File | Purpose |
|------|---------|
| `api/garmin-auth.js` | OAuth 2.0 PKCE flow, connection status, disconnect, repair, push route, health data |
| `api/garmin-webhook.js` | Webhook receiver — validates HMAC, stores events, returns 200 immediately |
| `api/garmin-webhook-process.js` | Cron (every 1 min) — processes queued events: imports activities, downloads FIT files |
| `api/garmin-webhook-status.js` | Diagnostic endpoint — connection health, webhook stats, troubleshooting |
| `api/garmin-activities.js` | Activity sync, backfill (30-day and historical), GPS/power/streams backfill, diagnostics |
| `api/garmin-token-maintenance.js` | Cron (every 6 hrs) — proactively refreshes expiring tokens |

### API Utilities (`api/utils/garmin/`)

| File | Purpose |
|------|---------|
| `signatureVerifier.js` | HMAC-SHA256 signature verification (timing-safe comparison) |
| `webhookPayloadParser.js` | Detects webhook type (activity push/ping, health) and extracts items |
| `activityBuilder.js` | Maps 80+ Garmin activity types to Tribos schema, builds activity records |
| `activityFilters.js` | Filters out noise (sedentary, sleep, monitoring) and short activities (<2min/<100m) |
| `garminApiClient.js` | Fetches activity details from Garmin API, requests backfill |
| `tokenManager.js` | Token refresh with Postgres mutex lock (prevents race conditions) |
| `healthDataProcessor.js` | Processes health push data (dailies, sleep, body comp, stress, HRV) |

All 7 modules have corresponding `.test.js` files (81 tests total).

### Shared API Utilities

| File | Purpose |
|------|---------|
| `api/utils/verifyCronAuth.js` | Timing-safe cron secret verification (used by both Garmin crons) |

### Frontend

| File | Purpose |
|------|---------|
| `src/utils/garminService.js` | Complete frontend service layer — OAuth, sync, backfill, health, diagnostics (771 lines) |
| `src/pages/oauth/GarminCallback.jsx` | OAuth callback handler — exchanges code for tokens |
| `src/pages/Settings.jsx` | Main Garmin management UI — connect, disconnect, sync, repair, diagnose |
| `src/components/settings/GarminConsentModal.jsx` | GDPR consent modal (required before OAuth) |
| `src/components/IntegrationAlert.jsx` | Proactive alerts for broken connections |
| `src/components/GarminBranding.jsx` | "Powered by Garmin Connect" attribution (required by dev agreement) |
| `src/components/RouteExportMenu.jsx` | Push routes to Garmin Connect |
| `src/components/HealthCheckInModal.jsx` | Syncs health data (resting HR, sleep, stress) from Garmin |
| `src/components/RideHistoryTable.jsx` | Shows Garmin attribution on activity list |
| `src/components/RideAnalysisModal.jsx` | GPS backfill button for rides missing tracks |

### Cloudflare Worker

| File | Purpose |
|------|---------|
| `cloudflare-workers/garmin-webhook/src/index.js` | Thin webhook proxy (149 lines) — validates HMAC, stores events in Supabase |
| `cloudflare-workers/garmin-webhook/wrangler.toml` | Worker config |
| `cloudflare-workers/garmin-webhook/DEPLOYMENT.md` | Deployment instructions |

### Database Migrations

| File | Purpose |
|------|---------|
| `database/migrations/003_garmin_oauth_temp.sql` | Temp PKCE state/verifier storage |
| `database/migrations/005_garmin_webhook_events.sql` | Webhook event queue table |
| `database/migrations/031_garmin_backfill_chunks.sql` | Historical backfill tracking |
| `database/migrations/036_garmin_token_refresh_lock.sql` | Mutex lock column on integrations |
| `database/migrations/038_garmin_refresh_token_invalid_flag.sql` | Invalid refresh token flag |
| `database/migrations/039_garmin_webhook_retry_support.sql` | Retry count + next_retry_at columns |
| `database/migrations/045_garmin_compliance_consents.sql` | GDPR consent tracking on user_profiles |

### Documentation

| File | Purpose |
|------|---------|
| `docs/garmin-webhook-refactoring.md` | Refactoring history — 13 bugs found, 6 phases of work |

---

## OAuth 2.0 PKCE Flow

> Despite legacy comments mentioning OAuth 1.0a, the implementation is **OAuth 2.0 with PKCE**.

### Step 1: User clicks "Connect Garmin" in Settings

```
Frontend                              API (garmin-auth.js)
   │                                        │
   │── POST /api/garmin-auth ──────────────►│
   │   { action: 'getAuthorizationUrl' }    │
   │                                        │── Generate PKCE code_verifier (43-128 chars)
   │                                        │── Calculate code_challenge = SHA256(verifier)
   │                                        │── Generate random state for CSRF
   │                                        │── Store verifier + state in garmin_oauth_temp
   │◄── { authorizationUrl } ──────────────│
   │                                        │
   │── Redirect to Garmin ─────────────────►│ connect.garmin.com/oauth2Confirm
```

### Step 2: User grants access on Garmin, redirected back

```
Garmin                    GarminCallback.jsx           API (garmin-auth.js)
   │                            │                            │
   │── Redirect with ──────────►│                            │
   │   ?code=XXX&state=YYY      │                            │
   │                            │── POST /api/garmin-auth ──►│
   │                            │   { action: 'exchangeToken',│
   │                            │     code, state }           │
   │                            │                            │── Verify state matches
   │                            │                            │── Retrieve stored verifier
   │                            │                            │── Exchange code for tokens at
   │                            │                            │   diauth.garmin.com/di-oauth2-service/oauth/token
   │                            │                            │── Fetch Garmin User ID (3 retries)
   │                            │                            │   apis.garmin.com/wellness-api/rest/user/id
   │                            │                            │── Store in bike_computer_integrations:
   │                            │                            │   access_token, refresh_token,
   │                            │                            │   provider_user_id (CRITICAL),
   │                            │                            │   token_expires_at
   │                            │◄── { success: true } ─────│
   │                            │                            │
   │                            │── Redirect to /settings ──►│
```

**Critical:** The `provider_user_id` (Garmin User ID) is what links incoming webhooks to user accounts. Without it, webhooks cannot be matched. The OAuth flow **fails entirely** if this ID cannot be fetched.

---

## Webhook Architecture

### Why Store-and-Respond?

Garmin **disables your webhook endpoint** if you don't respond within 5 seconds. Processing an activity (downloading FIT files, parsing power data, deduplication) takes much longer. So:

1. **Webhook arrives** → validate signature → store raw event → return 200 (milliseconds)
2. **Cron job (every minute)** → pick up unprocessed events → do the heavy lifting

### Two Entry Points, One Queue

| Entry Point | URL | When to Use |
|-------------|-----|-------------|
| **Cloudflare Worker** | `garmin-webhook.tribos-studio.workers.dev` | Primary — avoids Vercel deployment protection ($150/mo) |
| **Vercel Function** | `www.tribos.studio/api/garmin-webhook` | Backup — same logic, subject to deployment protection |

Both write to the same `garmin_webhook_events` table.

### Webhook Payload Types

| Type | Trigger | Contains |
|------|---------|----------|
| `CONNECT_ACTIVITY` (PUSH) | User syncs device | Activity summary (distance, duration, HR, etc.) |
| `ACTIVITY_FILE_DATA` (PING) | File ready for download | `callbackURL` for FIT file (valid 24 hours!) |
| `ACTIVITY_DETAIL` (PUSH) | Detailed activity data | Full activity details |
| `HEALTH` (various) | Daily health sync | Dailies, sleeps, bodyComps, stress, HRV |

### Duplicate Detection

- Activity webhooks are deduplicated by `activity_id`
- If a PING arrives for an existing event, the `file_url` is updated and the event is re-queued for processing
- PING webhooks without `activity_id` are matched to recent PUSH events from the same Garmin user within a 2-hour window

### HMAC Signature Verification

- Header: `x-garmin-signature` or `x-webhook-signature`
- Algorithm: HMAC-SHA256 with `GARMIN_WEBHOOK_SECRET`
- **Must verify against raw request body bytes** — not `JSON.stringify(parsed)` (this was the March 6 bug)
- Timing-safe comparison via `crypto.timingSafeEqual`
- If secret is not configured: warn and accept (graceful degradation, not hard rejection)

---

## Activity Processing Pipeline

Runs every minute via `garmin-webhook-process.js` cron.

```
1. Fetch up to 10 unprocessed events (< 24 hours old)
   │
2. For each event:
   │
   ├── Find integration by garmin_user_id → provider_user_id match
   │   (if not found → mark failed, skip)
   │
   ├── Ensure valid access token (refresh if needed, mutex-locked)
   │
   ├── Activity already imported?
   │   ├── YES → handleExistingActivity()
   │   │         • Check for missing data (GPS, power, streams)
   │   │         • Download FIT file if URL available
   │   │         • Merge missing data into existing record
   │   │         • Request backfill if no FIT URL and data gaps exist
   │   │
   │   └── NO → downloadAndProcessActivity()
   │             • Filter: skip health/monitoring types
   │             • Filter: skip < 2 min OR < 100m
   │             • Fetch API details if webhook data insufficient
   │             • Build activity record (map Garmin → Tribos schema)
   │             • Cross-provider dedup check (vs Strava/Wahoo)
   │             • Insert into activities table
   │             • Download + parse FIT file:
   │               - GPS polyline (simplified)
   │               - Power metrics (avg, normalized, max, TSS, IF)
   │               - Activity streams (time, distance, HR, power, cadence)
   │               - Ride analytics (pacing, fatigue resistance)
   │             • Auto-assign default gear
   │             • Track activation step (first_sync)
   │             • Enqueue coaching check-in
   │
   └── Mark event processed (or increment retry_count on failure)
```

### Retry Strategy

- Max 6 retries with exponential backoff: 1m → 2m → 4m → 8m → 16m → 32m (~1 hour total)
- After 6 failures: marked as permanently failed
- Events older than 24 hours are skipped (FIT URLs expire)

---

## Token Management

### Token Lifecycle

| Token | Lifespan | Refresh Trigger |
|-------|----------|-----------------|
| Access token | ~24 hours | Proactive: 1 day before expiry. Reactive: on 401 during API call |
| Refresh token | ~90 days | Proactive: 30 days before expiry |

### Proactive Maintenance (every 6 hours)

`garmin-token-maintenance.js` runs as a cron:

1. Query all Garmin integrations with tokens expiring within thresholds
2. For each: call Garmin token endpoint with `grant_type=refresh_token`
3. Update `access_token`, `token_expires_at` in database
4. If Garmin rejects the refresh token → set `refresh_token_invalid = true`
   - User must reconnect manually
   - `IntegrationAlert.jsx` shows a warning in the dashboard

### Mutex Lock (Prevents Race Conditions)

Multiple serverless instances could try to refresh the same token simultaneously. Solution:

1. Acquire lock: `UPDATE bike_computer_integrations SET refresh_lock_until = NOW() + 30s WHERE refresh_lock_until IS NULL OR refresh_lock_until < NOW()`
2. If lock acquired → refresh token → release lock
3. If locked by another process → wait 3 seconds → check if it succeeded → reuse new token

Implemented in `api/utils/garmin/tokenManager.js`.

---

## Health Data Pipeline

Health webhooks (`HEALTH_dailies`, `HEALTH_sleeps`, etc.) flow through the same event queue but are processed differently:

1. Match `garmin_user_id` to integration
2. Extract metrics based on type:
   - **Dailies:** Resting HR, stress level, body battery
   - **Sleeps:** Duration (hours), quality score (1-5)
   - **Body Comp:** Weight (kg), body fat %
   - **Stress Details:** Body battery time series
   - **HRV:** Heart rate variability
3. Save to `health_metrics` table
4. Available for health check-in modal and coaching insights

### Scale Conversions

- Garmin stress 0-100 → Tribos 1-5
- Garmin sleep score 0-100 → Tribos 1-5
- Weight: grams → kg

---

## Database Schema

### `bike_computer_integrations` (core)

```sql
user_id                   -- Tribos user UUID
provider                  -- 'garmin'
provider_user_id          -- Garmin User ID (CRITICAL for webhook matching)
access_token              -- OAuth access token (~24h lifespan)
refresh_token             -- Refresh token (~90d lifespan)
token_expires_at          -- Access token expiry
refresh_token_expires_at  -- Refresh token expiry
refresh_token_invalid     -- TRUE if Garmin rejected (user must reconnect)
refresh_lock_until        -- Mutex lock timestamp
sync_enabled              -- Whether sync is active
last_sync_at              -- Last successful sync
provider_user_data        -- JSONB metadata
```

### `garmin_webhook_events` (event queue)

```sql
event_type        -- CONNECT_ACTIVITY, ACTIVITY_FILE_DATA, HEALTH_dailies, etc.
garmin_user_id    -- Garmin's user ID (matched to provider_user_id)
activity_id       -- Garmin activity summary ID
file_url          -- FIT file download URL (expires in 24h!)
payload           -- Full raw webhook JSON
processed         -- FALSE until handled
process_error     -- Error message or result log
retry_count       -- 0-6
next_retry_at     -- Scheduled retry time
batch_index       -- Position in batch (Garmin sends multiple items per webhook)
```

### `garmin_backfill_chunks` (historical sync tracking)

```sql
user_id           -- Tribos user
chunk_start/end   -- Time range for this chunk
status            -- pending, requested, received, failed, already_processed
activity_count    -- How many activities arrived for this chunk
retry_count       -- Failure retries
```

---

## What Has Worked

Before March 6, 2026, the following was fully functional:

- **OAuth connection flow** — Users could connect Garmin accounts via PKCE
- **Webhook reception** — Cloudflare Worker received and stored events
- **Activity import** — Webhook processor imported activities with full data
- **FIT file processing** — Power metrics, GPS tracks, activity streams extracted
- **Health data sync** — Resting HR, sleep, stress from daily health webhooks
- **Token refresh** — Both proactive (cron) and reactive (on-demand)
- **Activity deduplication** — Cross-provider dedup between Strava and Garmin
- **Route push** — Sending routes to Garmin Connect Courses
- **Backfill** — Historical activity backfill (30-day and multi-year)
- **Diagnostics** — Connection health, webhook stats, troubleshooting info

The full pipeline — from Garmin device sync to imported activity with power/GPS/streams — was operational.

---

## What Broke and Why

### The Breaking Commit: March 6, 2026

**Commit `62a59c3`**: "Security hardening: timing-safe auth, webhook verification, error hygiene"

This commit made 3 changes that cascaded into a full integration outage:

#### Bug 1: Webhook HMAC verification broken

**What changed:** Added HMAC signature verification to `garmin-webhook.js`.

**The bug:** Used `JSON.stringify(req.body)` (the parsed JS object) instead of the raw request bytes for HMAC computation. Since `JSON.stringify` doesn't preserve original formatting, whitespace, or key order, the computed HMAC never matched Garmin's signature. **Every single webhook was rejected with 401.**

**Impact:** Garmin detected repeated 401s and eventually **disabled the webhook endpoint**. No new activities, health data, or backfill events could arrive.

#### Bug 2: Missing secret = hard rejection

**What changed:** `signatureVerifier.js` was updated to reject all requests when `GARMIN_WEBHOOK_SECRET` environment variable was not configured.

**The bug:** Instead of graceful degradation (warn and accept when secret isn't set), it hard-rejected every request. Any environment where the secret wasn't configured was completely broken.

#### Bug 3: Cron auth broke graceful fallback

**What changed:** New `verifyCronAuth.js` utility added and applied to all cron endpoints.

**The bug:** When `CRON_SECRET` env var was missing, it rejected all cron requests instead of warning and accepting. This killed:
- `garmin-webhook-process` (every-minute cron) → events piled up unprocessed
- `garmin-token-maintenance` (every-6-hour cron) → tokens expired without refresh

### The Cascade

```
March 6:  Security hardening deployed
          → Webhooks rejected (HMAC bug)
          → Cron processing stopped (auth bug)
          → Token maintenance stopped (auth bug)

March 6-15: 9 days of silent failure
          → No new activities imported
          → 4955 of 4990 events failed
          → Tokens expired
          → Backfill attempts failed (expired tokens + broken cron)

March 15: Emergency fixes (4 commits)
          → d4e8a58: Fixed HMAC (raw bytes), fixed secret fallbacks
          → 4815463: Fixed FIT file processing (6 interrelated bugs)
          → 62bd1fa: Fixed .maybeSingle() → .order().limit(1)
          → 54f640e: Removed frontend token-expired guard blocking auto-sync
```

---

## Current State (March 15, 2026)

### Fixed (code deployed)

- HMAC verification uses raw request bytes (not JSON.stringify)
- Missing webhook secret → warn and accept (not reject)
- Missing cron secret → warn and accept (not reject)
- FIT file URLs extracted from webhook callbackURL (not just event column)
- PING webhooks matched to recent PUSH events by user + 2-hour window
- `.maybeSingle()` replaced with `.order().limit(1)` across all lookups
- Frontend auto-sync no longer blocked by expired token state

### Needs Verification

| Item | How to Verify |
|------|---------------|
| Garmin webhook endpoint is re-enabled | Check Garmin Developer Portal — may need to re-register webhook URL |
| Tokens are valid/refreshed | Check `garmin-webhook-status` endpoint or Settings → Diagnose |
| Webhook events are being received | Check `garmin_webhook_events` table for new events after March 15 |
| Cron jobs are running | Check Vercel dashboard → Functions → Cron for recent invocations |
| Activities are importing | Sync a ride on Garmin and check if it appears in Tribos |
| FIT file data is being extracted | Check imported activities for power metrics, GPS, streams |
| Historical events (4955 failed) can be recovered | Run "Recover Activities" from Settings |

### Possibly Still Broken

1. **Garmin may have disabled the webhook URL** — After 9 days of 401s, Garmin likely deactivated the endpoint. You may need to:
   - Log into the Garmin Developer Portal
   - Check webhook registration status
   - Re-register the webhook URL if disabled

2. **User tokens may have fully expired** — If both access AND refresh tokens expired during the 9-day outage, users must reconnect. Check `refresh_token_invalid` flag.

3. **4955 failed events** — These may be recoverable via the "Recover Activities" button in Settings, or `reprocessFailedEvents()` in garminService. Events older than 24 hours with FIT URLs will have expired download links — those activities would need a fresh backfill.

---

## Known Garmin Gotchas

These are Garmin-specific quirks that have caused bugs before. Keep this list in mind for any future changes.

### 1. Push-Only Activity API
Garmin does **not** have a "list my activities" API endpoint. Activities are delivered exclusively via webhook push notifications. The "backfill" endpoint (`/wellness-api/rest/backfill/activities`) doesn't return data — it triggers Garmin to re-send webhooks for a time range. You get a 202 Accepted and then wait for webhooks to arrive asynchronously.

### 2. 5-Second Webhook Timeout
If your webhook handler doesn't respond within 5 seconds, Garmin marks it as failed. Too many failures → Garmin disables your endpoint. **Never do processing in the webhook handler.** Store the event and return 200 immediately.

### 3. FIT File URLs Expire in 24 Hours
The `callbackURL` in ACTIVITY_FILE_DATA webhooks is only valid for 24 hours. If your processor is down or backed up, those URLs die. You'd need to request a fresh backfill to get new URLs.

### 4. HMAC Must Use Raw Bytes
Garmin computes HMAC over the exact bytes they send. If you parse the JSON and re-serialize it, whitespace/key order changes will break the signature. **Always verify against the raw request body.**

### 5. Webhook Batching
A single webhook POST can contain multiple activities or health records. Each item needs to be stored and processed separately. The `batch_index` field tracks position.

### 6. Two Webhook Notifications Per Activity
A typical activity generates:
- First: CONNECT_ACTIVITY (PUSH) — summary data
- Then: ACTIVITY_FILE_DATA (PING) — FIT download URL

These arrive as separate webhooks and must be correlated by `activity_id` or by `garmin_user_id` + time window.

### 7. `.maybeSingle()` vs `.order().limit(1)`
When querying `garmin_webhook_events` by activity_id, there can be multiple rows (PUSH + PING). Supabase's `.maybeSingle()` throws an error if more than one row matches. Use `.order('received_at', { ascending: false }).limit(1)` instead.

### 8. Garmin User ID is the Linchpin
Webhooks identify users by Garmin's internal user ID (a string like "abc123def456"), not by email or Tribos user ID. This must be stored as `provider_user_id` during OAuth. If it's missing, **every webhook for that user silently fails** because it can't be matched.

### 9. Token Refresh Race Conditions
Multiple Vercel serverless instances can try to refresh the same token simultaneously, causing Garmin to invalidate tokens. The mutex lock in `tokenManager.js` prevents this but requires the `refresh_lock_until` column and ideally the `acquire_token_refresh_lock` RPC function.

### 10. Vercel Deployment Protection
Vercel's deployment protection feature ($150/mo Pro plan) blocks external webhook requests. The Cloudflare Worker was introduced specifically to bypass this — it stores events directly in Supabase, not through Vercel.

---

## Path Forward

### Immediate (Do Now)

1. **Check Garmin Developer Portal**
   - Is the webhook URL still registered and active?
   - If disabled, re-register it (use the Cloudflare Worker URL)
   - Verify the consumer key/secret are correct

2. **Verify Cron Jobs Are Running**
   - Check Vercel dashboard → Functions → Cron
   - `garmin-webhook-process` should show invocations every minute
   - `garmin-token-maintenance` should show invocations every 6 hours
   - If not running, check if `CRON_SECRET` is set in Vercel env vars (or confirm the fallback works)

3. **Check Token Status for Your Account**
   - Go to Settings → Integrations → Garmin → Diagnose
   - Or call `GET /api/garmin-webhook-status` with your auth token
   - If tokens are expired/invalid: disconnect and reconnect

4. **Test End-to-End**
   - Sync a ride on your Garmin device
   - Wait 2-3 minutes (webhook → event queue → cron processes)
   - Check if the activity appears in the Training dashboard
   - Verify it has GPS, power data, and streams (if applicable)

### Short Term (This Week)

5. **Recover Failed Events**
   - Settings → Garmin → "Recover Activities"
   - This reprocesses the 4955 failed events from the outage
   - Events with expired FIT URLs (>24h old) won't recover FIT data — follow up with a backfill

6. **Run a 30-Day Backfill**
   - Settings → Garmin → "Sync Recent Activities"
   - This triggers Garmin to re-send webhooks for the last 30 days
   - Will fill in activities missed during the 9-day outage

7. **Add Monitoring/Alerting**
   - The `garmin-webhook-status` endpoint has all the diagnostic data
   - Consider a simple health check that alerts if:
     - No webhook events received in 24 hours
     - More than 10 unprocessed events older than 1 hour
     - Any tokens with `refresh_token_invalid = true`

### Medium Term (This Month)

8. **End-to-End Integration Test**
   - Write a test that simulates the full webhook flow:
     - Send a fake PUSH webhook with valid HMAC → verify event stored
     - Run the processor → verify activity created
     - Send a PING webhook with FIT URL → verify FIT data merged
   - Run this test on every deploy to catch regressions early

9. **Simplify the Architecture**
   - The system has accumulated complexity from debugging iterations
   - Consider whether both Cloudflare Worker AND Vercel webhook handler are needed
   - If Cloudflare Worker is the primary entry point, the Vercel handler could be removed or made internal-only

10. **Dashboard Visibility**
    - Add a simple "Garmin sync health" indicator to the main dashboard
    - Show last sync time, pending events, any errors
    - Don't make users dig into Settings → Diagnose to find out their sync is broken

### Rules for Future Changes

- **Never modify webhook signature verification without testing against a real Garmin webhook payload**
- **Never change auth/secret validation to hard-reject when the secret is missing** — always warn and accept as fallback
- **Never use `.maybeSingle()` when querying webhook events** — always `.order().limit(1)`
- **Always read the raw request body for HMAC verification** — never re-serialize
- **Test cron endpoints independently** — they're the silent backbone; if they break, everything queues up invisibly
- **After any security hardening, verify that webhooks still arrive and process within 5 minutes**

---

## Environment Variables Required

### Vercel (Server-Side)

| Variable | Purpose |
|----------|---------|
| `GARMIN_CLIENT_ID` | OAuth 2.0 client ID from Garmin Developer Portal |
| `GARMIN_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GARMIN_WEBHOOK_SECRET` | HMAC secret for webhook signature verification (optional but recommended) |
| `GARMIN_REDIRECT_URI` | OAuth callback URL (e.g., `https://www.tribos.studio/oauth/garmin/callback`) |
| `CRON_SECRET` | Shared secret for cron job authentication (optional, graceful fallback) |
| `SUPABASE_SERVICE_KEY` | Server-side Supabase access |
| `SUPABASE_URL` | Supabase project URL |

### Cloudflare Worker

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key for database writes |
| `GARMIN_WEBHOOK_SECRET` | HMAC secret (must match Vercel config) |

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_GARMIN_CLIENT_ID` | OAuth client ID (for authorization URL construction) |

---

## Key API Endpoints Quick Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/garmin-auth` | POST | Bearer token | OAuth flow, connection management, health data |
| `/api/garmin-webhook` | POST | HMAC signature | Receive Garmin webhooks |
| `/api/garmin-webhook-process` | GET | Cron secret | Process queued events (cron) |
| `/api/garmin-webhook-status` | GET | Bearer token | Diagnostic health check |
| `/api/garmin-activities` | POST | Bearer token | Activity sync, backfill, diagnostics |
| `/api/garmin-token-maintenance` | GET | Cron secret | Refresh expiring tokens (cron) |
