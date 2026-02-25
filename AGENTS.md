# AGENTS.md — Tribos

> This file provides critical context, guardrails, and conventions for any AI agent (Claude Code or otherwise) working on the Tribos codebase. Read this completely before making any changes.

---

## 1. Project Overview

**Tribos** is a cycling and running training platform built by a solo developer with 25 years of tech and cycling experience. It combines AI coaching, route building, training analytics, gear tracking, and device sync into a single affordable platform.

- **Live site:** https://tribos.studio
- **Stage:** Beta (65+ users, targeting exit by May 2026)
- **Monetization:** Freemium — Solo (free) / Coached ($5/month)
- **Brand identity:** "Department of Cycling Intelligence" — retro-futuristic government manual aesthetic meets cartographic survey style

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (SPA with client-side routing) |
| Build | Vite 6 |
| Routing | React Router 7 |
| Language | JavaScript (~84%) with gradual TypeScript migration (~16%) |
| UI Library | Mantine UI 8 (core, hooks, form, notifications, charts, dates) |
| Styling | Mantine components + `var(--tribos-*)` CSS custom properties |
| State Management | Zustand 5 (persisted stores) + React Context (auth, preferences) |
| Database | Supabase (PostgreSQL, Auth, RLS, Storage) |
| Mapping | Mapbox GL JS / react-map-gl, Stadia Maps (Valhalla routing), Turf.js |
| Charts | Recharts |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Hosting | Vercel (frontend + serverless functions) |
| Device Sync | Garmin Health API, Strava API, Wahoo API |
| Analytics | PostHog, Vercel Analytics, Vercel Speed Insights |
| Error Tracking | Sentry (`@sentry/react`) |
| Email | Resend |
| PWA | vite-plugin-pwa with Workbox |
| Icons | `@tabler/icons-react` |

**Node requirement:** `>=20.0.0`

---

## 3. Critical Rules — Read Before Every Change

### 3.1 NEVER break authentication or signup

This is the single most important rule. A recent incident broke the login page, preventing new users from signing up. This is a **production app with real users actively signing up**.

**Before ANY change that touches auth or the login/signup flow:**
- Verify the login page renders correctly
- Verify new user signup works end-to-end
- Verify existing user login works
- Verify OAuth callback flow completes
- Test on both desktop and mobile viewports

**Files in the auth critical path (treat with extreme caution):**
- `src/pages/Auth.jsx` — login/signup form UI (email+password, Google OAuth)
- `src/contexts/AuthContext.jsx` — signUp, signIn, signInWithGoogle, resetPassword, auth state
- `src/pages/oauth/AuthCallback.jsx` — post-email-confirmation redirect handler
- `src/pages/oauth/StravaCallback.jsx` — Strava OAuth token exchange
- `src/pages/oauth/GarminCallback.jsx` — Garmin OAuth token exchange
- `src/pages/oauth/WahooCallback.jsx` — Wahoo OAuth token exchange
- `src/pages/oauth/GoogleCalendarCallback.jsx` — Google Calendar OAuth token exchange
- `src/lib/supabase.js` — Supabase client initialization (validates anon key role)
- Any Supabase RLS policy changes
- Any environment variable changes (`VITE_SUPABASE_*`)

**Database rules for auth triggers:**
- All `SECURITY DEFINER` functions must include `SET search_path = public` and use fully-qualified table names (e.g., `public.user_activation`, not just `user_activation`)
- Triggers on `auth.users` are critical — any failure in a trigger function rolls back the entire signup transaction, producing a generic "Database error saving new user" error
- Test trigger functions in isolation before deploying

**Email confirmation flow must remain intact:** signup → confirmation email → `/auth/callback` → dashboard

**If you are unsure whether a change affects auth, assume it does and test accordingly.**

### 3.2 NEVER break the landing/marketing page

The landing page at `tribos.studio` is where new users arrive from social media (primarily Threads). If it breaks, user acquisition stops. Verify it renders after any layout or global style changes.

### 3.3 NEVER delete user data

All database operations that delete or modify existing user data require explicit confirmation. Never run destructive migrations without a backup plan. Use soft deletes where appropriate.

### 3.4 NEVER expose secrets or API keys

