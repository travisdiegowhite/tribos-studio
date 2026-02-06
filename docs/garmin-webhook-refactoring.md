# Garmin Webhook Refactoring

## Why This Was Done

The Garmin webhook handler had been a persistent pain point. A code review identified **13 bugs and architectural issues** that were causing silent data loss, race conditions, and maintenance nightmares. This document covers every change made and why.

---

## The 13 Problems Found

1. **5-second timeout risk** — Garmin requires a 200 response within 5 seconds. The handler was doing full activity processing synchronously (API calls, FIT file downloads, database writes), regularly exceeding this limit. Garmin disables webhooks that consistently time out.

2. **Two divergent implementations** — The Vercel handler (1,749 lines) and Cloudflare Worker (909 lines) both contained full business logic that had drifted apart. Bug fixes applied to one were missing from the other.

3. **Signature verification bypass** — When the webhook secret was configured but the incoming request had no signature header, the handler accepted it anyway instead of rejecting it. Any unsigned request would pass through.

4. **Only first activity in batch processed** — Garmin sends batches of activities in a single webhook. The handler used `payload.activities[0]`, silently dropping every activity after the first.

5. **Useless in-memory rate limiting** — Rate limiting used a JavaScript `Map()`. In serverless (Vercel), each invocation can be a fresh instance with an empty Map. The rate limiter never actually limited anything.

6. **Token refresh mutex didn't work** — The lock mechanism used a client-side update-and-check pattern that could race. When two concurrent requests both saw `refresh_lock_until = null`, both would proceed to refresh. Worse, when the lock *was* detected, the code waited 2 seconds then **proceeded anyway** with a comment: "may cause race condition." Double-refreshing invalidates the first token.

7. **`start_date_local` always wrong** — Local time was computed using JavaScript's `Date` timezone (the server's timezone, UTC on Vercel), not the user's actual timezone. Garmin provides `startTimeOffsetInSeconds` for exactly this purpose, but it wasn't used.

8. **No retry mechanism** — If processing failed for any reason (network blip, temporary Garmin API outage), the event was marked as failed permanently. No retries, no backoff, just silent data loss.

9. **Health data had no audit trail** — Health webhooks (sleep, HRV, stress, body composition) were processed but nothing was recorded about what was received, what was saved, or which user it belonged to.

10. **1,749-line god file** — All business logic lived in a single file: signature verification, payload parsing, activity filtering, activity building, API calls, token management, health data processing. Untestable and unmaintainable.

11. **Tests didn't test actual code** — The test file re-implemented the webhook logic independently and tested that reimplementation. Changes to the actual handler weren't caught. The test file also called `process.exit(0)`, which broke vitest.

12. **Trainer detection used wrong field** — Indoor activity detection checked `isParent === false`, a field that indicates parent/child activity relationships, not indoor/outdoor status.

13. **Duplicate `clientIP` declaration** — A `const clientIP` was declared twice in the same scope (shadowed variable), causing a linter error.

---

## Phase 0: Surgical Bug Fixes

**Files changed:** `api/garmin-webhook.js`, `api/garmin-activities.js`, `cloudflare-workers/garmin-webhook/src/index.js`

### Signature bypass → reject unsigned requests
When `GARMIN_WEBHOOK_SECRET` is configured and the incoming request has no signature header, the handler now returns 401 instead of silently accepting it.

### `start_date_local` → use `startTimeOffsetInSeconds`
Local time is now computed as `startTimeInSeconds + startTimeOffsetInSeconds`, which gives the correct wall-clock time in the user's timezone.

### Trainer detection → `isIndoorActivityType()`
Replaced the `isParent === false` check with a proper function that checks activity type against known indoor types (indoor_cycling, virtual_ride, treadmill_running, etc.).

### Shadowed variable → removed duplicate declaration
Removed the duplicate `const clientIP` that was shadowing the outer declaration.

---

## Phase 1: Module Extraction

**Files created:** 7 new modules in `api/utils/garmin/`

The 1,749-line god file was decomposed into focused modules:

| Module | Lines | Purpose | Dependencies |
|--------|-------|---------|-------------|
| `activityFilters.js` | 57 | Filter health/monitoring types, detect indoor activities, check minimum metrics | None (pure functions) |
| `activityBuilder.js` | 220 | Build activity data objects, map Garmin types to Strava-compatible types, generate activity names | Imports `isIndoorActivityType` from activityFilters |
| `webhookPayloadParser.js` | 64 | Parse webhook payloads, identify type, extract all items from batch | None (pure functions) |
| `signatureVerifier.js` | 46 | HMAC-SHA256 signature verification with timing-safe comparison | Node.js `crypto` |
| `garminApiClient.js` | 119 | Fetch activity details from Garmin API, request backfill | `fetch` |
| `tokenManager.js` | 158 | Token refresh with mutex locking, proactive 6-hour refresh buffer | `supabase` (passed as param) |
| `healthDataProcessor.js` | 340 | Process all health data types (dailies, sleep, body comp, stress, HRV) | `supabase` (passed as param) |

