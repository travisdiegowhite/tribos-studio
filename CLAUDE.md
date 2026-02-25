# Claude Code Project Guidelines

## Project Overview

**tribos.studio** is a production cycling training platform (SaaS) built with React 19, Vite, Supabase, and Vercel serverless functions. It provides AI-powered route building, training plan management, multi-provider activity sync (Strava, Garmin, Wahoo), community features, and gear tracking.

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
- `/api/garmin-token-maintenance` — every 6 hours (token refresh)
- `/api/garmin-webhook-process` — every minute (process queued events)
- `/api/proactive-insights-process` — every minute (generate user insights)

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

## Code Conventions

### File Organization
- **Feature-based component directories**: Components grouped by feature domain (`coach/`, `gear/`, `planner/`, etc.)
- **Large page files**: Some pages are monolithic (RouteBuilder.jsx ~213KB, TrainingDashboard.jsx ~100KB, Settings.jsx ~80KB) — be aware of context limits when reading these
- **Utility modules**: Heavy business logic lives in `src/utils/` — read before modifying

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
