# Gear Tracking System — Implementation Plan

## Overview

A unified gear tracking system for Tribos Studio supporting cycling bikes (with component-level maintenance tracking) and running shoes. Mileage accumulates automatically from synced activities, alerts fire at configurable thresholds, and users can manage gear from a dedicated page linked from Settings.

**Key decisions:**
- **Navigation**: Gear lives at `/gear`, linked from a card on the Settings page and gear alert cards on the Dashboard. Not a new nav item.
- **Activity cardinality**: One gear item per activity (`UNIQUE` on `activity_id`).
- **Distance unit**: Meters everywhere in the DB (matching `activities.distance`). Convert to miles/km at display time via existing `formatDistance()`.
- **Alert dismissal**: Persisted in a `gear_alert_dismissals` DB table (survives across devices/browsers).

---

## Phase 1: Database Migration

**File:** `database/migrations/043_gear_tracking.sql`

### Table 1: `gear_items`
```sql
CREATE TABLE IF NOT EXISTS gear_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_type TEXT NOT NULL CHECK (sport_type IN ('cycling', 'running')),
  gear_type TEXT NOT NULL CHECK (gear_type IN ('bike', 'shoes')),
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  purchase_date DATE,
  purchase_price NUMERIC,
  notes TEXT,
  total_distance_logged NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  retirement_date DATE,
  is_default BOOLEAN DEFAULT false,
  strava_gear_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

- `strava_gear_id` maps to Strava's `gear_id` string (e.g., `b12345678`) for auto-matching on Strava webhook
- `is_default` enforced at DB level via partial unique index: one default per user+sport_type
- `retirement_date` populated when status changes to 'retired'

### Table 2: `gear_components`
```sql
CREATE TABLE IF NOT EXISTS gear_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  installed_date DATE DEFAULT CURRENT_DATE,
  distance_at_install NUMERIC DEFAULT 0,
  warning_threshold_meters NUMERIC,
  replace_threshold_meters NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced')),
  replaced_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

- Component mileage = `gear_items.total_distance_logged - distance_at_install` (always derived, never stored separately)
- When a component is replaced: old row gets `status='replaced'` + `replaced_date`, new row created with fresh `distance_at_install`

### Table 3: `activity_gear`
```sql
CREATE TABLE IF NOT EXISTS activity_gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL DEFAULT 'auto' CHECK (assigned_by IN ('auto', 'manual', 'strava')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id)
);
```

### Table 4: `gear_alert_dismissals`
```sql
CREATE TABLE IF NOT EXISTS gear_alert_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_item_id UUID REFERENCES gear_items(id) ON DELETE CASCADE,
  gear_component_id UUID REFERENCES gear_components(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('warning', 'replace')),
  dismissed_at_distance NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies
For each table: SELECT/INSERT/UPDATE/DELETE with `auth.uid() = user_id`, plus service_role bypass. Matches existing pattern from `042_running_support.sql`.

### Indexes
- `gear_items`: user_id, (user_id, sport_type, status), partial unique on (user_id, sport_type) WHERE is_default AND status='active', strava_gear_id WHERE NOT NULL
- `gear_components`: gear_item_id, user_id
- `activity_gear`: activity_id, gear_item_id, user_id
- `gear_alert_dismissals`: user_id

### RPC Function
```sql
CREATE OR REPLACE FUNCTION increment_gear_distance(p_gear_id UUID, p_distance NUMERIC)
RETURNS VOID AS $$
  UPDATE gear_items
  SET total_distance_logged = total_distance_logged + p_distance, updated_at = NOW()
  WHERE id = p_gear_id;