**Key design decisions:**
- `supabase` is passed as a parameter to every module that needs it (not a module-level global). This makes every function testable without mocking module imports.
- Pure function modules have zero dependencies and can be tested with plain assertions.
- Garmin uses different field names in different contexts (PUSH webhook vs API response vs FIT file). All variations are handled in `activityBuilder.js` with fallback chains.

The webhook handler went from 1,749 lines to 671 lines (just orchestration, no business logic).

---

## Phase 2: Async Processing

**Files created:** `api/garmin-webhook-process.js`, `database/migrations/039_garmin_webhook_retry_support.sql`
**Files changed:** `api/garmin-webhook.js`, `vercel.json`

### Store-and-respond pattern
The webhook handler was split into two parts:

1. **Webhook handler** (`api/garmin-webhook.js`, ~180 lines) — Receives the webhook, verifies the signature, parses the payload, stores each item as a separate event in `garmin_webhook_events`, returns 200. Fast, well within 5 seconds.

2. **Cron processor** (`api/garmin-webhook-process.js`, ~510 lines) — Runs every minute via Vercel cron. Queries unprocessed events, processes them (API calls, FIT files, health data, dedup), marks them as processed.

### Retry with exponential backoff
When processing fails, events are retried with exponential backoff: 1 minute, 2 minutes, 4 minutes, 8 minutes, 16 minutes, 32 minutes. After 6 retries (~1 hour of attempts), the event is marked as permanently failed with a detailed error message.

### Batch handling fix
The webhook handler now loops over ALL items in a batch and stores each as a separate event with a `batch_index`. The old code only processed `payload.activities[0]`.

### Database changes (migration 039)
```sql
ALTER TABLE garmin_webhook_events
  ADD COLUMN retry_count INTEGER DEFAULT 0,
  ADD COLUMN next_retry_at TIMESTAMPTZ,
  ADD COLUMN batch_index INTEGER DEFAULT 0;
```

---

## Phase 3: Cloudflare Worker Rewrite

**Files changed:** `cloudflare-workers/garmin-webhook/src/index.js`, `cloudflare-workers/garmin-webhook/wrangler.toml`, `cloudflare-workers/garmin-webhook/package.json`

### Why the Cloudflare Worker exists
Vercel's deployment protection blocks unauthenticated requests (like webhooks from Garmin) unless you pay $150/month for the bypass. The Cloudflare Worker exists as an alternative entry point that doesn't have this restriction.

### What changed
The Cloudflare Worker was rewritten from a 909-line copy of all business logic to a 149-line thin proxy that does exactly what the Vercel handler does:

1. Verify HMAC-SHA256 signature (using Web Crypto API, native to CF Workers)
2. Store events to `garmin_webhook_events` table via Supabase
3. Return 200

No business logic, no token management, no activity processing. Both entry points now write to the same event queue, and the single Vercel cron processor handles all events regardless of which endpoint received them.

This permanently eliminates the divergence problem — there's no business logic left to diverge.

---

## Phase 4: Rate Limiting & Token Mutex

**Files changed:** `api/garmin-webhook.js`, `api/utils/rateLimit.js`, `api/utils/garmin/tokenManager.js`
**Files created:** `database/migrations/040_token_refresh_lock_rpc.sql`

### Supabase-backed rate limiting
Replaced the useless in-memory `Map()` with the existing `rateLimitMiddleware` that calls the `check_rate_limit` Postgres RPC. This is distributed — it works correctly across all serverless instances because the state lives in the database.

Configuration: 100 requests per minute per IP for the webhook endpoint.

### Proper token refresh mutex
Created an `acquire_token_refresh_lock` Postgres function that uses `FOR UPDATE` row-level locking:

```sql
SELECT * FROM bike_computer_integrations
WHERE id = p_integration_id
FOR UPDATE;  -- blocks concurrent transactions
```

Only one transaction can hold the lock at a time, guaranteed by Postgres. The new behavior:

- If the lock is acquired: proceed with token refresh
- If the lock is held by another process: wait 3 seconds, check if the other process refreshed the token successfully, use that token
- If the other process failed: **throw an error** — the retry mechanism will handle it on the next cycle

