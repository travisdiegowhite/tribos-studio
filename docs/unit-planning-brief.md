# Tribos Studio — Conversational Route Builder Planning Brief

A self-contained reference for planning Units 1–3 of the conversational
Route Builder. Everything below was verified against the codebase or the
production Supabase project (Travis's user_id
`e17a000f-0662-464c-bddf-d44ced141fa1`) on 2026-05-23.

---

## 1. Project at a glance

**tribos.studio** — production cycling-training SaaS on React 19 + Vite 6 +
TypeScript (gradual JS→TS migration; `allowJs: true`), Supabase
(PostgreSQL + Auth + RLS), Vercel serverless functions, Mapbox GL + Stadia
(Valhalla) routing, Anthropic Claude API.

Key directories:

```
api/                Vercel serverless functions (one file = one endpoint)
  utils/            Shared API utilities (CORS, rate limit, persona, supabase singleton)
  coach.js          Main coach endpoint (1376 lines)
database/migrations/   Numbered SQL migrations (001…090+)
src/
  pages/            Page components (RouteBuilder.jsx, RouteBuilder2.tsx, Auth.jsx, …)
  components/coach/    Coach Check-In + persona UI (~20 components)
  components/RouteBuilder/   v1 route-builder pieces incl. AIEditPanel.jsx
  features/route-builder-v2/   Complete v2 feature (page + chat + layers)
  hooks/            Custom data hooks (useCoachCheckIn, useTrainingPlan, useGear, …)
  contexts/         AuthContext, UserPreferencesContext
  stores/           Zustand: routeBuilderStore.js, trainingPlannerStore.ts
  data/             workoutLibrary.ts (84KB), runningWorkoutLibrary.ts,
                    coachingPersonas.ts, trainingPlanTemplates.ts (93KB)
  utils/            Heavy business logic (~60 files, 831KB)
  types/            TypeScript types (database, training, checkIn, planner, geo)
  lib/supabase.js   Frontend Supabase client (singleton, validates anon role)
```

Path aliases: `@/*`, `@/types/*`, `@/components/*`, `@/utils/*`, `@/data/*`.

Critical rules (in CLAUDE.md):
- All `api/*` Supabase clients must come from `api/utils/supabaseAdmin.js`
  singleton — never `createClient()` directly.
- No Supabase Realtime; poll instead.
- The metrics rename (TSS→RSS, CTL→TFI, ATL→AFI, TSB→FormScore) is
  **complete-but-frozen**: legacy + canonical columns coexist permanently.
  Read canonical with legacy fallback (`activity.rss ?? activity.tss`).
  Dual-write both columns on insert/update.

---

## 2. Distance & coordinate conventions (T1.1, T1.2)

- **All distance variables end in `_km` or `_m`/`_meters`.** Never bare
  `distance`. Conversions via `src/utils/distanceUnits.ts`
  (`M_TO_KM`, `KM_TO_M`, `haversineMeters`, `haversineKm`, `assertKm`,
  `assertMeters`).
- **All internal coords are `Coordinate = readonly [lng, lat]`**
  (GeoJSON / Mapbox native). Defined in `src/types/geo.ts`.
  Per-provider converters in `src/utils/coordConverters.ts`
  (Valhalla, BRouter, Open-Elevation, Mapbox events, activity imports).

---

## 3. Coach Check-In — the existing conversational surface

The default app view for many users. A working multi-turn surface with
persona voice. **Units 1–3 should adapt this pattern rather than invent.**

### Components (`src/components/coach/`)

| File | Role |
|---|---|
| `CheckInPage.tsx` | Host page (routes between intake + live check-in) |
| `IntakeInterview.tsx` | First-run persona selection |
| `CheckInNarrative.tsx` | Coach's narrative block |
| `CheckInRecommendation.tsx` | Today's recommended workout card |
| `CheckInAcknowledgment.tsx` | Accept/dismiss buttons |
| `CheckInThread.tsx` | **Multi-turn follow-up chat** ("Ask About This Check-In") |
| `CoachMarkdown.tsx` | Markdown renderer for coach replies |

### Message state

