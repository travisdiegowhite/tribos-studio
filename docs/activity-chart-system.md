# Activity Chart System

The flagship single-activity analysis chart (2026-08), rendered by the
dedicated `/activity/:activityId` page. Wahoo-app-quality target: zone-colored
per-second power, elevation/W'Balance/speed overlays, brush zoom with live
NP/Avg/Max recomputation, crosshair value pill, mobile-first touch handling.

## Architecture

```
/activity/:activityId (src/pages/ActivityDetail.tsx, lazy chunk ~9 KB gz)
  ├─ narrow activities select (explicit columns, canonical ?? legacy reads,
  │  NO raw_data / fit_coach_context) + user_profiles ftp/weight/power_zones
  │  + latest fitness_snapshots.best_efforts
  ├─ GET /api/activity-streams?activityId=…  ← the data backbone
  └─ <ActivityChart>  (src/features/activity-chart/)
       model/       pure TS geometry, zero React, unit-tested
       components/  canvas renderer + DOM overlay chrome
       hooks/       useActivityStreams (lazy fetch), useElementWidth
```

### The stream endpoint (`api/activity-streams.js`)

Serves ONE normalized payload per activity at the best available fidelity.
Resolution ladder (each tier attempted in order; expensive-tier failures
degrade with `tier_degraded: true`):

| # | Source | Tier | Time axis |
|---|--------|------|-----------|
| 1 | Storage cache (`activity-streams` bucket, `{user}/{activity}.v1.json`) | as cached | — |
| 2 | `fit_storage_path` raw FIT re-parse | `per_second` | real timestamps (pause-honest) |
| 3 | Faithful 1 Hz stored streams (`length ≥ 0.8 × moving_time`) | `streams_1hz` | sample index |
| 4 | Strava streams API (on demand, cached after first fetch) | `per_second` | Strava `time` stream |
| 5 | `fit_coach_context.time_series` | `coach_ts` | real, 5–60 s |
| 6 | RDP-simplified `activity_streams` | `simplified` | **none — distance axis** |
| 7 | nothing | `summary` | chart hidden, stats only |

Canonical payload shape (keys omitted when the metric has no data; arrays
parallel): `{ version, tier, source, sample_seconds, t, power, hr, cadence,
speed_mps, elevation_m, distance_m, coords }` with `coords` in canonical
`[lng, lat]`. Producer: `api/utils/activityStreams.js`; consumer types:
`src/features/activity-chart/model/streamTypes.ts` — **keep in sync**.

Payloads are capped at 21,600 samples (stride decimation keeps real `t`).
Cache invalidation = bump `STREAM_SHAPE_VERSION` (changes every object key).
The bucket is created by migration 107.

### Rendering

Canvas draws one thin vertical column per horizontal pixel from a per-column
min/max/mean aggregation (`model/columnAggregate.ts`) — cost is bounded by
plot width, not ride length. Zone coloring builds a single `Path2D` of all
columns and fills it once per zone band under a horizontal clip rect
(`model/zoneBands.ts`) — exact per-sample zone color in ≤ 7 fills. Overlays:
elevation silhouette (own scale, bottom 35%, drawn first, muted), W'Bal and
speed as 2 px normalized lines with direct labels — **never a second labeled
y-axis** (dataviz one-axis rule).

Interaction model (deliberate, avoids touch ambiguity):

- **Touch**: drag on the plot scrubs the crosshair; zooming happens ONLY via
  the brush strip's captured-pointer handles. Plot uses `touch-action:
  pan-y` (page scroll survives), brush uses `touch-action: none`.
- **Mouse**: hover crosshair, drag-select zoom on the plot, plus the brush.
- Double-click plot or brush resets to full ride.

### Zones & colors

- Boundaries: `src/utils/powerZones.ts` — the single client-side source
  (profile `power_zones` JSONB, FTP-derived fallback identical to the DB
  trigger: 55/75/90/105/120/150 %FTP).
- Colors: `theme.js` `zone1..zone7`, validated with the dataviz skill's
  `validate_palette.js` against `#FFFFFF` (light) and `#222220` (dark).
  All hard checks pass; the gold/orange contrast WARNs are covered by
  secondary encoding (band position + labels + tooltip). Resolve tokens via
  `useThemeTokens()` at render time — never module scope (dark-mode bug
  class documented in RideZonesChart.jsx).

### Metrics

- NP: `src/utils/normalizedPower.ts` (rolling-sum, parity-tested against
  `api/utils/fitParser.js calculateNormalizedPower` — keep in sync). The
  selection stat card recomputes NP/Avg/Max from full-resolution samples on
  every window change.
- CP/W': `src/utils/criticalPower.ts` (extracted from CriticalPowerModel,
  dt-aware Skiba). Inputs: latest `fitness_snapshots.best_efforts` merged
  with the activity's `power_curve_summary` via `bestEffortsFromCurves`
  (2–30 min efforts only), fallback CP = 0.95×FTP / W' = 20 kJ, provenance
  shown in the stat card caption.

## Adopting the chart elsewhere

`import { ActivityChart, useActivityStreams } from '@/features/activity-chart'`
(or the relative path). Feed it any `NormalizedStreams` payload — the model
layer is exported for custom compositions (e.g. a workout-preview strip
could reuse `columnAggregate` + `zoneBands` directly).

## Named follow-ups (not started)

- **Wahoo FIT retention**: `api/wahoo-webhook.js` downloads the FIT but
  discards the bytes; storing them (like migration 099 does for Garmin)
  would upgrade Wahoo rides from `coach_ts` to `per_second`.
- **Dashboard `select('*')` diet**: TrainingDashboard/Dashboard/Progress
  still eagerly fetch every JSONB blob for every activity.
- **RideAnalysisModal retirement**: the page replaced the modal flow; the
  modal (and its RideStreamsChart) can be deleted once FuelCard /
  SegmentEffortCompare / share-card land on the page.
- **Pinch zoom** on the plot; **interval bands** via the unused
  `detectIntervals` in IntervalDetection.jsx; **lap markers** from FIT lap
  messages (would need the endpoint to emit them).
- **Perf profiling on real devices**: stats + canvas redraw run per
  brush-drag frame; if mid-range phones jank, throttle React state to
  ~10 Hz and keep canvas on rAF from refs.
