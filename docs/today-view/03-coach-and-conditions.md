# Part 3: Coach Persona + Conditions

## 5. Coach persona + recent context

### Persona definitions — `api/utils/personaData.js`

Five personas are defined as static objects (single source of truth
for server-side voice rules). The frontend mirror is
`src/data/coachingPersonas.ts`.

| ID | Name | Voice characteristic |
|----|------|---------------------|
| `hammer` | The Hammer | Direct, brief, imperatives, max 3 sentences |
| `scientist` | The Scientist | Calm, precise, uses physiology terminology |
| `encourager` | The Encourager | Warm, process-oriented, personal |
| `pragmatist` | The Pragmatist | Grounded, conversational, real-life constraints |
| `competitor` | The Competitor | Forward-looking, frames via race outcomes |

Each entry includes `name`, `philosophy`, `voice`, `emphasizes`,
`deviationStance`, `neverSay`, `styleRules` (array of constraints
like "Max 3 sentences" and "Answer yes/no questions with Yes or No
in the first word").

### Persona storage — important clarification

Persona is **not** stored as a column in `user_coach_settings`
(verified — that table only has work hours, ride preferences,
notification settings, calendar settings, coach name, user
preferred name).

Persona-related columns that DO exist:

| Table | Column | Migration | Purpose |
|-------|--------|-----------|---------|
| `user_profiles` | `onboarding_persona_set BOOLEAN` | 062 | Just a "did onboarding set this?" flag |
| `coach_check_ins` | `persona_id TEXT NOT NULL DEFAULT 'pending'` | 051 | Per-check-in cache |
| `activities` | `fit_coach_analysis_persona TEXT` | 065 | Cache key for `fit_coach_analysis` regeneration |
| `coach_correction_proposals` | `persona_id TEXT` | 084 | Per-proposal context |

For the **interactive coach** (`/api/coach`), the persona is passed in
the request body each call — there is no DB column tracking the
"currently selected" persona for the interactive surface. The
frontend persists the user's choice client-side (likely in localStorage,
inferred from absence of any persisted DB write in
`src/components/OnboardingModal.jsx` for the persona ID itself).

### Coach API — `api/coach.js`

```
POST /api/coach
Auth: Bearer (Supabase JWT)
Body: {
  message: string,
  timezone: string,        // e.g. 'America/New_York'
  persona: string,         // e.g. 'hammer'
  tool_calls?: [...]
}
```

**Model**: `claude-sonnet-4-6` (verified at `api/coach.js:1094`).
Max tokens varies; temperature typically 0.7–0.8.

### Anthropic SDK pattern

```javascript
import Anthropic from '@anthropic-ai/sdk';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await claude.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1500,
  system: systemPrompt,         // composed string
  messages: conversationHistory,
  tools: ALL_COACH_TOOLS
});
```

`api/coach.js` imports `Anthropic` from `@anthropic-ai/sdk`. The
`fitness-summary.js` endpoint uses Claude Haiku 4.5 (different model)
for the short language layer.

### Context assembly

The system prompt for the interactive coach is built from two
helpers in `api/utils/temporalAnchor.js`:

```javascript
import { buildTemporalAnchor, fetchTemporalAnchorData }
  from './utils/temporalAnchor.js';

const anchorData = await fetchTemporalAnchorData(userId, timezone);
const anchor = buildTemporalAnchor(anchorData, timezone);
```

`fetchTemporalAnchorData()` queries:

- Today's planned workout (from `planned_workouts`)
- Last N days of activities
- Weekly TSS / hours / ride count rollup
- Active training plan + derived current phase
- Next A-race (`get_next_a_race()` or in-line query)
- Coach memory (short-term + long-term) from `coach_memory` table
- Conversation history from `coach_conversations`

`buildTemporalAnchor()` produces a CALENDAR_ANCHOR block that maps
short labels (`today`, `tomorrow`, `this_fri`, `next_sun`, …) to
concrete ISO dates. The coach is prohibited from computing dates in
prose — it must use these labels. DST-safe via noon-UTC arithmetic.

### System prompt composition order (in `coach.js`)

1. Persona definition (from `PERSONA_DATA[persona]`)
2. Current fitness context (TFI, AFI, FS, terrain class)
3. Today's planned workout details
4. Recent activity history
5. Plan phase + next race goal
6. Coach memory
7. Tool definitions (`ALL_COACH_TOOLS`)