- Environment variables must never be committed to git
- Server-side API keys (Anthropic, Garmin, etc.) must only be used in Vercel serverless functions (`/api`) — never in frontend code under `src/`
- `SUPABASE_SERVICE_KEY` is server-side only; `VITE_SUPABASE_ANON_KEY` is the only Supabase key exposed to the client
- The Supabase client in `src/lib/supabase.js` validates at startup that the configured key has the "anon" role
- Frontend environment variables use the `VITE_` prefix; backend variables have no prefix

---

## 4. Architecture & Conventions

### 4.1 Project Structure

```
tribos-studio/
├── api/                     # Vercel serverless functions (36 endpoints)
│   ├── utils/               # Shared API utilities (CORS, rate limiting, parsers)
│   │   └── garmin/          # Garmin-specific utilities (6+ modules with tests)
│   ├── coach.js             # AI coaching endpoint
│   ├── claude-routes.js     # Claude AI route generation
│   ├── admin.js             # Admin operations
│   ├── email.js             # Email via Resend
│   ├── strava-*.js          # Strava auth, webhook, activities
│   ├── garmin-*.js          # Garmin auth, webhook, activities, token maintenance
│   ├── wahoo-*.js           # Wahoo auth, webhook
│   └── ...                  # Routes, weather, elevation, fuel, fitness snapshots
├── cloudflare-workers/      # Garmin webhook proxy (thin store-and-respond)
│   └── garmin-webhook/      # HMAC-verified event store → async processing
├── database/                # 50 SQL migration files (numbered 001–044+)
├── scripts/                 # Utility scripts (seed, backfill, validate)
├── src/
│   ├── App.jsx              # Router config, providers, route definitions
│   ├── main.jsx             # Entry point (PostHog init)
│   ├── theme.js             # Mantine theme + design tokens (18KB)
│   ├── components/          # 100+ components organized by feature
│   │   ├── RouteBuilder/    # Route builder sub-components
│   │   ├── coach/           # AI coach command bar + response area
│   │   ├── planner/         # Training planner (TypeScript)
│   │   ├── training/        # Training plan cards, filters
│   │   ├── community/       # Cafe, discussions, check-ins
│   │   ├── gear/            # Gear/component tracking
│   │   ├── admin/           # Admin dashboard widgets
│   │   ├── activation/      # Onboarding guides
│   │   ├── landing/         # Marketing landing page sections
│   │   ├── settings/        # Settings sub-components
│   │   ├── fueling/         # Nutrition planning cards
│   │   ├── conversations/   # Conversation thread UI
│   │   └── ui/              # Shared UI primitives (badges, buttons, zone colors)
│   ├── contexts/            # React Context providers
│   │   ├── AuthContext.jsx   # Auth state + methods (CRITICAL)
│   │   └── UserPreferencesContext.jsx
│   ├── hooks/               # Custom React hooks (14 major hooks)
│   │   ├── useTrainingPlan.ts    # Training plan management (35KB)
│   │   ├── useGear.ts            # Gear CRUD
│   │   ├── useCommunity.ts       # Community pod management
│   │   ├── useActivation.ts      # Onboarding step tracking
│   │   ├── useRouteManipulation.js  # Route editing, snap-to-road
│   │   ├── useRouteOperations.js    # Route save/load/delete
│   │   ├── useWorkoutAdaptations.ts # AI workout adjustments
│   │   └── ...
│   ├── stores/              # Zustand state management
│   │   ├── routeBuilderStore.js     # Route builder (persisted to localStorage)
│   │   └── trainingPlannerStore.ts  # Training planner (drag-and-drop)
│   ├── services/            # Business logic services
│   │   ├── workoutRecommendation.js # "What to ride today" engine
│   │   ├── adminService.js
│   │   └── ftp.js                   # FTP estimation
│   ├── lib/                 # Library initialization
│   │   ├── supabase.js      # Supabase client (validates anon key role)
│   │   └── sentry.js        # Sentry error tracking
│   ├── utils/               # 59 utility modules (831KB total)
│   │   ├── aiRouteGenerator.js      # Claude AI + routing engine (112KB)
│   │   ├── claudeRouteService.js    # Claude API wrapper
│   │   ├── directions.js            # Multi-provider routing abstraction
│   │   ├── rideAnalysis.js          # Activity analysis (power, intensity)
│   │   ├── stravaService.js         # Strava API wrapper
│   │   ├── garminService.js         # Garmin API wrapper
│   │   └── ...
│   ├── data/                # Static data (templates, workout libraries)
│   │   ├── trainingPlanTemplates.ts  # 93KB of plan definitions
│   │   ├── workoutLibrary.ts         # 41 cycling workouts (84KB)
│   │   ├── runningPlanTemplates.ts   # Running plan definitions
│   │   └── runningWorkoutLibrary.ts  # Running workout definitions
│   ├── types/               # TypeScript type definitions
│   │   ├── database.ts, training.ts, planner.ts, index.ts
│   ├── styles/global.css    # Global CSS with `--tribos-*` custom properties
│   └── test/setup.ts        # Vitest setup (Supabase mocks, browser API stubs)
├── docs/                    # Project documentation
├── OLD/                     # Deprecated/archived code
├── vercel.json              # Deployment config + 3 cron jobs
├── vite.config.js           # Build config + PWA + chunk splitting
├── vitest.config.ts         # Test config (jsdom, path aliases)
└── tsconfig.json            # TypeScript config (allowJs, path aliases)
```

