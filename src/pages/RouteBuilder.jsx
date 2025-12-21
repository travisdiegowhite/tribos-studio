import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Paper, Stack, Title, Text, Button, Group, TextInput, Textarea, SegmentedControl, NumberInput, Select, Card, Badge, Divider, Loader, Tooltip, ActionIcon, Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSparkles, IconRoute, IconDeviceFloppy, IconCurrentLocation, IconSearch, IconX, IconSettings, IconCalendar } from '@tabler/icons-react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import { generateAIRoutes, generateSmartWaypoints } from '../utils/aiRouteGenerator';
import { getSmartCyclingRoute } from '../utils/smartCyclingRouter';
import { matchRouteToOSM } from '../utils/osmCyclingService';
import { useAuth } from '../contexts/AuthContext.jsx';
import { stravaService } from '../utils/stravaService';
import { saveRoute, getRoute } from '../utils/routesService';
import PreferenceSettings from '../components/PreferenceSettings.jsx';
import IntervalCues from '../components/IntervalCues.jsx';
import ElevationProfile from '../components/ElevationProfile.jsx';
import WeatherWidget from '../components/WeatherWidget.jsx';
import { WORKOUT_LIBRARY } from '../data/workoutLibrary';
import { generateCuesFromWorkoutStructure, createColoredRouteSegments } from '../utils/intervalCues';
import { formatDistance, formatElevation, formatSpeed } from '../utils/units';
import { supabase } from '../lib/supabase';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Build a prompt for Claude to parse natural language route requests
 * Returns waypoint NAMES that will be geocoded, not generic route suggestions
 * @param {string} userRequest - The user's natural language request
 * @param {object} weatherData - Current weather conditions
 * @param {object} userLocation - User's location {latitude, longitude}
 * @param {string} userAddress - User's address for regional context
 * @param {object} calendarData - Calendar context with upcoming workouts
 */
function buildNaturalLanguagePrompt(userRequest, weatherData, userLocation, userAddress, calendarData = null) {
  // Extract region/area from user's address for context
  let regionContext = '';
  let gravelExamples = '';

  if (userAddress) {
    const addressLower = userAddress.toLowerCase();

    if (addressLower.includes('colorado') || addressLower.includes(', co')) {
      regionContext = 'The cyclist is in Colorado.';
      gravelExamples = `
   **Colorado Front Range Examples:**
   - Erie → Lafayette → Superior → Louisville (county roads)
   - Boulder → Lyons → Hygiene → Longmont (dirt roads in foothills)
   - Boulder → Nederland → Ward → Jamestown (high country gravel)
   - Golden → Morrison → Evergreen → Conifer (mountain roads)`;
    } else if (addressLower.includes('california') || addressLower.includes(', ca')) {
      regionContext = 'The cyclist is in California.';
      gravelExamples = `
   **California Examples:**
   - Use small towns connected by county roads
   - Suggest towns in wine country, foothills, or rural areas
   - Look for agricultural areas with farm roads`;
    } else {
      regionContext = `The cyclist is near: ${userAddress}`;
      gravelExamples = `
   **General Strategy:**
   - Suggest small towns/communities near the cyclist's location
   - Rural areas typically have more gravel/dirt roads
   - County roads between small towns are often unpaved`;
    }
  } else {
    regionContext = 'Cyclist location unknown.';
    gravelExamples = `
   **General Strategy:**
   - Suggest small towns logically placed between start and destination
   - Rural areas and small communities often have gravel roads
   - Use actual town names that will geocode reliably`;
  }

  // Build calendar context string if available
  let calendarContext = '';
  if (calendarData?.todaysWorkout || calendarData?.upcomingWorkouts?.length > 0) {
    calendarContext = `
TRAINING CALENDAR CONTEXT:
The cyclist has a training plan. When they reference "today's workout", "my scheduled ride", "this week's long ride", etc., use this information:
`;
    if (calendarData.todaysWorkout) {
      const tw = calendarData.todaysWorkout;
      calendarContext += `
- TODAY'S WORKOUT: ${tw.name || tw.workout_type} (${tw.target_duration || 60} minutes, ${tw.workout_type} type)`;
    }
    if (calendarData.upcomingWorkouts?.length > 0) {
      calendarContext += `
- UPCOMING WORKOUTS:`;
      calendarData.upcomingWorkouts.slice(0, 5).forEach(w => {
        const date = new Date(w.scheduled_date + 'T00:00:00');
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        calendarContext += `
  * ${dayName}: ${w.name || w.workout_type} (${w.target_duration || 60} min)`;
      });
    }
  }

  return `You are an expert cycling route planner. A cyclist has requested: "${userRequest}"

${regionContext}
${calendarContext}

Your task is to extract the route requirements and return a structured JSON response with ACTUAL WAYPOINT NAMES that can be geocoded.

CRITICAL: If the user mentions SPECIFIC trail names or paths (e.g., "Coal Creek Path", "Boulder Creek Trail", "Cherry Creek Trail"), you MUST include those EXACT names as waypoints. These are the user's primary request.

Extract the following:
1. Start location (if mentioned)
2. Waypoints - CRITICAL: Include any trail names, path names, roads, or landmarks the user specifically mentioned
3. Route type (loop, out_back, point_to_point)
4. Distance or time
5. Surface preference (gravel, paved, mixed)

ROUTE TYPE DEFINITIONS:
- "loop": Returns to start via DIFFERENT roads. If user says "heading south and back", this is a loop.
- "out_back": Returns via the SAME route (only when explicitly requested)
- "point_to_point": Different start and end

Current conditions:
${weatherData ? `- Weather: ${weatherData.temperature}°C, ${weatherData.description}
- Wind: ${weatherData.windSpeed} km/h` : '- Weather data not available'}

${gravelExamples}

Return ONLY a JSON object:
{
  "startLocation": "start location if mentioned, or null",
  "waypoints": ["IMPORTANT: Include EXACT trail/path names user mentioned here", "additional waypoint"],
  "routeType": "loop|out_back|point_to_point",
  "distance": number in km (or null),
  "timeAvailable": number in minutes (or null),
  "surfaceType": "gravel|paved|mixed",
  "avoidHighways": true/false,
  "trainingGoal": "endurance|intervals|recovery|hills" or null,
  "direction": "north|south|east|west" if user mentioned a direction
}

EXAMPLES:

User: "30 mile loop heading south on Coal Creek Path"
Response:
{
  "startLocation": null,
  "waypoints": ["Coal Creek Path"],
  "routeType": "loop",
  "distance": 48.3,
  "surfaceType": "paved",
  "direction": "south"
}

User: "Ride to Boulder Creek Trail and back on gravel"
Response:
{
  "startLocation": null,
  "waypoints": ["Boulder Creek Trail"],
  "routeType": "loop",
  "surfaceType": "gravel"
}

User: "40 mile loop through Hygiene and Lyons on dirt roads"
Response:
{
  "startLocation": null,
  "waypoints": ["Hygiene", "Lyons"],
  "routeType": "loop",
  "distance": 64.4,
  "surfaceType": "gravel"
}

User: "Create a route for today's workout" (when today's workout is a 90-minute endurance ride)
Response:
{
  "startLocation": null,
  "waypoints": [],
  "routeType": "loop",
  "timeAvailable": 90,
  "trainingGoal": "endurance",
  "surfaceType": "mixed"
}

User: "Route for my Saturday long ride" (when Saturday has a 3-hour endurance workout scheduled)
Response:
{
  "startLocation": null,
  "waypoints": [],
  "routeType": "loop",
  "timeAvailable": 180,
  "trainingGoal": "endurance",
  "surfaceType": "mixed"
}

CRITICAL RULES:
1. If user mentions a TRAIL NAME (Coal Creek Path, Boulder Creek, etc.), it MUST be in waypoints
2. Return ONLY valid JSON, no extra text
3. Waypoints should be actual place names that can be geocoded
4. If user references their training calendar (today's workout, this week's ride, etc.), use the TRAINING CALENDAR CONTEXT above`;
}

/**
 * Parse Claude's natural language response to extract waypoints
 */