There is **no shared message hook**. Two independent things:

- `src/hooks/useCoachCheckIn.ts` — manages check-in *lifecycle* (fetch
  latest, persona, decisions, `requestCheckIn`). Not the chat thread.
- `CheckInThread.tsx` — owns its own `useState<Message[]>`. Loads from
  / persists to `coach_conversations` table scoped by `check_in_id`.
  Conversation history is rebuilt from local state on every send.

### How the chat talks to Claude

**Not streaming.** Single synchronous `POST /api/coach` with the body
shape below; awaits full JSON `{ message }`, optimistically renders the
user bubble, appends the coach reply, writes both rows to
`coach_conversations`.

```ts
fetch('/api/coach', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${access_token}` },
  body: JSON.stringify({
    message,
    conversationHistory,        // [{role, content}]
    trainingContext,
    checkInId,
    userId,
    maxTokens: 1024,
    quickMode: true,
    userLocalDate: {...},
  }),
});
```

---

## 4. `/api/coach` endpoint pattern (`api/coach.js`, 1376 lines)

The closest existing model for a conversational endpoint.

### Handler flow (entry: line 617)

1. **Gate (617–707)**: CORS → POST-only → `ANTHROPIC_API_KEY` check →
   validate `message` (string, ≤5000 chars) → require
   `Authorization: Bearer` → `supabase.auth.getUser(token)` → use
   `verifiedUserId` (ignore body's `userId` as untrusted) → rate-limit
   (`AI_COACH`, 10 req / 5 min via `rateLimitMiddleware`).

2. **Body shape**:
   ```js
   { message, conversationHistory = [], trainingContext, userLocalDate,
     userId, maxTokens = 1024, quickMode, userAvailability, checkInId,
     planId }
   ```

3. **Persona lookup is server-side** (709–812). Parallel batch:
   ```js
   supabase.from('user_coach_settings')
     .select('coaching_persona, user_preferred_name, coaching_experience_level')
     .eq('user_id', verifiedUserId).maybeSingle()
   ```
   Then:
   ```js
   const personaId = settings?.coaching_persona !== 'pending'
     ? settings.coaching_persona : fallback;
   const persona = PERSONA_DATA[personaId];  // from api/utils/personaData.js
   ```
   Client never sends persona.

4. **System prompt** (815–1039): string concatenation, section by
   section: `=== TEMPORAL ANCHOR ===` → `=== COACH MEMORY ===` →
   training context → health → metrics → active plans → schedule →
   calendar → check-in (if `checkInId`) → deviations → **persona** →
   instructions → quick-mode addendum.

5. **`conversationHistory` windowing** (1041–1091): array of
   `{role, content}`. Filter non-empty. `RECENT_WINDOW = 10` — older
   messages get summarized (first sentence of each older user message)
   into a system-prompt section; the recent 10 go into `messages`
   verbatim. Final user message prefixed with `[Today is {date}]`.

6. **Claude call** (1094–1103):
   ```js
   await claude.messages.create({
     model: 'claude-sonnet-4-6',
     max_tokens: Math.min(maxTokens, 4096),
     temperature: 0.7,
     system: systemPrompt,
     messages,
     tools: ALL_COACH_TOOLS,
   });
   ```
   Plus a tool-use continuation loop (1106–1288).

7. **Response** (1343–1352):
   ```js
   { success, message, workoutRecommendations, trainingPlanPreview,
     fuelPlan, scheduleAdjusted, suggestedActions, usage }
   ```

### Critical detail

**`/api/coach` does NOT persist the conversation.** It's stateless. The
client writes both `coach_conversations` rows after the fetch resolves.
History is rebuilt client-side on every request.

---

## 5. `coach_conversations` schema

Base (`013_accountability_coach.sql:187`) + two later columns:

```sql
coach_conversations (
  id               UUID PK DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp        TIMESTAMPTZ DEFAULT NOW(),
  role             TEXT CHECK (role IN ('user','coach','system')),
  message          TEXT NOT NULL,
  context_snapshot JSONB,
  message_type     TEXT DEFAULT 'chat' CHECK (message_type IN
                     ('chat','check_in','weekly_plan','commitment',
                      'reflection','notification')),
  thread_id        UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  coach_type       TEXT CHECK (coach_type IN ('strategist','pulse')),  -- mig 020
  check_in_id      UUID REFERENCES coach_check_ins(id) ON DELETE SET NULL  -- mig 052
)
```

Indexes: `user_id`, `timestamp DESC`, `(user_id, timestamp DESC)`,
`thread_id` (partial), `coach_type`, `(check_in_id, timestamp ASC)` (partial).

**The scope-key precedent is established.** Migration 052 adds one
nullable FK + one partial index so a check-in gets its own scoped thread
in the same table. Route Builder could do the identical thing
(`route_id UUID REFERENCES routes(id) ON DELETE SET NULL`) and reuse
the table — minor friction is the `role` CHECK ("coach" not "assistant")
and adding a `message_type` like `'route_edit'`. Alternatively, a
dedicated `route_conversations` table is cleaner.

---

## 6. Persona system

### Five personas, snake_case lowercase

```ts
// src/types/checkIn.ts:10
type PersonaId = 'hammer' | 'scientist' | 'encourager' | 'pragmatist' | 'competitor';
```

Stored on `user_coach_settings.coaching_persona` (defaults to `'pending'`
until intake). NOT on `user_profiles` — there's only the
`onboarding_persona_set` boolean flag there.

### Voice bible

- **Prose**: `docs/tribos_voice_bible.md` (425 lines).
- **Machine-readable**: `src/data/coachingPersonas.ts`
  (`PERSONAS: Record<PersonaId, PersonaDefinition>`) — fields:
  `id, name, tagline, philosophy, voice, emphasizes, deviationStance,
  encouragementPattern, neverSay[]`.
- **Server mirror**: `api/utils/personaData.js` (used by `/api/coach`).

### Per-row persona stamps (for cache invalidation)

- `activities.fit_coach_analysis_persona` (mig 065)
- `coach_correction_proposals.persona_id` (mig 084)
- `coach_check_in.persona_id` (mig 051)

---

## 7. Workout library

`src/data/workoutLibrary.ts` exports `WORKOUT_LIBRARY: Record<string,
WorkoutDefinition>` (cycling). Running counterpart:
`src/data/runningWorkoutLibrary.ts` → `RUNNING_WORKOUT_LIBRARY`.

### Entry shape (`src/types/training.ts:550`)

```ts
interface WorkoutDefinition {
  id: string;
  name: string;
  sportType?: SportType;            // default 'cycling'
  category: WorkoutCategory;        // recovery|endurance|tempo|sweet_spot|
                                    // threshold|vo2max|anaerobic|race|...
  difficulty: FitnessLevel;         // beginner|intermediate|advanced
  duration: number;                 // minutes
  targetTSS: number;                // legacy name; targetRSS under freeze
  intensityFactor: number;          // RI; 0.40..1.10
  description: string;
  focusArea: string;                // free text
  tags: string[];
  terrainType: TerrainType;
  structure: WorkoutStructure;      // warmup/main/cooldown with segments
  cyclingStructure?: ...;           // detailed intervals for export
  exercises?: ...;                  // strength/core/flex
  runningStructure?: ...;
  coachNotes: string;
  targetDistance?: number;          // km, running
  exportable?: boolean;
  exportFormats?: WorkoutExportFormat[];
}

