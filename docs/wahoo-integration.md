# Wahoo integration

Status, design and runbook for the Wahoo Cloud API connection. Source of truth
for API facts: <https://cloud-api.wahooligan.com/> (read 2026-11-14).

## Status (2026-11-14)

The Wahoo connection shipped in early 2026 but **never imported a workout**:
7 accounts connected between January and April, `last_sync_at` was never set,
and there were 0 `provider = 'wahoo'` activities. Those riders kept getting
their rides through Strava. The rebuild on branch `claude/bold-clarke-91gfno`
fixes the causes:

| # | Old behaviour | Wahoo reality | Fix |
|---|---|---|---|
| 1 | Read `body.workout` | The workout is nested: `body.workout_summary.workout` | `splitWahooPayload` |
| 2 | Mapped a `workout_type` string | Numeric `workout_type_id` | `workoutTypes.js` |
| 3 | Asked for no `offline_data` scope | Webhooks are only sent with `offline_data` | Scope added; old connections show **Reconnect** |
| 4 | Wrote `calories` / `sync_error` | Neither column exists, so the insert or update fails | Removed; uses `status` / `error_message` |
| 5 | Wrote `"3600.0"` into integer columns | Decimals arrive as strings | `num()` / rounding |
| 6 | Read `workout.file.url` | `workout_summary.file.url` | Fixed |
| 7 | Threw away FIT power metrics | — | NP/EP, TSS/RSS, IF/RI dual-written |
| 8 | Trusted body `userId`; no OAuth `state`; `?token=` only | Wahoo sends `webhook_token` in the body | `requireAuth`, state nonce, body token |

## How it works

```
ELEMNT ride ─▶ Wahoo Cloud ─▶ POST /api/wahoo-webhook ─▶ wahoo_webhook_events (audit row)
                                     │
                                     └─▶ ingestWahooWorkout ─▶ activities (+ dedup, FIT, metrics)
Settings "Sync Activities" ─▶ /api/wahoo-auth sync_workouts ─▶ GET /v1/workouts ─▶ ingestWahooWorkout
Route builder "Send to Wahoo" ─▶ /api/wahoo-auth push_route ─▶ POST /v1/routes
```

| File | Role |
|---|---|
| `api/wahoo-webhook.js` | Verifies `webhook_token`, stores an audit row, imports inline. |
| `api/wahoo-auth.js` | Connect (`exchange_code`), status, disconnect, manual sync and route push. Every action uses `requireAuth`. |
| `api/utils/wahoo/ingest.js` | The one import path, shared by webhook and sync. |
| `api/utils/wahoo/normalize.js` | Converts a Wahoo summary into an `activities` row, and FIT results into columns. |
| `api/utils/wahoo/workoutTypes.js` | `workout_type_id` → type and trainer. Only cycling and running are imported. |
| `api/utils/wahoo/tokens.js` | Lazy refresh with a lock, reconnect flagging, `DELETE /v1/permissions`. |
| `api/utils/wahoo/fileHosts.js` | Allowlist of FIT download hosts (SSRF guard). |
| `src/utils/wahooService.js` | Browser client. It sends a Bearer token and an OAuth `state` nonce. |
| `src/pages/oauth/WahooCallback.jsx` | Checks `state`, then exchanges the code. |
| `database/migrations/140_wahoo_webhook_events.sql` | Audit log. **Apply by hand.** |

### Rules that bind changes

- **Refresh tokens only right before a request, never from a cron.** Wahoo caps
  each app at 10 unrevoked tokens per user (from 2026-01-01), and an old pair
  is revoked only after the new one is used. `getValidWahooToken` is the only
  refresh path. It takes `refresh_lock_until` so two requests never mint two
  tokens.
- **The import is idempotent on `provider_activity_id`.** Wahoo can send
  duplicate webhooks and retries any delivery that doesn't get a 200. The
  webhook therefore returns **5xx on a transient failure** on purpose: Wahoo
  redelivers after 30 min, 4 h, 24 h and 72 h. That is the retry queue, and
  there is no processor cron.
- **Strava auto-import is switched off at the first successful Wahoo import,
  not at connect.** A Wahoo connection that never delivers must never silence
  Strava.
- **Cross-provider dedup** goes through `activityDedup.js`. Wahoo (90) takes
  over a Strava copy (50) and merges into a Garmin copy (100).
