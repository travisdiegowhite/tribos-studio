# Garmin Reliability — Phase 0 Runbook (Decision Gate)

> **Purpose:** Manual checks and diagnostics that decide which recovery path
> Phase 2 (recovery of the ~377 `summary_only` rides + ongoing reconcile cron)
> gets built on. Run these in order; record the results inline. ~1 hour of work.
>
> Context: `docs/garmin-integration-context.md` and the reliability plan.
> Spec references are to `docs/Activity_API-1.2.5.pdf` (current) and
> `docs/Activity_API-1.2.3_0.pdf` (last version documenting `/backfill/*`).

## Why this gate exists

- The §7.3 pull endpoint rejects OAuth Bearer auth (`InvalidPullTokenException`);
  the only sanctioned pull auth is a **pull token** — either embedded in a
  ping's `callbackURL` or generated manually with the portal's Pull Token tool.
- The `/backfill/*` endpoints were **removed from spec 1.2.5 entirely**. They
  still answer today (the legacy recovery nudges use them) but are deprecated.
- Spec 1.2.5 documents portal web tools (Summary Resender, Connect Status,
  API Configuration, Pull Token) as the supported ops surface.

## Step 1 — Portal inspection (`https://apis.garmin.com/tools/endpoints`)

Log in with the consumer key + secret. Record:

| Check | What to look for | Result |
|---|---|---|
| API Configuration / Endpoint Configuration | Which summary types are **Enabled**? Is `activityDetails` enabled at all? Push or Ping for `activityDetails` and `activityFiles`? Any types **On Hold**? | _todo_ |
| Connect Status | Any flagged disruptions on our key | _todo_ |
| Summary Resender | Can it re-send `activityDetails` / `activityFiles` for a specific user + date range? What inputs does it take? | _todo_ |
| Pull Token tool | Generate a token; note its TTL | _todo_ |

**Decision input:** if `activityDetails` is disabled or misrouted, that alone
explains the ~70% of activities that never get details/files organically —
fix the configuration before concluding anything else is broken.

## Step 2 — Backfill diagnostic (one API call per test ride)

Use the June 6 diagnostic endpoint (no DB writes). From the tribos.studio
browser console while logged in as a user with stranded rides:

```js
const { data: { session } } = await supabase.auth.getSession();
fetch('/api/garmin2-request-activity-details-backfill', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ activityId: '<activities.id uuid>' })
}).then(r => r.json()).then(console.log);
```

Run against 3–5 stranded `summary_only` rides of varying age. Find candidates:

```sql
SELECT id, start_date, name, resync_attempt_count
FROM activities
WHERE provider = 'garmin' AND data_completeness = 'summary_only'
ORDER BY start_date DESC
LIMIT 20;
```

Then watch for resulting pings (wait up to ~1h):

```sql
SELECT id, event_type, activity_id, created_at, processed
FROM garmin_webhook_events
WHERE event_type = 'ACTIVITY_DETAIL_PING'
ORDER BY created_at DESC
LIMIT 20;
```

| Garmin response | Meaning | Phase 2 consequence |
|---|---|---|
| **202 + ping arrives** | callbackURL recovery viable (pull token embedded) | Re-enable the ping consumer (`garmin2-pull` cron) + batch backfill driver |
| **202 but no ping** | Garmin accepted but won't deliver — likely endpoint config (Step 1) or consent | Fix config first, re-test |
| **409** | That timeframe was already backfill-requested (permanent per 1.2.3) | Old windows unrecoverable via backfill; rely on Summary Resender / pull token |
| **412** | User consent doesn't authorize Activity Details | Reconnect-with-consent prompt needed; include in support ticket |

> ⚠️ 1.2.3 documented 409s on duplicate backfill windows as permanent.
> Treat each tested window as consumed — pick test rides you'd want
> recovered anyway.

## Step 3 — Pull Token smoke test

Generate a temporary token with the portal's Pull Token tool, then (replace
times with the stranded ride's upload window, ≤24h span):

```bash
curl -s "https://apis.garmin.com/wellness-api/rest/activityDetails?uploadStartTimeInSeconds=<START>&uploadEndTimeInSeconds=<END>&token=<PULL_TOKEN>" | head -c 2000
```

- **Returns activity detail JSON with samples** → the most direct recovery
  path for the 377: adapt `scripts/garmin-pull-backfill.js` to take
  `--pull-token` (its upload-window batching already works; only the auth
  changes), run in supervised batches while a token is valid.
- **Rejected** → fall back to Summary Resender (Step 1) and/or backfill.

## Step 4 — Summary Resender trial

If the tool supports it, re-send `activityFiles` (or `activityDetails`) for
one affected user + date. Confirm the re-sent notification lands in
`garmin_webhook_events` and the ride completes to `data_completeness='full'`
after the next processor tick.

## Step 5 — File the support ticket

Email **connect-support@developer.garmin.com** (draft below — fill in the
measured numbers from `/api/admin-garmin-health` and Step 1–4 results).

---

### Draft support ticket

> **Subject:** Activity API — incomplete ACTIVITY_FILE_DATA/details delivery and recommended recovery path after backfill deprecation
>
> Hello,
>
> We operate a push-based Activity API integration (consumer key: `<KEY>`,
> production). We're seeing three issues and would appreciate guidance:
>
> 1. **Partial file/details delivery.** Over the last `<N>` days,
>    `<X>` distinct activities generated CONNECT_ACTIVITY notifications, but
>    only `<Y>` (~`<Z>`%) received an ACTIVITY_FILE_DATA ping. Affected
>    example summaryIds: `<id1>, <id2>, <id3>` (Garmin user IDs available on
>    request). Is partial file delivery expected, and what determines whether
>    an activity gets an activityFiles ping?
>
> 2. **`/backfill/*` deprecation.** Spec 1.2.5 no longer documents the
>    Summary Backfill endpoints that 1.2.3 described. The endpoints still
>    respond today. What is their deprecation timeline, and what is the
>    recommended **programmatic** path to request re-delivery of summaries
>    for a user/time range going forward (the Summary Resender web tool
>    appears to be manual-only)?
>
> 3. **Diagnostic results.** A test request to
>    `/wellness-api/rest/backfill/activityDetails` for an affected activity
>    returned `<202/409/412>` `<and a subsequent ACTIVITY_DETAIL_PING did /
>    did not arrive>`. If 412: which consent scope governs Activity Details,
>    and can a user grant it without disconnecting?
>
> Endpoint configuration (from the portal): `<paste summary-type table>`.
>
> Thanks,
> `<name>` — tribos.studio

---

## Recording the decision

When done, append the outcome here and update the plan: which of the three
recovery mechanisms (pull-token script / Summary Resender / backfill driver)
Phase 2 will use, and whether a re-consent prompt is needed (412 case).
