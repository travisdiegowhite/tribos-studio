# Mantine Performance Audit — Interaction Timing Alerts

**Date**: 2026-03-06
**Trigger**: Browser Interaction Timing panel showing 170–242ms click latencies on Mantine Tabs and buttons in TrainingDashboard.

---

## Alert Breakdown (from screenshot)

| Element | Interaction | Duration | Severity |
|---------|-------------|----------|----------|
| `path` (route navigation) | click → render | 177.7ms | Yellow (>40ms) |
| `button#mantine-*-tab-trends` | click | 169.9ms | Yellow |
| `button#mantine-*-tab-power` | click | 242.5ms | Red (>200ms) |
| `span.mantine-Tabs-tabLabel` | click | 174.6ms | Yellow |

All alerts originate from **TrainingDashboard.jsx** tab switching. The "power" tab click at 242.5ms exceeds the 200ms INP threshold — this is a Core Web Vitals issue.

---

## Root Causes Identified

### 1. All Tab Panels Render on Every Tab Switch (HIGH impact)

**File**: `src/pages/TrainingDashboard.jsx:868–1140`

Mantine `<Tabs>` default behavior mounts/unmounts tab panel content on switch. However, all 7 panels are defined inline, so React must evaluate JSX and resolve props for every panel on each render — even panels that won't be displayed.

Heavy panels:
- **"today"** (lines 931–1066): 6 child components including `TodaysFocusCard` (complex narrative generation), `CoachCard` (AI context builder), `TrainNow` (workout recommendations)
- **"trends"** (lines 1078–1092): `TrendsTab` receives full activities array + health history
- **"power"** (lines 1095–1103): `PowerTab` receives full activities array + power zone calculations
- **"history"** (lines 1106–1115): `RideHistoryTable` with `maxRows={Infinity}` — renders ALL rides
- **"calendar"** (line 1123): Uses `keepMounted` — always in DOM

**Why "power" is slowest (242ms)**: PowerTab receives the entire `visibleActivities` array and recalculates power zone distributions, W/kg metrics, and FTP history on mount.

### 2. No Component Memoization (HIGH impact)

None of the tab panel child components (`TrendsTab`, `PowerTab`, `SegmentLibraryPanel`, `RideHistoryTable`, `HistoricalInsights`, `TrainingCalendar`) are wrapped in `React.memo()`. Every tab switch triggers a full re-render of the parent, which re-evaluates all child component props.

### 3. Inline Object/Function Props Create New References (MEDIUM impact)

**File**: `src/pages/TrainingDashboard.jsx:1009`

```jsx
<CoachCard
  trainingContext={buildTrainingContext(trainingMetrics, weeklyStats, ...)} // new object every render
  onAddWorkout={async (workout) => { ... }}  // new function every render
/>
```

**File**: `src/pages/TrainingDashboard.jsx:1131`
```jsx
<TrainingCalendar
  onPlanUpdated={async () => { ... }}  // new function every render
/>
```

These inline functions/objects cause child components to re-render even if their actual data hasn't changed.

### 4. Expensive Inline Computations in Dashboard.jsx (MEDIUM impact)

**File**: `src/pages/Dashboard.jsx:457–472`

```jsx
weekStats={{
  hours: activities.reduce((sum, a) => {
    const weekAgo = new Date();  // Creates new Date on EVERY iteration
    weekAgo.setDate(weekAgo.getDate() - 7);
    ...
  }, 0),
  tss: activities.reduce((sum, a) => {
    const weekAgo = new Date();  // Same: new Date per iteration
    ...
  }, 0),
}}
```

Two full array traversals with `Date` object construction per iteration, computed inline in JSX props (no memoization).

### 5. `visibleActivities` Filter Dependencies (LOW impact)

**File**: `src/pages/TrainingDashboard.jsx:164–167`

```jsx
const visibleActivities = useMemo(() =>
  activities.filter(a => !a.is_hidden),
  [activities]
);
```