### 4.2 Coding Conventions

- **Functional components only** — no class components
- **Default exports** for components and pages
- **Mantine for styling** — use Mantine components and `var(--tribos-*)` CSS custom properties; avoid raw inline styles
- **Error boundaries** — wrap feature areas in error boundaries so one broken feature doesn't take down the whole app
- **TypeScript for new files** — prefer `.ts`/`.tsx` when practical, but `.js`/`.jsx` is accepted during gradual migration
- **Path aliases** — use `@/*`, `@/types/*`, `@/components/*`, `@/utils/*`, `@/data/*` (defined in tsconfig.json)
- **Hooks for data** — custom hooks (`useTrainingPlan`, `useGear`, `useCommunity`, etc.) encapsulate Supabase queries and state management
- **Zustand for shared UI state** — route builder and training planner use Zustand stores with localStorage persistence
- **Icons** — use `@tabler/icons-react` exclusively

### 4.3 Database Conventions

- All tables use `auth.users` FK for user ownership
- Row Level Security (RLS) is enabled on all user-facing tables
- Use `uuid` for primary keys
- Timestamps: `created_at` (default `now()`), `updated_at`
- Soft deletes preferred over hard deletes for user data
- JSONB for flexible/nested data (track_points, workout intervals, etc.)
- All `SECURITY DEFINER` functions must include `SET search_path = public`

### 4.4 API Route Conventions

- Vercel serverless functions in `/api/` — each file exports a default handler
- Backend uses `SUPABASE_SERVICE_KEY` (service role); frontend uses `VITE_SUPABASE_ANON_KEY` (anon role)
- Garmin webhooks must return 200 within 30 seconds — process asynchronously via Cloudflare worker + Vercel cron
- All external API calls should have error handling and timeouts
- Rate limit awareness for Strava (100 requests/15 min, 1000/day) and Garmin APIs
- Claude API calls go through server-side API routes only (`api/coach.js`, `api/claude-routes.js`)
- Shared middleware in `api/utils/` — CORS (`cors.js`), rate limiting (`rateLimit.js`)

### 4.5 Cron Jobs (vercel.json)

- `/api/garmin-token-maintenance` — every 6 hours (refresh Garmin tokens)
- `/api/garmin-webhook-process` — every minute (process queued Garmin webhook events)
- `/api/proactive-insights-process` — every minute (generate AI insights for users)

---

## 5. Known Sensitive Areas & Gotchas

### 5.1 Garmin Integration

The Garmin Health API has several non-obvious behaviors:

- **Token lifecycle:** Access tokens expire every 24 hours. Each refresh returns a NEW refresh token that invalidates the old one. You must persist the new refresh token on every refresh cycle or the auth chain breaks.
- **Power data:** Activity Summaries do NOT include power fields. Power data only exists in Activity Details (`powerInWatts` in per-second samples) and raw FIT files.
- **Backfill:** Historical data export is asynchronous (returns 202). Results arrive later via webhooks. Duplicate requests for the same time range get rejected with 409.
- **Webhook timeout:** Garmin enforces a 30-second timeout. Return 200 immediately, then process asynchronously. This is why a Cloudflare Worker sits in front as a thin proxy.
- **Connection drops:** Users lose connection after a few days if token refresh isn't handled correctly. This is the most common support issue.

### 5.2 Strava Integration

- Currently limited in what data it pulls — users are directed to bulk export + manual import as workaround
- Strava strips some data fields (power balance, pedal smoothness, etc.) — prefer Garmin FIT files for full data
- API rate limits are aggressive; batch requests where possible