### Tool calls supported

From `api/utils/workoutLibrary.js` (`ALL_COACH_TOOLS`):

- `schedule_adjustment` — move/swap/skip workouts in active plan
- `adjust_targets` — modify TSS or duration targets
- `suggest_supplement` — add an extra workout for a date
- `generate_plan` — create a new training plan from scratch (uses
  `api/utils/planGenerator.js`)
- `fuel_plan` — generate a fueling strategy (uses
  `api/utils/fuelPlanGenerator.js`)
- Calendar queries — check availability via
  `api/utils/calendarHelper.js`
- Fitness history queries (`fitnessHistoryTool.js`)
- Training data queries (`trainingDataTool.js`)
- Correction tools (`correctionTools.js`)

### Other relevant utilities

- `api/utils/assembleFitnessContext.js` — separate context assembler
  used by `/api/fitness-summary.js`
- `api/utils/contextHelpers.js` — `formatHealth`,
  `fetchProprietaryMetrics`
- `api/utils/checkInContext.js` — coach check-in surface context
- `api/utils/fitCoachContext.js` — Deep Ride Analysis context

---

## 6. Conditions — weather + location

### Two weather endpoints

#### `/api/weather.js` — current conditions

```
GET /api/weather?lat={lat}&lon={lon}
```

Provider: **OpenWeatherMap** (`OPENWEATHER_API_KEY`). Returns
`{ success, data: { ...current weather... }, source: 'openweathermap' | 'mock' }`.

Response shape (current):
```json
{
  "temperature": 20, "feelsLike": 18,
  "windSpeed": 12, "windDirection": "NW",
  "windDegrees": 315, "windGust": 20,
  "description": "partly cloudy", "icon": "02d",
  "conditions": "clouds", "humidity": 65,
  "pressure": 1010, "visibility": 10, "cloudCover": 25,
  "sunrise": 1234567890, "sunset": 1234567890,
  "location": "San Francisco"
}
```

Falls back to mock data if `OPENWEATHER_API_KEY` is missing or the
upstream call fails.

#### `/api/weather-forecast.js` — 5-day forecast

```
GET /api/weather-forecast?lat={lat}&lon={lon}&tz={offsetMinutes}
```

Aggregates 3-hour intervals from OpenWeatherMap into daily summaries
keyed by `YYYY-MM-DD` in the requested timezone. Returns
`{ success, data: { '2026-04-30': {...}, '2026-05-01': {...}, ... } }`.

Sets `Cache-Control: public, max-age=1800` (30 minutes).

### `weather_cache` table

`013_accountability_coach.sql`:

```sql
CREATE TABLE weather_cache (
  id UUID PRIMARY KEY,
  latitude FLOAT NOT NULL, longitude FLOAT NOT NULL,
  weather_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(latitude, longitude)
);
```

### Frontend hook — `src/hooks/useWeatherForecast.ts`

```typescript
function useWeatherForecast(
  lat: number | null,
  lon: number | null
): { forecast: Record<string, DailyForecast> | null; loading: boolean }
```

**Important**: this hook calls `/api/weather-forecast` (5-day), not
`/api/weather` (current). It has a module-level cache (30-minute TTL)
keyed by `lat,lon` to two decimal places. Type defined in
`src/types/weather.ts`.

There does not appear to be a hook that calls `/api/weather` for
*current* conditions in the standard `src/hooks/` directory.

### User location — sourcing

There are **no** persisted home coordinate columns in `user_profiles`
or `user_coach_settings`. Verified by grep across all migrations.

Available sources:

1. **Browser geolocation API** — primary, requires permission prompt.
2. **Last activity start coordinates** — Strava/Garmin/Wahoo
   activities store start lat/lon; can be read from `activities` table.
3. **Routes table** — `start_latitude`, `start_longitude` per saved
   route.
4. **OpenWeatherMap response** — the `location` field returns the
   nearest named city based on the lat/lon supplied.

For a Today view that wants weather without prompting on every load,
the practical options are:
- Cache the last-used location in localStorage.
- Add a `home_latitude` / `home_longitude` (or a single `home_location`
  GEOGRAPHY column) to `user_profiles`.
