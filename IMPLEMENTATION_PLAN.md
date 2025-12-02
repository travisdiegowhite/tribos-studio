# tribos.studio - AI Route Generation Implementation Plan

## ✅ Completed (Current Session)

### Phase 1: Foundation
- [x] **Interactive Route Builder** with Mapbox GL
  - Click-to-add waypoints
  - Automatic route calculation via Mapbox Directions API
  - Real-time stats (distance, duration, waypoints)
  - GPX export functionality
  - Visual waypoint markers (start=green, end=red, intermediate=lime)

- [x] **Database Schema**
  - Created `routes` table with comprehensive metadata
  - Support for manual, AI-generated, and Strava-imported routes
  - RLS policies for privacy and security
  - Performance indexes

- [x] **Claude API Integration**
  - Serverless function `/api/claude-routes` for secure API key handling
  - Claude Sonnet 4.5 integration
  - Error handling and validation

- [x] **Claude Route Service**
  - Intelligent prompt engineering for cycling routes
  - Training goal-based route suggestions (endurance, intervals, hills, recovery)
  - JSON parsing and validation
  - Target distance calculations

### Phase 2: Strava OAuth
- [x] Strava OAuth flow working in production
- [x] Token storage in `bike_computer_integrations` table
- [x] Connection status display in Settings page

---

## 📋 Next Steps (Prioritized)

### **IMMEDIATE: Run Database Migration**

Before continuing, you need to create the routes table in Supabase:

```bash
# 1. Open Supabase Dashboard
https://supabase.com/dashboard/project/xbziuusxagasizxnlwwn

# 2. Go to SQL Editor

# 3. Run the migration file:
cat database/create_routes_table.sql | pbcopy
# Then paste and execute in Supabase SQL Editor
```

### **Priority 1: AI Route Generation UI** (2-3 hours)

Add AI route generation to [RouteBuilder.jsx](src/pages/RouteBuilder.jsx)

#### Features to Add:
1. **Training Goal Selector**
   ```jsx
   <SegmentedControl
     value={trainingGoal}
     onChange={setTrainingGoal}
     data={[
       { label: 'Recovery', value: 'recovery' },
       { label: 'Endurance', value: 'endurance' },
       { label: 'Intervals', value: 'intervals' },
       { label: 'Hills', value: 'hills' }
     ]}
   />
   ```

2. **Time Input**
   ```jsx
   <NumberInput
     label="Available Time (minutes)"
     value={timeAvailable}
     onChange={setTimeAvailable}
     min={15}
     max={480}
     step={15}
   />
   ```

3. **Route Type Selector**
   ```jsx
   <Select
     label="Route Type"
     value={routeType}
     onChange={setRouteType}
     data={[
       { value: 'loop', label: 'Loop' },
       { value: 'out_back', label: 'Out & Back' },
       { value: 'point_to_point', label: 'Point to Point' }
     ]}
   />
   ```

4. **Generate Button & Loading State**
   ```jsx
   <Button
     onClick={handleGenerateAIRoutes}
     loading={generatingAI}
     leftIcon={<IconSparkles />}
   >
     Generate AI Routes
   </Button>
   ```

5. **AI Suggestions Display**
   - Show 3 route cards with:
     - Name
     - Description
     - Distance & elevation
     - Difficulty badge
     - "Select Route" button
   - When selected, convert to actual GPS coordinates using Mapbox

#### Implementation Steps:
```javascript
// 1. Import the service
import { generateClaudeRoutes } from '../utils/claudeRouteService';

// 2. Add state
const [trainingGoal, setTrainingGoal] = useState('endurance');
const [timeAvailable, setTimeAvailable] = useState(60);
const [routeType, setRouteType] = useState('loop');
const [aiSuggestions, setAiSuggestions] = useState([]);
const [generatingAI, setGeneratingAI] = useState(false);

// 3. Generate routes
const handleGenerateAIRoutes = async () => {
  setGeneratingAI(true);
  try {
    const suggestions = await generateClaudeRoutes({
      startLocation: viewport, // or use map center
      timeAvailable,
      trainingGoal,
      routeType
    });
    setAiSuggestions(suggestions);
  } catch (error) {
    notifications.show({
      title: 'Error',
      message: error.message,
      color: 'red'
    });
  } finally {
    setGeneratingAI(false);
  }
};

// 4. Convert AI suggestion to route
const handleSelectAISuggestion = async (suggestion) => {
  // For MVP: Use the keyDirections as a guide
  // Generate waypoints based on directions
  // Call Mapbox Directions API to get actual route
  // Display on map
};
```