### 5.3 Supabase Auth

- Uses email/password authentication + Google OAuth
- Email confirmation callback is at `src/pages/oauth/AuthCallback.jsx`
- Auth state managed via `supabase.auth.onAuthStateChange()` listener in `AuthContext.jsx`
- RLS policies are the last line of defense — test them when modifying
- Webview detection blocks Google OAuth in Instagram/TikTok/Facebook in-app browsers (user-agent sniffing in `src/utils/webviewDetection.js`)

### 5.4 Mapbox / Route Builder

- Route Builder uses multiple routing backends: BRouter (gravel/MTB), Stadia Maps (road), GraphHopper, Mapbox (fallback)
- Smart router in `src/utils/smartCyclingRouter.js` selects the best provider by cycling profile
- Route Builder has Manual Mode with draggable waypoints and AI-assisted editing via Claude
- Elevation data is critical for training features — verify it loads after route changes
- Map rendering is performance-sensitive on mobile
- RouteBuilder.jsx is ~213KB — be aware of context limits when reading

### 5.5 Large Files

Some files are very large and may require partial reads:
- `src/pages/RouteBuilder.jsx` — ~213KB
- `src/pages/TrainingDashboard.jsx` — ~100KB
- `src/pages/Settings.jsx` — ~80KB
- `src/utils/aiRouteGenerator.js` — ~112KB
- `src/data/trainingPlanTemplates.ts` — ~93KB
- `src/data/workoutLibrary.ts` — ~84KB

---

## 6. Testing Requirements

### Commands

```bash
npm run test         # Vitest in watch mode
npm run test:run     # Vitest single run
npm run test:coverage # Vitest with v8 coverage
npm run lint         # ESLint on src/ (.js, .jsx)
npm run type-check   # TypeScript type checking (tsc --noEmit)
npm run build        # Production build (Vite)
```

### Test Setup

- **Framework:** Vitest with jsdom environment
- **Test files:** `src/**/*.{test,spec}.{js,jsx,ts,tsx}` and `api/**/*.{test,spec}.{js,ts}`
- **Setup:** `src/test/setup.ts` — mocks Supabase client, `matchMedia`, `ResizeObserver`, `IntersectionObserver`
- **Coverage:** v8 provider, HTML reporter
- **Excludes:** `node_modules/` and `OLD/`

### Before any PR or deployment:

1. **Build passes:** `npm run build` completes without errors
2. **Auth flow works:** Login, signup, and OAuth callback all function
3. **Landing page renders:** The marketing page loads correctly
4. **No TypeScript errors:** `npm run type-check` passes
5. **Key pages load:** Dashboard, Training Analysis, Route Builder, AI Coach
6. **Mobile responsive:** Check at 375px width minimum

### Smoke Test Checklist

```
[ ] Landing page loads
[ ] Login page loads and accepts credentials
[ ] New user signup flow works
[ ] Dashboard loads after auth
[ ] Training Analysis page loads with ride data
[ ] Route Builder map renders
[ ] AI Coach responds to a message
[ ] Garmin sync status is visible
[ ] No console errors on key pages
```

---

## 7. Deployment

- **Platform:** Vercel (auto-deploys from main branch)
- **Preview deployments:** Vercel creates preview URLs for PRs — use these for testing before merging
- **Environment variables:** Managed in Vercel dashboard, NOT in code (see `.env.example` for full list)
- **Rollback:** If a deploy breaks production, revert in Vercel dashboard immediately
- **Local API dev:** Use `npm run dev:vercel` (requires Vercel CLI) to test serverless functions locally

### Pre-Deploy Checklist

```
[ ] npm run build succeeds locally
[ ] Auth flow tested
[ ] No new TypeScript errors
[ ] No hardcoded secrets or API keys
[ ] Database migrations tested in dev first
[ ] Existing user data is not affected
```

---

## 8. Design System

Tribos uses a specific visual identity defined in `src/theme.js` and `src/styles/global.css`. Do not introduce new colors or fonts without checking against the design system.

### Color Palette

| Token | Light | Dark | Usage |
|---|---|---|---|
| Background (void) | `#EDEDE8` (Bone) | `#131410` | Page background |
| Surface (card) | `#F5F5F1` (Parchment) | `#1D1E1B` | Cards, panels |
| Primary accent | `#9E5A3C` (Terracotta/Sienna) | `#BD7C58` | CTAs, links, active states |
| Text primary | `#24261F` (Green-black ink) | `#E5E5DF` | Body text |
| Text secondary | `#5E6054` | `#636358` | Labels, captions |
| Text muted | `#84867A` | `#444439` | Hints, placeholders |

