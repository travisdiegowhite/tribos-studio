# Claude Code Project Guidelines

## Project Overview

**tribos.studio** is a production cycling training platform (SaaS) built with React 19, Vite, Supabase, and Vercel serverless functions. It provides AI-powered route building, training plan management, multi-provider activity sync (Strava, Garmin, Wahoo), community features, and gear tracking.

## Metrics Rollout — FROZEN

The canonical Tribos metrics specification lives at `docs/TRIBOS_METRICS_SPECIFICATION.md`. Historical rollout context is in `docs/METRICS_ROLLOUT_STATUS.md` and `docs/METRICS_ROLLOUT_REMAINING.md`. **The current policy lives in `docs/METRICS_ROLLOUT_FREEZE.md` and overrides anything those docs imply about future cut-over PRs.**

Three amendments from Part A implementation apply on top of the spec:

- **(D1) `rss_source` has 6 tiers, not 4**: `device`, `power`, `kilojoules`, `hr`, `rpe`, `inferred`.
- **(D2) Confidence values are calibrated**: `device` 0.95 / `power` 0.95 / `kJ-with-FTP` 0.75 / `kJ-no-FTP` 0.50 / `hr` 0.65 / `inferred` 0.40.
- **(D4) Terrain multiplier applies only to `kJ` and `inferred` tiers**, not all tiers.

### The B0–B10 rename is frozen — do not resume it