- **Manual sync is small on purpose.** Sandbox apps get 25 requests per 5
  minutes for the whole app (production: 200 per 5 min, 1,000 per hour, 5,000
  per day). Sync reads at most 2 pages of 30, stops when
  `X-RateLimit-Remaining` is low, and stops after 45 s. Webhooks and file
  downloads don't count against the limit.
- **FIT files** are fetched without an Authorization header first. If the
  server answers 401 or 403, the fetch is retried with the bearer token.
  Successful downloads are kept in the `garmin-fit` bucket under
  `wahoo/<user>/<workout>.fit`. Production only downloads from
  `*.wahooligan.com` / `*.wahoofitness.com`, plus any hosts in
  `WAHOO_FILE_HOSTS`. If a URL is refused, the workout still imports from its
  summary, and the refusal is logged in `wahoo_webhook_events.process_error`.
- **Wahoo does not share workouts created by third-party apps.** Uploading a FIT
  through `POST /v1/workout_file_uploads` will not come back to us as a webhook.

## Setup checklist (Wahoo developer portal + Vercel)

1. Check whether the app is in **sandbox or production**. Production needs
   Wahoo's review; apply early.
2. The app's scopes must include `email user_read workouts_read offline_data
   routes_read routes_write`. If the app has more scopes (for example
   `plans_read plans_write`), set `VITE_WAHOO_SCOPES` to the full
   space-separated list. Asking for a scope the app lacks makes authorization
   fail.
3. The redirect URI must equal both `WAHOO_REDIRECT_URI` and
   `VITE_WAHOO_REDIRECT_URI` (`https://www.tribos.studio/wahoo/callback`).
4. Webhook settings:
   - Set the URL to `https://www.tribos.studio/api/wahoo-webhook`.
   - Enable webhooks.
   - Copy the portal's **webhook token** into Vercel as `WAHOO_WEBHOOK_TOKEN`.
5. Vercel environment variables: `WAHOO_CLIENT_ID`, `WAHOO_CLIENT_SECRET`,
   `WAHOO_REDIRECT_URI`, `WAHOO_WEBHOOK_TOKEN`, `VITE_WAHOO_CLIENT_ID` and
   `VITE_WAHOO_REDIRECT_URI`.
6. Apply migration 140 by hand, then run `npm run audit:schema`.
7. The deauthorize flags ("Delete Upcoming Workouts", "Delete Owned Plans") act
   when a user disconnects. Leave them off unless we start pushing plans.

## Testing without a device

1. **Unit tests**: `npx vitest run api/utils/wahoo api/wahoo-webhook.test.js api/wahoo-auth.test.js`.
   The fixtures copy the documented payload shapes.
2. **Replay against a preview deploy**: `scripts/wahoo-webhook-replay.mjs`.
   - It sends a real-shaped webhook for a connected account (`--wahoo-user-id`
     = that account's `provider_user_id`).
   - `--file-url` can point at any https FIT on a preview, for example a signed
     URL to one of your own FITs. Production only fetches from Wahoo hosts.
   - Pass `--starts` with the start time of a ride you already have to test
     dedup.
   - Re-run with the same `--workout-id` to test the idempotent update path.
3. **A free Wahoo account (no hardware)** covers:
   - connect: check `scopes` and `provider_user_id` on the row
   - status
   - Sync (expect 0 workouts)
   - Send to Wahoo (confirm with the ELEMNT companion app's route list)
   - disconnect (the log shows `DELETE /v1/permissions`)
4. **A real ride** is the only thing that can't be faked. Options: a connected
   rider with an ELEMNT, or a first-party Wahoo app such as a SYSTM trial.

## Operations

```sql
-- Recent deliveries and how they ended
select created_at, status, result, process_error, workout_id, activity_id
from wahoo_webhook_events order by created_at desc limit 50;

-- Connections that cannot receive rides (need Reconnect)
select user_id, scopes, refresh_token_invalid, status, error_message, last_sync_at
from bike_computer_integrations
where provider = 'wahoo'
  and (scopes is null or not ('offline_data' = any(scopes)) or refresh_token_invalid);
```

## Not built yet

- Pushing planned workouts to Wahoo (plans API; needs `plans_write`).
- Updating a route that was already sent. Each send creates a new Wahoo route.