This is correctly memoized, but since `activities` is set via `setActivities` (a state update), any activity change recomputes this and cascades to all 7 tab panels via props.

### 6. Missing `useCallback` on Handler Functions

**File**: `src/pages/TrainingDashboard.jsx`

Functions like `handleViewRide`, `handleHideRide`, `handleViewWorkout` are defined in the component body without `useCallback`. They're passed as props to child components, creating new references on every render.

---

## Broader Mantine Performance Patterns Found

### Settings.jsx (2,735 lines, 6 tabs)
- Same pattern: all tab panels defined inline, no lazy loading
- **Zero `useMemo` or `useCallback` usage**
- Gear filtering (`gearItems.filter()`) not memoized
- All event handlers are inline functions

### Admin.jsx (nested tabs)
- 9 top-level tabs, several with **nested tab components** (ActivityDashboard, UserInsights, EmailCampaigns)
- Tab switch at top level re-renders nested tab components unnecessarily

### RouteBuilder.jsx (5,406 lines)
- No tab-based UI, but has **duplicate `.map()` operations** on same arrays rendered in different sections
- Good `useMemo`/`useCallback` usage (30+ instances) — best practices of the large components

---

## Recommendations (Priority Order)

### P0: Fix the 242ms "power" tab INP violation

1. **Wrap expensive tab children in `React.memo()`**:
   ```jsx
   const MemoizedPowerTab = React.memo(PowerTab);
   const MemoizedTrendsTab = React.memo(TrendsTab);
   const MemoizedRideHistoryTable = React.memo(RideHistoryTable);
   ```

2. **Memoize handler functions with `useCallback`**:
   ```jsx
   const handleViewRide = useCallback((ride) => { ... }, [dependencies]);
   const handleHideRide = useCallback((rideId) => { ... }, [dependencies]);
   ```

3. **Memoize computed objects passed as props**:
   ```jsx
   const trainingContext = useMemo(
     () => buildTrainingContext(trainingMetrics, weeklyStats, ...),
     [trainingMetrics, weeklyStats, ...]
   );
   ```

### P1: Reduce unnecessary panel evaluation

4. **Conditionally render tab panels** (only render the active panel):
   ```jsx
   {activeTab === 'power' && (
     <Tabs.Panel value="power">
       <MemoizedPowerTab ... />
     </Tabs.Panel>
   )}
   ```
   This prevents React from evaluating JSX for hidden panels.

5. **Or use `React.lazy` + `Suspense`** for heavy panels:
   ```jsx
   const PowerTab = React.lazy(() => import('../components/training/PowerTab'));
   ```

### P2: Fix Dashboard.jsx Date allocation

6. **Move `weekAgo` outside the reduce**:
   ```jsx
   const weekAgo = new Date();
   weekAgo.setDate(weekAgo.getDate() - 7);

   const weeklyHours = useMemo(() =>
     activities.reduce((sum, a) => {
       if (new Date(a.start_date) >= weekAgo) {
         return sum + ((a.duration_seconds || a.moving_time || 0) / 3600);
       }
       return sum;
     }, 0),
     [activities]
   );
   ```

### P3: Settings.jsx and Admin.jsx

7. **Add `useMemo` for filtered data** in Settings.jsx (gear items)
8. **Conditionally render admin panels** (most users only visit 1-2 admin tabs)

---

## Impact Estimate

| Fix | Expected Improvement | Effort |
|-----|---------------------|--------|
| React.memo on tab children | 30–50% reduction in tab switch time | Low |
| Conditional panel rendering | 40–60% reduction (fewer components evaluated) | Low |
| useCallback on handlers | 10–20% reduction in child re-renders | Low |
| useMemo on computed props | 10–15% reduction | Low |
| React.lazy for heavy tabs | Best for initial load, moderate for tab switch | Medium |
| Dashboard Date fix | Minor (only affects Dashboard, not Training) | Trivial |

Combined, these fixes should bring the "power" tab click from 242ms down to well under 100ms, and all tab interactions below the 200ms INP threshold.
