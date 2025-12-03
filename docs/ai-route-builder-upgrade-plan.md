# AI Route Builder Upgrade Plan

## Overview
Upgrade the current simplified RouteBuilder to incorporate the best features from the OLD AI route builder while keeping the codebase clean and avoiding the "junk routes" problems.

## Key Findings from OLD Implementation

### What Worked Well
1. **Multi-provider routing with Stadia Maps as primary** - Valhalla engine is superior for cycling routes
2. **Smart fallback strategy**: Stadia Maps → BRouter (gravel) → Mapbox
3. **Claude AI route suggestions** with structured prompts for training goals
4. **Natural language route requests** - parsing user descriptions into routes
5. **Speed profile integration** - using user's actual ride history for distance calculations

### What Caused Problems ("Junk Routes")
1. **Past ride pattern analysis** - Was disabled by default (`usePastRides = false`) because it caused routes to be 2-3x longer than expected
2. **Pattern-based distance adjustments** - Commented out in code with note: "DISABLED: Pattern-based adjustment was causing routes to be 2-3x longer than expected"
3. **Geometric fallback routes** - Routes with <50 coordinates were filtered as "geometric fallbacks"
4. **Complex template-based generation** - Multiple layers of template/pattern processing added complexity and bugs

### Current Implementation Gaps
- Only uses Mapbox for routing (no Stadia Maps or BRouter)
- AI suggestions don't convert to actual GPS routes (shows "implementation coming soon")
- No smart routing based on training goals
- No elevation data
- Missing speed profile integration

## Implementation Plan

### Phase 1: Add Stadia Maps Router (Primary)
**Files to modify/add:**
- Copy and update `OLD/src/utils/stadiaMapsRouter.js` → `src/utils/stadiaMapsRouter.js`
- Copy `OLD/src/utils/smartCyclingRouter.js` → `src/utils/smartCyclingRouter.js`
- Ensure `.env` has `REACT_APP_STADIA_API_KEY` and `REACT_APP_USE_STADIA_MAPS=true`

**Key Features:**
- Stadia Maps Valhalla API for bike-optimized routing
- Profile options: road, gravel, mountain, commuting
- Fallback to Mapbox when Stadia fails

### Phase 2: Update claudeRouteService.js
**File:** `src/utils/claudeRouteService.js`

**Changes:**
1. Update `convertClaudeToRoute()` to use smart cycling router instead of raw Mapbox
2. Improve waypoint generation logic (current geometric approach is too simple)
3. Use Stadia Maps as primary router for converting AI suggestions to GPS paths

### Phase 3: Update RouteBuilder.jsx
**File:** `src/pages/RouteBuilder.jsx`

**Changes:**
1. Add route profile selector (road, gravel, mountain, commuting)
2. Connect AI suggestion selection to actual route generation via smart router
3. Add elevation stats display (from Stadia/router response)
4. Show routing provider used (Stadia/Mapbox/BRouter)
5. Add loading states for route conversion

### Phase 4: Add BRouter for Gravel (Optional Fallback)
**Files:**
- Copy `OLD/src/utils/brouter.js` → `src/utils/brouter.js`

**Purpose:** Free OSM-based routing with excellent unpaved road support for gravel routes

## Files to Port from OLD

### Must Have (Core Routing)
1. `stadiaMapsRouter.js` - Valhalla routing engine
2. `smartCyclingRouter.js` - Multi-provider orchestration
3. `polyline.js` (if not already present) - For decoding Valhalla polylines

### Nice to Have (Enhanced Features)
1. `brouter.js` - Gravel routing fallback
2. `routeOptimizer.js` - Loop route optimization
3. `routeUtils.js` - Route simplification utilities

### Do NOT Port (Caused Problems)
1. `rideAnalysis.js` - Past ride pattern analysis (caused junk routes)
2. `enhancedContext.js` - Complex context collection (over-engineered)
3. Training plan integration - Keep it simple for now

## Environment Variables Required
```env
REACT_APP_STADIA_API_KEY=your_key_here
REACT_APP_USE_STADIA_MAPS=true
VITE_MAPBOX_TOKEN=your_existing_token
```

## Architecture Diagram

```
User Input (training goal, time, location)
           ↓
Claude AI → Route Suggestions (name, description, waypoints)
           ↓
Smart Cycling Router
    ├─→ Stadia Maps (Valhalla) - PRIMARY
    │      ↓ (if fails)
    ├─→ BRouter (gravel only)
    │      ↓ (if fails)
    └─→ Mapbox (fallback)
           ↓
Route with GPS coordinates + elevation
           ↓
Display on map + stats
```

## Key Design Decisions

1. **Keep Stadia Maps as primary** - Best cycling-specific routing
2. **Disable past ride analysis by default** - Main cause of "junk routes"
3. **Simple waypoint generation** - Don't over-engineer the Claude → GPS conversion
4. **No geometric fallbacks** - If routing fails, show error rather than fake route
5. **Minimal complexity** - Only port what's absolutely needed

## Open Questions (Need Your Input)

### 1. Stadia Maps API Key
Do you already have a Stadia Maps API key configured? Their free tier gives 10,000 routes/month. If not, we can set it up to gracefully fall back to Mapbox.

### 2. Natural Language Route Input
The OLD version had a sophisticated natural language feature where you could type things like "40 mile loop from Boulder through the mountains with gravel roads." Do you want this feature included, or should we focus on the simpler structured UI?

### 3. Training Plan Integration
For this rebuild, should we:
- **Keep it simple**: Just training goal (endurance/intervals/recovery/hills) and time available
- **Add workout library**: Include the workout selector with 40+ pre-built workouts
- **Full integration**: Connect to training plans from Supabase

### 4. BRouter for Gravel
Should I include BRouter as a fallback for gravel routes, or is Stadia's gravel profile sufficient?

### 5. Speed Profile
The OLD version learned your actual riding speed from past rides to calculate more accurate distances. Should we include this feature? (It's separate from the problematic "pattern analysis" that caused junk routes)

## Testing Checklist
- [ ] Generate AI route for 60min endurance ride
- [ ] Convert AI suggestion to actual GPS route via Stadia
- [ ] Fallback to Mapbox when Stadia unavailable
- [ ] Gravel route uses BRouter or Stadia gravel profile
- [ ] Route displays correct distance and elevation
- [ ] GPX export works with new routes

## Reference Files (OLD Implementation)
- `OLD/src/utils/stadiaMapsRouter.js` - Stadia Maps integration
- `OLD/src/utils/smartCyclingRouter.js` - Multi-provider routing
- `OLD/src/utils/brouter.js` - BRouter integration
- `OLD/src/components/AIRouteGenerator.js` - UI component (2194 lines)
- `OLD/src/utils/aiRouteGenerator.js` - Route generation engine
- `OLD/src/utils/claudeRouteService.js` - Claude AI integration