---

### **Priority 2: Route Saving** (1-2 hours)

Implement saving manually-created and AI-generated routes.

#### Create Route Service:
```javascript
// src/utils/routeService.js

import { supabase } from '../lib/supabase';

export async function saveRoute(routeData) {
  const { user } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Must be logged in to save routes');
  }

  const { data, error } = await supabase
    .from('routes')
    .insert({
      user_id: user.id,
      name: routeData.name,
      description: routeData.description,
      distance_km: routeData.distance,
      elevation_gain_m: routeData.elevationGain || 0,
      elevation_loss_m: routeData.elevationLoss || 0,
      estimated_duration_minutes: routeData.duration,
      geometry: routeData.geometry, // GeoJSON
      waypoints: routeData.waypoints,
      start_latitude: routeData.waypoints[0]?.lat,
      start_longitude: routeData.waypoints[0]?.lng,
      route_type: routeData.routeType,
      training_goal: routeData.trainingGoal,
      generated_by: routeData.source || 'manual',
      ai_prompt: routeData.aiPrompt,
      is_private: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadUserRoutes() {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function deleteRoute(routeId) {
  const { error } = await supabase
    .from('routes')
    .delete()
    .eq('id', routeId);

  if (error) throw error;
}
```

#### Add Save Button to RouteBuilder:
```jsx
<Button
  color="lime"
  onClick={handleSaveRoute}
  disabled={waypoints.length < 2}
>
  Save Route
</Button>

const handleSaveRoute = async () => {
  try {
    await saveRoute({
      name: routeName,
      description: '',
      distance: routeStats.distance,
      duration: routeStats.duration,
      geometry: routeGeometry,
      waypoints,
      routeType: determineRouteType(waypoints),
      trainingGoal,
      source: 'manual'
    });

    notifications.show({
      title: 'Saved!',
      message: `${routeName} has been saved`,
      color: 'green'
    });
  } catch (error) {
    notifications.show({
      title: 'Error',
      message: error.message,
      color: 'red'
    });
  }
};
```

---

### **Priority 3: My Routes Page** (2-3 hours)

Create a page to view and manage saved routes.

#### Create Routes List Page:
```jsx
// src/pages/Routes.jsx

import { useEffect, useState } from 'react';
import { Container, Title, Grid, Card, Text, Badge, Button, Group } from '@mantine/core';
import { loadUserRoutes, deleteRoute } from '../utils/routeService';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';

function Routes() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = async () => {
    try {
      const data = await loadUserRoutes();
      setRoutes(data);
    } catch (error) {
      console.error('Error loading routes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (routeId) => {
    if (!confirm('Delete this route?')) return;

    try {
      await deleteRoute(routeId);
      setRoutes(routes.filter(r => r.id !== routeId));
    } catch (error) {
      console.error('Error deleting route:', error);
    }
  };

  return (
    <AppShell>
      <Container size="lg" py="xl">
        <Group justify="space-between" mb="xl">
          <Title>My Routes</Title>
          <Button onClick={() => navigate('/routes/builder')}>
            Create New Route
          </Button>
        </Group>

        <Grid>
          {routes.map(route => (
            <Grid.Col span={{ base: 12, md: 6, lg: 4 }} key={route.id}>
              <Card>
                <Text fw={600} size="lg">{route.name}</Text>
                <Text size="sm" c="dimmed" mb="sm">{route.description}</Text>

                <Group gap="xs" mb="md">
                  <Badge>{route.distance_km} km</Badge>
                  {route.elevation_gain_m > 0 && (
                    <Badge variant="outline">{route.elevation_gain_m}m ↗</Badge>
                  )}
                  {route.training_goal && (
                    <Badge color="lime">{route.training_goal}</Badge>
                  )}
                </Group>

                <Group>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => navigate(`/routes/builder/${route.id}`)}
                  >
                    View
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => handleDelete(route.id)}
                  >
                    Delete
                  </Button>
                </Group>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      </Container>
    </AppShell>
  );
}

export default Routes;
```

#### Add Route to App.jsx:
```jsx
import Routes from './pages/Routes';

<Route path="/routes" element={<Routes />} />
```

---

### **Priority 4: Route Loading in Builder** (1 hour)

Modify RouteBuilder to load existing routes.