function parseNaturalLanguageResponse(responseText) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('📝 Parsed natural language response:', parsed);

    // Convert to route generator parameters
    const result = {};

    // Determine route type
    if (parsed.routeType) {
      result.routeType = parsed.routeType;
    } else if (parsed.endLocation && parsed.endLocation !== parsed.startLocation) {
      result.routeType = 'point_to_point';
    } else {
      result.routeType = 'loop';
    }

    // Set time or distance
    if (parsed.timeAvailable) {
      result.timeAvailable = parsed.timeAvailable;
    } else if (parsed.distance) {
      // Estimate time from distance (assume 25 km/h average)
      result.timeAvailable = Math.round((parsed.distance / 25) * 60);
      result.targetDistanceKm = parsed.distance;
    }

    // Set training goal
    if (parsed.trainingGoal) {
      result.trainingGoal = parsed.trainingGoal;
    } else {
      result.trainingGoal = 'endurance';
    }

    // Extract waypoints - THIS IS THE KEY DIFFERENCE
    result.startLocationName = parsed.startLocation;
    result.waypoints = parsed.waypoints || [];
    result.direction = parsed.direction;

    // Surface/preferences
    result.preferences = {
      avoidHighways: parsed.avoidHighways,
      surfaceType: parsed.surfaceType || 'mixed',
      trailPreference: parsed.surfaceType === 'gravel'
    };

    console.log('🎯 Extracted waypoints:', result.waypoints);
    console.log('🧭 Direction:', result.direction);
    return result;

  } catch (error) {
    console.error('Failed to parse natural language response:', error);
    throw new Error('Could not understand the route request. Please try being more specific.');
  }
}

/**
 * Geocode a waypoint name to coordinates
 * IMPORTANT: Uses Mapbox with bounding box, falls back to OSM for trails
 */