The critical change: the code never "proceeds anyway." The old code had an explicit fallback that said "may cause race condition" — this is gone. Double-refreshing (which invalidates the first token) is no longer possible.

There's a graceful fallback to the old direct-update approach if migration 040 hasn't been deployed yet.

---

## Phase 5: Health Data Audit Trail

**Files changed:** `api/garmin-webhook-process.js`, `api/utils/garmin/healthDataProcessor.js`

### Bug fix: N×N processing
Health events were being processed N×N times. The webhook handler correctly stored one event per item (with `batch_index`), but the processor ignored `batch_index` and processed ALL items from the payload for each event. A batch of 3 daily records created 3 events, each processing all 3 records = 9 total processings.

Fixed: `processHealthEvent` now uses `batch_index` to process only the single item relevant to each event.

### User tracking
Health events now populate `user_id` and `integration_id` on the event record, matching the pattern already used by activity events. Previously these fields were left null for health data, making it impossible to trace which user a health data point belonged to.

### Result logging
Each health processor now returns a human-readable description of what was saved:

- `daily 2025-01-15: resting_hr=55, stress=2`
- `sleep 2025-01-15: 8h, quality=4`
- `bodyComp 2025-01-15: 75kg, 15.5% bf`
- `hrv 2025-01-15: 42ms`
- `stress 2025-01-15: battery=60`

These descriptions are stored in the event's `process_error` field (repurposed as a general result log), providing a complete audit trail of what was received and what was saved.

---

## Phase 6: Real Tests

**Files created:** 7 test files in `api/utils/garmin/`
**Files deleted:** `api/garmin-webhook.test.js` (legacy)

81 vitest tests covering all 7 extracted modules:

| Test file | Tests | Coverage |
|-----------|-------|----------|
| `activityFilters.test.js` | 11 | Filter logic, indoor detection, minimum metrics, case sensitivity, null handling |
| `activityBuilder.test.js` | 20 | Type mapping (30+ Garmin types), name generation, full data building, field name variations (API/PUSH/FIT), trainer detection, `start_date_local` offset, calories→kilojoules |
| `webhookPayloadParser.test.js` | 11 | All payload types, batch returns ALL items, field extraction with fallbacks, null/empty handling |
| `signatureVerifier.test.js` | 10 | Valid/invalid signatures, missing signature rejection, no-secret bypass, header extraction |
| `garminApiClient.test.js` | 10 | Successful fetches, empty responses, auth errors, network failures, backfill requests with time windows |
| `tokenManager.test.js` | 7 | Valid token passthrough, RPC lock acquisition, lock contention (wait + use refreshed token), lock contention (other process failed), RPC fallback, missing credentials, missing refresh token |
| `healthDataProcessor.test.js` | 12 | All 5 health types with result verification, missing integration handling, batch processing, metric extraction from activities |

The old test file re-implemented webhook logic independently (it didn't import anything from the actual codebase) and called `process.exit(0)`. It has been deleted.

---

## Deployment Checklist

1. **Run migration 039** — Adds `retry_count`, `next_retry_at`, `batch_index` columns
2. **Run migration 040** — Creates `acquire_token_refresh_lock` RPC function
3. **Deploy code** — The cron processor will start running automatically every minute
4. **Verify** — `GET /api/garmin-webhook` should return version `3.0.0`
5. **No user action required** — Users do not need to reconnect Garmin

The code gracefully handles the case where migration 040 hasn't been deployed yet (falls back to direct UPDATE for the token lock).

---

## Architecture After Refactoring

```
Garmin Push Notification
        │
        ├──→ Vercel: /api/garmin-webhook (180 lines)
        │         │
        │         └──→ Verify signature
        │         └──→ Store events to garmin_webhook_events
        │         └──→ Return 200
        │
        └──→ Cloudflare Worker (149 lines, optional)
                  │
                  └──→ Same: verify, store, return 200
                              │
                              ▼
                    garmin_webhook_events table
                              │
                              ▼
              Vercel Cron (every minute)
              /api/garmin-webhook-process (510 lines)
                  │
                  ├──→ Activity: filter → build → dedup → import → FIT file
                  └──→ Health: dailies, sleep, body comp, stress, HRV
                              │
                              ▼
                    activities / health_metrics tables
```

**Modules** (`api/utils/garmin/`):
```
signatureVerifier.js     ← pure, no deps
webhookPayloadParser.js  ← pure, no deps
activityFilters.js       ← pure, no deps
activityBuilder.js       ← imports activityFilters
garminApiClient.js       ← uses fetch
tokenManager.js          ← uses supabase (param)
healthDataProcessor.js   ← uses supabase (param)
```