The TSS→RSS / CTL→TFI / ATL→AFI / TSB→FormScore / NP→EP / IF→RI rename
shipped through B10 (canonical columns added by migrations 069–073, the
`training_load_daily` cut-over completed in B3/B4 with migration 071's drop).
Everything beyond that is **abandoned**, not deferred. See
`docs/METRICS_ROLLOUT_FREEZE.md` for the full rationale and rules.

Practical implications:

- **Migrations `074`–`080` will not run.** Their DROP blocks stay commented
  out indefinitely. Legacy columns (`tss`, `ctl`, `atl`, `tsb`,
  `normalized_power`, `intensity_factor`, `weekly_tss_estimate`, etc.)
  coexist with their canonical twins as the long-term schema. Do NOT
  uncomment a DROP block.
- **No more reader cut-over PRs.** The `canonical ?? legacy` fallback
  pattern is the steady state. The reader audits in
  `docs/METRICS_ROLLOUT_REMAINING.md` §1a–§1f are not a roadmap.
- **Internal JS identifiers stay legacy.** Variable names like `ctl`,
  `atl`, `tsb`, `tss` inside `src/utils/trainingPlans.ts`,
  `src/lib/training/tsb-projection.ts`, etc. are off-limits for renames.
  The spec §7 grep checklist (`grep -ri "\.tss\b\|\.ctl\b..." src/`
  must be zero) **no longer applies**.

Code added or modified under `api/` and `src/` should:
- **Read canonical-first with legacy fallback** (`activity.rss ?? activity.tss`).
- **Dual-write both columns when mutating a row.** This is stricter than
  the previous "write canonical only" guidance — it eliminates the
  sequencing bugs that caused the `target_rss` and `plan_deviations`
  outages. New writers populate canonical AND legacy on insert/update.
- Never add a canonical-only reader without the legacy in the SELECT
  list or a JS fallback — that's the failure mode that landed
  `target_rss` in production with no column.
- Treat the rename as complete-but-abandoned. Do not "finish" stranded
  pieces opportunistically; if a real bug needs a real fix, scope it
  and ask for approval.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, React Router 7, Mantine UI 8, Zustand 5 |
| **Build** | Vite 6, TypeScript (gradual migration from JS) |
| **Backend** | Vercel serverless functions (`/api` directory) |
| **Database** | Supabase (PostgreSQL + Auth + RLS) |
| **Maps** | Mapbox GL, Stadia Maps (Valhalla routing), Turf.js |
| **AI** | Anthropic Claude API (`@anthropic-ai/sdk`) |
| **Testing** | Vitest 4, Testing Library, jsdom |
| **Monitoring** | Sentry (errors), PostHog (analytics), Vercel Analytics |
| **Email** | Resend |
| **PWA** | vite-plugin-pwa with workbox |

**Node requirement**: `>=20.0.0`

## Commands

```bash
npm run dev          # Start Vite dev server on port 3000
npm run build        # Production build to dist/
npm run preview      # Preview production build
npm run lint         # ESLint on src/ (.js, .jsx)
npm run test         # Vitest in watch mode
npm run test:run     # Vitest single run
npm run test:coverage # Vitest with v8 coverage
npm run type-check   # TypeScript type checking (tsc --noEmit)
npm run dev:vercel   # Local dev with Vercel CLI (for API routes)
```

**To test API serverless functions locally**, use `npm run dev:vercel` (requires Vercel CLI).

## Project Structure

```
tribos-studio/
├── api/                    # Vercel serverless functions (36 endpoints)
│   ├── utils/              # Shared API utilities (CORS, rate limiting, parsers)
│   │   └── garmin/         # Garmin-specific utilities (6+ modules with tests)
│   ├── coach.js            # AI coaching endpoint
│   ├── claude-routes.js    # Claude AI route generation
│   ├── admin.js            # Admin operations
│   ├── email.js            # Email via Resend
│   ├── strava-*.js         # Strava auth, webhook, activities
│   ├── garmin-*.js         # Garmin auth, webhook, activities, tokens
│   ├── wahoo-*.js          # Wahoo auth, webhook
│   └── ...                 # Routes, weather, elevation, fuel, etc.
├── cloudflare-workers/     # Garmin webhook proxy (store-and-respond)
│   └── garmin-webhook/     # Thin HMAC-verified event store
├── database/               # 50 SQL migration files (numbered chronologically)
├── scripts/                # Utility scripts (seed, backfill, validate)
├── src/
│   ├── App.jsx             # Router config, providers, route definitions
│   ├── main.jsx            # Entry point
│   ├── theme.js            # Mantine theme + design tokens (18KB)
│   ├── components/         # 100+ components organized by feature
│   │   ├── RouteBuilder/   # Route building UI components
│   │   ├── activation/     # Onboarding guides
│   │   ├── admin/          # Admin dashboard widgets
│   │   ├── coach/          # AI coach command bar + response area
│   │   ├── community/      # Cafe, discussions, check-ins
│   │   ├── conversations/  # Conversation thread UI
│   │   ├── fueling/        # Nutrition planning cards
│   │   ├── gear/           # Gear/component tracking
│   │   ├── landing/        # Marketing landing page sections
│   │   ├── planner/        # Training planner (TypeScript)
│   │   ├── settings/       # Settings sub-components
│   │   ├── training/       # Training plan cards, filters
│   │   └── ui/             # Shared UI primitives (badges, buttons)
│   ├── contexts/           # React Context providers
│   │   ├── AuthContext.jsx  # Auth state + methods (CRITICAL)
│   │   └── UserPreferencesContext.jsx
│   ├── hooks/              # Custom React hooks (14 major hooks)
│   │   ├── useTrainingPlan.ts  # Training plan management (35KB)
│   │   ├── useActivation.ts    # Onboarding step tracking
│   │   ├── useGear.ts          # Gear CRUD
│   │   ├── useCommunity.ts     # Community pod management
│   │   ├── useRouteManipulation.js  # Route editing, snap-to-road
│   │   └── ...
│   ├── stores/             # Zustand state management
│   │   ├── routeBuilderStore.js     # Route builder (persisted to localStorage)
│   │   └── trainingPlannerStore.ts  # Training planner (drag-and-drop state)
│   ├── services/           # Business logic services
│   ├── lib/                # Library initialization
│   │   ├── supabase.js     # Supabase client (validates anon key role)
│   │   └── sentry.js       # Sentry error tracking
│   ├── utils/              # 59 utility modules (831KB)
│   │   ├── aiRouteGenerator.js      # Claude AI + routing engine (112KB)
│   │   ├── claudeRouteService.js    # Claude API wrapper (18KB)
│   │   ├── directions.js            # Multi-provider routing abstraction
│   │   ├── rideAnalysis.js          # Activity analysis (power, intensity)
│   │   ├── stravaService.js         # Strava API wrapper
│   │   ├── garminService.js         # Garmin API wrapper
│   │   └── ...
│   ├── data/               # Static data (templates, workout libraries)
│   │   ├── trainingPlanTemplates.ts  # 93KB of plan definitions
│   │   ├── workoutLibrary.ts         # 84KB of workout definitions
│   │   ├── runningPlanTemplates.ts
│   │   └── runningWorkoutLibrary.ts
│   ├── types/              # TypeScript type definitions
│   │   ├── database.ts     # Database table types
│   │   ├── training.ts     # Training domain types
│   │   ├── planner.ts      # Planner domain types
│   │   └── index.ts        # Re-exports
│   ├── styles/global.css   # Global styles
│   └── test/setup.ts       # Vitest setup (Supabase mocks, browser API stubs)
├── docs/                   # Project documentation
├── OLD/                    # Deprecated/archived code
├── vercel.json             # Deployment config + cron jobs
├── vite.config.js          # Build config + PWA + chunk splitting
├── vitest.config.ts        # Test config
└── tsconfig.json           # TypeScript config with path aliases
```

## Architecture

### Frontend Rendering
Single-page app with client-side routing. `ProtectedRoute` redirects unauthenticated users to `/auth`; `PublicRoute` redirects authenticated users to `/dashboard`.

### State Management
- **Zustand stores** — Large shared state (route builder, training planner) with localStorage persistence
- **React Context** — Auth state (global), user preferences
- **Component state** — Temporary UI state via `useState`

### API Layer
Vercel serverless functions in `/api`. Each file exports a default handler. Backend uses `SUPABASE_SERVICE_KEY` (service role, server-only). Frontend uses `VITE_SUPABASE_ANON_KEY` (anon role, exposed to browser).

### Cron Jobs (vercel.json)

`vercel.json` is the source of truth; this table is kept in step with it. It
listed three of them with two wrong cadences until 2026-08-30 — both claimed
"every minute", which also contradicted the connection-hygiene rule below that
no cron may run more often than every 5 minutes. Nothing runs every minute.

| Schedule | Path | What it does |
|---|---|---|
| `*/5 * * * *` | `garmin-webhook-process` | drain queued Garmin events |
| `*/5 * * * *` | `coros-webhook-process` | drain queued COROS events |
| `*/5 * * * *` | `cron/welcome-email` | send queued welcome emails |
| `*/10 * * * *` | `proactive-insights-process` | generate user insights |
| `30 * * * *` | `garmin-health-monitor` | Garmin SLI/SLO checks |
| `45 * * * *` | `strava-health-monitor` | Strava SLI/SLO checks |
| `0 * * * *` | `workout-preview-cron` | tomorrow's session push |
| `0 */6 * * *` | `garmin-token-maintenance` | refresh Garmin tokens |
| `0 */6 * * *` | `coros-token-maintenance` | refresh COROS tokens |
| `0 2 * * *` | `recompute-user-tau?action=recompute-all` | adaptive EWMA taus |
| `30 2 * * *` | `training-load-daily?action=rollforward` | daily load rollforward |
| `0 3 * * *` | `database-cleanup` | prune stale rows |
| `0 10 * * *` | `cron/activation-nudge` | onboarding nudges |
| `0 12 * * *` | `coach-correction-trigger` | coach correction sweep |
| `0 3 * * 1` | `fitness-snapshots?action=compute-weekly` | weekly snapshots |
| `0 4 * * 1` | `evidence-weekly?action=compute-weekly` | weekly evidence rollup |

### TypeScript Migration
The codebase is **gradually migrating from JavaScript to TypeScript**. New code should prefer TypeScript (`.ts`/`.tsx`) but JS files are accepted. `allowJs: true` and `checkJs: false` are set in tsconfig. Path aliases available: `@/*`, `@/types/*`, `@/components/*`, `@/utils/*`, `@/data/*`.

## Key Routes

| Path | Page | Access |
|------|------|--------|
| `/` | Landing | Public (redirects to dashboard if authenticated) |
| `/auth` | Login/Signup | Public |
| `/auth/callback` | Email confirmation handler | Public |
| `/dashboard` | Main dashboard | Protected |
| `/routes/new` | Route builder | Protected |
| `/routes/:routeId` | Edit existing route | Protected |
| `/planner` | Training planner | Protected |
| `/training` | Training dashboard | Protected |
| `/community` | Community (pods, cafe) | Protected |
| `/gear` | Gear tracking | Protected |
| `/settings` | User settings | Protected |
| `/admin` | Admin panel | Protected |
| `/oauth/strava/callback` | Strava OAuth | Public |
| `/oauth/garmin/callback` | Garmin OAuth | Public |
| `/oauth/google/callback` | Google Calendar OAuth | Public |
| `/wahoo/callback` | Wahoo OAuth | Public |

## Testing

- **Framework**: Vitest with jsdom environment
- **Test files**: `src/**/*.{test,spec}.{js,jsx,ts,tsx}` and `api/**/*.{test,spec}.{js,ts}`
- **Setup**: `src/test/setup.ts` — mocks Supabase client, `matchMedia`, `ResizeObserver`, `IntersectionObserver`
- **Coverage**: v8 provider, HTML reporter
- **Mock env vars**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in vitest config
- Excludes `node_modules` and `OLD` directories

Run all tests: `npm run test:run`

## Design System

Mantine UI 8 with a custom theme defined in `src/theme.js`. Design language: "Department of Cycling Intelligence" — retro-futuristic field guide aesthetic.

- **Color palette**: Earthy tones — terracotta (primary accent), moss/sage greens, slate blue, ochre gold
- **Typography**: Clean sans-serif with monospace accents
- **Cards**: Flat surfaces with sharp borders, no gradients, `borderRadius: 0`
- **CSS variables**: `var(--tribos-*)` tokens for colors, shadows, backgrounds
- **Dark mode**: Supported via Mantine's `ColorSchemeScript`, cool green-black palette

## External Integrations

| Service | Purpose | Key Files |
|---------|---------|-----------|
| **Supabase** | Database, auth, RLS | `src/lib/supabase.js`, all API routes |
| **Strava** | Activity sync (OAuth 2.0) | `api/strava-*.js`, `src/utils/stravaService.js` |
| **Garmin** | Activity sync (OAuth 1.0a) | `api/garmin-*.js`, Cloudflare worker, `src/utils/garminService.js` |
| **Wahoo** | Activity sync (OAuth 2.0) | `api/wahoo-*.js`, `src/utils/wahooService.js` |
| **Google Calendar** | Event scheduling (OAuth 2.0) | `api/google-calendar-auth.js`, `src/utils/googleCalendarService.js` |
| **Claude AI** | Route generation, coaching | `api/coach.js`, `api/claude-routes.js`, `src/utils/claudeRouteService.js` |
| **Stadia Maps** | Bike-optimized routing (Valhalla) | `src/utils/stadiaMapsRouter.js` |
| **Mapbox** | Maps, geocoding | `src/utils/directions.js`, `mapbox-gl` |
| **Sentry** | Error tracking | `src/lib/sentry.js` |
| **PostHog** | Product analytics | `src/main.jsx` |
| **Resend** | Transactional email | `api/email.js` |
| **OpenWeatherMap** | Weather data | `api/weather.js` |

## Environment Variables

Frontend vars use `VITE_` prefix (exposed to browser). Backend vars have no prefix (server-only, used in `/api`).

**Critical security rule**: `VITE_SUPABASE_ANON_KEY` must be the "anon" role key. Never expose `SUPABASE_SERVICE_KEY` to the frontend. The Supabase client in `src/lib/supabase.js` validates this at initialization.

See `.env.example` for the full list of required variables.

## Database Migrations

SQL migrations live in `/database/`, numbered chronologically (001–044+). Key tables cover:

- Activities (Strava, Garmin, Wahoo)
- Training plans, templates, and planned workouts
- User profiles, preferences, and availability
- Routes and route analysis
- Conversation threads (AI coach)
- Community pods and cafe discussions
- Gear and component tracking
- Fitness snapshots and activation tracking
- Fueling and cross-training

### Orphaned tables from rolled-back features — ignore, do not query

Migrations `081` and `082` ran in production before PRs #675–#681 were reverted
(2026-04-22). The tables they created have **no corresponding code** and receive
no reads or writes. Do not add new code that references them.

| Table | Created by | What it was |
|-------|-----------|-------------|
| `today_hero_paragraphs` | migration 081 | Cache for the AI-generated dashboard hero paragraph |
| `far_daily` | migration 082 | Daily FAR (Fitness Acquisition Rate) metric rows |

If these features are eventually re-implemented, the migrations do not need to
be re-run — the tables are already there. If they are permanently abandoned,
drop both tables (they have no foreign-key dependents; order doesn't matter):

```sql
DROP TABLE IF EXISTS today_hero_paragraphs;
DROP TABLE IF EXISTS far_daily;
```

Do not drop them without explicit approval — the same "wait and watch" policy
that governs legacy column drops applies here.

### Route Builder 2.0 is canonical — the gate is fully removed

The Route Builder 2.0 / routing-first Today rollout originally used a two-layer
gate (env kill-switch `VITE_ROUTE_BUILDER_V2_ENABLED` + per-user cohort column
`user_profiles.route_builder_v2_enabled`, added by migration 090, defaulted TRUE
by migration 100). **The gate is now gone entirely.** RB2 is the one and only
route builder:

- **`/ride/new` and `/ride/:routeId` render `RouteBuilder2`** (RB2). The legacy
  v1 `RouteBuilder` is retained only as a hidden fallback at **`/ride/new/classic`**.
  `/route-builder-2[/:routeId]` still render RB2 as working aliases.
- `useRouteBuilderV2Access` and `RouteBuilderV2Guard` were **deleted**; the
  `VITE_ROUTE_BUILDER_V2_ENABLED` env flag was **removed** (no longer read). There
  is no per-user or env gate anymore.
- **`/today` renders the Training-Arc `TodaySpine`** (`src/views/today-spine/`,
  flipped 2026-07). The routing-first glance (`TodayEntry` → `TodayGlance`) is
  kept as a fallback at `/today/glance`; `/today/spine` remains a working alias
  for the Spine. The old `src/views/today/TodayView.tsx` is orphaned (kept on
  disk, not mounted).
- The admin per-user toggle is gone (UI + service + `api/admin.js` action).

The `route_builder_v2_enabled` column is kept in the DB (and in
`src/types/database.ts`, since it still exists) under the "wait and watch" policy
— **do not add new readers/writers and do not drop it without explicit approval.**

### The calendar is `calendar_entries` — one table, one surface (2026-08-29)

`planned_workouts` is retired as the training calendar. **`grep -rn
"from('planned_workouts')" src/ api/` returns nothing outside
`api/arc-refill.js`.** Do not add a reader or a writer for it.

**The ownership inversion is the whole point.** A `planned_workouts` row's
identity was `(plan_id, scheduled_date)`, so a session belonged to a PLAN.
Anything outside that plan's `duration_weeks` could not exist, which is why an
athlete's December cyclocross races were unschedulable and `TrainingCalendar`
had to hard-return on `!activePlan` before adding, moving or editing anything.
A `calendar_entries` row is keyed `(user_id, date, slot)` and belongs to the
ATHLETE. **A plan is provenance (`plan_id`), never ownership.** Never gate a
calendar read or write on a plan existing.

| Where | Read | Write |
|---|---|---|
| Browser | `src/lib/calendar/readPlannedSessions.ts` · `getCalendarRange.ts` | `src/lib/calendar/calendarMutations.ts` |
| Server (`api/`) | `api/utils/calendarRead.js` | `api/utils/calendarWrite.js` |
| Coach tool | `api/utils/calendarCoachContext.js` | `api/utils/calendarChangeApply.js` |

The browser and server modules are deliberate duplicates, not an oversight: the
`src/` pair binds the browser client under RLS, the `api/` pair the
service-role client where **`user_id` scoping IS the security boundary**. Every
statement in the `api/` modules filters on it; keep it that way.

Both readers hand back rows in the LEGACY field names (`scheduled_date`,
`name`, `target_rss`, `completed`) via `plannedWorkoutAdapter` / `toLegacyShape`,
so a caller swaps its query for one call rather than sweeping field names. Two
things follow: `week_number` and `day_of_week` are DERIVED from the date, never
stored — storing them is how three plans' "Week 4" collided — and the
canonical/legacy load pairs collapse, since the calendar has ONE `target_load`
column (the adapter still emits both names for readers that fall back).

**Races are excluded from `fetchPlannedSessions` by default.** Migration 115
copied every `race_goals` row into `calendar_entries`, so a caller that also
reads `race_goals` would show each race twice and add its load to a training
total. Pass `includeRaces` only if you are NOT reading `race_goals` too.

#### Rules

- **`pinned` means the ATHLETE decided**, not "something touched it". Athlete
  gestures pin; an accepted proposal pins; the coach applying a change on its
  own authority does NOT — it leaves the flag exactly as it found it, since an
  unpin is a decision too. `adjudicateOps` proposes rather than applies
  whenever a coach change touches a pinned entry, so a coach that pinned its
  own work would need approval to revise it.
- **A plan FILLS the calendar, it does not own it.** `insertSessions` skips a
  day the athlete has already filled rather than overwriting it, so activating
  a plan can never bury a race. Cancelling a plan DETACHES its entries
  (`plan_id = null`); it must not delete them.
- **`calendar_change` is the coach's only calendar tool.** `recommend_workout`,
  `create_training_plan` and `adjust_schedule` are gone, along with their
  handlers. Multi-week blocks are its `generate_block` operation — one
  operation per session overruns the reply budget and truncates mid-write.
- **Every write reports.** `runCalendarChange` on `/train` toasts and offers an
  undo; a failed coach write says what failed. A silent write is the bug this
  rebuild exists to remove.
- **The `/calendar` gate is fully removed** — no `useCalendarV2Access`, no
  `CalendarV2Guard`, no `VITE_CALENDAR_V2_ENABLED`. `user_profiles
  .calendar_v2_enabled` is kept unread under the same "wait and watch" policy
  as `route_builder_v2_enabled`; do not drop it without approval.

#### Why the gate had to go rather than be extended

The rebuild was gated exactly like RB2 — env kill switch AND a per-user column.
That worked for RB2 because v1 and RB2 shared the `routes` table, so the gate
only chose UI. Here it chose DATA, and the moment `/train`'s reads were
repointed for everyone the gate inverted: it was the LEGACY writers that then
wrote where nobody looks. A gated athlete's coach would report scheduling a
workout and show them an unchanged calendar — the exact failure the flag was
added to prevent.

#### Still on `planned_workouts`

`api/arc-refill.js` keeps its own arc bookkeeping there and MIRRORS the
readiness numbers (`target_load`, `target_duration_min`, `workout_type`) onto
`calendar_entries` by id, skipping pinned entries. Migration 070's backfill
preserved ids, so the id is the join. The table itself is kept for now — do not
drop it without approval and a soak period.

### Garmin sync — dual stack, FROZEN (2026-07-14)

Garmin sync works in production and the decision is to **not touch it**. The
ping/pull rebuild (`garmin2-*`) was built but the cutover was never executed;
it is now **frozen, not in progress**. `docs/garmin-rebuild-cutover.md` is a
preserved runbook for a future *deliberate* cutover — do not resume it
opportunistically, in whole or in part.

Current state (verified 2026-07-14):

- **The legacy stack is the one and only production path**: the frontend
  (`src/utils/garminService.js`) calls only legacy endpoints
  (`api/garmin-auth.js`, `garmin-activities.js`, `garmin-webhook-status.js`,
  `garmin-resync-activity.js`, …), and `vercel.json` registers only the legacy
  crons (`garmin-token-maintenance`, `garmin-webhook-process`,
  `garmin-health-monitor`).
- **The `garmin2-*` endpoints and `api/utils/garmin2/` are dormant**: built and
  tested, but nothing calls them. The `garmin2-pull` cron is **not registered**
  in `vercel.json` (the cutover runbook's claim that it was is stale).
- **The stacks are interleaved, not independent**: the production Cloudflare
  worker tags ping-type events for the new pipeline, and the legacy processor
  (`api/garmin-webhook-process.js`) deliberately **skips** ping-typed rows to
  avoid racing `garmin2-pull`. Nothing drains those rows today. Sync works only
  because the Garmin portal is still on PUSH.

Rules:

- Do NOT delete the legacy `garmin-*.js` files or their cron entries (the
  runbook's "Phase 7 cleanup" is frozen).
- Do NOT register `garmin2` crons or repoint the frontend at `garmin2-*`.
- Do NOT flip the Garmin developer portal from PUSH to PING — with
  `garmin2-pull` unregistered, that silently stops all Garmin sync (ping rows
  queue in `garmin_webhook_events` and nothing claims them). If sync ever
  stops and events show ping types, check the portal delivery mode first.
- Keep the dormant `garmin2` files and tests on disk — they cost nothing and
  preserve the option of a future cutover, which would be a scoped project
  with a soak plan, not a cleanup task.

## Auth Flow — Critical Path (DO NOT BREAK)

The signup and login flow is the most critical path in the app. Any breakage blocks all new users. Follow these rules strictly:

### Before modifying auth-related files, always read them first:
- `src/pages/Auth.jsx` — signup/login form UI
- `src/contexts/AuthContext.jsx` — signUp, signIn, signInWithGoogle, resetPassword
- `src/pages/oauth/AuthCallback.jsx` — post-confirmation redirect handler
- `src/lib/supabase.js` — Supabase client initialization

### Database rules for auth triggers:
- **All `SECURITY DEFINER` functions must include `SET search_path = public`** and use fully-qualified table names (e.g., `public.user_activation`, not just `user_activation`)
- **Triggers on `auth.users` are critical** — any failure in a trigger function rolls back the entire signup transaction, producing a generic "Database error saving new user" error
- Test trigger functions in isolation before deploying

### General auth rules:
- Never remove or alter the signup/login flow (email+password or Google OAuth) without explicit user approval
- After any auth-adjacent change, verify that both signup and login still work end-to-end
- Email confirmation flow must remain intact: signup → confirmation email → `/auth/callback` → dashboard

## Deployment & Caching — Critical Rules (DO NOT BREAK)

The production domain `www.tribos.studio` routes through **Cloudflare CDN** before hitting Vercel. This has caused a major outage before (see `docs/postmortem-2026-03-13-cloudflare-pwa-outage.md`).

### Never re-introduce a service worker that precaches JS chunks
- The PWA service worker was **removed** after it caused an 18-hour outage
- Workbox precaching of content-hashed JS files breaks on every deployment (old SW serves stale chunks)
- If offline support is ever needed, use `NetworkFirst` for everything — **never precache JS**
- The `index.html` contains an inline SW killer script — keep it until all user caches have rotated

### Cloudflare cache awareness
- Deploying to Vercel does NOT immediately update what users see — Cloudflare may serve stale content
- After any deployment that changes caching behavior or fixes a production issue, **purge Cloudflare cache** (Caching → Configuration → Purge Everything)
- `sw.js` must always have `Cache-Control: no-cache, no-store, must-revalidate` in `vercel.json`
- `index.html` should have `max-age=0, must-revalidate` (Vercel default, don't override)
- Only `/assets/*` (content-hashed files) should have long `max-age`

### Always verify on the production domain
- After deploying fixes, test on `www.tribos.studio` — not just Vercel preview URLs
- Vercel preview URLs bypass Cloudflare and can give false confidence that a fix worked

### The SPA rewrite is a silent footgun
- `vercel.json` rewrites `/((?!api/).*) → /index.html` — missing JS files return HTML with 200, not 404
- This means stale SW or CDN cache issues surface as MIME type errors, not clear 404s

## Supabase Connection Hygiene — Critical Rules (DO NOT BREAK)

On March 17, 2026, the database froze after running all day due to **connection pool exhaustion**. Root cause: 46 separate `createClient()` calls scattered across API routes and utilities, compounded by a Supabase Realtime subscription consuming 13 idle connections. See `docs/weekly-updates/` for the full postmortem.

### NEVER create a new Supabase client in API code
- **All API routes and utilities MUST use the shared singleton** from `api/utils/supabaseAdmin.js`
- `import { supabase } from './utils/supabaseAdmin.js'` (or appropriate relative path)
- **NEVER call `createClient()` directly** in any file under `api/` — the singleton handles initialization, connection reuse, and cleanup
- If you see `createClient` imported from `@supabase/supabase-js` in any API file, that is a bug — fix it immediately

### NEVER use Supabase Realtime subscriptions in production
- Supabase Realtime consumes ~13 PostgreSQL connections just for being active, regardless of subscription count
- On a free/Pro plan with 60 connections, that's 22% of budget burned on infrastructure overhead
- **Use polling instead** — for any data that updates on user action (not streaming), 5-second polling via the existing PostgREST pool is functionally equivalent and costs zero extra connections
- If Realtime is ever truly needed (e.g., live chat), it must be discussed and approved first

### Periodic connection audit (run when adding new API routes or utilities)
When creating or substantially modifying files in `api/`, verify connection hygiene:
1. **Search for raw `createClient`**: `grep -r "createClient" api/ --include="*.js" --include="*.ts"` — the ONLY hit should be inside `api/utils/supabaseAdmin.js`
2. **Search for direct imports**: `grep -r "from '@supabase/supabase-js'" api/ --include="*.js" --include="*.ts"` — the ONLY hit should be `supabaseAdmin.js`
3. **Search for Realtime subscriptions**: `grep -r "\.channel\b\|\.on('postgres_changes'\|supabase\.realtime" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"` — there should be zero matches
4. **Check cron frequency**: Review `vercel.json` cron schedules — no cron should run more frequently than every 5 minutes unless there's a documented reason

### Frontend Supabase client
The frontend client in `src/lib/supabase.js` is a separate singleton and is fine — it runs in the browser (one instance per tab). The rules above apply to **server-side code** in `api/`.

## Distance Unit Convention — Critical Rules (DO NOT BREAK)

T1.1 (May 2026) eliminated a class of silent km/m unit-mismatch bugs in the Route Builder. The contract below is the steady state. The audit that motivated this lives in `audit-report.md`.

### The rule

All distance variables in `src/` end in either `_km` (kilometers) or `_m` / `_meters` (meters). Never name a variable just `distance`, `length`, `radius`, `dist`, or `len`. Conversions happen at module boundaries via `M_TO_KM` / `KM_TO_M` from `src/utils/distanceUnits.ts`. Routing-provider responses are meters; the converter is the seam.

### Practical implications

- **The Zustand store `routeStats`** uses `{ distance_km, elevation_gain_m, elevation_loss_m, duration_s }`. There is a one-shot localStorage migration in `src/stores/routeBuilderStore.js` that converts legacy `{ distance, elevation, duration }` shapes; keep it indefinitely until you're certain every user's cached state has been rotated.
- **Routing utilities** (`smartCyclingRouter`, `stadiaMapsRouter`, `brouter`, `graphHopper`, `directions`) return both `distance_m` / `duration_s` (canonical) and `distance` / `duration` (legacy aliases). New code uses the canonical fields; the aliases exist only for callers that haven't migrated. A future PR can remove the aliases.
- **Elevation profile points** from `src/utils/elevation.js getElevationData()` carry both `distance_km` (canonical) and `distance` (legacy alias). Consumers (`personalizedETA`, `routeGradient`, `routePOIService`, `ElevationProfile`, etc.) currently read the alias; the rename is a follow-up.
- **GPX track points** from `src/utils/gpxParser.js` use `distance_m` (meters). `gpxData.summary.totalDistance_km` is KM.
- **The canonical haversine** lives in `src/utils/distanceUnits.ts` (`haversineMeters`, `haversineKm`). Every duplicate copy in `src/utils/` now wraps the canonical helper; do not introduce a new one. The copy in `api/garmin-auth.js` is duplicated for the serverless-runtime split and is comment-flagged to stay in sync.
- **Supabase distance columns** are documented in `audit-report.md`. The canonical fields are suffixed (`distance_km`, `distance_meters`, `_m`); the four legacy unsuffixed columns (`activities.distance`, `gear_items.total_distance_logged`, `gear_components.distance_at_install`, `gear_alert_dismissals.dismissed_at_distance`) are METERS per `COMMENT ON COLUMN`. Renaming production columns is out of scope per the migration freeze policy.

### Runtime assertions

`assertKm(value, fieldName)` and `assertMeters(value, fieldName)` (from `distanceUnits.ts`) fire `console.warn` in dev when a value's magnitude doesn't match its labelled unit. They're called at high-risk sites today (`snapToRoads`, GPX import, `saveRoute`, `calculateRoute`). Add them at any new boundary where a distance enters the system.

### When you see `distance` without a suffix

Treat it as a bug, especially in any new code. The grep audit in `audit-report.md` enumerates the ~80 Category C sites; they were unit-correct at boundaries but name-incorrect. The follow-up name sweep has since landed for three of the four files:

- **`segmentDetector.ts` — done.** The internal `StreamPoint`/`DetectedStop`/`BoundaryPoint`/`CandidateSegment` `distance` fields are now `distanceMeters` (matching the file's existing `distanceMeters`/`totalDistanceMeters` style). No external consumer read those fields.
- **`directions.js` — done.** Route-result return objects now emit `distance_m`/`duration_s` (canonical) alongside the legacy `distance`/`duration` aliases, matching `smartCyclingRouter`/`stadiaMapsRouter`; the header comment is now accurate. Internal `totalDistance` → `totalDistanceMeters`. `radius` is left (Category D / snap-tolerance, not a route distance).
- **`iterativeRouteBuilder.js` — done.** Internal km locals are suffixed (`totalDistanceKm`, `actualDistanceKm`, `straightLineDistKm`, `halfDistanceKm`, `remainingDistanceKm`, etc.) and the internal `segment.distance` field is now `segment.distanceKm`. Route-level returns keep `distance` (legacy m) + `distanceKm` (canonical), so callers are unaffected.
- **`aiRouteGenerator.js` — done.** Self-contained km geometry locals are suffixed (`halfDistanceKm`, `outboundDistanceKm`, `outboundGeometricDistanceKm`, the bare `const distance` waypoint locals → `distanceKm`). The cross-module `targetDistance` object-key contract was also renamed to `targetDistanceKm` in lockstep across `aiRouteGenerator.js`, `rideAnalysis.js`, `claudeRouteService.js`, `enhancedContext.js` (+ `claudeRouteService.test.ts`). `radius` is left (Category D — sometimes km, sometimes degrees).

Note: the `targetDistance` field on the **Workout** type (`src/types/training.ts`, "primarily for running workouts") and its uses in `runningWorkoutLibrary.ts`/`intervalCues.js`, plus the `targetDistance` query param of the `api/road-segments.js` endpoint, are a **different concept** and were intentionally left alone.

What remains: the elevation-profile-point `distance` alias and the Supabase column renames already documented as out of scope by the migration freeze.

## Coordinate Format Convention — Critical Rules (DO NOT BREAK)

T1.2 (May 2026) defined the internal coordinate contract for the Route Builder pipeline. The audit that motivated this lives in `coord-audit-report.md`.

### The rule

All internal coordinates are the canonical `Coordinate` type = `readonly [longitude: number, latitude: number]` (GeoJSON convention, same as Mapbox GL native). The type is defined in `src/types/geo.ts` along with `isValidCoordinate` and `assertCoordinate`. Conversion to/from any other shape happens through named converters in `src/utils/coordConverters.ts` — never inline.

### Practical implications

- **Mapbox GL** is canonical natively. The one wrinkle is DOM events (`event.lngLat`) which arrive as `{lng, lat}` objects — use `mapboxEventToCanonical()` at the handler. Today, `useRouteManipulation.addWaypoint()` and `updateWaypointPosition()` accept Mapbox-style `{lng, lat}` and convert internally; that boundary is documented but call-site conversion via `mapboxEventToCanonical` is preferred in new code.
- **Stadia Maps / Valhalla** uses `{lat, lon}` in request bodies — `canonicalToValhalla()` / `valhallaToCanonical()` are the boundary. Polyline response geometry is decoded into canonical arrays.
- **BRouter** uses `lon,lat|lon,lat|…` query strings — `canonicalToBRouter()`. Response geometry is GeoJSON (canonical).
- **Open-Elevation** uses `{latitude, longitude}` — `canonicalToOpenElevation()` / `openElevationToCanonical()`.
- **OpenTopoData** (via our `/api/elevation` proxy) takes canonical arrays in the request but returns per-result `{lat, lon, elevation}` — `openTopoToCanonical()`.
- **Activity imports** (Strava polyline decode, FIT records, GPX track points) use per-point `{latitude, longitude}` objects. **These parsers are intentionally left emitting their existing shapes** to avoid breaking the import pipeline (Strava webhook, Garmin webhook, FIT upload, GPX upload). Consumers convert via `activityPointToCanonical()` / `activityPointsToCanonical()` at the seam where imported data hands off to internal analysis.
- **`routes.start_*` / `routes.end_*` scalar columns** are read via `routeRowStartToCanonical()` / `routeRowEndToCanonical()` for new readers. Existing readers continue to do their own field extraction; the helper is preferred in new code.
- **The waypoint shape** is `{ id, position: Coordinate, type, name }` — `position` was already canonical pre-T1.2, just untyped. No data migration is needed for waypoint state in localStorage.
- **`routes.waypoints` JSONB shape** is not modified by T1.2 — see `scripts/audit-route-waypoints-shape.js`, a dry-run report script. The manual save path doesn't write that column; AI/legacy rows may carry various shapes. Run the audit script before deciding whether a transform script is worth writing.

### Runtime assertions

`assertCoordinate(value, fieldName)` from `src/types/geo.ts` fires `console.warn` in dev when a value isn't a plausible `[lng, lat]` or looks reversed for the US region. Call it at any new boundary where a coordinate enters internal code (router waypoint lists, persisted state hydration, geometry assembled from DB rows).

### When you see `{lat, lng}` / `{lat, lon}` / `{latitude, longitude}` in `src/`

It is either (a) a boundary that needs a converter from `coordConverters.ts`, or (b) an internal shape that should be `Coordinate`. The five private `normalizeStartLocation`-style helpers in `aiRouteGenerator.js`, `claudeRouteService.js`, `enhancedContext.js`, `iterativeRouteBuilder.js`, and `rideAnalysis.js` are unchanged in T1.2 to keep the diff small; new code should call `looseToCanonical()` from `coordConverters.ts` instead.

### Out of scope (do not "fix" opportunistically)

- `react-map-gl` viewport state (`{latitude, longitude, zoom}`) is the library's native shape.
- `activities.stream_data` JSONB column shape (Strava/Garmin imports) is preserved per the activity-import safety rule.
- `routes.start_latitude/start_longitude/end_latitude/end_longitude` columns stay scalar (rename is out of scope per the migration freeze policy).

## Code Conventions

### File Organization
- **Feature-based component directories**: Components grouped by feature domain (`coach/`, `gear/`, `planner/`, etc.)
- **Large page files**: Some pages are monolithic (RouteBuilder.jsx ~213KB, TrainingDashboard.jsx ~100KB, Settings.jsx ~80KB) — be aware of context limits when reading these
- **Utility modules**: Heavy business logic lives in `src/utils/` — read before modifying
- **Documentation goes in `docs/`**: Audit reports, findings, postmortems, specs, and runbooks all belong in the `docs/` directory — do not add new markdown docs at the repo root. (The root-level `audit-report.md` / `coord-audit-report.md` predate this rule; don't follow their example.)

### Patterns
- **Hooks for data**: Custom hooks (`useTrainingPlan`, `useGear`, `useCommunity`, etc.) encapsulate Supabase queries and state management
- **Zustand for shared UI state**: Route builder and training planner use Zustand stores with persistence
- **API utils**: `api/utils/` contains shared middleware (CORS, rate limiting) and domain helpers
- **Icons**: `@tabler/icons-react` for all iconography

### Style Guidelines
- Use Mantine components and theme tokens — avoid raw CSS where possible
- Use `var(--tribos-*)` CSS variables for colors and shadows
- Cards use `borderRadius: 0` (flat, sharp edges) per the design system
- Prefer Mantine's `useComputedColorScheme` for dark/light mode awareness

### TypeScript
- New files should be `.ts`/`.tsx` when practical
- Type definitions go in `src/types/`
- Existing `.jsx` files don't need to be migrated unless being substantially modified
