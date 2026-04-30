# Part 4: Gaps

Inventory of what does **not** exist yet for a Today view that shows:

- Route preview + elevation
- Freshness state with mapped word
- Block position
- Conditions
- Coach paragraph
- Workout block visualization
- "Send to Garmin" action

Each row is tagged: **UI-only** (data backend already exists), or
**Backend + UI** (both sides need work).

## A. Data exists — UI / hook gap only

| Gap | What exists | What's missing | Notes |
|-----|------------|----------------|-------|
| Route preview mini-map | `routes.geometry` JSONB; `ColoredRouteMap.jsx`, `RouteBuilder/RoutePreviewMap.tsx` | A small embeddable map widget designed for a dashboard card (not full-screen) | Refactor or wrap `ColoredRouteMap.jsx`. Recharts is already a dependency. |
| Elevation profile chart | `routes.geometry` (with elevation) and `/api/elevation.js` | A standalone elevation chart component | No `ElevationProfile` component found in `src/components/` outside the route builder context. |
| Single "today snapshot" hook | `useTrainingPlan`, `useTodayTerrain`, `useFormConfidence`, `useDeviations`, `useWorkoutAdaptations` (each loads one slice) | A `useTodaySnapshot()` that combines planned workout + fitness state + phase + race goal + weather in one call | All inputs available; needs orchestration only. |
| Block / phase position arithmetic | `currentPhase` from `useTrainingPlan`; `phases` array on each template | `{ weekInPhase, weeksInPhase, weeksRemaining }` derivation | Pure frontend logic, no DB change. |
| Race goal in frontend | `race_goals` table + `get_next_a_race()` / `get_upcoming_races()` DB functions; `user_profiles.target_event_date`/`target_event_name` | A frontend hook that calls `get_next_a_race()` (or a direct query) | DB functions exist with `SECURITY DEFINER`; just need a hook. |
| Weather widget for current conditions | `/api/weather.js` | A `useWeather()` hook (current, not forecast) and a card component | `useWeatherForecast` exists but only calls the 5-day endpoint. |
| Coach daily paragraph (pre-cached) | `/api/fitness-summary.js` (Claude Haiku 4.5, 4-hour cache); `coach_check_ins` table | A pre-compute cron that warms the cache for active users at e.g. 06:00 local | Today, the first Today-view load triggers the LLM call (slow). |
| Word-mapped freshness state | `/api/fitness-summary.js` returns sentence form | A deterministic numeric → word lookup if the LLM call should be skipped | Optional: depends on whether a fast deterministic chip is wanted alongside the Haiku sentence. |
| Workout adaptation context | `plan_deviations`, `workout_adaptations` tables; `useDeviations`, `useWorkoutAdaptations` hooks | Surfacing the "this workout was adapted because…" reason in the Today view | Backend ready, just UI surface. |
| Readiness check-in | `fatigue_checkins` table (migration 058) — `leg_feel`, `energy`, `motivation`, `hrv_status` | A morning prompt UI on the Today view | Table is sufficient; no schema change needed. |

## B. Backend work also needed

| Gap | What exists | What's missing | Notes |
|-----|------------|----------------|-------|
| Route ↔ today's workout link | `routes` table; `race_goals.route_id` (migration 063); `route_context_history` (links to `scheduled_workouts`) | **No** `route_id` on `planned_workouts` | Either add a migration, or treat the route as a separate user pick at view time. |
| **Send to Garmin Connect** | `src/utils/fitWorkoutEncoder.ts` (encodes workout → FIT binary); `src/utils/workoutExport.ts:421` (used for local download); `src/utils/garminService.js` (OAuth + activity import) | An API endpoint that takes a `planned_workout_id`, encodes to FIT, and **pushes** the file to Garmin Connect's training-plan endpoint | The existing FIT path generates a downloadable file in the browser. The Garmin Connect "send workout to device" upload endpoint is not wired up. |
| Persisted home location | Browser geolocation, last activity coords, route start coords | A `home_latitude`/`home_longitude` (or `home_location` GEOGRAPHY) column on `user_profiles`, plus a settings UI to set it | Optional — could also just persist in localStorage. |
| Full multi-sport Today view | `sport_type` on `activities` and `training_plans`; `runningWorkoutLibrary.ts` and `runningPlanTemplates.ts` exist | Today-view UI assumes cycling vocabulary (FTP, power %, RSS); needs sport-aware rendering for running (pace zones, HR zones) | DB-side it works; UI/coach prompt-side may need branching. |

