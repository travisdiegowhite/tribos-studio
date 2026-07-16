# Site Audit — 2026-07-16

Full-site audit covering three failure classes: **things that don't work**, **things
not fully wired up**, and **things producing incorrect data**. Scope: `src/`, `api/`,
`vercel.json`, `.env.example`, and the freeze-policy invariants documented in
`CLAUDE.md` (metrics rename freeze, Garmin dual-stack freeze, connection hygiene,
distance/coordinate conventions).

Method: three independent sweeps (frontend wiring, API/cron layer, data
correctness), followed by direct source verification of every high-severity
finding. Findings below are ordered by severity. Every "Broken" item was
confirmed by reading the exact write sites, SELECT lists, and auth paths cited.

---

## 1. BROKEN — producing incorrect data or exploitable today

### 1.1 Template plan activation never writes `target_rss` → TFI projections see zero planned load

**Writers (legacy-only inserts to `planned_workouts`):**

- `src/hooks/useTrainingPlan.ts:416` — `activatePlan` inserts `target_tss: workout?.targetTSS || null`, no `target_rss`
- `src/hooks/useTrainingPlan.ts:602` — `activatePlanWithAvailability`, same pattern
- `src/hooks/useTrainingPlan.ts:1039` — `addSupplementWorkout`, same pattern

**Canonical-only readers with no legacy fallback:**

- `api/utils/temporalAnchor.js:303` — SELECT includes `target_rss` but **not** `target_tss`
- `api/utils/tfiProjection.js:42` — `existing + (w.target_rss || 0)` → every workout from a template-activated plan contributes **0**
- `api/utils/arcBuilder.js:242` — `const load = s.target_rss ?? null`
- `api/arc-refill.js:152` — SELECT `target_rss` only

**Effect:** migration 089's backfill was one-time, and there is no DB trigger
syncing the column pairs (the only `planned_workouts` trigger is
`update_plan_compliance`). So every plan activated through the template browser
since that migration has `target_rss = NULL` on all its workouts. The TFI
projection — which drives the live `coach-correction-trigger` cron
(`api/coach-correction-trigger.js:254/329`) — then projects fitness as **pure
decay**, producing wrong projected-fitness numbers and spurious "off-target"
correction proposals for exactly the users who did the standard onboarding flow.

**Fix:** dual-write `target_rss` alongside `target_tss` at all three insert
sites (pattern: `api/utils/arcBuilder.js:255-256`, `api/arc-refill.js:180-181`).
A one-time backfill (`UPDATE planned_workouts SET target_rss = target_tss WHERE
target_rss IS NULL AND target_tss IS NOT NULL`) repairs existing rows — needs
approval since it touches production data.

### 1.2 Check-in and deviation flows mutate `target_tss` but leave `target_rss` stale

- `api/check-in-apply.js:169` (`modify`: scales `target_tss`), `:230` (`insert_rest`: `target_tss: 0`), `:273` (`replace`)
- `api/deviation-resolve.js:150` (`modify`: scales to 70%), `:220` (`insert_rest`: `target_tss: 0`)
- Same class (legacy-only target writes): `api/google-calendar-auth.js:712`, `api/utils/planGenerator.js:632/751/859`

**Effect:** this is worse than 1.1 for rows that *do* have `target_rss`: after
the coach scales a workout to 70% or zeroes it for rest, canonical-first
readers (`target_rss ?? target_tss`) read the **pre-mutation** load. This is
the exact sequencing failure mode the CLAUDE.md dual-write rule exists to
prevent. Every sibling writer does it correctly —
`api/correction-proposal-apply.js:149-196`, `api/coach.js:303-304/411-412/503-504`,
`api/arc-refill.js:180-181`, `api/utils/arcRefill.js:153-154`,
`api/utils/arcBuilder.js:255-256` — these two (plus the two same-class files)
are the outliers.

**Fix:** mirror every `target_tss` write with `target_rss` (copy the
`correction-proposal-apply.js` pattern).

### 1.3 Manual activity linking writes `actual_rss` without `actual_tss` → legacy-only readers undercount completed load

- `src/hooks/useTrainingPlan.ts:932` — `linkActivityToWorkout` writes
  `actual_rss: activity.rss ?? activity.tss` with no `actual_tss`. The inline
  comment defers to a §1d backfill migration that the freeze policy cancelled.
- The auto-link sibling does it correctly: `src/hooks/useActivityAutoLink.ts:142-143`
  writes both columns.

**Legacy-only readers that silently miss manually-linked workouts:**

- `api/admin.js:694` — `if (w.target_tss && w.actual_tss)` (SELECT at `:594` has no `actual_rss`) → dropped from admin adherence/TSS-hit stats
- `api/utils/assembleFitnessContext.js:162` — AI coach fitness context undercounts completed load
- `api/utils/contextHelpers.js:80/100`, `api/utils/checkInContext.js:242`