```jsx
// In RouteBuilder.jsx

useEffect(() => {
  if (routeId) {
    loadRoute(routeId);
  }
}, [routeId]);

const loadRoute = async (id) => {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    setRouteName(data.name);
    setRouteGeometry(data.geometry);
    setWaypoints(data.waypoints);
    setRouteStats({
      distance: data.distance_km,
      elevation: data.elevation_gain_m,
      duration: data.estimated_duration_minutes
    });

    // Center map on route
    if (data.waypoints && data.waypoints.length > 0) {
      const firstWaypoint = data.waypoints[0];
      setViewport({
        latitude: firstWaypoint.lat,
        longitude: firstWaypoint.lng,
        zoom: 12
      });
    }
  } catch (error) {
    console.error('Error loading route:', error);
    notifications.show({
      title: 'Error',
      message: 'Failed to load route',
      color: 'red'
    });
  }
};
```

---

### **Priority 5: Activity Sync from Strava** (3-4 hours)

Fetch and display Strava activities.

#### Strava Activities API Endpoint:
```javascript
// api/strava-activities.js

export default async function handler(req, res) {
  const { userId } = req.body;

  // Get Strava tokens from bike_computer_integrations
  const { data: integration } = await supabase
    .from('bike_computer_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .single();

  if (!integration) {
    return res.status(404).json({ error: 'Strava not connected' });
  }

  // Check if token is expired and refresh if needed
  // ... (token refresh logic)

  // Fetch activities from Strava
  const response = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=30',
    {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`
      }
    }
  );

  const activities = await response.json();

  return res.status(200).json({ activities });
}
```

---

## 🎯 Reference: OLD Implementation Files

### Key Files to Reference:

1. **AI Route Generation**
   - `OLD/src/utils/aiRouteGenerator.js` (2,300+ lines)
   - `OLD/src/utils/claudeRouteService.js` (484 lines)
   - `OLD/src/utils/smartCyclingRouter.js` (300+ lines)

2. **Route Components**
   - `OLD/src/components/ProfessionalRouteBuilder.js` (4,181 lines)
   - `OLD/src/components/RouteDiscovery.js`
   - `OLD/src/components/RouteStudio.js`

3. **Utilities**
   - `OLD/src/utils/routeNaming.js` (235 lines) - Smart route naming
   - `OLD/src/utils/routeSharing.js` (475+ lines) - Privacy-aware sharing
   - `OLD/src/utils/enhancedContext.js` (790 lines) - User preference collection

---

## 🔧 Environment Variables Needed

Make sure these are set in Vercel and `.env`:

```bash
# Already configured:
VITE_MAPBOX_TOKEN=
VITE_STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Need to add:
ANTHROPIC_API_KEY=  # Get from https://console.anthropic.com/
```

---

## 📊 Success Metrics

### MVP Complete When:
- [ ] Users can generate 3 AI route suggestions
- [ ] Users can save routes to database
- [ ] Users can view their saved routes
- [ ] Users can load and edit saved routes
- [ ] Strava activities display on dashboard

### Full Feature Complete When:
- [ ] Historical route patterns influence AI suggestions
- [ ] Multiple routing services (Stadia Maps, BRouter fallback)
- [ ] Elevation profiles display
- [ ] Route sharing with privacy zones
- [ ] Route discovery page
- [ ] Weather-aware route suggestions

---

## 💡 Tips for Implementation

1. **Start Small**: Get AI generation working with basic prompts first
2. **Test Thoroughly**: Claude responses need robust parsing
3. **Error Handling**: AI can fail - always have fallbacks
4. **User Feedback**: Show loading states and clear error messages
5. **Iterate**: Start with MVP features, enhance based on usage

---

## 🚀 Deployment Checklist

Before deploying AI features to production:

1. [ ] Add `ANTHROPIC_API_KEY` to Vercel environment variables
2. [ ] Run database migration in production Supabase
3. [ ] Test AI route generation with various inputs
4. [ ] Verify rate limiting works (or implement it)
5. [ ] Test route saving/loading
6. [ ] Check RLS policies work correctly

---

## 📝 Current Status

**What Works:**
- ✅ Manual route building with Mapbox
- ✅ GPX export
- ✅ Strava OAuth connection
- ✅ Claude API backend ready
- ✅ Database schema created

**Next Session Should Start With:**
1. Run database migration in Supabase
2. Add AI route generation UI to RouteBuilder
3. Test end-to-end AI route flow
4. Implement route saving

---

Good luck! The foundation is solid - now it's time to bring the AI features to life! 🚴‍♂️⚡