## C. Quick reference — Today-view feature readiness

| Feature | DB | API | Hook | UI |
|---------|----|----|------|----|
| Today's workout (data) | ✅ `planned_workouts` | — | ✅ `useTrainingPlan` | ❌ |
| Workout interval bar chart | ✅ `workoutLibrary.ts` | — | ✅ | ❌ |
| Today's route (data) | ✅ `routes` | — | ❌ | ❌ |
| Workout ↔ route link | ❌ no FK | — | — | — |
| Elevation profile | ✅ in `routes.geometry` | ✅ `/api/elevation` | ❌ | ❌ |
| TFI / AFI / FS values | ✅ dual columns | partial | ❌ combined | ❌ |
| Terrain class | ✅ `training_load_daily.terrain_class` | — | ✅ `useTodayTerrain` (most-recent, not today-filtered) | ❌ |
| Current phase | ✅ derived | — | ✅ `currentPhase` | ❌ |
| Week-in-phase position | ✅ derivable | — | ❌ | ❌ |
| Next A-race | ✅ `race_goals` + `get_next_a_race()` | — | ❌ | ❌ |
| Lightweight target event | ✅ `user_profiles.target_event_*` | — | ❌ | ❌ |
| Coach persona definitions | ✅ `personaData.js` | — | — | — |
| Coach interactive chat | — | ✅ `/api/coach` (`claude-sonnet-4-6`) | partial | ✅ chat UI |
| Coach daily paragraph | ✅ `fitness_summaries` cache | ✅ `/api/fitness-summary` (Haiku 4.5, on-demand) | ❌ | ❌ |
| Weather current | ✅ `weather_cache` | ✅ `/api/weather` | ❌ | ❌ |
| Weather forecast | ✅ `weather_cache` | ✅ `/api/weather-forecast` | ✅ `useWeatherForecast` | ❌ |
| Persisted home location | ❌ | — | — | — |
| Send to Garmin Connect | 🟡 FIT encoder exists | ❌ no upload endpoint | ❌ | ❌ |
| Readiness check-in | ✅ `fatigue_checkins` | — | ❌ | ❌ |

## D. Notes on the FIT/Garmin gap

The phrase "send to Garmin" can mean three different things — only
one of which is genuinely missing:

1. **Local FIT file download** — fully implemented at
   `src/utils/fitWorkoutEncoder.ts` (encoder) and
   `src/utils/workoutExport.ts:421` (download trigger). The user
   clicks a button, gets a `.fit` file, and side-loads it.
2. **Send to Garmin Connect (training plan)** — **not implemented**.
   Would require POST'ing the FIT to the Garmin Connect Training API
   on the user's behalf. The OAuth scopes in `api/garmin-auth.js`
   would need to include the appropriate write scope; the Garmin
   Connect side of `src/utils/garminService.js` currently handles
   *activity import* (read), not workout *push* (write).
3. **Send via webhook to a connected device** — Garmin's
   training-plan push goes through Garmin Connect, not the
   activity-webhook proxy in `cloudflare-workers/garmin-webhook/`.
   The webhook proxy is read-only.

If the user clicks a "Send to Garmin" button on the Today view
expecting the workout to appear on their device, option 2 is what's
needed and it requires both an API endpoint and Garmin OAuth scope
review.