Note: the planner's own weekly stats read `actual_rss ?? actual_tss ?? target_tss`
(`useTrainingPlan.ts:1180`), which masks the bug in the UI that wrote it.

**Fix:** add `actual_tss` to the update at `useTrainingPlan.ts:932` (copy
`useActivityAutoLink.ts:142-143`). Optional backfill for rows linked since the
canonical cut-over.

### 1.4 Unauthenticated fleet-wide recompute endpoint (security / cost)

- `api/training-load-daily.js:49-51` — the `GET ?action=rollforward` cron path
  runs a trailing-180-day training-load recompute for **every active user**
  with no `verifyCronAuth()`. The inline comment claims it follows "the same
  unauthenticated-GET convention as `/api/fitness-snapshots?action=compute-weekly`",
  but `api/fitness-snapshots.js:202-203` **does** call `verifyCronAuth` — that
  precedent was hardened and this endpoint was missed. It is the only
  registered cron without auth.

**Effect:** anyone who discovers the URL can trigger repeated fleet-wide
recomputes — a compute-cost / database-load DoS vector.

**Fix:** add the same `verifyCronAuth` gate as `fitness-snapshots.js:202`
(Vercel crons send the secret; the fire-and-forget webhook callers already
send `x-cron-secret`).

### 1.5 Dead endpoint call: `/api/claude-enhance` does not exist

- `src/utils/claudeRouteService.js:715` — `enhanceRouteWithClaude` fetches
  `/api/claude-enhance`; there is no `api/claude-enhance.js` (only the archived
  `OLD/` copy references it). The function is exported and imported into
  `src/utils/aiRouteGenerator.js:13` but has no live call site — a latent 404
  the moment anyone wires it up.

**Fix:** delete the function + import (or build the endpoint if enhancement is
still wanted).

---

## 2. NOT FULLY WIRED UP

### 2.1 Google Calendar settings UI hidden behind a stale "Coming Soon" badge

`src/pages/Settings.jsx` fully implements `connectGoogleCalendar` (`:1353`) and
`disconnectGoogleCalendar` (`:1375`) against a working backend
(`api/google-calendar-auth.js` exists; connection status is even loaded on
mount at `:286-301`) — but the rendered section (`:2240-2249`) shows a static
"Coming Soon" badge and never wires a button to either handler. A completed,
connected feature is invisible to users.

### 2.2 Orphaned live API endpoints (deployed, auth'd, zero callers)

- `api/fuel-plan.js` — live Claude proxy; the frontend fuel features
  (`WorkoutModal.tsx`, `RaceDayGuide.jsx`, `FuelCard.jsx`) use the local
  calculator, never this endpoint.
- `api/review-week.js` — live Claude proxy; docs claim `trainingPlannerStore.ts`
  calls it, but no call exists anywhere in `src/`. Also instantiates
  `new Anthropic()` at module load (`:16`).
- `api/email.js` — superseded by `/api/email-tool` (`adminService.js:59`) and
  `api/cron/welcome-email.js`; nothing calls it. CLAUDE.md still lists it as
  the Resend integration point (stale doc).

Each is either a feature that lost its UI or cleanup debt; either wire them up
or remove them (removal keeps attack surface down).

### 2.3 Hardcoded imperial units ignore user preferences

- `src/pages/Settings.jsx:131` — `const useImperial = true; // TODO: Get from user preferences context`
- `src/pages/GearPage.jsx:43` — same pattern

Metric-preferring users see imperial values on these pages regardless of their
saved preference.

### 2.4 RouteAnalysisPanel "save as route" not implemented

`src/components/training/RouteAnalysisPanel.jsx:654` — TODO; the action is a stub.

### 2.5 Canonical-only activity RSS readers (latent policy violations)