interface WorkoutStructure {
  warmup: { duration, zone, powerPctFTP?, description? } | null;
  main: (WorkoutSegment | WorkoutInterval)[];
  cooldown: same as warmup | null;
}
```

Library entries already carry zone, %FTP, cadence, segment-by-segment
structure, and coach notes — no additional `target_zone` column needed on
`planned_workouts`.

---

## 8. `planned_workouts` — the scheduled-workout-on-a-date table

Definition: `database/migrations/010_alter_training_plans.sql:53` +
add-columns from migrations 012, 057, 058, 073, 089.

Key columns for "which workout on which date":

```
id              UUID PK
plan_id         UUID → training_plans(id) ON DELETE CASCADE
user_id         UUID → auth.users(id) ON DELETE CASCADE     (mig 012)
week_number     INTEGER
day_of_week     INTEGER
scheduled_date  DATE
original_scheduled_date  DATE                                (mig 057)

-- workout reference
workout_id      TEXT          -- NOT an FK; keys into WORKOUT_LIBRARY
workout_type    TEXT NOT NULL -- free text
session_type    TEXT                                          (mig 058)
name            TEXT          (mig 012)
original_workout_id  TEXT     (mig 057)

-- inline targets (all on the row)
target_tss            INTEGER  (legacy)
target_rss            INTEGER  (canonical, mig 089) -- read: target_rss ?? target_tss
target_duration       INTEGER  -- seconds
duration_minutes      INTEGER  (mig 012)
target_distance_km    NUMERIC