### Semantic Colors

| Token | Color | Usage |
|---|---|---|
| Sage | `#6B8C72` | Success, Z1 Recovery |
| Teal/Moss | `#5C7A5E` | Z2 Endurance |
| Gold/Ochre | `#B89040` | Warning, Z3 Tempo |
| Terracotta | `#9E5A3C` | Error/accent, Z4 Threshold |
| Mauve/Slate | `#6B7F94` | Info, Z5 VO2max |
| Sky/Iron | `#8B6B5A` | Z6 Anaerobic |

### Typography

- **Headings:** Anybody (weight 800)
- **Body:** Familjen Grotesk (regular)
- **Labels/Data/Buttons:** DM Mono (monospace, uppercase, 1px letter-spacing)
- **UI tone:** Authoritative but approachable — like a knowledgeable coach, not a corporate SaaS

### Design Principles

- **Flat surfaces:** `borderRadius: 0` on all components (cards, buttons, inputs)
- **Sharp borders:** `1.5px solid var(--tribos-border-default)` on cards
- **No gradients:** Flat backgrounds only
- **CSS variables:** All colors via `var(--tribos-*)` tokens — never hardcode hex values
- **Dark mode:** Supported via Mantine's `ColorSchemeScript` — cool green-black palette

### Route Zone Colors (on map)

Route lines use vivid off-palette colors that intentionally break the muted brand palette to pop against the basemap:

| Zone | Color | Hex |
|---|---|---|
| Z1–Z2 Recovery | Teal | `#4ECDC4` |
| Z3 Endurance | Coral | `#FF6B4A` |
| Z4 Tempo | Amber | `#FFBE2E` |
| Z5 VO2max | Pink | `#FF4E8E` |
| Z6+ Sprint | Purple | `#B44EFF` |

Route lines use a glow effect (18px wide, 25% opacity, Gaussian blur) under a 5px core line.

### Email Styling

- Fully light: Parchment to Bone, no dark sections
- Header/footer: `#EDEDE8`, body: `#F5F5F1`
- Terracotta accent borders, sharp corners
- DM Mono for labels
- Terracotta CTA button (`#9E5A3C`)

---

## 9. Feature Context

### Current Active Features
- Training Analysis (ride history, power data, FIT/GPX import, interval detection)
- Route Builder (manual mode, draggable waypoints, AI-assisted editing, elevation profiles, POI, surface overlay)
- AI Coach (Claude-powered, conversation-based, command bar UI)
- Training Plans (cycling + running with 41+ workouts, periodization, drag-and-drop planner)
- Gear Tracking (bikes, shoes, components, maintenance alerts)
- Device Sync (Garmin, Strava, Wahoo + Google Calendar)
- The Cafe (community pods, weekly check-ins, discussions)
- Fueling/Nutrition planning

### In Development / Planned
- Power Duration Curves
- Activation guide for new users (onboarding funnel)
- Email nurture sequence
- Proactive AI insights on first synced activity
- Route learning from ride history
- Running feature expansion

### Key Business Context
- Solo developer project — there is no QA team, no staging environment team, no one to catch mistakes except automated checks and the developer
- Users are acquired primarily through Threads (social media) — the landing page and signup flow are the front door
- Every broken deploy potentially loses real users who may never come back
- The $5/month Coached tier depends on users experiencing AI Coach and Route Builder during free trial — these features must always work

---

## 10. Git Practices

- **Commit messages:** Use conventional format: `fix:`, `feat:`, `docs:`, `refactor:`, `test:`
- **Small commits:** One logical change per commit
- **Never force push to main**
- **Branch for risky changes:** If a change touches auth, database schema, or global styles, branch first

---

## 11. When In Doubt

1. **Don't guess — ask.** If you're unsure about a pattern, convention, or whether something is safe to change, ask before proceeding.
2. **Err on the side of not breaking things.** A feature that ships tomorrow is better than a broken app today.
3. **Auth is sacred.** If there's any chance your change affects authentication, test it explicitly.
4. **User data is sacred.** Never modify or delete without explicit instruction and a rollback plan.
5. **The landing page is sacred.** It's the first thing potential users see.