These read `activity.rss` with no `?? tss` fallback, violating the freeze
rule ("never add a canonical-only reader without the legacy in the SELECT or a
JS fallback"):

- `api/utils/metricsComputation.js:20,232,266,302,405-406` (TWL/EFI compute)
- `api/utils/fitnessHistoryTool.js:516`
- `api/proactive-insights-process.js:218` (display-only, guarded)

Currently bounded because migration 090 backfilled `rss` and the FIT/Garmin
ingestors dual-write (`api/fit-upload.js:360-361`,
`api/garmin-activities.js:1008-1009`), but this is the same latent shape that
caused the `target_rss` outage. Add `?? tss` fallbacks.

---

## 3. COSMETIC / DOC DRIFT

- `src/pages/Updates.jsx` is orphaned — `/updates` redirects to `/settings` (`App.jsx:402`).
- "Coming soon" placeholders (no handler expected): `Admin.jsx:188`,
  `PlanTemplateManager.jsx:602`, `NotificationSettings.jsx:257`, `WhatsNewModal.jsx:118`.
- `api/push-test.js` — debug endpoint with no callers (likely intentional).
- `.env.example` missing `AI_DAILY_USER_LIMIT` / `AI_DAILY_GLOBAL_LIMIT`
  (read in `api/utils/aiQuota.js:29-30`, code defaults exist); the
  `VITE_MAPBOX_ACCESS_TOKEN` fallback variant (read in
  `segmentAnalysisPipeline.js:37` etc.) is also undocumented.
- CLAUDE.md drift: says `garmin-webhook-process` and `proactive-insights-process`
  crons run "every minute" — `vercel.json` has `*/5` and `*/10`; still cites
  `api/email.js` as the Resend integration point.
- `useTrainingPlan.ts:934` — inline `/ 1000` instead of `M_TO_KM` (value
  correct, convention miss).
- Duplicate haversines not wrapping the canonical helper:
  `src/pages/RouteBuilder.jsx:1462`, `src/utils/segmentAlternatives.js:37-44`
  (both numerically correct).
- `useTrainingPlan.ts:1113/1135` — `getDaysRemaining` / `currentWeek` diff a
  stored timestamp against local `new Date()`; can be off by a day near
  midnight across timezones (week-bucket granularity, low impact).

---

## 4. VERIFIED CLEAN

- **Routing:** every route in `App.jsx` resolves to a real component; `/today` →
  TodaySpine, `/ride/new` → RouteBuilder2 with `/ride/new/classic` fallback —
  matches the documented contract. Dev harness correctly gated on
  `import.meta.env.DEV`.
- **Deleted RB2 gate:** zero references to `useRouteBuilderV2Access`,
  `RouteBuilderV2Guard`, or `VITE_ROUTE_BUILDER_V2_ENABLED` in code.
- **Env vars (frontend):** every `import.meta.env.VITE_*` read is documented in
  `.env.example`.
- **Realtime:** zero Supabase Realtime usage in `src/` (the one `.subscribe(` is
  Web Push).
- **Connection hygiene:** the only production `createClient` is
  `api/utils/supabaseAdmin.js` — no violations.
- **Garmin freeze invariants:** `garmin2-*` fully dormant (nothing calls it);
  legacy processor still skips ping-typed rows
  (`garmin-webhook-process.js:137-143`); `garmin2-pull` not registered in
  `vercel.json`.
- **vercel.json:** all 14 cron paths resolve to real files; no cron faster than
  `*/5`; `sw.js` no-cache header present; `/assets/*` immutable + SPA rewrite
  correct.
- **Auth:** `admin.js`, `coach.js`, `claude-routes.js`, all three `admin-*`
  endpoints, and 13 of 14 registered crons verified gated (the exception is
  finding 1.4).
- **Webhooks:** fire-and-forget calls from strava/garmin/wahoo webhooks are
  `.catch`-guarded and pass `x-cron-secret`; no silent data drops observed.
- **Orphaned tables:** zero code references to `today_hero_paragraphs`,
  `far_daily`, or `user_profiles.route_builder_v2_enabled` (type-only mention
  in `database.ts` is allowed).
- **RSS source spec:** `api/utils/fitnessSnapshots.js:306-402` matches the spec
  exactly — 6 tiers, confidences 0.95/0.95/0.75/0.50/0.65/0.40, terrain
  multiplier applied only to the kilojoules and inferred tiers.
- **Coordinates:** no `[lat, lng]` swaps or converter bypasses found in the
  route-builder/geometry utilities.
- **Timezones:** scheduling/redistribution use `formatLocalDate` + noon-anchored
  parsing consistently; `tfiProjection.js` uses UTC-noon consistently.
- **Dual-write compliance elsewhere:** `strava-activities.js:412-413/463-464`,
  `onboarding-complete.js:200-201`, `process-deviation.js:220-223`,
  `correction-proposal-apply.js`, `coach.js`, `arcBuilder.js`/`arcRefill.js`
  all verified correct.

---

## 5. Recommended fix order

| Priority | Item | Scope |
|----------|------|-------|
| P0 | 1.1 + 1.2 + 1.3 — dual-write repairs (8 write sites across 6 files) | Small diffs; copy existing sibling patterns. Optional prod backfill needs approval. |
| P0 | 1.4 — add `verifyCronAuth` to `training-load-daily.js` rollforward | 3-line diff matching `fitness-snapshots.js:202` |
| P1 | 2.5 — add `?? tss` fallbacks to canonical-only readers | Small, prevents the next outage-class incident |
| P1 | 1.5 — delete dead `enhanceRouteWithClaude` (or build endpoint) | Cleanup |
| P2 | 2.1 — un-hide Google Calendar UI (product decision) | Wire existing handlers |
| P2 | 2.3 — respect unit preference in Settings/GearPage | Read from UserPreferencesContext |
| P3 | 2.2 orphaned endpoints, cosmetic/doc drift items | Cleanup batch |

Per the metrics-freeze policy, the P0 metric fixes are scoped, targeted bug
fixes (dual-write violations), not a resumption of the rename — they restore
the documented steady-state contract.