-- completion + actuals
completed       BOOLEAN
completed_at    TIMESTAMPTZ
activity_id     UUID
actual_tss      INTEGER
actual_rss      INTEGER       (mig 073)
actual_duration INTEGER
actual_distance_km NUMERIC
ride_intensity  NUMERIC       (mig 073)
is_quality      BOOLEAN       (mig 058)
difficulty_rating INTEGER
notes           TEXT
skipped_reason  TEXT
```

No `target_zone` column — zone info is in the workout-library entry,
referenced via `workout_id`.

---

## 9. Fitness metrics — `training_load_daily`

One row per `(user_id, date)`, UNIQUE enforced.

Definition: `database/migrations/058_training_load_deviation.sql:8`.
Rename-additive: `070_training_load_daily_rename.sql`.

```sql
training_load_daily (
  id          UUID PK,
  user_id     UUID,
  date        DATE,

  -- spec §2 canonical (mig 070)
  rss         NUMERIC(6,2),     -- Ride Stress Score
  tfi         NUMERIC(6,2),     -- Training Fitness Index (CTL-equiv)
  afi         NUMERIC(6,2),     -- Acute Fatigue Index (ATL-equiv)
  form_score  NUMERIC(6,2),     -- Form Score (TSB-equiv, off-by-one per spec)
  rss_source  TEXT,             -- device|power|kilojoules|hr|rpe|inferred

  -- legacy twins (drops permanently commented out per freeze)
  tss, ctl, atl, tsb, tss_source,

  -- shared
  confidence    NUMERIC(4,2),   -- 0..1
  fs_confidence NUMERIC,        -- 7-day weighted
  terrain_class TEXT,
  tfi_composition JSONB,        -- {aerobic, threshold, high_intensity}
  tfi_tau   INTEGER,
  afi_tau   NUMERIC(4,1),
  UNIQUE(user_id, date)
)
```

**Single canonical writer**: `api/utils/trainingLoad.js` —
`upsertTrainingLoadDaily(supabase, userId, date, payload)`. Enforces
fs_confidence + form_score per spec §3.6.

Callers: `api/strava-webhook.js`, `api/garmin-webhook-process.js`,
`api/coros-webhook-process.js`, `api/process-deviation.js`.

Read sites: `api/coach-ride-analysis.js`,
`api/training-load-projection.js`, `api/utils/checkInContext.js`,
`api/utils/sequencerContext.js`, `api/internal/fitness-audit.js`.

---

## 10. Form Score classification — Stats Bible cuts

**Spec §5 display zones** (`docs/TRIBOS_METRICS_SPECIFICATION.md:260`) —
canonical UI cuts:

| FS range | Color | Label |
|---|---|---|
| `FS > +20` | Yellow | Transition — too fresh |
| `+10 ≤ FS ≤ +20` | Blue | Fresh |
| `-5 ≤ FS < +10` | Grey | Grey zone |
| `-30 ≤ FS < -5` | Green | Optimal training load |
| `FS < -30` | Red | High risk / overreached |

**FS confidence display**: ≥0.85 normal, 0.60–0.85 prefix `~`, <0.60
prefix `~` + muted italic.

**Event-aware FS targets** (when race within 21 days,
`FS_TARGETS` in spec §3.6):

- criterium: +15..+25
- road_race: +5..+20
- gran_fondo: 0..+15
- stage_race: -5..+10
- gravel_race: +5..+15
- default: +5..+20

**Scheduler bands** (`src/lib/training/tsb-projection.ts:64`) —
internal, do not match UI:

```ts
type FSZone = 'race_ready' | 'building' | 'heavy_load' | 'overreached';
// fs ≥ 5  → race_ready
// fs ≥ -10 → building
// fs ≥ -25 → heavy_load
// fs < -25 → overreached
```

Constants (`src/lib/training/constants.ts`): `TFI_TIME_CONSTANT = 42`,
`AFI_TIME_CONSTANT = 7`, `QUALITY_FS_THRESHOLD = -15`,
`RACE_FS_TARGET_LOW = 5`, `RACE_FS_TARGET_HIGH = 20`.

---

## 11. Road & training segments — two parallel systems

### System 1: routing preference (`user_road_segments`)

Migration `database/migrations/035_user_road_segments.sql`.

```sql
user_road_segments (
  user_id, segment_hash, start_lat/lng, end_lat/lng,
  bearing, segment_length_m,
  ride_count, first_ridden_at, last_ridden_at,
  avg_speed_ms, min_speed_ms, max_speed_ms, total_time_s,
  osm_way_id, road_name, road_type, surface_type,
  UNIQUE(user_id, segment_hash)
)