async function geocodeWaypoint(waypointName, proximityLocation) {
  if (!waypointName || !MAPBOX_TOKEN) return null;

  const isTrailOrPath = waypointName.toLowerCase().includes('path') ||
                        waypointName.toLowerCase().includes('trail') ||
                        waypointName.toLowerCase().includes('creek') ||
                        waypointName.toLowerCase().includes('greenway');

  // For trails/paths, try OSM first since it has better trail data
  if (isTrailOrPath && proximityLocation) {
    try {
      console.log(`🗺️ Trying OSM for trail: "${waypointName}"`);
      const osmMatch = await matchRouteToOSM(
        { name: waypointName },
        { lat: proximityLocation[1], lng: proximityLocation[0] }
      );

      if (osmMatch) {
        console.log(`✅ OSM found "${waypointName}" at: ${osmMatch.name}`);
        return {
          coordinates: [osmMatch.lng, osmMatch.lat], // [lng, lat]
          name: osmMatch.name
        };
      }
    } catch (osmError) {
      console.log(`⚠️ OSM lookup failed for "${waypointName}", trying Mapbox...`);
    }
  }

  // Fall back to Mapbox geocoding
  try {
    // Append state hint to trail names to prevent geocoding to wrong state
    let searchName = waypointName;

    if (proximityLocation && isTrailOrPath) {
      if (!waypointName.toLowerCase().includes('colorado') &&
          !waypointName.toLowerCase().includes(', co')) {
        searchName = `${waypointName}, Colorado`;
      }
    }

    const encodedName = encodeURIComponent(searchName);
    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedName}.json?access_token=${MAPBOX_TOKEN}&country=US&types=place,locality,address,poi,neighborhood`;

    // Add proximity bias and bounding box if we have a user location
    if (proximityLocation) {
      url += `&proximity=${proximityLocation[0]},${proximityLocation[1]}`;

      // Add bounding box around the user (about 100 miles / 160km radius)
      const lng = proximityLocation[0];
      const lat = proximityLocation[1];
      const radius = 1.5; // degrees, roughly 100 miles
      const bbox = `${lng - radius},${lat - radius},${lng + radius},${lat + radius}`;
      url += `&bbox=${bbox}`;
    }

    console.log(`🔍 Geocoding waypoint: "${searchName}"`);

    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];

      // Verify the result is reasonably close to the user (within ~200km)
      if (proximityLocation) {
        const [resultLng, resultLat] = feature.center;
        const distance = Math.sqrt(
          Math.pow(resultLng - proximityLocation[0], 2) +
          Math.pow(resultLat - proximityLocation[1], 2)
        );
        // If result is more than 2 degrees away (~220km), it's probably wrong
        if (distance > 2) {
          console.warn(`⚠️ Geocoded result for "${waypointName}" is too far away (${distance.toFixed(1)}° from user), skipping`);
          return null;
        }
      }

      console.log(`✅ Geocoded "${waypointName}" to: ${feature.place_name}`);
      return {
        coordinates: feature.center, // [lng, lat]
        name: feature.place_name
      };
    } else {
      console.warn(`⚠️ Could not geocode: ${waypointName}`);
      return null;
    }
  } catch (error) {
    console.error(`Geocoding error for ${waypointName}:`, error);
    return null;
  }
}

function RouteBuilder() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [routeName, setRouteName] = useState('Untitled Route');

  // Calendar context state (when navigating from training calendar)
  const [calendarContext, setCalendarContext] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [routeStats, setRouteStats] = useState({ distance: 0, elevation: 0, duration: 0 });
  const [isCalculating, setIsCalculating] = useState(false);
  const mapRef = useRef();
  const isEditing = !!routeId;

  // AI Route Generation State
  const [trainingGoal, setTrainingGoal] = useState('endurance');
  const [timeAvailable, setTimeAvailable] = useState(60);
  const [routeType, setRouteType] = useState('loop');
  const [routeProfile, setRouteProfile] = useState('road'); // 'road', 'gravel', 'mountain', 'commuting'
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [convertingRoute, setConvertingRoute] = useState(null); // Index of suggestion being converted
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [routingSource, setRoutingSource] = useState(null); // 'stadia_maps', 'brouter', 'mapbox'

  // Speed profile from Strava sync
  const [speedProfile, setSpeedProfile] = useState(null);

  // Preferences modal state
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Workout and interval cues state
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [intervalCues, setIntervalCues] = useState(null);

  // Units preference state
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const isImperial = unitsPreference === 'imperial';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);
  const formatSpd = (kmh) => formatSpeed(kmh, isImperial);

  // Weather state
  const [weatherData, setWeatherData] = useState(null);

  // Calendar workouts for NL context (today's workout and upcoming)
  const [todaysWorkout, setTodaysWorkout] = useState(null);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState([]);

  // Memoize workout options for Select component
  const workoutOptions = useMemo(() => {
    if (!WORKOUT_LIBRARY || typeof WORKOUT_LIBRARY !== 'object') {
      return [];
    }
    try {
      const values = Object.values(WORKOUT_LIBRARY);
      // Simple flat list without groups (groups can cause issues with Mantine Select)
      return values
        .filter(w => w && w.id && w.name && w.duration)
        .map(w => ({
          value: w.id,
          label: `${w.name} (${w.duration}min)`
        }));
    } catch (e) {
      console.error('Error building workout options:', e);
      return [];
    }
  }, []);

  // Route saving state
  const [savedRouteId, setSavedRouteId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Location search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  const [viewport, setViewport] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    zoom: 12
  });

  // Generate colored route segments when workout is selected and route exists
  const coloredSegments = useMemo(() => {
    if (!routeGeometry?.coordinates || !selectedWorkout) {
      return null;
    }

    try {
      // Create route object for interval cue generation
      const route = {
        coordinates: routeGeometry.coordinates,
        distance: routeStats.distance
      };

      // Generate cues from workout structure
      const cues = generateCuesFromWorkoutStructure(route, selectedWorkout);
      if (cues && cues.length > 0) {
        setIntervalCues(cues);
        return createColoredRouteSegments(routeGeometry.coordinates, cues);
      }
    } catch (error) {
      console.error('Error generating colored segments:', error);
    }
    return null;
  }, [routeGeometry, selectedWorkout, routeStats.distance]);

  // Memoize route GeoJSON to prevent re-creating on every map move/render
  const routeGeoJSON = useMemo(() => {
    if (!routeGeometry) return null;
    return { type: 'Feature', geometry: routeGeometry };
  }, [routeGeometry]);

  // Load user's units preference
  useEffect(() => {
    const loadUnitsPreference = async () => {
      if (!user) return;
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('units_preference')
          .eq('id', user.id)
          .single();
        if (data?.units_preference) {
          setUnitsPreference(data.units_preference);
        }
      } catch (err) {
        console.error('Failed to load units preference:', err);
      }
    };
    loadUnitsPreference();
  }, [user]);

  // Read calendar context from URL params (when navigating from training calendar)
  useEffect(() => {
    const fromCalendar = searchParams.get('from') === 'calendar';
    if (!fromCalendar) return;

    // Extract calendar context from URL params
    const context = {
      workoutType: searchParams.get('workoutType') || 'endurance',
      trainingGoal: searchParams.get('trainingGoal') || 'endurance',
      duration: parseInt(searchParams.get('duration') || '60', 10),
      distance: searchParams.get('distance') ? parseFloat(searchParams.get('distance')) : null,
      workoutId: searchParams.get('workoutId') || null,
      workoutName: searchParams.get('workoutName') || null,
      scheduledDate: searchParams.get('scheduledDate') || null,
    };

    console.log('📅 Route Builder opened from calendar with context:', context);

    // Set the calendar context for display
    setCalendarContext(context);

    // Pre-populate route builder settings from calendar context
    setTrainingGoal(context.trainingGoal);
    setTimeAvailable(context.duration);

    // Auto-select workout for interval cues if workoutId is provided
    if (context.workoutId && WORKOUT_LIBRARY[context.workoutId]) {
      setSelectedWorkout(WORKOUT_LIBRARY[context.workoutId]);
    }

    // Set route name based on workout
    if (context.workoutName) {
      setRouteName(`Route for ${context.workoutName}`);
    }

    // Pre-fill natural language input with workout description
    const workoutDesc = context.workoutName || context.workoutType;
    const goalText = context.trainingGoal === 'intervals' ? 'with intervals' :
                     context.trainingGoal === 'hills' ? 'with climbing' :
                     context.trainingGoal === 'recovery' ? 'easy recovery' : '';
    setNaturalLanguageInput(`Create a ${context.duration} minute ${workoutDesc} route ${goalText}`.trim());

    // Clear the URL params after reading (keeps URL clean)
    setSearchParams({}, { replace: true });
  }, []);

  // Geolocate user on mount
  useEffect(() => {
    if (routeId) return; // Don't geolocate if loading existing route

    const geolocateUser = () => {
      if (!navigator.geolocation) {
        console.log('Geolocation not supported');
        return;
      }

      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          setViewport(v => ({
            ...v,
            latitude,
            longitude,
            zoom: 13
          }));
          setIsLocating(false);
          console.log('📍 Geolocated to:', latitude, longitude);
        },
        (error) => {
          console.log('Geolocation error:', error.message);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    };

    geolocateUser();
  }, [routeId]);

  // Load user's speed profile on mount
  useEffect(() => {
    const loadSpeedProfile = async () => {
      if (!user) return;

      try {
        const profile = await stravaService.getSpeedProfile();
        if (profile) {
          setSpeedProfile(profile);
          console.log('🚴 Speed profile loaded:', {
            average: profile.average_speed,
            road: profile.road_speed,
            gravel: profile.gravel_speed,
            mtb: profile.mtb_speed
          });
        }
      } catch (error) {
        console.error('Error loading speed profile:', error);
      }
    };

    loadSpeedProfile();
  }, [user]);

  // Load upcoming planned workouts for natural language context
  useEffect(() => {
    const loadUpcomingWorkouts = async () => {
      if (!user) return;

      try {
        // Get today's date in YYYY-MM-DD format
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Get date 7 days from now
        const weekLater = new Date(today);
        weekLater.setDate(weekLater.getDate() + 7);
        const weekLaterStr = weekLater.toISOString().split('T')[0];

        // Query planned workouts for the next 7 days
        const { data, error } = await supabase
          .from('planned_workouts')
          .select('*, training_plans!inner(user_id)')
          .eq('training_plans.user_id', user.id)
          .gte('scheduled_date', todayStr)
          .lte('scheduled_date', weekLaterStr)
          .neq('workout_type', 'rest')
          .order('scheduled_date', { ascending: true });

        if (error) {
          console.error('Error loading upcoming workouts:', error);
          return;
        }

        if (data && data.length > 0) {
          // Find today's workout
          const todayWorkout = data.find(w => w.scheduled_date === todayStr);
          if (todayWorkout) {
            setTodaysWorkout(todayWorkout);
          }

          // Store all upcoming workouts
          setUpcomingWorkouts(data);
          console.log('📅 Loaded upcoming workouts for NL context:', data.length);
        }
      } catch (error) {
        console.error('Error loading upcoming workouts:', error);
      }
    };

    loadUpcomingWorkouts();
  }, [user]);

  // Load existing route if editing
  useEffect(() => {
    const loadExistingRoute = async () => {
      if (!routeId || !user) return;

      setLoadingRoute(true);
      try {
        const route = await getRoute(routeId);
        if (route) {
          setRouteName(route.name);
          setRouteGeometry(route.geometry);
          setRouteStats({
            distance: route.distance_km || 0,
            elevation: route.elevation_gain_m || 0,
            duration: route.estimated_duration_minutes || 0
          });
          setRouteType(route.route_type || 'loop');
          setTrainingGoal(route.training_goal || 'endurance');
          setSavedRouteId(route.id);

          // Center map on route start
          if (route.start_latitude && route.start_longitude) {
            setViewport(v => ({
              ...v,
              latitude: route.start_latitude,
              longitude: route.start_longitude,
              zoom: 13
            }));
          }
        }
      } catch (error) {
        console.error('Error loading route:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load route',
          color: 'red'
        });
      } finally {
        setLoadingRoute(false);
      }
    };

    loadExistingRoute();
  }, [routeId, user]);

  // Calculate route using Mapbox Directions API
  const calculateRoute = useCallback(async (points) => {
    if (points.length < 2) {
      setRouteGeometry(null);
      setRouteStats({ distance: 0, elevation: 0, duration: 0 });
      return;
    }

    setIsCalculating(true);
    try {
      const coordinates = points.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?` +
        `geometries=geojson&overview=full&steps=true&` +
        `access_token=${MAPBOX_TOKEN}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok') {
        console.error('Mapbox API error:', data);
        return;
      }

      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        setRouteGeometry(route.geometry);
        setRouteStats({
          distance: parseFloat((route.distance / 1000).toFixed(1)), // Convert to km (as number)
          elevation: 0, // Mapbox doesn't provide elevation in basic API
          duration: Math.round(route.duration / 60) // Convert to minutes
        });
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setIsCalculating(false);
    }
  }, []);

  // Handle map click to add waypoint
  const handleMapClick = useCallback((event) => {
    const { lng, lat } = event.lngLat;
    const newWaypoints = [...waypoints, { lng, lat, id: Date.now() }];
    setWaypoints(newWaypoints);
    calculateRoute(newWaypoints);
  }, [waypoints, calculateRoute]);

  // Remove waypoint
  const removeWaypoint = useCallback((id) => {
    const newWaypoints = waypoints.filter(w => w.id !== id);
    setWaypoints(newWaypoints);
    calculateRoute(newWaypoints);
  }, [waypoints, calculateRoute]);

  // Clear all waypoints
  const clearRoute = useCallback(() => {
    setWaypoints([]);
    setRouteGeometry(null);
    setRouteStats({ distance: 0, elevation: 0, duration: 0 });
  }, []);

  // Export GPX
  const exportGPX = useCallback(() => {
    if (!routeGeometry) {
      notifications.show({
        title: 'No Route',
        message: 'Please create a route first',
        color: 'yellow'
      });
      return;
    }

    const gpxContent = generateGPX(routeName, routeGeometry.coordinates);
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${routeName.replace(/\s+/g, '_')}.gpx`;
    link.click();
    URL.revokeObjectURL(url);
  }, [routeName, routeGeometry]);

  // Save route to database
  const handleSaveRoute = useCallback(async () => {
    if (!routeGeometry) {
      notifications.show({
        title: 'No Route',
        message: 'Please create a route before saving',
        color: 'yellow'
      });
      return;
    }

    if (!user) {
      notifications.show({
        title: 'Sign In Required',
        message: 'Please sign in to save routes',
        color: 'yellow'
      });
      return;
    }

    setIsSaving(true);
    try {
      const routeData = {
        id: savedRouteId, // Include ID if updating existing route
        name: routeName,
        geometry: routeGeometry,
        distance_km: parseFloat(routeStats.distance) || null,
        elevation_gain_m: routeStats.elevation || null,
        estimated_duration_minutes: routeStats.duration || null,
        route_type: routeType,
        training_goal: trainingGoal,
        surface_type: routeProfile,
        generated_by: aiSuggestions.length > 0 ? 'ai' : 'manual',
        waypoints: waypoints.length > 0 ? waypoints : null
      };

      const saved = await saveRoute(routeData);
      setSavedRouteId(saved.id);

      notifications.show({
        title: 'Route Saved!',
        message: `"${routeName}" has been saved to your routes`,
        color: 'lime'
      });

      // If this was a new route, update URL to include route ID
      if (!routeId && saved.id) {
        navigate(`/routes/${saved.id}`, { replace: true });
      }
    } catch (error) {
      console.error('Error saving route:', error);
      notifications.show({
        title: 'Save Failed',
        message: error.message || 'Failed to save route',
        color: 'red'
      });
    } finally {
      setIsSaving(false);
    }
  }, [routeGeometry, routeName, routeStats, routeType, trainingGoal, routeProfile, waypoints, aiSuggestions, savedRouteId, user, routeId, navigate]);

  // Generate AI Routes using the comprehensive aiRouteGenerator
  const handleGenerateAIRoutes = useCallback(async () => {
    setGeneratingAI(true);
    try {
      // Use the full AI route generator which:
      // 1. Uses Claude for intelligent suggestions
      // 2. Converts suggestions to full GPS routes
      // 3. Falls back to past ride patterns and Mapbox if needed
      const routes = await generateAIRoutes({
        startLocation: [viewport.longitude, viewport.latitude], // [lng, lat] format
        timeAvailable,
        trainingGoal,
        routeType,
        userId: user?.id,
        speedProfile,
        speedModifier: 1.0
      });

      // Routes from generateAIRoutes already have full coordinates
      setAiSuggestions(routes);
      notifications.show({
        title: 'Routes Generated!',
        message: `Found ${routes.length} routes for your ${trainingGoal} session`,
        color: 'lime'
      });
    } catch (error) {
      console.error('AI route generation error:', error);
      notifications.show({
        title: 'Generation Failed',
        message: error.message || 'Failed to generate routes. Please try again.',
        color: 'red'
      });
    } finally {
      setGeneratingAI(false);
    }
  }, [viewport, timeAvailable, trainingGoal, routeType, user, speedProfile]);

  // Get user's speed for the current route profile
  const getUserSpeedForProfile = useCallback((profile) => {
    if (!speedProfile) return null;

    switch (profile) {
      case 'road':
        return speedProfile.road_speed || speedProfile.average_speed;
      case 'gravel':
        return speedProfile.gravel_speed || (speedProfile.average_speed ? speedProfile.average_speed * 0.85 : null);
      case 'mountain':
        return speedProfile.mtb_speed || (speedProfile.average_speed ? speedProfile.average_speed * 0.7 : null);
      case 'commuting':
        return speedProfile.easy_speed || (speedProfile.average_speed ? speedProfile.average_speed * 0.9 : null);
      default:
        return speedProfile.average_speed;
    }
  }, [speedProfile]);

  // Select an AI suggestion - routes already have full coordinates from generateAIRoutes
  const handleSelectAISuggestion = useCallback(async (suggestion, index) => {
    setConvertingRoute(index);
    setRouteName(suggestion.name);

    try {
      // Routes from generateAIRoutes already have full coordinates
      if (suggestion.coordinates && suggestion.coordinates.length > 0) {
        // Create GeoJSON geometry from coordinates
        const geometry = {
          type: 'LineString',
          coordinates: suggestion.coordinates
        };
        setRouteGeometry(geometry);

        // Update route stats from the pre-computed route data
        setRouteStats({
          distance: parseFloat((suggestion.distance || 0).toFixed(1)),
          elevation: suggestion.elevationGain || 0,
          duration: Math.round((suggestion.distance || 0) / 25 * 60) // Estimate based on 25km/h
        });

        // Track routing source for display
        setRoutingSource(suggestion.source || 'ai_generated');

        // Clear waypoints since we're using AI-generated route
        setWaypoints([]);

        notifications.show({
          title: 'Route Selected!',
          message: `${(suggestion.distance || 0).toFixed(1)} km - ${suggestion.name}`,
          color: 'lime',
          autoClose: 3000
        });
      } else {
        throw new Error('Route has no coordinates');
      }
    } catch (error) {
      console.error('Error selecting route:', error);
      notifications.show({
        title: 'Selection Failed',
        message: error.message || 'Failed to load route. Please try again.',
        color: 'red',
        autoClose: 5000
      });
    } finally {
      setConvertingRoute(null);
    }
  }, []);

  // Get human-readable label for routing source
  const getRoutingSourceLabel = (source) => {
    switch (source) {
      case 'stadia_maps': return 'Stadia Maps (Valhalla)';
      case 'brouter': return 'BRouter';
      case 'brouter_gravel': return 'BRouter Gravel';
      case 'mapbox_fallback': return 'Mapbox';
      default: return source || 'Unknown';
    }
  };

  // Handle natural language route generation - NEW APPROACH
  // Uses Claude to extract waypoint NAMES, then geocodes and routes through them
  const handleNaturalLanguageGenerate = useCallback(async () => {
    if (!naturalLanguageInput.trim()) {
      notifications.show({
        title: 'Enter a description',
        message: 'Please describe the route you want (e.g., "40 mile gravel loop")',
        color: 'yellow'
      });
      return;
    }

    setGeneratingAI(true);

    try {
      console.log('🗣️ Processing natural language request:', naturalLanguageInput);

      // Step 1: Build prompt for Claude to extract waypoint names
      const prompt = buildNaturalLanguagePrompt(
        naturalLanguageInput,
        weatherData,
        [viewport.longitude, viewport.latitude],
        null, // userAddress - could add reverse geocoding later
        { todaysWorkout, upcomingWorkouts } // Calendar context for NL understanding
      );

      // Step 2: Call Claude API to parse the request
      const apiUrl = import.meta.env.PROD ? '/api/claude-routes' : 'http://localhost:3000/api/claude-routes';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 1000,
          temperature: 0.3 // Lower temperature for more consistent parsing
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process route request');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to parse route request');
      }

      // Step 3: Parse Claude's response to get waypoint names
      const parsed = parseNaturalLanguageResponse(data.content);
      console.log('📍 Parsed route request:', parsed);

      // Update UI with parsed values
      if (parsed.timeAvailable) setTimeAvailable(parsed.timeAvailable);
      if (parsed.trainingGoal) setTrainingGoal(parsed.trainingGoal);
      if (parsed.routeType) setRouteType(parsed.routeType);
      if (parsed.preferences?.surfaceType === 'gravel') setRouteProfile('gravel');

      // Step 4: Geocode each waypoint name to coordinates
      const startLocation = [viewport.longitude, viewport.latitude];
      let waypointCoords = [];
      let routeDescription = '';

      // Check if we have explicit waypoints to geocode
      if (parsed.waypoints && parsed.waypoints.length > 0) {
        waypointCoords = [startLocation]; // Start with user's current location

        for (const waypointName of parsed.waypoints) {
          const geocoded = await geocodeWaypoint(waypointName, startLocation);
          if (geocoded) {
            waypointCoords.push(geocoded.coordinates);
          } else {
            console.warn(`Could not geocode waypoint: ${waypointName}`);
          }
        }

        // For loop routes, return to start
        if (parsed.routeType === 'loop' || parsed.routeType === 'out_back') {
          waypointCoords.push(startLocation);
        }

        routeDescription = parsed.waypoints.join(', ');
      } else {
        // No explicit waypoints - generate smart geometric waypoints based on duration
        console.log('🎯 No waypoints provided, generating smart route based on duration...');

        const duration = parsed.timeAvailable || timeAvailable || 60;
        const goal = parsed.trainingGoal || trainingGoal || 'endurance';
        const type = parsed.routeType || 'loop';
        const direction = parsed.direction || null;

        waypointCoords = generateSmartWaypoints(
          startLocation,
          duration,
          type,
          goal,
          speedProfile,
          direction
        );

        // Create a description for the route
        const distanceEstimate = Math.round(duration * 0.33); // Rough km estimate
        routeDescription = `${duration}min ${goal} ${type}`;
      }

      console.log(`📍 Routing through ${waypointCoords.length} waypoints:`, waypointCoords);

      if (waypointCoords.length < 2) {
        throw new Error('Could not generate route waypoints. Please try again.');
      }

      // Step 5: Generate route through the waypoints
      notifications.show({
        id: 'generating-route',
        title: 'Generating Route',
        message: `Creating ${routeDescription} route...`,
        loading: true,
        autoClose: false
      });

      const routeResult = await getSmartCyclingRoute(waypointCoords, {
        profile: parsed.preferences?.surfaceType === 'gravel' ? 'gravel' : 'road',
        trainingGoal: parsed.trainingGoal || 'endurance',
        mapboxToken: MAPBOX_TOKEN
      });

      if (!routeResult || !routeResult.coordinates || routeResult.coordinates.length < 10) {
        throw new Error('Could not generate a route. Try a different duration or location.');
      }

      // Step 6: Create route object and display
      const distanceKm = parseFloat((routeResult.distance / 1000).toFixed(1));
      const generatedRouteName = parsed.waypoints?.length > 0
        ? `${parsed.waypoints.join(' → ')} ${parsed.routeType}`
        : `${distanceKm}km ${parsed.trainingGoal || 'endurance'} ${parsed.routeType || 'loop'}`;

      setRouteGeometry({
        type: 'LineString',
        coordinates: routeResult.coordinates
      });

      setRouteStats({
        distance: distanceKm, // Now a number, not string
        elevation: routeResult.elevationGain || 0,
        duration: Math.round(routeResult.duration / 60)
      });

      // Only update route name if not already set from calendar context
      if (!calendarContext) {
        setRouteName(generatedRouteName);
      }
      setRoutingSource(routeResult.source);
      setWaypoints([]); // Clear manual waypoints since we're using AI route

      notifications.update({
        id: 'generating-route',
        title: 'Route Generated!',
        message: `${distanceKm} km ${parsed.routeType || 'loop'} route created`,
        color: 'lime',
        loading: false,
        autoClose: 3000
      });

      console.log(`✅ Route generated: ${(routeResult.distance / 1000).toFixed(1)} km via ${routeResult.source}`);

    } catch (error) {
      console.error('Natural language route generation error:', error);
      notifications.hide('generating-route');
      notifications.show({
        title: 'Generation Failed',
        message: error.message || 'Failed to generate routes. Please try again.',
        color: 'red'
      });
    } finally {
      setGeneratingAI(false);
    }
  }, [naturalLanguageInput, viewport]);

  // Search for address using Mapbox Geocoding API
  const handleAddressSearch = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
        `access_token=${MAPBOX_TOKEN}&types=address,place,locality,neighborhood,poi&limit=5`
      );
      const data = await response.json();

      if (data.features) {
        setSearchResults(data.features.map(f => ({
          id: f.id,
          name: f.place_name,
          center: f.center, // [lng, lat]
        })));
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle selecting a search result
  const handleSelectSearchResult = useCallback((result) => {
    const [lng, lat] = result.center;
    setViewport(v => ({
      ...v,
      latitude: lat,
      longitude: lng,
      zoom: 14
    }));
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  // Handle "My Location" button click
  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      notifications.show({
        title: 'Not Supported',
        message: 'Geolocation is not supported by your browser',
        color: 'yellow'
      });
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        setViewport(v => ({
          ...v,
          latitude,
          longitude,
          zoom: 14
        }));
        setIsLocating(false);
        notifications.show({
          title: 'Location Found',
          message: 'Map centered on your current location',
          color: 'lime'
        });
      },
      (error) => {
        setIsLocating(false);
        notifications.show({
          title: 'Location Error',
          message: error.message || 'Could not get your location',
          color: 'red'
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Show loading state when loading existing route
  if (loadingRoute) {
    return (
      <AppShell fullWidth>
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)' }}>
          <Stack align="center" gap="md">
            <Loader color="lime" size="lg" />
            <Text style={{ color: tokens.colors.textSecondary }}>Loading route...</Text>
          </Stack>
        </Box>
      </AppShell>
    );
  }

  // Render route stats for the bottom sheet peek content
  const renderPeekContent = () => (
    <Group justify="space-between" style={{ width: '100%' }}>
      <Box>
        <Text size="xs" c="dimmed">Distance</Text>
        <Text fw={600} size="sm">{formatDist(routeStats.distance)}</Text>
      </Box>
      <Box>
        <Text size="xs" c="dimmed">Elevation</Text>
        <Text fw={600} size="sm">{routeStats.elevation > 0 ? formatElev(routeStats.elevation) : '--'}</Text>
      </Box>
      <Box>
        <Text size="xs" c="dimmed">Time</Text>
        <Text fw={600} size="sm">
          {routeStats.duration > 0 ? `${Math.floor(routeStats.duration / 60)}h ${routeStats.duration % 60}m` : '--:--'}
        </Text>
      </Box>
      <Button
        size="xs"
        color="lime"
        disabled={!routeGeometry}
        onClick={handleSaveRoute}
        loading={isSaving}
      >
        Save
      </Button>
    </Group>
  );

  // Render the sidebar/bottom sheet controls
  const renderControls = () => (
    <Stack gap="md">
      {/* Calendar Context Banner (mobile) */}
      {calendarContext && (
        <Paper
          p="sm"
          style={{
            backgroundColor: `${tokens.colors.electricLime}15`,
            border: `1px solid ${tokens.colors.electricLime}`,
          }}
          radius="md"
        >
          <Group justify="space-between" align="flex-start">
            <Group gap="xs">
              <IconCalendar size={16} style={{ color: tokens.colors.electricLime }} />
              <Box>
                <Text size="xs" fw={600} style={{ color: tokens.colors.electricLime }}>
                  Creating route for scheduled workout
                </Text>
                <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                  {calendarContext.workoutName || calendarContext.workoutType} • {calendarContext.duration} min
                </Text>
              </Box>
            </Group>
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={() => setCalendarContext(null)}
            >
              <IconX size={12} />
            </ActionIcon>
          </Group>
        </Paper>
      )}

      <Box>
        <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
          ROUTE NAME
        </Text>
        <TextInput
          value={routeName}
          onChange={(e) => setRouteName(e.target.value)}
          variant="filled"
          size="sm"
        />
      </Box>

      <Divider label="AI Route Generator" labelPosition="center" />

      {/* Natural Language Input */}
      <Box>
        <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
          DESCRIBE YOUR RIDE
        </Text>
        <Textarea
          placeholder="e.g., '40 mile gravel loop' or '2 hour recovery ride'"
          value={naturalLanguageInput}
          onChange={(e) => setNaturalLanguageInput(e.target.value)}
          minRows={2}
          maxRows={3}
          size="sm"
          variant="filled"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleNaturalLanguageGenerate();
            }
          }}
        />
        <Button
          onClick={handleNaturalLanguageGenerate}
          loading={generatingAI}
          leftSection={<IconSparkles size={16} />}
          color="lime"
          variant={calendarContext ? 'filled' : 'light'}
          size="xs"
          mt="xs"
          fullWidth
          style={calendarContext ? {
            animation: 'pulse-glow 2s ease-in-out infinite',
            boxShadow: `0 0 20px ${tokens.colors.electricLime}40`,
          } : undefined}
        >
          {calendarContext ? '✨ Generate Route for Workout' : 'Generate from Description'}
        </Button>
      </Box>

      {/* Pulse animation styles */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 5px ${tokens.colors.electricLime}40;
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 25px ${tokens.colors.electricLime}80;
            transform: scale(1.02);
          }
        }
      `}</style>

      <Divider label="or configure manually" labelPosition="center" size="xs" />

      {/* Route Profile */}
      <Box>
        <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
          ROUTE PROFILE
        </Text>
        <SegmentedControl
          value={routeProfile}
          onChange={setRouteProfile}
          fullWidth
          size="xs"
          data={[
            { label: '🚴 Road', value: 'road' },
            { label: '🌲 Gravel', value: 'gravel' },
            { label: '⛰️ MTB', value: 'mountain' },
            { label: '🏙️ Commute', value: 'commuting' }
          ]}
          styles={{
            root: { backgroundColor: tokens.colors.bgTertiary }
          }}
        />
      </Box>

      {/* Training Goal */}
      <Box>
        <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
          TRAINING GOAL
        </Text>
        <SegmentedControl
          value={trainingGoal}
          onChange={setTrainingGoal}
          fullWidth
          size="xs"
          data={[
            { label: 'Recovery', value: 'recovery' },
            { label: 'Endurance', value: 'endurance' },
            { label: 'Intervals', value: 'intervals' },
            { label: 'Hills', value: 'hills' }
          ]}
          styles={{
            root: { backgroundColor: tokens.colors.bgTertiary }
          }}
        />
      </Box>

      <Group grow>
        <Box>
          <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
            TIME (MIN)
          </Text>
          <NumberInput
            value={timeAvailable}
            onChange={setTimeAvailable}
            min={15}
            max={480}
            step={15}
            size="sm"
            variant="filled"
          />
        </Box>

        <Box>
          <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
            ROUTE TYPE
          </Text>
          <Select
            value={routeType}
            onChange={setRouteType}
            size="sm"
            variant="filled"
            data={[
              { value: 'loop', label: 'Loop' },
              { value: 'out_back', label: 'Out & Back' },
              { value: 'point_to_point', label: 'Point to Point' }
            ]}
          />
        </Box>
      </Group>

      {/* Workout Selection */}
      <Box>
        <Group justify="space-between" mb="xs">
          <Text size="xs" style={{ color: tokens.colors.textMuted }}>
            WORKOUT (OPTIONAL)
          </Text>
          <Tooltip label="Route Preferences">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setPreferencesOpen(true)}
            >
              <IconSettings size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Select
          placeholder="Select a workout for color-coded route..."
          value={selectedWorkout?.id || null}
          onChange={(value) => {
            if (value) {
              const workout = WORKOUT_LIBRARY[value];
              setSelectedWorkout(workout);
              // Auto-set time available from workout duration
              if (workout.duration) {
                setTimeAvailable(workout.duration);
                console.log(`⏱️ Set time available to workout duration: ${workout.duration} min`);
              }
            } else {
              setSelectedWorkout(null);
              setIntervalCues(null);
            }
          }}
          clearable
          size="sm"
          variant="filled"
          data={workoutOptions}
        />
      </Box>

      <Button
        onClick={handleGenerateAIRoutes}
        loading={generatingAI}
        leftSection={<IconSparkles size={18} />}
        color="lime"
        fullWidth
      >
        {generatingAI ? 'Generating Routes...' : 'Generate AI Routes'}
      </Button>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <Box>
          <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
            AI SUGGESTIONS ({aiSuggestions.length})
          </Text>
          <Stack
            gap="sm"
            style={{
              maxHeight: isMobile ? 250 : 200,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingRight: 4,
            }}
          >
            {aiSuggestions.map((suggestion, index) => (
              <Card
                key={index}
                p="sm"
                withBorder
                style={{
                  borderColor: convertingRoute === index ? tokens.colors.electricLime : tokens.colors.bgTertiary,
                  backgroundColor: tokens.colors.bgPrimary,
                  cursor: convertingRoute !== null ? 'wait' : 'pointer',
                  opacity: convertingRoute !== null && convertingRoute !== index ? 0.5 : 1,
                  transition: 'all 0.2s',
                  minHeight: 70,
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (convertingRoute === null) {
                    handleSelectAISuggestion(suggestion, index);
                  }
                }}
              >
                <Stack gap={6}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1 }}>
                      {suggestion.name}
                    </Text>
                    {convertingRoute === index ? (
                      <Loader size={16} color="lime" />
                    ) : (
                      <Badge size="xs" color={
                        suggestion.difficulty === 'easy' ? 'green' :
                        suggestion.difficulty === 'moderate' ? 'yellow' : 'red'
                      }>
                        {suggestion.difficulty || 'moderate'}
                      </Badge>
                    )}
                  </Group>
                  <Group gap={6}>
                    <Badge size="xs" variant="light" color="lime">
                      {typeof suggestion.distance === 'number' ? `${suggestion.distance.toFixed(1)} km` : suggestion.distance}
                    </Badge>
                    {suggestion.elevationGain > 0 && (
                      <Badge size="xs" variant="light" color="gray">
                        {suggestion.elevationGain}m ↗
                      </Badge>
                    )}
                    {suggestion.estimatedTime && (
                      <Badge size="xs" variant="outline">
                        {suggestion.estimatedTime}min
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="lime" fw={500}>
                    {convertingRoute === index ? 'Loading route...' : 'Tap to select'}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {/* Weather Widget (compact for mobile) */}
      {userLocation && (
        <WeatherWidget
          latitude={userLocation.latitude}
          longitude={userLocation.longitude}
          coordinates={routeGeometry?.coordinates}
          isImperial={isImperial}
          compact={true}
          showWindAnalysis={false}
          onWeatherUpdate={setWeatherData}
        />
      )}

      {/* Actions */}
      <Stack gap="sm">
        <Group grow>
          <Button
            variant="light"
            color="lime"
            size="sm"
            disabled={!routeGeometry}
            onClick={exportGPX}
          >
            Export GPX
          </Button>
          <Button
            variant="outline"
            color="red"
            size="sm"
            disabled={!routeGeometry && waypoints.length === 0}
            onClick={clearRoute}
          >
            Clear
          </Button>
        </Group>
      </Stack>
    </Stack>
  );

  // Mobile layout
  if (isMobile) {
    return (
      <AppShell fullWidth hideNav>
        <Box style={{ height: 'calc(100vh - 60px)', position: 'relative' }}>
          {/* Full-screen map */}
          <Box style={{ width: '100%', height: '100%' }}>
            {MAPBOX_TOKEN ? (
              <Map
                ref={mapRef}
                {...viewport}
                onMove={evt => setViewport(evt.viewState)}
                onClick={handleMapClick}
                mapStyle="mapbox://styles/mapbox/outdoors-v12"
                mapboxAccessToken={MAPBOX_TOKEN}
                style={{ width: '100%', height: '100%' }}
                cursor="crosshair"
              >
                {/* Colored route segments */}
                {coloredSegments && (
                  <Source key={routeName || 'colored-route'} id="colored-route" type="geojson" data={coloredSegments}>
                    <Layer
                      id="route-colored"
                      type="line"
                      paint={{
                        'line-color': ['get', 'color'],
                        'line-width': 6,
                        'line-opacity': 0.9
                      }}
                    />
                  </Source>
                )}

                {/* Route line */}
                {routeGeoJSON && !coloredSegments && (
                  <Source key={routeName || 'route'} id="route" type="geojson" data={routeGeoJSON}>
                    <Layer
                      id="route-line"
                      type="line"
                      paint={{
                        'line-color': tokens.colors.electricLime,
                        'line-width': 4,
                        'line-opacity': 0.8
                      }}
                    />
                  </Source>
                )}

                {/* User location */}
                {userLocation && (
                  <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
                    <div style={{
                      width: 16,
                      height: 16,
                      backgroundColor: '#3b82f6',
                      borderRadius: '50%',
                      border: '3px solid white',
                      boxShadow: '0 0 0 2px #3b82f6',
                    }} />
                  </Marker>
                )}

                {/* Waypoint markers */}
                {waypoints.map((waypoint, index) => (
                  <Marker
                    key={waypoint.id}
                    longitude={waypoint.lng}
                    latitude={waypoint.lat}
                    anchor="bottom"
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      removeWaypoint(waypoint.id);
                    }}
                  >
                    <div style={{
                      backgroundColor: index === 0 ? '#22c55e' : index === waypoints.length - 1 ? '#ef4444' : tokens.colors.electricLime,
                      color: 'white',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      border: '2px solid white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    }}>
                      {index + 1}
                    </div>
                  </Marker>
                ))}
              </Map>
            ) : (
              <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Text>Map requires MAPBOX_TOKEN</Text>
              </Box>
            )}

            {/* Mobile search bar - top center */}
            {MAPBOX_TOKEN && (
              <Box
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 16,
                  right: 16,
                  zIndex: 10,
                  display: 'flex',
                  gap: 8,
                }}
              >
                <TextInput
                  placeholder="Search location..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleAddressSearch(e.target.value);
                  }}
                  leftSection={<IconSearch size={16} />}
                  rightSection={searchQuery ? (
                    <IconX size={16} style={{ cursor: 'pointer' }} onClick={() => { setSearchQuery(''); setSearchResults([]); }} />
                  ) : null}
                  style={{ flex: 1 }}
                  styles={{ input: { backgroundColor: tokens.colors.bgSecondary } }}
                />
                <Tooltip label="My Location">
                  <Button variant="filled" color="lime" size="md" onClick={handleGeolocate} loading={isLocating} style={{ padding: '0 12px' }}>
                    <IconCurrentLocation size={20} />
                  </Button>
                </Tooltip>
              </Box>
            )}

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <Paper
                shadow="md"
                style={{
                  position: 'absolute',
                  top: 70,
                  left: 16,
                  right: 16,
                  zIndex: 10,
                  maxHeight: 200,
                  overflowY: 'auto',
                  backgroundColor: tokens.colors.bgSecondary,
                }}
              >
                {searchResults.map((result, index) => (
                  <Box
                    key={index}
                    p="sm"
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${tokens.colors.bgTertiary}` }}
                    onClick={() => handleSelectSearchResult(result)}
                  >
                    <Text size="sm">{result.place_name}</Text>
                  </Box>
                ))}
              </Paper>
            )}
          </Box>

          {/* Bottom Sheet with controls */}
          <BottomSheet
            peekContent={renderPeekContent()}
            peekHeight={100}
            expandedHeight="75vh"
          >
            {renderControls()}
          </BottomSheet>
        </Box>

        {/* Preferences Modal */}
        <PreferenceSettings opened={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
      </AppShell>
    );
  }

  // Desktop layout
  return (
    <AppShell fullWidth>
      <Box style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
        {/* Sidebar */}
        <Paper
          style={{
            width: 360,
            backgroundColor: tokens.colors.bgSecondary,
            borderRight: `1px solid ${tokens.colors.bgTertiary}`,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
          radius={0}
          p="md"
        >
          <Stack gap="md" style={{ flex: 1 }}>
            {/* Calendar Context Banner */}
            {calendarContext && (
              <Paper
                p="sm"
                style={{
                  backgroundColor: `${tokens.colors.electricLime}15`,
                  border: `1px solid ${tokens.colors.electricLime}`,
                }}
                radius="md"
              >
                <Group justify="space-between" align="flex-start">
                  <Group gap="xs">
                    <IconCalendar size={16} style={{ color: tokens.colors.electricLime }} />
                    <Box>
                      <Text size="xs" fw={600} style={{ color: tokens.colors.electricLime }}>
                        Creating route for scheduled workout
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                        {calendarContext.workoutName || calendarContext.workoutType} • {calendarContext.duration} min
                        {calendarContext.scheduledDate && ` • ${new Date(calendarContext.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
                      </Text>
                    </Box>
                  </Group>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={() => setCalendarContext(null)}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              </Paper>
            )}

            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                ROUTE NAME
              </Text>
              <TextInput
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                variant="filled"
                size="md"
              />
            </Box>

            <Divider label="AI Route Generator" labelPosition="center" />

            {/* Natural Language Input */}
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                DESCRIBE YOUR RIDE
              </Text>
              <Textarea
                placeholder="e.g., '40 mile gravel loop' or '2 hour recovery ride on bike paths'"
                value={naturalLanguageInput}
                onChange={(e) => setNaturalLanguageInput(e.target.value)}
                minRows={2}
                maxRows={3}
                size="sm"
                variant="filled"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleNaturalLanguageGenerate();
                  }
                }}
              />
              <Button
                onClick={handleNaturalLanguageGenerate}
                loading={generatingAI}
                leftSection={<IconSparkles size={16} />}
                color="lime"
                variant={calendarContext ? 'filled' : 'light'}
                size="xs"
                mt="xs"
                fullWidth
                style={calendarContext ? {
                  animation: 'pulse-glow 2s ease-in-out infinite',
                  boxShadow: `0 0 20px ${tokens.colors.electricLime}40`,
                } : undefined}
              >
                {calendarContext ? '✨ Generate Route for Workout' : 'Generate from Description'}
              </Button>
            </Box>

            {/* Pulse animation styles (desktop) */}
            <style>{`
              @keyframes pulse-glow {
                0%, 100% {
                  box-shadow: 0 0 5px ${tokens.colors.electricLime}40;
                  transform: scale(1);
                }
                50% {
                  box-shadow: 0 0 25px ${tokens.colors.electricLime}80;
                  transform: scale(1.02);
                }
              }
            `}</style>

            <Divider label="or configure manually" labelPosition="center" size="xs" />

            {/* Route Profile Selector */}
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                ROUTE PROFILE
              </Text>
              <SegmentedControl
                value={routeProfile}
                onChange={setRouteProfile}
                fullWidth
                size="xs"
                data={[
                  { label: '🚴 Road', value: 'road' },
                  { label: '🌲 Gravel', value: 'gravel' },
                  { label: '⛰️ MTB', value: 'mountain' },
                  { label: '🏙️ Commute', value: 'commuting' }
                ]}
                styles={{
                  root: { backgroundColor: tokens.colors.bgTertiary }
                }}
              />
            </Box>

            {/* AI Route Generation Controls */}
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                TRAINING GOAL
              </Text>
              <SegmentedControl
                value={trainingGoal}
                onChange={setTrainingGoal}
                fullWidth
                size="xs"
                data={[
                  { label: 'Recovery', value: 'recovery' },
                  { label: 'Endurance', value: 'endurance' },
                  { label: 'Intervals', value: 'intervals' },
                  { label: 'Hills', value: 'hills' }
                ]}
                styles={{
                  root: { backgroundColor: tokens.colors.bgTertiary }
                }}
              />
            </Box>

            <Group grow>
              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                  TIME (MIN)
                </Text>
                <NumberInput
                  value={timeAvailable}
                  onChange={setTimeAvailable}
                  min={15}
                  max={480}
                  step={15}
                  size="sm"
                  variant="filled"
                />
              </Box>

              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                  ROUTE TYPE
                </Text>
                <Select
                  value={routeType}
                  onChange={setRouteType}
                  size="sm"
                  variant="filled"
                  data={[
                    { value: 'loop', label: 'Loop' },
                    { value: 'out_back', label: 'Out & Back' },
                    { value: 'point_to_point', label: 'Point to Point' }
                  ]}
                />
              </Box>
            </Group>

            {/* Workout Selection for Color-Coded Routes */}
            <Box>
              <Group justify="space-between" mb="xs">
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                  WORKOUT (OPTIONAL)
                </Text>
                <Tooltip label="Route Preferences">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => setPreferencesOpen(true)}
                  >
                    <IconSettings size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Select
                placeholder="Select a workout for color-coded route..."
                value={selectedWorkout?.id || null}
                onChange={(value) => {
                  if (value) {
                    const workout = WORKOUT_LIBRARY[value];
                    setSelectedWorkout(workout);
                    // Auto-set time available from workout duration
                    if (workout.duration) {
                      setTimeAvailable(workout.duration);
                      console.log(`⏱️ Set time available to workout duration: ${workout.duration} min`);
                    }
                  } else {
                    setSelectedWorkout(null);
                    setIntervalCues(null);
                  }
                }}
                clearable
                size="sm"
                variant="filled"
                data={workoutOptions}
              />
              {selectedWorkout && (
                <Text size="xs" c="dimmed" mt="xs">
                  Route will show color-coded segments for: {selectedWorkout.name}
                </Text>
              )}
            </Box>

            <Button
              onClick={handleGenerateAIRoutes}
              loading={generatingAI}
              leftSection={<IconSparkles size={18} />}
              color="lime"
              fullWidth
            >
              {generatingAI ? 'Generating Routes...' : 'Generate AI Routes'}
            </Button>

            {/* AI Suggestions Display */}
            {aiSuggestions.length > 0 && (
              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                  AI SUGGESTIONS ({aiSuggestions.length})
                </Text>
                <Stack gap="xs" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {aiSuggestions.map((suggestion, index) => (
                    <Card
                      key={index}
                      padding="sm"
                      style={{
                        backgroundColor: tokens.colors.bgTertiary,
                        cursor: convertingRoute !== null ? 'wait' : 'pointer',
                        border: `1px solid ${convertingRoute === index ? tokens.colors.electricLime : tokens.colors.bgPrimary}`,
                        transition: 'all 0.2s',
                        opacity: convertingRoute !== null && convertingRoute !== index ? 0.5 : 1
                      }}
                      onClick={() => convertingRoute === null && handleSelectAISuggestion(suggestion, index)}
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" align="flex-start">
                          <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary, flex: 1 }}>
                            {suggestion.name}
                          </Text>
                          <Badge
                            size="xs"
                            color={
                              suggestion.difficulty === 'easy' ? 'green' :
                              suggestion.difficulty === 'moderate' ? 'yellow' :
                              'red'
                            }
                          >
                            {suggestion.difficulty}
                          </Badge>
                        </Group>
                        <Text size="xs" style={{ color: tokens.colors.textSecondary }} lineClamp={2}>
                          {suggestion.description}
                        </Text>
                        <Group gap="xs">
                          <Badge variant="outline" size="xs">
                            {suggestion.distance} km
                          </Badge>
                          {suggestion.elevationGain > 0 && (
                            <Badge variant="outline" size="xs">
                              {suggestion.elevationGain}m ↗
                            </Badge>
                          )}
                          <Badge variant="light" size="xs" color="lime">
                            {suggestion.estimatedTime}min
                          </Badge>
                        </Group>
                        <Button
                          size="xs"
                          variant="light"
                          color="lime"
                          leftSection={convertingRoute === index ? <Loader size={14} /> : <IconRoute size={14} />}
                          fullWidth
                          disabled={convertingRoute !== null}
                          loading={convertingRoute === index}
                        >
                          {convertingRoute === index ? 'Converting...' : 'Select & Generate Route'}
                        </Button>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}

            <Divider />

            {/* Route Stats */}
            <Box
              style={{
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.bgTertiary,
                borderRadius: tokens.radius.md,
              }}
            >
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Distance
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {formatDist(routeStats.distance)}
                </Text>
              </Group>
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Elevation
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {routeStats.elevation > 0 ? `${formatElev(routeStats.elevation)} ↗` : '--'}
                </Text>
              </Group>
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Est. Time
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {routeStats.duration > 0 ? `${Math.floor(routeStats.duration / 60)}h ${routeStats.duration % 60}m` : '--:--'}
                </Text>
              </Group>
              {routingSource && (
                <Group justify="space-between">
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Powered by
                  </Text>
                  <Tooltip label={getRoutingSourceLabel(routingSource)}>
                    <Badge size="xs" variant="light" color="blue">
                      {routingSource === 'stadia_maps' ? 'Valhalla' :
                       routingSource === 'brouter' || routingSource === 'brouter_gravel' ? 'BRouter' :
                       'Mapbox'}
                    </Badge>
                  </Tooltip>
                </Group>
              )}
              {speedProfile && (
                <Group justify="space-between">
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Your Speed
                  </Text>
                  <Tooltip label={`Based on ${speedProfile.rides_analyzed} Strava rides`}>
                    <Badge size="xs" variant="light" color="lime">
                      {formatSpd(getUserSpeedForProfile(routeProfile) || speedProfile.average_speed)}
                    </Badge>
                  </Tooltip>
                </Group>
              )}
            </Box>

            {/* Weather Widget - Shows current conditions and wind analysis */}
            {userLocation && (
              <WeatherWidget
                latitude={userLocation.latitude}
                longitude={userLocation.longitude}
                coordinates={routeGeometry?.coordinates}
                isImperial={isImperial}
                showWindAnalysis={routeGeometry?.coordinates?.length >= 2}
                onWeatherUpdate={setWeatherData}
              />
            )}

            {/* Interval Cues Display (when workout selected) */}
            {intervalCues && intervalCues.length > 0 && (
              <IntervalCues cues={intervalCues} formatDistance={formatDist} />
            )}

            {/* Instructions */}
            <Box style={{ flex: 1 }}>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="sm">
                INSTRUCTIONS
              </Text>
              <Stack gap="xs">
                <Text style={{ color: tokens.colors.textSecondary }} size="sm">
                  {waypoints.length === 0 ? '📍 Click on the map to add your first waypoint' :
                   waypoints.length === 1 ? '📍 Add another waypoint to create a route' :
                   `✅ Route created! ${isCalculating ? 'Calculating...' : ''}`}
                </Text>
                {waypoints.length > 0 && (
                  <Text style={{ color: tokens.colors.textMuted }} size="xs">
                    Click waypoint markers to remove them
                  </Text>
                )}
              </Stack>
            </Box>

            {/* Actions */}
            <Stack gap="sm">
              <Button
                color="lime"
                fullWidth
                disabled={!routeGeometry}
                onClick={handleSaveRoute}
                loading={isSaving}
                leftSection={<IconDeviceFloppy size={18} />}
              >
                {savedRouteId ? 'Update Route' : 'Save Route'}
              </Button>
              <Group grow>
                <Button
                  variant="light"
                  color="lime"
                  disabled={!routeGeometry}
                  onClick={exportGPX}
                >
                  Export GPX
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  disabled={!routeGeometry && waypoints.length === 0}
                  onClick={clearRoute}
                >
                  Clear
                </Button>
              </Group>
            </Stack>
          </Stack>
        </Paper>

        {/* Map Container */}
        <Box style={{ flex: 1, position: 'relative' }}>
          {/* Search Bar and Location Button */}
          {MAPBOX_TOKEN && (
            <Box
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                right: 16,
                zIndex: 10,
                display: 'flex',
                gap: 8,
                maxWidth: 500,
              }}
            >
              <Box style={{ flex: 1, position: 'relative' }}>
                <TextInput
                  placeholder="Search for an address or place..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleAddressSearch(e.target.value);
                  }}
                  leftSection={<IconSearch size={16} />}
                  rightSection={
                    searchQuery ? (
                      <IconX
                        size={16}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                      />
                    ) : isSearching ? (
                      <Loader size={14} />
                    ) : null
                  }
                  styles={{
                    input: {
                      backgroundColor: tokens.colors.bgSecondary,
                      borderColor: tokens.colors.bgTertiary,
                      '&:focus': {
                        borderColor: tokens.colors.electricLime,
                      },
                    },
                  }}
                />
                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <Paper
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      backgroundColor: tokens.colors.bgSecondary,
                      border: `1px solid ${tokens.colors.bgTertiary}`,
                      borderRadius: tokens.radius.sm,
                      overflow: 'hidden',
                      zIndex: 20,
                    }}
                  >
                    {searchResults.map((result) => (
                      <Box
                        key={result.id}
                        onClick={() => handleSelectSearchResult(result)}
                        style={{
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderBottom: `1px solid ${tokens.colors.bgTertiary}`,
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = tokens.colors.bgTertiary;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
                          {result.name}
                        </Text>
                      </Box>
                    ))}
                  </Paper>
                )}
              </Box>
              <Tooltip label="My Location">
                <Button
                  variant="filled"
                  color="lime"
                  size="md"
                  onClick={handleGeolocate}
                  loading={isLocating}
                  style={{ padding: '0 12px' }}
                >
                  <IconCurrentLocation size={20} />
                </Button>
              </Tooltip>
            </Box>
          )}

          {MAPBOX_TOKEN ? (
            <Map
              ref={mapRef}
              {...viewport}
              onMove={evt => setViewport(evt.viewState)}
              onClick={handleMapClick}
              mapStyle="mapbox://styles/mapbox/outdoors-v12"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              cursor="crosshair"
            >
              {/* Render colored route segments when workout is selected */}
              {coloredSegments && (
                <Source key={routeName || 'colored-route'} id="colored-route" type="geojson" data={coloredSegments}>
                  <Layer
                    id="route-colored"
                    type="line"
                    paint={{
                      'line-color': ['get', 'color'],
                      'line-width': 6,
                      'line-opacity': 0.9
                    }}
                  />
                </Source>
              )}

              {/* Render route line (shown when no workout selected, or as outline) */}
              {routeGeoJSON && !coloredSegments && (
                <Source key={routeName || 'route'} id="route" type="geojson" data={routeGeoJSON}>
                  <Layer
                    id="route-line"
                    type="line"
                    paint={{
                      'line-color': tokens.colors.electricLime,
                      'line-width': 4,
                      'line-opacity': 0.8
                    }}
                  />
                </Source>
              )}

              {/* Render user location marker */}
              {userLocation && (
                <Marker
                  longitude={userLocation.longitude}
                  latitude={userLocation.latitude}
                  anchor="center"
                >
                  <div style={{
                    width: 16,
                    height: 16,
                    backgroundColor: '#3b82f6',
                    borderRadius: '50%',
                    border: '3px solid white',
                    boxShadow: '0 0 0 2px #3b82f6, 0 2px 8px rgba(59, 130, 246, 0.5)',
                  }} />
                </Marker>
              )}

              {/* Render waypoint markers */}
              {waypoints.map((waypoint, index) => (
                <Marker
                  key={waypoint.id}
                  longitude={waypoint.lng}
                  latitude={waypoint.lat}
                  anchor="bottom"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    removeWaypoint(waypoint.id);
                  }}
                >
                  <div style={{
                    backgroundColor: index === 0 ? '#22c55e' : index === waypoints.length - 1 ? '#ef4444' : tokens.colors.electricLime,
                    color: 'white',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    {index === 0 ? 'S' : index === waypoints.length - 1 ? 'E' : index + 1}
                  </div>
                </Marker>
              ))}
            </Map>
          ) : (
            <Box
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: tokens.colors.bgPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Stack align="center" gap="md">
                <Text size="4rem">🗺️</Text>
                <Title order={2} style={{ color: tokens.colors.textPrimary }}>
                  Map Configuration Required
                </Title>
                <Text style={{ color: tokens.colors.textSecondary, maxWidth: 400, textAlign: 'center' }}>
                  Configure VITE_MAPBOX_TOKEN in your .env file to enable the map.
                </Text>
              </Stack>
            </Box>
          )}
        </Box>
      </Box>

      {/* Preferences Modal */}
      <PreferenceSettings
        opened={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
      />

      {/* Elevation Profile - Fixed at bottom of screen */}
      {routeGeometry?.coordinates && routeGeometry.coordinates.length > 1 && (
        <ElevationProfile
          coordinates={routeGeometry.coordinates}
          totalDistance={routeStats.distance}
          isImperial={isImperial}
        />
      )}
    </AppShell>
  );
}

// GPX generation helper
function generateGPX(name, coordinates) {
  const points = coordinates.map(([lng, lat]) => {
    return `    <trkpt lat="${lat}" lon="${lng}">
      <ele>0</ele>
    </trkpt>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="tribos.studio" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

export default RouteBuilder;