$$ LANGUAGE sql SECURITY DEFINER;
```

Atomic increment avoids race conditions when two activities sync simultaneously.

---

## Phase 2: API Utilities

### File: `api/utils/gearDefaults.js`
Constants file with default maintenance thresholds (stored in meters internally, sourced from user's spec):

| Component | Warning (miles) | Replace (miles) |
|-----------|----------------|-----------------|
| Chain | 1,200 | 1,500 |
| Cassette | 2,400 (80%) | 3,000 |
| Tires (road) | 2,000 (80%) | 2,500 |
| Tires (gravel/MTB) | 1,200 (80%) | 1,500 |
| Brake pads (rim) | 1,200 (80%) | 1,500 |
| Brake pads (disc) | 1,600 (80%) | 2,000 |
| Bar tape | — | 12 months (time-based) |
| Cables/housing | 2,400 (80%) | 3,000 |
| **Running shoes** | **350** | **400** |

Where the original spec didn't provide a warning threshold, use 80% of replace threshold (matching the spec: "cycling component reaches 80% of its maintenance interval").

Exports: `METERS_PER_MILE`, `DEFAULT_COMPONENT_THRESHOLDS`, `RUNNING_SHOE_THRESHOLDS`, `COMPONENT_TYPES` array.

### File: `api/utils/gearAssignment.js`
Core utility imported by all three webhook handlers:

- **`assignGearToActivity(supabase, { activityId, userId, activityType, distance, stravaGearId })`**
  1. Get sport type via existing `getSportType(activityType)`
  2. If `stravaGearId` provided, look up matching `gear_items.strava_gear_id`
  3. Fall back to user's default gear for that sport type
  4. Insert into `activity_gear`, call `increment_gear_distance` RPC
  5. Wrapped in try/catch — never fails the webhook

- **`recalculateGearMileage(supabase, gearItemId)`**
  Sums `activities.distance` from all linked `activity_gear` rows, updates `gear_items.total_distance_logged`.

- **`reassignActivityGear(supabase, activityId, oldGearId, newGearId, distance)`**
  Decrements old gear mileage, increments new gear mileage, updates `activity_gear` row.

### File: `api/utils/gearAlerts.js`
Alert computation:

- **`computeGearAlerts(supabase, userId)`** — Returns array of alert objects
  - Running shoes: check `total_distance_logged` against shoe thresholds
  - Cycling components: check `(total_distance_logged - distance_at_install)` against per-component thresholds
  - Bar tape: check `installed_date` against 12-month threshold (time-based)
  - Filter out dismissed alerts via `gear_alert_dismissals` table
  - Alert object shape: `{ type, level, gearItemId, componentId?, gearName, componentType?, currentDistance, threshold }`

---

## Phase 3: API Route

### File: `api/gear.js`
New Vercel API route following `api/activities.js` pattern (`setupCors` + `getUserFromAuthHeader` + action-based dispatch).

Actions:
- `list_gear` — List user's gear items with component counts and alert state
- `get_gear` — Single gear item with components, recent activities, alert dismissals
- `create_gear` — Insert gear item; if `is_default=true`, atomically clear other defaults for that sport_type
- `update_gear` — Update fields
- `retire_gear` — Set status='retired', retirement_date=now, clear is_default
- `delete_gear` — Delete (CASCADE handles children)
- `create_component` — Insert component, auto-snapshot `distance_at_install` from parent gear's current total, populate default thresholds from `gearDefaults.js`
- `update_component` — Update fields
- `replace_component` — Mark old as 'replaced' + `replaced_date`, create new row with fresh `distance_at_install`
- `delete_component` — Delete
- `reassign_activity_gear` — Reassign gear on an activity, recalculate mileage for both old and new gear
- `get_alerts` — Return `computeGearAlerts()` results
- `dismiss_alert` — Upsert into `gear_alert_dismissals`
- `recalculate_mileage` — Recalculate `total_distance_logged` from all linked activities

---

## Phase 4: Webhook Integration

Modify three files to call `assignGearToActivity` after activity insert. All use try/catch (non-critical, matching existing snapshot error-handling pattern).

1. **`api/strava-webhook.js`** (~line 403, after `savedActivity` insert confirmed):
   - Pass `savedActivity.gear_id` as `stravaGearId` for Strava gear matching

2. **`api/garmin-webhook-process.js`** (~line 393, after `activity` insert confirmed):
   - No `stravaGearId` (Garmin doesn't provide gear IDs)

3. **`api/wahoo-webhook.js`** (~line 312, after `activity` insert confirmed):
   - No `stravaGearId`

---

## Phase 5: Frontend Hook

### File: `src/hooks/useGear.ts`
TypeScript hook following `useTrainingPlan.ts` / `useCommunity.ts` pattern:
- Direct Supabase client queries for reads (RLS-protected, fast)
- `/api/gear` endpoint calls for mutations (via fetch with Bearer token)
- Exports: `gearItems`, `alerts`, `loading`, CRUD functions, `dismissAlert`, `recalculateMileage`, `refresh`

---

## Phase 6: Frontend Components

### New directory: `src/components/gear/`

| File | Description |
|------|-------------|
| `GearItemCard.jsx` | Mantine Card: name, brand/model, total mileage via `formatDistance()`, status badge, "Default" badge, progress bar (shoes), component alert count (bikes). Click to open detail. |
| `GearDetailView.jsx` | Mantine Modal (xl, fullScreen on mobile): stats header, component table (bikes), mileage progress (shoes), recent linked activities, edit/retire/set-default actions, cost-per-mile if purchase_price exists. |
| `ComponentTable.jsx` | Mantine Table: component type, brand/model, installed date, computed mileage, status badge (green/yellow/red), replace button. |
| `AddGearModal.jsx` | Form: sport type SegmentedControl (auto-sets gear_type), name (required), brand, model, purchase date, set-as-default Switch, optional Strava gear ID (collapsible advanced section). For bikes: checkbox to auto-add common components. |
| `AddComponentModal.jsx` | Form: component_type Select from COMPONENT_TYPES, brand, model, install date, editable warning/replace thresholds (pre-populated from defaults, displayed in user's unit preference). |
| `GearAlertBanner.jsx` | Mantine Alert: warning (gold) or replace (red) alerts. Each alert shows target name + message + dismiss button. Compact mode for dashboard usage. |

---

## Phase 7: Pages and Routing

### File: `src/pages/GearPage.jsx`
Page structure matching existing patterns: `AppShell > Container size="md" py="lg" > Stack gap="xl" > PageHeader > content`

- `PageHeader`: title="Gear", subtitle="Track your bikes, shoes, and components", actions=Add Gear button
- Alert banner (if any alerts)
- `SegmentedControl`: Cycling | Running
- Gear item cards grid (filtered by sport type)
- Collapsed "Retired Gear" section (toggle to show/hide)
- URL param support: `/gear/:gearId` opens detail modal for that item

### Route registration in `src/App.jsx`:
```jsx
<Route path="/gear" element={<ProtectedRoute><GearPage /></ProtectedRoute>} />
<Route path="/gear/:gearId" element={<ProtectedRoute><GearPage /></ProtectedRoute>} />
```

---

## Phase 8: Integration Points

### Settings page (`src/pages/Settings.jsx`)
Add a "Gear" Card between Running Profile and Connected Services sections:
- Shows active gear count, default bike name, default shoes name
- "Manage Gear" button linking to `/gear`
- Uses `useGear` hook (lightweight, loads only summary data)

### Dashboard (`src/pages/Dashboard.jsx`)
Conditionally render a gear alerts card if any active alerts:
- Compact `GearAlertBanner` with "View All" link to `/gear`
- Uses `useGear` hook in alerts-only mode

### RideAnalysisModal (`src/components/RideAnalysisModal.jsx`)
Add gear info row showing assigned gear name + icon, with a "Change" button for reassignment:
- Gear info joins via `activity_gear` table (extend activity query with `.select('*, activity_gear(gear_items(id, name))')`)

### AppShell active state (`src/components/AppShell.jsx`)
Extend Settings `isActive` check to also match `/gear` paths so nav highlights Settings when on the gear page.

---

## Implementation Order

1. Migration (`043_gear_tracking.sql`)
2. API utilities (`gearDefaults.js`, `gearAssignment.js`, `gearAlerts.js`)
3. API route (`gear.js`)
4. Webhook handler integration (3 files)
5. Frontend hook (`useGear.ts`)
6. Frontend components (gear/ directory)
7. Gear page + routing (`GearPage.jsx`, `App.jsx`)
8. Integration points (Settings, Dashboard, RideAnalysisModal, AppShell)

---

## Files Summary

### New files (13):
- `database/migrations/043_gear_tracking.sql`
- `api/gear.js`
- `api/utils/gearDefaults.js`
- `api/utils/gearAssignment.js`
- `api/utils/gearAlerts.js`
- `src/hooks/useGear.ts`
- `src/pages/GearPage.jsx`
- `src/components/gear/GearItemCard.jsx`
- `src/components/gear/GearDetailView.jsx`
- `src/components/gear/ComponentTable.jsx`
- `src/components/gear/AddGearModal.jsx`
- `src/components/gear/AddComponentModal.jsx`
- `src/components/gear/GearAlertBanner.jsx`

### Modified files (7):
- `api/strava-webhook.js` — add gear auto-assignment after activity insert
- `api/garmin-webhook-process.js` — same
- `api/wahoo-webhook.js` — same
- `src/App.jsx` — add /gear routes
- `src/components/AppShell.jsx` — extend Settings active state for /gear
- `src/pages/Settings.jsx` — add Gear card
- `src/pages/Dashboard.jsx` — add gear alerts widget