user_road_preferences (
  user_id PK,
  familiarity_strength INT  (0..100, default 50),
  explore_mode BOOL,
  min_rides_for_familiar INT (default 2),  -- canonical "familiar" cut
  recency_weight INT (default 30),
  familiarity_decay_days INT (default 180)
)
```

**RPCs (none take limit/sort params)**:

```sql
get_segment_preferences(user_id, segment_hashes TEXT[])
  → (segment_hash, ride_count, preference_score, confidence, last_ridden_at)
  -- preference_score: log-ish boost (1→1.1, 2-3→1.2-1.3, 5+→1.35+)
  -- confidence: 5+ high, 2+ medium, 1 low

get_user_segments_in_bbox(user_id, min/max lat/lng, p_min_ride_count DEFAULT 1)
  → (id, segment_hash, start_*, end_*, ride_count, last_ridden_at,
     road_name, road_type)
  -- ORDER BY ride_count DESC; no LIMIT param

get_user_segment_stats(user_id)
  → (total_segments, total_rides, unique_km, most_ridden_segment_hash,
     most_ridden_count, segments_by_ride_count JSONB, recent_new_segments)
```

For "top N familiar roads anywhere," query the table directly
(`.gte('ride_count', 2).order('ride_count', { ascending: false }).limit(N)`).

### System 2: training segments (`training_segments`)

Migration `database/migrations/047_training_segments.sql`. Four tables:

- `training_segments` — geography, terrain, gradient, obstruction, topology,
  `ride_count`, `first/last_ridden_at`, `confidence_score`
- `training_segment_rides` — per-traversal: power, NP, HR, cadence,
  duration, stops, weather. UNIQUE(segment_id, activity_id)
- `training_segment_profiles` — aggregates: mean/std power,
  zone_distribution, `consistency_score`, training-suitability flags,
  `frequency_tier` (`primary|regular|occasional|rare`),
  `rides_last_30_days`, `rides_last_90_days`, `relevance_score`
- `workout_segment_matches` — precomputed workout→segment recs

Code: `api/utils/roadSegmentExtractor.js`,
`api/utils/segmentAnalysisPipeline.js`,
`api/utils/workoutSegmentMatcher.js`, `api/segment-analysis.js`,
`api/road-segments.js`, `src/components/training/SegmentLibraryPanel.tsx`,
`src/hooks/useSegmentLibrary.ts`,
`src/features/route-builder-v2/layers/FamiliarSegmentsLayer.tsx`.

---

## 12. Data quality findings (production, Travis on 2026-05-23)

### Activity coverage by provider

| Provider | Total | With polyline | With streams | Earliest |
|---|---|---|---|---|
| fit_upload | 782 | 782 (100%) | 1 | 2016-03-04 |
| strava | 538 | **471 (87.5%)** | 0 | **2013-03-02** |
| gpx_import | 315 | 315 (100%) | 0 | 2013-02-17 |
| garmin | 43 | 32 (74%) | 26 (60%) | 2025-10-18 |

Only `map_summary_polyline` exists on `activities` — there is no
full-stream polyline column. Strava summary polylines median ~3.2
points/km (one point every ~310 m); p10 ~720 m; p90 ~130 m.

### System 1 (user_road_segments) — works

- **68,815 rows** for Travis
- 438 of 471 Strava polylines (93%) already extracted
- 354 familiar (`ride_count ≥ 2`), 13 high-confidence (`ride_count ≥ 5`)
- **0% have `road_name`** — OSM enrichment never ran
- 0% `osm_way_id`, `road_type`, `surface_type`

### System 2 (training_segments) — partly broken

- **229 segments**, all 229 have `display_name`
- **But every display_name is generic** ("Rolling 14.7km", "Flat 14.8km")
  — reverse-geocoder fallback, not the promised "Spine Rd Climb"
- **Every `ride_count` reads 1**, every `frequency_tier` reads `'rare'`,
  even though `training_segment_rides` shows up to 12 actual traversals
  for the same segment. The rollup writers in
  `api/utils/segmentAnalysisPipeline.js` aren't keeping the parent rows
  in sync.

### Implication for Claude referencing roads

Today, Claude has no real road names to use. Options:
1. **Reference by descriptor** ("a rolling 15 km segment you've ridden 12
   times since November") — use `training_segment_rides COUNT(*)` directly,
   already accurate. Cheapest by far.
2. **Backfill road names** via Mapbox tilequery or Nominatim over the 354
   familiar segments — one-shot job + per-segment hook for new ones.
3. **Fix the rollup** to keep `training_segments.ride_count` and
   `training_segment_profiles.frequency_tier` in sync with
   `training_segment_rides`.

---

## 13. v1 AI edit panel — what exists today

`src/components/RouteBuilder/AIEditPanel.jsx` ("Smart Route Edit"):

- Freeform `TextInput` + 6 quick-action buttons (Flatter / Scenic / More
  gravel / More paved / Faster / Reverse)
- **Preview-then-accept** flow with before/after stat deltas
- Wired in `RouteBuilder.jsx` via `handleAIEditSubmit` (1487),
  `handleAIEditAccept` (1559), `handleAIEditReject` (1581);
  panel rendered twice — desktop (3315) and mobile (5189).

**Classifier is pure keyword-scoring, no LLM.**
`src/utils/aiRouteEditService.js` exports `classifyEditIntent(text)` —
10 intents (`flatten`, `surface_gravel`, `surface_paved`, `scenic`,
`faster`, `shorter`, `longer`, `avoid`, `detour`, `reverse`), each a
keyword list. Plus regex for `location` (avoid/detour) and
`distanceModifier` (shorter/longer). `applyRouteEdit()` does the
geometry work.

---

## 14. Route Builder 2.0 — what exists today

A complete, routable feature behind `user_profiles.route_builder_v2_enabled`.

- **Page**: `src/pages/RouteBuilder2.tsx` (467 lines), Layout B
  map-dominant. Routes: `/route-builder-2`, `/route-builder-2/:routeId`.
- **Chat shell** (`src/features/route-builder-v2/components/`):
  `ChatPanel.tsx` (floating lower-right desktop, open/minimized/closed
  states + telemetry), `ChatDrawer.tsx` (mobile), `ChatBody.tsx`,
  `ChatShell.tsx`
- **Persona picker**: `PersonaDropdown.tsx` wired to
  `useCoachCheckIn.savePersona` → `user_coach_settings`
- **Brand tokens**: `brand.ts` — `RB2` palette + `RB2_FONT` (Barlow
  Condensed / Barlow / DM Mono)
- **Chat logic** (`src/features/route-builder-v2/chat/`):
  `useChatSession.ts` (local message list + `isProcessing`),
  `submitChatMessage.ts` (dispatch), `replicatedEditLogic.ts`
  (`applyAIEdit` wrapper), `types.ts`

**Critical caveat — v2 chat is NOT conversational AI today.**
`submitChatMessage` does a cold-start regex check, then calls
`applyAIEdit()`, which **wraps v1's keyword `classifyEditIntent` +
`applyRouteEdit`**. The headers explicitly say *"S2 replicates v1's
behavior intentionally… S5 will replace this with the real
conversational pipeline."* No streaming, no persona voice in the chat
path, no Claude call at all from chat today.

The v2 UI is real code, not a sketch. The handoff note's "worth wrapping
the eventual new code in this UI" is mechanical — swap
`submitChatMessage`'s body; the shell/panel states/persona dropdown/brand
tokens are done.

---

## 15. Other tables that may be relevant

| Table | Purpose | Migration |
|---|---|---|
| `user_coach_settings` | Persona + coaching prefs | 013, 051, 059 |
| `coach_check_ins` | One check-in per generation | 051 |
| `coach_check_in_decisions` | Accept/dismiss decisions | 051 |
| `coach_correction_proposals` | Proposed schedule corrections | 084 |
| `coach_memory` | Persistent insights about athlete | (in 013 family) |
| `conversation_threads` | Generic thread metadata | 020 |
| `coach_conversations` | Chat messages | 013 + 020 + 052 |
| `routes` | Saved routes (start/end lat/lng scalars, waypoints JSONB) | 001 + later |
| `activities` | All activity sources | 001/004 + many |
| `training_plans`, `planned_workouts` | Training calendar | 009/010 + later |
| `user_road_segments`, `user_road_preferences` | Familiar-road routing | 035 |
| `training_segments`, `training_segment_*` | Trainable segment library | 047, 048 |
| `training_load_daily` | RSS/TFI/AFI/FormScore per day | 058, 070 |
| `race_goals` | Upcoming races (used by FS_TARGETS) | 015, 063, 064, 083 |

### Orphaned tables — do NOT query

`today_hero_paragraphs` (mig 081), `far_daily` (mig 082) — created
before PRs were reverted. No code reads or writes them.

---

## 16. Patterns to keep in mind for Unit planning

- **Stateless endpoint + client-owned persistence + client-owned history**
  is the established pattern (`CheckInThread` ↔ `/api/coach`).
- **Persona is server-resolved from the authenticated user**, not
  passed in. Client cannot spoof.
- **Conversation history is windowed at 10 messages**; older messages
  get summarized into the system prompt.
- **System prompts are built by string concatenation, sectioned by
  `=== HEADING ===`**, with the persona block as the final voice
  override before instructions.
- **All API calls use the singleton `supabase` from
  `api/utils/supabaseAdmin.js`** — never `createClient()`.
- **No streaming, no realtime subscriptions** anywhere in the app today.

---

## 17. Recommended phasing

Based on the data realities above:

- **Unit 1 (route conversation MVP)** — can ship without
  fitness-state calibration (Section 9) and without road-name
  references (Section 11). Use the `/api/coach` pattern verbatim,
  reuse `coach_conversations` with a new scope key (`route_id`), and
  reuse v2's `ChatPanel` + `useChatSession` for the surface. Replace
  `submitChatMessage`'s body with a `fetch('/api/route-coach', …)`.
- **Unit 2 (fitness-state calibration)** — pulls
  `(date, rss, tfi, afi, form_score, fs_confidence)` from
  `training_load_daily`. One-table SELECT. Cheap to fold in if needed.
- **Unit 3 (voice / persona depth)** — already covered structurally
  (PERSONA_DATA on server, `PersonaDropdown` on client, voice bible
  in `docs/tribos_voice_bible.md`). Main work is the route-specific
  scenario responses, mirroring the structure of the existing voice
  bible scenarios.

Out-of-scope-but-flagged prerequisites for richer Unit 3:
- Backfill OSM names on `user_road_segments` (0% today)
- Repair `training_segments` rollup (`ride_count` stuck at 1)
- Optionally backfill full Strava streams for repeat-ridden activities
