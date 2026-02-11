# Tribos.studio - Callbacks, Keys & Configuration Reference

Quick-reference for all environment variables, OAuth callbacks, webhook endpoints, API keys, and important configuration values.

---

## Table of Contents

- [Environment Variables (Frontend)](#environment-variables-frontend)
- [Environment Variables (Backend)](#environment-variables-backend)
- [OAuth Callback URLs](#oauth-callback-urls)
- [OAuth Callback Pages](#oauth-callback-pages)
- [Webhook Endpoints](#webhook-endpoints)
- [Webhook Secrets & Verification](#webhook-secrets--verification)
- [Database Token Tables](#database-token-tables)
- [Cron Jobs](#cron-jobs)
- [Rate Limits](#rate-limits)
- [Custom Events](#custom-events)
- [Auth State Listeners](#auth-state-listeners)
- [Key React Callbacks by Page](#key-react-callbacks-by-page)
- [Security Notes](#security-notes)

---

## Environment Variables (Frontend)

All `VITE_` prefixed variables are **public** (visible in browser). Only use public/anon tokens here.

| Variable | Service | Purpose |
|----------|---------|---------|
| `VITE_SUPABASE_URL` | Supabase | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase | Public anon key (RLS-protected) |
| `VITE_STRAVA_CLIENT_ID` | Strava | OAuth client identifier |
| `VITE_STRAVA_REDIRECT_URI` | Strava | OAuth callback URL |
| `VITE_MAPBOX_TOKEN` | Mapbox | Map tiles & geocoding |
| `VITE_STADIA_API_KEY` | Stadia Maps | Bicycle routing |
| `VITE_USE_STADIA_MAPS` | Stadia Maps | Feature flag (boolean) |
| `VITE_SENTRY_DSN` | Sentry | Error tracking DSN |
| `VITE_APP_VERSION` | Internal | App version string |
| `VITE_PUBLIC_POSTHOG_KEY` | PostHog | Analytics API key |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog | Analytics host URL |
| `VITE_GARMIN_CONSUMER_KEY` | Garmin | OAuth consumer key (display) |
| `VITE_WAHOO_CLIENT_ID` | Wahoo | OAuth client identifier |
| `VITE_WAHOO_REDIRECT_URI` | Wahoo | OAuth callback URL |
| `VITE_GOOGLE_CLIENT_ID` | Google | OAuth client identifier |
| `VITE_GOOGLE_CALENDAR_REDIRECT_URI` | Google | OAuth callback URL |

**Referenced in:**
- `src/lib/supabase.js` - Supabase client init with anon key validation
- `src/main.jsx` - PostHog analytics
- `src/lib/sentry.js` - Sentry error tracking
- `src/utils/stravaService.js` - Strava OAuth
- `src/utils/stadiaMapsRouter.js` - Stadia Maps routing
- `src/utils/geocoding.js` - Mapbox geocoding
- `src/utils/googleCalendarService.js` - Google Calendar OAuth
- `src/utils/wahooService.js` - Wahoo OAuth
- `src/utils/garminService.js` - Garmin integration

---

## Environment Variables (Backend)

Server-only secrets. Accessed via `process.env` in `/api/` routes only.

| Variable | Service | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | Supabase | Server-side DB URL |
| `SUPABASE_SERVICE_KEY` | Supabase | Admin/service role key (full access) |
| `STRAVA_CLIENT_ID` | Strava | OAuth client ID |
| `STRAVA_CLIENT_SECRET` | Strava | OAuth secret |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Strava | Webhook subscription verification |
| `GARMIN_CONSUMER_KEY` | Garmin | OAuth 1.0a consumer key |
| `GARMIN_CONSUMER_SECRET` | Garmin | OAuth 1.0a consumer secret |
| `GARMIN_CALLBACK_URL` | Garmin | OAuth callback URL |
| `WAHOO_CLIENT_ID` | Wahoo | OAuth client ID |
| `WAHOO_CLIENT_SECRET` | Wahoo | OAuth secret |
| `WAHOO_REDIRECT_URI` | Wahoo | OAuth callback URL |
| `WAHOO_WEBHOOK_TOKEN` | Wahoo | Webhook verification token |
| `GOOGLE_CLIENT_ID` | Google | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google | OAuth secret |
| `ANTHROPIC_API_KEY` | Anthropic | Claude AI model access |
| `OPENWEATHER_API_KEY` | OpenWeather | Weather data |
| `RESEND_API_KEY` | Resend | Email sending |
| `RESEND_WEBHOOK_SECRET` | Resend | Email webhook HMAC verification |
| `CRON_SECRET` | Internal | Bearer token for cron job auth |
| `MAPBOX_ACCESS_TOKEN` | Mapbox | Server-side road segment extraction |
| `NODE_ENV` | Node.js | `"development"` or `"production"` |
| `PRODUCTION_URL` | Internal | Production domain for redirects |
| `VITE_APP_URL` | Internal | App base URL (OAuth fallback) |

---

## OAuth Callback URLs

These are the redirect URIs registered with each OAuth provider.

| Provider | Callback URL | Config Variable |
|----------|-------------|-----------------|
| Strava | `http://localhost:3000/oauth/strava/callback` (dev) | `VITE_STRAVA_REDIRECT_URI` |
| Garmin | `https://yourdomain.com/oauth/garmin/callback` | `GARMIN_CALLBACK_URL` |
| Wahoo | `https://www.tribos.studio/oauth/wahoo/callback` | `VITE_WAHOO_REDIRECT_URI` / `WAHOO_REDIRECT_URI` |
| Google Calendar | `http://localhost:3000/oauth/google-calendar/callback` (dev) | `VITE_GOOGLE_CALENDAR_REDIRECT_URI` |
| Supabase Auth | `http://localhost:3000/oauth/callback` (dev) | Supabase dashboard |

---

## OAuth Callback Pages

Frontend pages that handle the OAuth redirect and token exchange.

| Page | File | Token Exchange API |
|------|------|--------------------|
| Auth (Supabase) | `src/pages/oauth/AuthCallback.jsx` | `supabase.auth.getSession()` |
| Strava | `src/pages/oauth/StravaCallback.jsx` | `api/strava-auth` |
| Garmin | `src/pages/oauth/GarminCallback.jsx` | `api/garmin-auth` |
| Wahoo | `src/pages/oauth/WahooCallback.jsx` | `api/wahoo-auth` |
| Google Calendar | `src/pages/oauth/GoogleCalendarCallback.jsx` | `api/google-calendar-auth` |

---

## Webhook Endpoints

External services push events to these API routes.

| Endpoint | Service | HTTP Methods | Purpose |
|----------|---------|--------------|---------|
| `/api/strava-webhook` | Strava | GET, POST | Activity create/update/delete events |
| `/api/garmin-webhook` | Garmin | POST | Activity & health data push |
| `/api/wahoo-webhook` | Wahoo | GET, POST | Workout data events |
| `/api/resend-webhook` | Resend | POST | Email delivery status events |

---

## Webhook Secrets & Verification

| Service | Mechanism | Secret Variable |
|---------|-----------|-----------------|
| Strava | Verify token in GET subscription handshake | `STRAVA_WEBHOOK_VERIFY_TOKEN` |
| Garmin | Optional HMAC signature header | `GARMIN_WEBHOOK_SECRET` |
| Wahoo | URL query parameter `?token=VALUE` | `WAHOO_WEBHOOK_TOKEN` |
| Resend | HMAC signature in request body | `RESEND_WEBHOOK_SECRET` |

**Strava webhook subscription management:** `api/strava-webhook-subscribe.js`

---

## Database Token Tables

OAuth tokens stored in Supabase (encrypted at rest).

| Table | Provider | Tokens Stored | Refresh Strategy |
|-------|----------|---------------|------------------|
| `user_strava_tokens` | Strava | Access + Refresh | On-demand refresh |
| `user_garmin_tokens` | Garmin | Access + Refresh | Automatic cron (every 6h) |
| `user_wahoo_tokens` | Wahoo | Access + Refresh | On-demand refresh |
| `user_coach_settings` | Google Calendar | Refresh token + Calendar ID | Auto-refresh on use |

---

## Cron Jobs

Configured in `vercel.json`.

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/garmin-token-maintenance` | Every 6 hours | Refresh Garmin OAuth tokens |
| `/api/garmin-webhook-process` | Every minute | Process queued Garmin webhook events |

**Authentication:** Cron jobs validate either `x-vercel-cron: 1` header or `Authorization: Bearer ${CRON_SECRET}`.

---

## Rate Limits

Configured in `api/utils/rateLimit.js`.

| Endpoint | Limit | Window |
|----------|-------|--------|
| Strava auth | 20 requests/IP | 10 minutes |
| Garmin auth | 30 requests/IP | 60 minutes |
| Wahoo auth | 30 requests/IP | 60 minutes |
| Google Calendar auth | 20 requests/IP | 5 minutes |

---

## Custom Events

Window-level custom events used for cross-component communication.

| Event Name | Dispatched From | Listened In | Purpose |
|------------|----------------|-------------|---------|
| `training-plan-activated` | `CoachCard.jsx:397`, `CoachCommandBar.jsx:332` | `TrainingDashboard.jsx:393` | Refresh dashboard after plan activation |

---

## Auth State Listeners

| Location | Listener | Purpose |
|----------|----------|---------|
| `src/contexts/AuthContext.jsx:26` | `supabase.auth.onAuthStateChange()` | Global auth state tracking |
| `src/pages/oauth/AuthCallback.jsx:40` | `supabase.auth.onAuthStateChange()` | Detect session after redirect |

Both return a subscription object that must be cleaned up with `subscription.unsubscribe()`.

---

## Key React Callbacks by Page

### RouteBuilder (`src/pages/RouteBuilder.jsx`)

| Callback | Line | Purpose |
|----------|------|---------|
| `calculateRoute` | 750 | Recalculate route between waypoints |
| `handleMapClick` | 845 | Add waypoint on map click |
| `removeWaypoint` | 960 | Remove a waypoint |
| `reorderWaypoints` | 968 | Drag-reorder waypoints |
| `handleWaypointDragEnd` | 991 | Update position after drag |
| `handleSelectAltSegment` | 1092 | Select alternate route segment |
| `handleAIEditSubmit` | 1177 | Submit AI edit request |
| `handleAIEditAccept` | 1229 | Accept AI route suggestion |
| `handleAIEditReject` | 1241 | Reject AI route suggestion |
| `handleRemoveSegment` | 1251 | Remove a route segment |
| `handleSaveRoute` | 1350 | Save route to database |
| `handleClearSession` | 1411 | Clear route builder state |
| `handleImportGPX` | 1434 | Import GPX file |
| `handleGenerateAIRoutes` | 1497 | Generate routes via Claude AI |
| `handleNaturalLanguageGenerate` | 1680 | Natural language route generation |

### Settings (`src/pages/Settings.jsx`)

| Callback | Line | Purpose |
|----------|------|---------|
| `handleSaveProfile` | 245 | Save user profile changes |
| `syncStravaActivities` | 340 | Sync recent Strava activities |
| `syncFullStravaHistory` | 389 | Full Strava history backfill |
| `findDuplicateActivities` | 497 | Detect duplicate activities |
| `cleanupDuplicateActivities` | 543 | Remove duplicates |
| `connectGarmin` | 601 | Initiate Garmin OAuth |
| `disconnectGarmin` | 623 | Remove Garmin connection |
| `repairGarminConnection` | 658 | Fix broken Garmin auth |
| `recoverGarminActivities` | 709 | Re-import Garmin activities |
| `syncGarminActivities` | 799 | Sync recent Garmin activities |
| `backfillGarminGps` | 862 | Backfill missing GPS data |
| `backfillGarminHistory` | 922 | Full Garmin history backfill |

### Dashboard (`src/pages/Dashboard.jsx`)

| Callback | Line | Purpose |
|----------|------|---------|
| `checkOnboardingAndLoadProfile` | 71 | Initial data load + onboarding check |
| `fetchData` | 122 | Load activities, plans, routes |
| `handleSync` | 201 | Manual activity sync |
| `handleCheckInSubmit` | 233 | Submit health check-in |

### TrainingDashboard (`src/pages/TrainingDashboard.jsx`)

| Callback | Line | Purpose |
|----------|------|---------|
| `handlePlanActivated` | 366 | Refresh on plan activation event |
| `runGarminAutoSync` | 399 | Auto-sync Garmin on page load |

---

## Security Notes

1. **VITE_ vars are public** - visible in browser bundle. Only use public/anon tokens.
2. **Supabase anon key is validated** (`src/lib/supabase.js`) to ensure service_role key is never used client-side.
3. **All user tables use RLS** - Row Level Security policies protect data even with the anon key exposed.
4. **Server secrets stay server-side** - only accessed in `/api/` routes via `process.env`.
5. **Webhook endpoints verify authenticity** - each uses a different mechanism (see Webhook Secrets table).
6. **Missing variables degrade gracefully** - services fall back when unconfigured.
