import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Paper, Stack, Title, Text, Button, Group, TextInput, Textarea, SegmentedControl, NumberInput, Select, Card, Badge, Divider, Loader, Tooltip, ActionIcon, Modal, Menu, Switch } from '@mantine/core';
import { useMediaQuery, useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSparkles, IconRoute, IconDeviceFloppy, IconCurrentLocation, IconSearch, IconX, IconSettings, IconCalendar, IconRobot, IconAdjustments, IconDownload, IconTrash, IconRefresh, IconMap, IconBike, IconRefreshDot, IconScissors, IconBrain, IconFolderOpen, IconHandClick, IconRoad, IconPencil, IconMountain, IconHeartRateMonitor, IconMapPin } from '@tabler/icons-react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import { generateAIRoutes, generateSmartWaypoints } from '../utils/aiRouteGenerator';
import { generateIterativeRoute, generateIterativeRouteVariations } from '../utils/iterativeRouteBuilder';
import { getSmartCyclingRoute, getRoutingSourceLabel } from '../utils/smartCyclingRouter';
import { buildNaturalLanguagePrompt, parseNaturalLanguageResponse } from '../utils/naturalLanguagePrompt';
import { geocodeWaypoint } from '../utils/geocoding';
import { scoreRoutePreference, getFamiliarLoopWaypoints } from '../utils/routeScoring';
import { useAuth } from '../contexts/AuthContext.jsx';
import { stravaService } from '../utils/stravaService';
import { saveRoute, getRoute } from '../utils/routesService';
import FloatingRouteSettings, { RouteSettingsButton } from '../components/FloatingRouteSettings.jsx';
import IntervalCues from '../components/IntervalCues.jsx';
import ElevationProfile from '../components/ElevationProfile.jsx';
import WeatherWidget from '../components/WeatherWidget.jsx';
import { WORKOUT_LIBRARY } from '../data/workoutLibrary';
import { generateCuesFromWorkoutStructure, createColoredRouteSegments } from '../utils/intervalCues';
import { detectRouteClick, findNearestPointOnRoute, findSegmentToRemove, removeSegmentAndReroute, getSegmentHighlight, getRemovalStats } from '../utils/routeEditor';
import { getElevationData, calculateElevationStats, calculateCumulativeDistances } from '../utils/elevation';
import { formatDistance, formatElevation, formatSpeed } from '../utils/units';
import { createGradientRoute, GRADE_COLORS } from '../utils/routeGradient';
import { fetchRouteSurfaceData, createSurfaceRoute, computeSurfaceDistribution, SURFACE_COLORS, SURFACE_LABELS } from '../utils/surfaceOverlay';
import { supabase } from '../lib/supabase';
import { useRouteBuilderStore, useRouteBuilderHydrated } from '../stores/routeBuilderStore';
import CollapsibleSection from '../components/CollapsibleSection.jsx';
import StepIndicator from '../components/StepIndicator.jsx';
import DifficultyBadge from '../components/DifficultyBadge.jsx';
import RouteStatsPanel from '../components/RouteStatsPanel.jsx';
import AISuggestionCard from '../components/AISuggestionCard.jsx';
import MapTutorialOverlay from '../components/MapTutorialOverlay.jsx';
import BikeInfrastructureLayer from '../components/BikeInfrastructureLayer.jsx';
import BikeInfrastructureLegend from '../components/BikeInfrastructureLegend.jsx';
import { fetchBikeInfrastructure } from '../utils/bikeInfrastructureService';
import RouteExportMenu from '../components/RouteExportMenu.jsx';
import MapControls from '../components/MapControls.jsx';
import { FuelCard } from '../components/fueling';
import TirePressureCalculator from '../components/TirePressureCalculator.jsx';
import RoadPreferencesCard from '../components/settings/RoadPreferencesCard.jsx';
import SavedRoutesDrawer from '../components/SavedRoutesDrawer.jsx';
import ModeSelector from '../components/RouteBuilder/ModeSelector.jsx';
import WaypointList from '../components/RouteBuilder/WaypointList.jsx';
import useRouteManipulation from '../hooks/useRouteManipulation';
import { parseGpxFile } from '../utils/gpxParser';
import { calculatePersonalizedETA } from '../utils/personalizedETA';
import { queryPOIsAlongRoute, POI_CATEGORIES } from '../utils/routePOIService';
import RoutePOILayer from '../components/RouteBuilder/RoutePOILayer.jsx';
import POIPanel from '../components/RouteBuilder/POIPanel.jsx';
import { IconArrowsExchange } from '@tabler/icons-react';

// Shared constants — single source of truth in components/RouteBuilder/index.js
import { MAPBOX_TOKEN, BASEMAP_STYLES, CYCLOSM_STYLE } from '../components/RouteBuilder';

function RouteBuilder() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Access token for road segment scoring
  const [accessToken, setAccessToken] = useState(null);
  useEffect(() => {
    const getToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAccessToken(session?.access_token || null);
    };
    if (user) {
      getToken();
    }
  }, [user]);

  // === Persisted State (from Zustand store) ===
  const {
    routeGeometry, setRouteGeometry,
    routeName, setRouteName,
    routeStats, setRouteStats,
    waypoints, setWaypoints,
    viewport, setViewport,
    trainingGoal, setTrainingGoal,
    timeAvailable, setTimeAvailable,
    routeType, setRouteType,
    routeProfile, setRouteProfile,
    explicitDistanceKm, setExplicitDistanceKm,
    aiSuggestions, setAiSuggestions,
    selectedWorkoutId, setSelectedWorkoutId,
    routingSource, setRoutingSource,
    snapToRoads, setSnapToRoads,
    builderMode, setBuilderMode,
    clearRoute,
    resetAll,
  } = useRouteBuilderStore();

  // Check if store has been hydrated from localStorage
  const storeHydrated = useRouteBuilderHydrated();

  // Auto-detect builder mode on mount: if loading a saved route, go to editing;
  // if there's already a route geometry from a previous session, go to editing.
  useEffect(() => {
    if (!storeHydrated) return;
    if (routeId) {
      // Loading a saved route → editing mode
      setBuilderMode('editing');
    } else if (routeGeometry?.coordinates?.length > 0) {
      // Persisted route from last session → editing mode
      setBuilderMode('editing');
    }
    // Otherwise keep whatever mode was persisted (or 'ready' default)
  }, [storeHydrated, routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve selectedWorkout from ID
  const selectedWorkout = selectedWorkoutId ? WORKOUT_LIBRARY[selectedWorkoutId] : null;
  const setSelectedWorkout = useCallback((workout) => {
    setSelectedWorkoutId(workout?.id || null);
  }, [setSelectedWorkoutId]);

  // === Transient State (not persisted) ===
  // Saved routes drawer
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);
  // Calendar context state (when navigating from training calendar)
  const [calendarContext, setCalendarContext] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const mapRef = useRef();
  const isEditing = !!routeId;

  // AI Route Generation transient state
  const [generatingAI, setGeneratingAI] = useState(false);
  const [convertingRoute, setConvertingRoute] = useState(null); // Index of suggestion being converted
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  // Iterative route builder - persisted to localStorage, enabled by default
  const [useIterativeBuilder, setUseIterativeBuilder] = useLocalStorage({
    key: 'tribos-route-builder-iterative',
    defaultValue: true,
  });

  // Speed profile from Strava sync (fetched fresh)
  const [speedProfile, setSpeedProfile] = useState(null);

  // Preferences modal state
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Road preferences modal state
  const [roadPreferencesOpen, setRoadPreferencesOpen] = useState(false);

  // Interval cues (derived from selectedWorkout)
  const [intervalCues, setIntervalCues] = useState(null);

  // Toggle to show/hide workout color overlay on route
  const [showWorkoutOverlay, setShowWorkoutOverlay] = useState(true);

  // Units preference state
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const isImperial = unitsPreference === 'imperial';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);
  const formatSpd = (kmh) => formatSpeed(kmh, isImperial);

  // Route editing state
  const [editMode, setEditMode] = useState(false);
  const [elevationProfileData, setElevationProfileData] = useState([]);
  const [elevationHoverPosition, setElevationHoverPosition] = useState(null); // For elevation chart hover marker
  const [selectedSegment, setSelectedSegment] = useState(null); // { startIndex, endIndex, stats }
  const [isRemovingSegment, setIsRemovingSegment] = useState(false);

  // Track drag state to suppress click-to-remove during drag
  const waypointDragRef = useRef(false);

  // Manual editing tools (undo/redo, reverse, snap-to-roads)
  const {
    undo: manualUndo,
    redo: manualRedo,
    canUndo: manualCanUndo,
    canRedo: manualCanRedo,
    reverseRoute: manualReverse,
    snapToRoads: manualSnapToRoads,
    updateWaypointPosition,
  } = useRouteManipulation({
    waypoints,
    setWaypoints,
    routeGeometry,
    setRouteGeometry,
    routeStats,
    setRouteStats,
    elevationProfile: elevationProfileData,
    setElevationProfile: setElevationProfileData,
    routingProfile: routeProfile,
    useSmartRouting: true,
  });

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

  // Tutorial overlay state
  const [showTutorial, setShowTutorial] = useLocalStorage({
    key: 'tribos-route-builder-tutorial-shown',
    defaultValue: true,
  });

  // Basemap style state (persisted to localStorage)
  const [mapStyleId, setMapStyleId] = useLocalStorage({
    key: 'tribos-route-builder-basemap',
    defaultValue: 'dark',
  });
  const currentMapStyle = BASEMAP_STYLES.find(s => s.id === mapStyleId)?.style || BASEMAP_STYLES[1].style;

  // Bike infrastructure overlay state
  const [showBikeInfrastructure, setShowBikeInfrastructure] = useLocalStorage({
    key: 'tribos-route-builder-bike-infrastructure',
    defaultValue: false,
  });
  const [infrastructureData, setInfrastructureData] = useState(null);
  const [infrastructureLoading, setInfrastructureLoading] = useState(false);
  const infrastructureFetchTimeout = useRef(null);

  // Smart POIs along route (Phase 3.2)
  const [showPOIs, setShowPOIs] = useState(false);
  const [poiData, setPOIData] = useState([]);
  const [poiLoading, setPOILoading] = useState(false);
  const [poiCategories, setPOICategories] = useState(
    () => new Set(Object.keys(POI_CATEGORIES))
  );
  const [selectedPOI, setSelectedPOI] = useState(null);

  // Step indicator - determine current step based on form state
  const wizardSteps = useMemo(() => [
    { id: 1, label: 'Describe', icon: '📝' },
    { id: 2, label: 'Configure', icon: '⚙️' },
    { id: 3, label: 'Route', icon: '🗺️' },
    { id: 4, label: 'Save', icon: '💾' },
  ], []);

  // Calculate current wizard step based on state
  const currentWizardStep = useMemo(() => {
    if (savedRouteId) return 3; // Saved
    if (routeGeometry) return 2; // Route created
    if (naturalLanguageInput || routeName !== 'Untitled Route') return 1; // Configured
    return 0; // Just starting
  }, [savedRouteId, routeGeometry, naturalLanguageInput, routeName]);

  // viewport comes from the store (persisted)

  // Generate colored route segments when workout is selected and overlay is enabled
  const coloredSegments = useMemo(() => {
    // Only show colored segments if overlay is enabled AND workout is selected
    if (!routeGeometry?.coordinates || !selectedWorkout || !showWorkoutOverlay) {
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
  }, [routeGeometry, selectedWorkout, routeStats.distance, showWorkoutOverlay]);

  // Memoize route GeoJSON to prevent re-creating on every map move/render
  const routeGeoJSON = useMemo(() => {
    if (!routeGeometry) return null;
    return { type: 'Feature', geometry: routeGeometry };
  }, [routeGeometry]);

  // Gradient-colored route (slope-based coloring) — toggle state
  const [showGradient, setShowGradient] = useLocalStorage({
    key: 'tribos-route-gradient',
    defaultValue: false,
  });

  // Compute gradient route GeoJSON from elevation data
  const gradientRouteGeoJSON = useMemo(() => {
    if (!showGradient || !routeGeometry?.coordinates || !elevationProfileData?.length) return null;
    return createGradientRoute(routeGeometry.coordinates, elevationProfileData);
  }, [showGradient, routeGeometry, elevationProfileData]);

  // Surface type overlay
  const [showSurface, setShowSurface] = useLocalStorage({
    key: 'tribos-route-surface',
    defaultValue: false,
  });
  const [surfaceSegments, setSurfaceSegments] = useState(null);
  const [surfaceLoading, setSurfaceLoading] = useState(false);
  const surfaceRouteRef = useRef(null); // cache: coordinates hash → surfaceSegments

  // Fetch surface data when toggled on and route changes
  useEffect(() => {
    if (!showSurface || !routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
      return;
    }
    // Simple cache key: first + last coordinate + length
    const coords = routeGeometry.coordinates;
    const cacheKey = `${coords[0][0].toFixed(4)},${coords[0][1].toFixed(4)}_${coords.length}`;
    if (surfaceRouteRef.current?.key === cacheKey) return; // already fetched

    let cancelled = false;
    setSurfaceLoading(true);
    fetchRouteSurfaceData(coords).then(data => {
      if (cancelled) return;
      setSurfaceSegments(data);
      surfaceRouteRef.current = { key: cacheKey, data };
      setSurfaceLoading(false);
    }).catch(() => {
      if (!cancelled) setSurfaceLoading(false);
    });
    return () => { cancelled = true; };
  }, [showSurface, routeGeometry]);

  // Build surface GeoJSON FeatureCollection
  const surfaceRouteGeoJSON = useMemo(() => {
    if (!showSurface || !surfaceSegments || !routeGeometry?.coordinates) return null;
    return createSurfaceRoute(routeGeometry.coordinates, surfaceSegments);
  }, [showSurface, surfaceSegments, routeGeometry]);

  // Surface distribution for summary bar
  const surfaceDistribution = useMemo(() => {
    if (!surfaceSegments) return null;
    return computeSurfaceDistribution(surfaceSegments);
  }, [surfaceSegments]);

  // Personalized ETA: terrain- and fitness-aware ride time
  const personalizedETA = useMemo(() => {
    if (!routeStats?.distance || routeStats.distance <= 0) return null;
    if (!elevationProfileData || elevationProfileData.length < 2) return null;
    return calculatePersonalizedETA({
      distanceKm: routeStats.distance,
      elevationProfile: elevationProfileData,
      surfaceDistribution: surfaceDistribution,
      speedProfile: speedProfile,
      routeProfile: routeProfile,
      trainingGoal: trainingGoal,
    });
  }, [routeStats?.distance, elevationProfileData, surfaceDistribution, speedProfile, routeProfile, trainingGoal]);

  // Memoize segment highlight GeoJSON for edit mode
  const segmentHighlightGeoJSON = useMemo(() => {
    if (!selectedSegment || !routeGeometry?.coordinates) return null;
    return getSegmentHighlight(
      routeGeometry.coordinates,
      selectedSegment.startIndex,
      selectedSegment.endIndex
    );
  }, [selectedSegment, routeGeometry]);

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

  // Geolocate user on mount (after store hydration)
  // Track if we've already attempted geolocation this session
  const hasGeolocatedRef = useRef(false);

  useEffect(() => {
    // Wait for store hydration to complete before geolocating
    if (!storeHydrated) return;
    if (routeId) return; // Don't geolocate if loading existing route
    if (hasGeolocatedRef.current) return; // Only attempt once per session

    if (!navigator.geolocation) {
      console.log('Geolocation not supported');
      hasGeolocatedRef.current = true;
      return;
    }

    hasGeolocatedRef.current = true;
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
  }, [storeHydrated, routeId, setViewport]);

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

  // Fetch bike infrastructure when map moves and overlay is enabled
  const fetchInfrastructureForViewport = useCallback(async () => {
    if (!showBikeInfrastructure || mapStyleId === 'cyclosm') {
      // Don't fetch if disabled or using CyclOSM (already has bike styling)
      return;
    }

    const map = mapRef.current?.getMap();
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    // Only fetch at reasonable zoom levels (avoid fetching too much data)
    const zoom = map.getZoom();
    if (zoom < 11) {
      setInfrastructureData(null);
      return;
    }

    setInfrastructureLoading(true);
    try {
      const data = await fetchBikeInfrastructure({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
      setInfrastructureData(data);
    } catch (error) {
      console.error('Failed to fetch bike infrastructure:', error);
    } finally {
      setInfrastructureLoading(false);
    }
  }, [showBikeInfrastructure, mapStyleId]);

  // Debounced infrastructure fetch on viewport change
  useEffect(() => {
    if (!showBikeInfrastructure || mapStyleId === 'cyclosm') {
      setInfrastructureData(null);
      return;
    }

    // Clear any pending timeout
    if (infrastructureFetchTimeout.current) {
      clearTimeout(infrastructureFetchTimeout.current);
    }

    // Debounce the fetch
    infrastructureFetchTimeout.current = setTimeout(() => {
      fetchInfrastructureForViewport();
    }, 500);

    return () => {
      if (infrastructureFetchTimeout.current) {
        clearTimeout(infrastructureFetchTimeout.current);
      }
    };
  }, [viewport, showBikeInfrastructure, mapStyleId, fetchInfrastructureForViewport]);

  // Fetch POIs along route when toggle is on and route changes
  useEffect(() => {
    if (!showPOIs || !routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
      setPOIData([]);
      return;
    }

    let cancelled = false;
    const fetchPOIs = async () => {
      setPOILoading(true);
      try {
        const pois = await queryPOIsAlongRoute(
          routeGeometry.coordinates,
          Array.from(poiCategories),
          0.5, // 500m corridor
        );
        if (!cancelled) setPOIData(pois);
      } catch (err) {
        console.error('POI fetch failed:', err);
      } finally {
        if (!cancelled) setPOILoading(false);
      }
    };

    fetchPOIs();
    return () => { cancelled = true; };
  }, [showPOIs, routeGeometry, poiCategories]);

  // Calculate route — either via smart routing (snap) or direct lines (freehand)
  const calculateRoute = useCallback(async (points) => {
    if (points.length < 2) {
      setRouteGeometry(null);
      setRouteStats({ distance: 0, elevation: 0, duration: 0 });
      return;
    }

    setIsCalculating(true);
    try {
      const waypointCoordinates = points.map(p => p.position);

      if (!snapToRoads) {
        // Freehand mode: connect waypoints with straight lines
        const coordinates = waypointCoordinates;
        // Calculate straight-line distance (haversine)
        let totalDistance = 0;
        for (let i = 1; i < coordinates.length; i++) {
          const [lon1, lat1] = coordinates[i - 1];
          const [lon2, lat2] = coordinates[i];
          const R = 6371000;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        setRouteGeometry({ type: 'LineString', coordinates });
        setRouteStats({
          distance: parseFloat((totalDistance / 1000).toFixed(1)),
          elevation: 0,
          duration: 0,
          routingSource: 'freehand',
        });
        setRoutingSource('freehand');

        // Fetch elevation for the freehand line
        const elevation = await getElevationData(coordinates);
        if (elevation) {
          setElevationProfileData(elevation);
          const elevStats = calculateElevationStats(elevation);
          setRouteStats(prev => ({ ...prev, ...elevStats }));
        }

        console.log(`✏️ Freehand route: ${(totalDistance / 1000).toFixed(1)}km`);
        return;
      }

      // Snap-to-roads: smart multi-provider routing (Stadia/BRouter/Mapbox)
      const smartRoute = await getSmartCyclingRoute(waypointCoordinates, {
        profile: routeProfile === 'gravel' ? 'gravel' :
                 routeProfile === 'mountain' ? 'mountain' : 'bike',
        mapboxToken: MAPBOX_TOKEN,
      });

      if (smartRoute?.coordinates?.length > 0) {
        setRouteGeometry({
          type: 'LineString',
          coordinates: smartRoute.coordinates,
        });
        setRouteStats({
          distance: parseFloat(((smartRoute.distance || 0) / 1000).toFixed(1)), // meters → km
          elevation: smartRoute.elevationGain || 0,
          duration: Math.round((smartRoute.duration || 0) / 60), // seconds → minutes
          routingSource: smartRoute.source || 'smart',
        });
        setRoutingSource(smartRoute.source || 'smart');

        // Fetch elevation profile data for gradient overlay and elevation chart
        getElevationData(smartRoute.coordinates).then(elevation => {
          if (elevation) {
            setElevationProfileData(elevation);
            const elevStats = calculateElevationStats(elevation);
            setRouteStats(prev => ({ ...prev, ...elevStats }));
          }
        }).catch(err => console.warn('Elevation fetch failed:', err));

        console.log(`✅ Smart route via ${smartRoute.source}: ${((smartRoute.distance || 0) / 1000).toFixed(1)}km`);
      } else {
        console.warn('Smart routing returned no results');
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setIsCalculating(false);
    }
  }, [routeProfile, snapToRoads, setRouteGeometry, setRouteStats, setRoutingSource]);

  // Recalculate route when snap-to-roads mode changes
  useEffect(() => {
    if (waypoints.length >= 2) {
      calculateRoute(waypoints);
    }
  }, [snapToRoads]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle map click - either add waypoint or select segment in edit mode
  const handleMapClick = useCallback((event) => {
    const { lng, lat } = event.lngLat;

    // If in edit mode and we have a route, check for route click
    if (editMode && routeGeometry?.coordinates) {
      const routeClick = detectRouteClick(routeGeometry.coordinates, { lng, lat }, 100);

      if (routeClick) {
        // Found a click on the route - find segment to remove
        const segment = findSegmentToRemove(routeGeometry.coordinates, routeClick.index);

        if (segment) {
          const stats = getRemovalStats(
            routeGeometry.coordinates,
            segment.startIndex,
            segment.endIndex
          );

          setSelectedSegment({
            ...segment,
            stats
          });

          console.log('📍 Selected segment for removal:', {
            indices: `${segment.startIndex} - ${segment.endIndex}`,
            savings: stats ? `${stats.distanceSaved}m` : 'unknown'
          });
        } else {
          notifications.show({
            title: 'No segment detected',
            message: 'Click closer to a tangent or spur to select it',
            color: 'yellow'
          });
        }
        return; // Don't add waypoint in edit mode
      } else {
        // Clicked away from route - deselect segment
        setSelectedSegment(null);
        return;
      }
    }

    // Only allow waypoint placement in manual or editing mode
    if (builderMode === 'ready') return;

    // If we have an existing route with 2+ waypoints, check if click is on the route
    // to insert a control point between existing waypoints
    if (routeGeometry?.coordinates && waypoints.length >= 2) {
      const routeClick = detectRouteClick(routeGeometry.coordinates, { lng, lat }, 80);
      if (routeClick) {
        // Determine which waypoint pair this click falls between.
        // Find the nearest waypoint to each side of the clicked index by checking
        // which existing waypoint positions are closest in the route coordinate space.
        const clickIdx = routeClick.index;
        const coords = routeGeometry.coordinates;

        // For each waypoint, find its closest index in the route coordinates
        const wpIndices = waypoints.map(wp => {
          let bestIdx = 0, bestDist = Infinity;
          for (let i = 0; i < coords.length; i++) {
            const d = Math.abs(coords[i][0] - wp.position[0]) + Math.abs(coords[i][1] - wp.position[1]);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
          return bestIdx;
        });

        // Find the insertion index: the first waypoint whose route index is after the click
        let insertAfter = 0;
        for (let i = 0; i < wpIndices.length - 1; i++) {
          if (clickIdx >= wpIndices[i]) insertAfter = i;
        }

        const newWaypoint = {
          id: `wp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          position: [lng, lat],
          type: 'waypoint',
          name: `Waypoint ${insertAfter + 1}`,
        };

        const newWaypoints = [...waypoints];
        newWaypoints.splice(insertAfter + 1, 0, newWaypoint);
        // Re-type all waypoints
        newWaypoints.forEach((wp, i) => {
          if (i === 0) wp.type = 'start';
          else if (i === newWaypoints.length - 1) wp.type = 'end';
          else wp.type = 'waypoint';
        });
        setWaypoints(newWaypoints);
        calculateRoute(newWaypoints);
        console.log(`📌 Inserted waypoint between index ${insertAfter} and ${insertAfter + 1}`);
        return;
      }
    }

    // No route hit — append waypoint at end
    const newWaypoint = {
      id: `wp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      position: [lng, lat],
      type: waypoints.length === 0 ? 'start' : 'end',
      name: waypoints.length === 0 ? 'Start' : `Waypoint ${waypoints.length}`,
    };
    const newWaypoints = [...waypoints];
    if (newWaypoints.length > 0) {
      // Re-type previous endpoint as a through-waypoint
      newWaypoints[newWaypoints.length - 1] = {
        ...newWaypoints[newWaypoints.length - 1],
        type: 'waypoint',
      };
    }
    newWaypoints.push(newWaypoint);
    setWaypoints(newWaypoints);
    calculateRoute(newWaypoints);
  }, [waypoints, calculateRoute, editMode, routeGeometry, builderMode]);

  // Remove waypoint (suppressed during drag)
  const removeWaypoint = useCallback((id) => {
    if (waypointDragRef.current) return; // Don't remove on drag-end click
    const newWaypoints = waypoints.filter(w => w.id !== id);
    setWaypoints(newWaypoints);
    calculateRoute(newWaypoints);
  }, [waypoints, calculateRoute]);

  // Reorder waypoints — swap fromIndex ↔ toIndex, re-type start/end, recalculate
  const reorderWaypoints = useCallback((fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= waypoints.length) return;
    const reordered = [...waypoints];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    // Re-assign types
    reordered.forEach((wp, i) => {
      if (i === 0) { wp.type = 'start'; wp.name = 'Start'; }
      else if (i === reordered.length - 1) { wp.type = 'end'; wp.name = 'End'; }
      else { wp.type = 'waypoint'; wp.name = `Waypoint ${i}`; }
    });
    setWaypoints(reordered);
    calculateRoute(reordered);
  }, [waypoints, setWaypoints, calculateRoute]);

  // Focus map on a waypoint
  const focusWaypoint = useCallback((wp) => {
    if (mapRef.current && wp?.position) {
      mapRef.current.flyTo({ center: wp.position, zoom: 15, duration: 800 });
    }
  }, []);

  // Handle waypoint drag end — update position and recalculate route
  const handleWaypointDragEnd = useCallback((waypointId, event) => {
    const { lng, lat } = event.lngLat;
    const updated = updateWaypointPosition(waypointId, { lng, lat });
    calculateRoute(updated);
    // Clear drag flag after a short delay so the click event is suppressed
    setTimeout(() => { waypointDragRef.current = false; }, 100);
  }, [updateWaypointPosition, calculateRoute]);

  // Map → Elevation chart hover sync: when mouse moves near the route on the map,
  // compute the distance along the route and pass it to ElevationProfile as highlightDistance.
  const [mapHoverDistance, setMapHoverDistance] = useState(null);
  const cumulativeDistancesRef = useRef(null);
  const lastRouteGeometryRef = useRef(null);

  // Recompute cumulative distances when route geometry changes
  useEffect(() => {
    if (routeGeometry?.coordinates?.length > 1) {
      if (routeGeometry !== lastRouteGeometryRef.current) {
        cumulativeDistancesRef.current = calculateCumulativeDistances(routeGeometry.coordinates);
        lastRouteGeometryRef.current = routeGeometry;
      }
    } else {
      cumulativeDistancesRef.current = null;
    }
  }, [routeGeometry]);

  const handleMapMouseMove = useCallback((event) => {
    if (!routeGeometry?.coordinates || !cumulativeDistancesRef.current) {
      setMapHoverDistance(null);
      return;
    }
    const { lng, lat } = event.lngLat;
    const nearest = findNearestPointOnRoute(routeGeometry.coordinates, { lng, lat });
    if (nearest && nearest.distance < 200) { // within 200m of route
      const distKm = cumulativeDistancesRef.current[nearest.index] || 0;
      setMapHoverDistance(distKm);
    } else {
      setMapHoverDistance(null);
    }
  }, [routeGeometry]);

  const handleMapMouseLeave = useCallback(() => {
    setMapHoverDistance(null);
  }, []);

  // POI category toggle
  const handleTogglePOICategory = useCallback((catId) => {
    setPOICategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  // POI selection — pan map to selected POI
  const handleSelectPOI = useCallback((poi) => {
    setSelectedPOI(prev => prev?.id === poi.id ? null : poi);
    const map = mapRef.current?.getMap();
    if (map && poi) {
      map.flyTo({ center: [poi.lon, poi.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
  }, []);

  // Remove selected segment and re-route
  const handleRemoveSegment = useCallback(async () => {
    if (!selectedSegment || !routeGeometry?.coordinates) return;

    setIsRemovingSegment(true);

    notifications.show({
      id: 'removing-segment',
      title: 'Removing segment',
      message: 'Re-routing around the selected section...',
      loading: true,
      autoClose: false
    });

    try {
      const newCoordinates = await removeSegmentAndReroute(
        routeGeometry.coordinates,
        selectedSegment.startIndex,
        selectedSegment.endIndex,
        {
          profile: routeProfile || 'road',
          mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN
        }
      );

      // Update route geometry with new coordinates
      setRouteGeometry({
        type: 'LineString',
        coordinates: newCoordinates
      });

      // Recalculate route stats
      // Simple distance calculation (sum of segments)
      let newDistance = 0;
      for (let i = 0; i < newCoordinates.length - 1; i++) {
        const [lon1, lat1] = newCoordinates[i];
        const [lon2, lat2] = newCoordinates[i + 1];
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        newDistance += R * c;
      }

      setRouteStats(prev => ({
        ...prev,
        distance: parseFloat(newDistance.toFixed(1))
      }));

      // Clear selection
      setSelectedSegment(null);

      notifications.update({
        id: 'removing-segment',
        title: 'Segment removed',
        message: `Route updated! Saved ~${selectedSegment.stats?.distanceSaved || 0}m`,
        color: 'green',
        loading: false,
        autoClose: 3000
      });

    } catch (error) {
      console.error('Error removing segment:', error);
      notifications.update({
        id: 'removing-segment',
        title: 'Error',
        message: 'Failed to remove segment. Please try again.',
        color: 'red',
        loading: false,
        autoClose: 3000
      });
    } finally {
      setIsRemovingSegment(false);
    }
  }, [selectedSegment, routeGeometry, routeProfile, setRouteGeometry, setRouteStats]);

  // clearRoute comes from the store (clears waypoints, geometry, stats, etc.)

  // Create route data object for export
  const routeDataForExport = useMemo(() => {
    if (!routeGeometry) return null;
    return {
      name: routeName,
      coordinates: routeGeometry.coordinates,
      waypoints: waypoints.map((wp) => ({
        lat: wp.position[1],
        lng: wp.position[0],
        name: wp.name || 'Waypoint',
        type: wp.type || 'waypoint',
      })),
      distanceKm: routeStats?.distance,
      elevationGainM: routeStats?.elevationGain,
      elevationLossM: routeStats?.elevationLoss,
    };
  }, [routeName, routeGeometry, waypoints, routeStats]);

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

  // Clear session / Start new route - resets all state
  const handleClearSession = useCallback(() => {
    // Reset all persisted store state
    resetAll();

    // Reset local component state
    setSavedRouteId(null);
    setNaturalLanguageInput('');
    setCalendarContext(null);
    setIntervalCues(null);

    // Navigate to clean route builder URL (remove any route ID from URL)
    if (routeId) {
      navigate('/routes/new', { replace: true });
    }

    notifications.show({
      title: 'Session Cleared',
      message: 'Ready to create a new route',
      color: 'lime'
    });
  }, [resetAll, routeId, navigate]);

  // GPX/TCX import handler
  const handleImportGPX = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,.tcx';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const gpxData = await parseGpxFile(text, file.name);
        if (!gpxData.trackPoints || gpxData.trackPoints.length < 2) {
          throw new Error('File must contain at least 2 points');
        }
        const trackPoints = gpxData.trackPoints;
        const coords = trackPoints.map(p => [p.longitude, p.latitude]);

        // Create waypoints at start, intermediate, and end
        const wpIndices = [0];
        if (trackPoints.length > 100) {
          const step = Math.floor(trackPoints.length / 5);
          for (let i = step; i < trackPoints.length - step; i += step) {
            wpIndices.push(i);
          }
        }
        wpIndices.push(trackPoints.length - 1);

        const wps = wpIndices.map((idx, i) => ({
          id: `wp_${Date.now()}_${i}`,
          position: [trackPoints[idx].longitude, trackPoints[idx].latitude],
          type: i === 0 ? 'start' : i === wpIndices.length - 1 ? 'end' : 'waypoint',
          name: i === 0 ? 'Start' : i === wpIndices.length - 1 ? 'End' : `Waypoint ${i}`,
        }));

        setWaypoints(wps);
        setRouteGeometry({ type: 'LineString', coordinates: coords });
        if (gpxData.metadata?.name) setRouteName(gpxData.metadata.name);
        if (gpxData.summary) {
          setRouteStats({
            distance: (gpxData.summary.totalDistance || 0) / 1000,
            elevation: gpxData.summary.totalAscent || 0,
            duration: Math.round((gpxData.summary.totalDistance || 0) / 1000 / 25 * 60),
          });
        }
        setBuilderMode('editing');
        setRoutingSource('gpx_import');
        notifications.show({
          title: 'Route Imported',
          message: `${gpxData.metadata?.name || file.name} - ${trackPoints.length} points`,
          color: 'green',
        });
      } catch (err) {
        console.error('Import failed:', err);
        notifications.show({
          title: 'Import Failed',
          message: err.message || 'Failed to parse file',
          color: 'red',
        });
      }
    };
    input.click();
  }, [setWaypoints, setRouteGeometry, setRouteName, setRouteStats, setBuilderMode, setRoutingSource]);

  // Generate AI Routes using the comprehensive aiRouteGenerator or iterative builder
  const handleGenerateAIRoutes = useCallback(async () => {
    setGeneratingAI(true);
    try {
      let routes;

      if (useIterativeBuilder) {
        // Use the new iterative route builder approach
        // Builds routes segment-by-segment for more accurate results
        console.log('🔄 Using Iterative Route Builder');

        // Use explicit distance if user specified it (e.g., "100km loop")
        // Otherwise calculate from time and speed
        const avgSpeed = speedProfile?.average_speed || 28; // km/h default
        let targetDistanceKm;

        if (explicitDistanceKm) {
          // User specified distance directly - use it exactly
          targetDistanceKm = explicitDistanceKm;
          console.log(`📏 Using explicit distance: ${targetDistanceKm}km (${(targetDistanceKm * 0.621371).toFixed(1)}mi)`);
        } else {
          // Calculate from time and speed
          targetDistanceKm = (timeAvailable / 60) * avgSpeed;
          console.log(`📊 Route calculation: ${timeAvailable}min × ${avgSpeed.toFixed(1)}km/h = ${targetDistanceKm.toFixed(1)}km (${(targetDistanceKm * 0.621371).toFixed(1)}mi)`);
          console.log(`   Speed source: ${speedProfile?.average_speed ? 'user profile' : 'default (28 km/h)'}`);
        }

        routes = await generateIterativeRouteVariations({
          startLocation: [viewport.longitude, viewport.latitude],
          targetDistanceKm,
          routeType: routeType === 'out_back' ? 'out_and_back' : routeType,
          options: {
            profile: routeProfile || 'road',
            trainingGoal
          },
          trainingGoal
        }, 3); // Generate 3 route variations

        // Normalize route format for UI compatibility
        routes = routes.map(route => ({
          ...route,
          distance: route.distanceKm, // km for display
          source: route.source || 'iterative_builder'
        }));
      } else {
        // Use the full AI route generator which:
        // 1. Uses Claude for intelligent suggestions
        // 2. Converts suggestions to full GPS routes
        // 3. Falls back to past ride patterns and Mapbox if needed
        routes = await generateAIRoutes({
          startLocation: [viewport.longitude, viewport.latitude], // [lng, lat] format
          timeAvailable,
          trainingGoal,
          routeType,
          userId: user?.id,
          speedProfile,
          speedModifier: 1.0
        });
      }

      // Score routes against user's riding history and rank by composite score
      if (routes.length > 1 && accessToken) {
        console.log('🎯 Scoring routes against riding history...');
        const targetDistKm = explicitDistanceKm || ((timeAvailable / 60) * (speedProfile?.average_speed || 28));

        const scoredRoutes = await Promise.all(routes.map(async (route) => {
          try {
            const score = route.coordinates
              ? await scoreRoutePreference(route.coordinates, accessToken)
              : null;
            const distanceAccuracy = route.distance && targetDistKm
              ? 1 - Math.abs(route.distance - targetDistKm) / targetDistKm
              : 0.5;
            const familiarityPercent = score?.familiarityPercent || 0;
            // Composite: 70% distance accuracy, 30% familiarity
            const compositeScore = (0.7 * Math.max(0, distanceAccuracy)) + (0.3 * (familiarityPercent / 100));
            return { ...route, familiarityScore: score, compositeScore };
          } catch {
            return { ...route, familiarityScore: null, compositeScore: 0 };
          }
        }));

        // Sort by composite score (highest first)
        scoredRoutes.sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));

        const topScore = scoredRoutes[0]?.familiarityScore;
        if (topScore) {
          console.log(`🎯 Top route familiarity: ${topScore.familiarityPercent?.toFixed(0)}%`);
        }
        routes = scoredRoutes;
      }

      // Routes already have full coordinates
      setAiSuggestions(routes);
      notifications.show({
        title: 'Routes Generated!',
        message: `Found ${routes.length} routes for your ${trainingGoal} session${useIterativeBuilder ? ' (iterative)' : ''}`,
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
  }, [viewport, timeAvailable, trainingGoal, routeType, routeProfile, user, speedProfile, useIterativeBuilder, explicitDistanceKm, accessToken]);

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

        // Transition to editing mode
        setBuilderMode('editing');

        // Clear waypoints since we're using AI-generated route
        setWaypoints([]);

        notifications.show({
          title: 'Route Selected!',
          message: `${formatDist(suggestion.distance || 0)} - ${suggestion.name}`,
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

      // Store explicit distance if user specified it directly (e.g., "100km loop")
      // This prevents distance→time→distance conversion from losing precision
      if (parsed.targetDistanceKm) {
        setExplicitDistanceKm(parsed.targetDistanceKm);
        console.log(`📏 Explicit distance set: ${parsed.targetDistanceKm}km`);
      } else {
        setExplicitDistanceKm(null); // Clear if not explicitly specified
      }

      // Step 4: Determine start location with priority:
      // 1. User-placed waypoint on map (if any)
      // 2. User's geolocated position
      // 3. Viewport center (with warning)
      let startLocation;
      let startLocationSource = 'viewport';

      if (waypoints.length > 0) {
        // User has placed waypoints on the map - use the first one as start
        startLocation = [waypoints[0].position[0], waypoints[0].position[1]];
        startLocationSource = 'waypoint';
        console.log('📍 Using user-placed waypoint as start:', startLocation);
      } else if (userLocation) {
        // Use the user's geolocated position
        startLocation = [userLocation.longitude, userLocation.latitude];
        startLocationSource = 'geolocation';
        console.log('📍 Using geolocated position as start:', startLocation);
      } else {
        // Fall back to viewport center with a warning
        startLocation = [viewport.longitude, viewport.latitude];
        startLocationSource = 'viewport';
        console.warn('⚠️ No geolocation available, using viewport center as start:', startLocation);
        notifications.show({
          id: 'location-fallback-warning',
          title: 'Using Map Center as Start',
          message: 'Your location could not be determined. The route will start from the center of your current map view. Click the location button or place a waypoint to set a specific start point.',
          color: 'yellow',
          icon: <IconCurrentLocation size={16} />,
          autoClose: 8000
        });
      }

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
        // No explicit waypoints - generate route based on duration
        console.log('🎯 No waypoints provided, generating route based on duration...');

        const duration = parsed.timeAvailable || timeAvailable || 60;
        const goal = parsed.trainingGoal || trainingGoal || 'endurance';
        const type = parsed.routeType || 'loop';
        const direction = parsed.direction || null;

        // Use iterative builder if enabled, otherwise use smart waypoints
        if (useIterativeBuilder) {
          console.log('🔄 Using Iterative Route Builder for natural language request');

          // Use explicit distance if user specified it (e.g., "100km loop")
          // Otherwise calculate from time and speed
          const avgSpeed = speedProfile?.average_speed || 28; // km/h default
          let targetDistanceKm;

          if (parsed.targetDistanceKm) {
            // User specified distance directly - use it exactly
            targetDistanceKm = parsed.targetDistanceKm;
            console.log(`📏 Using explicit distance: ${targetDistanceKm}km (${(targetDistanceKm * 0.621371).toFixed(1)}mi)`);
          } else {
            // Calculate from time and speed
            targetDistanceKm = (duration / 60) * avgSpeed;
            console.log(`📊 Route calculation: ${duration}min × ${avgSpeed.toFixed(1)}km/h = ${targetDistanceKm.toFixed(1)}km (${(targetDistanceKm * 0.621371).toFixed(1)}mi)`);
            console.log(`   Speed source: ${speedProfile?.average_speed ? 'user profile' : 'default (28 km/h)'}`);
          }

          notifications.show({
            id: 'generating-route',
            title: 'Building Route',
            message: `Creating ${duration}min ${goal} route...`,
            loading: true,
            autoClose: false
          });

          // If user prefers familiar roads, try to get waypoints from their riding history
          let useFamiliarWaypoints = false;
          let familiarWaypointsData = null;

          if (parsed.preferences?.preferFamiliar && accessToken && type === 'loop') {
            console.log('🧠 User prefers familiar roads - fetching segment waypoints...');
            familiarWaypointsData = await getFamiliarLoopWaypoints(
              startLocation[1], // lat
              startLocation[0], // lng
              targetDistanceKm,
              accessToken,
              false // not explore mode
            );

            if (familiarWaypointsData && !familiarWaypointsData.fallbackToRandom && familiarWaypointsData.waypoints?.length >= 4) {
              useFamiliarWaypoints = true;
              console.log(`🧠 Using ${familiarWaypointsData.waypoints.length} familiar waypoints from ${familiarWaypointsData.segments?.length || 0} segments`);
            } else {
              console.log('🧠 Not enough familiar segments, falling back to iterative builder');
            }
          }

          let iterativeResult;
          let routeSource = 'iterative_quarter_loop';

          if (useFamiliarWaypoints) {
            // Build route through familiar waypoints
            notifications.update({
              id: 'generating-route',
              title: 'Building Familiar Route',
              message: `Routing through ${familiarWaypointsData.waypoints.length} familiar waypoints...`,
              loading: true,
              autoClose: false
            });

            // Convert waypoints to coordinate array: start -> familiar waypoints -> start (loop)
            const waypointCoords = [
              startLocation, // Start
              ...familiarWaypointsData.waypoints.map(wp => [wp.lng, wp.lat]),
              startLocation  // Return to start
            ];

            console.log(`🧠 Routing through ${waypointCoords.length} waypoints (including start/end)`);

            const routeResult = await getSmartCyclingRoute(waypointCoords, {
              profile: parsed.preferences?.surfaceType === 'gravel' ? 'gravel' : 'road',
              trainingGoal: goal,
              mapboxToken: MAPBOX_TOKEN
            });

            if (routeResult && routeResult.coordinates && routeResult.coordinates.length >= 10) {
              iterativeResult = {
                coordinates: routeResult.coordinates,
                distanceKm: routeResult.distance / 1000,
                elevationGain: routeResult.elevationGain || 0,
                duration: routeResult.duration || 0,
                name: `Familiar ${(routeResult.distance / 1000).toFixed(0)}km ${goal} loop`,
                source: 'familiar_segments'
              };
              routeSource = 'familiar_segments';
            } else {
              // Fallback to iterative if routing through waypoints failed
              console.log('🧠 Routing through familiar waypoints failed, falling back to iterative');
              useFamiliarWaypoints = false;
            }
          }

          // Fallback to iterative route builder
          if (!useFamiliarWaypoints) {
            iterativeResult = await generateIterativeRoute({
              startLocation,
              targetDistanceKm,
              routeType: type === 'out_back' ? 'out_and_back' : type,
              direction,
              options: {
                profile: parsed.preferences?.surfaceType === 'gravel' ? 'gravel' : 'road',
                trainingGoal: goal
              },
              trainingGoal: goal
            });
          }

          if (!iterativeResult || !iterativeResult.coordinates || iterativeResult.coordinates.length < 10) {
            throw new Error('Could not generate a route. Try a different duration or location.');
          }

          const distanceKm = parseFloat(iterativeResult.distanceKm.toFixed(1));
          const generatedRouteName = iterativeResult.name || `${distanceKm}km ${goal} ${type}`;

          // Score the route to show familiarity percentage
          let familiarityScore = null;
          if (accessToken) {
            familiarityScore = await scoreRoutePreference(iterativeResult.coordinates, accessToken);
            if (familiarityScore) {
              console.log('🧠 Route familiarity:', familiarityScore);
            }
          }

          setRouteGeometry({
            type: 'LineString',
            coordinates: iterativeResult.coordinates
          });

          setRouteStats({
            distance: distanceKm,
            elevation: iterativeResult.elevationGain || 0,
            duration: Math.round((iterativeResult.duration || 0) / 60),
            familiarityScore: familiarityScore
          });

          if (!calendarContext) {
            setRouteName(generatedRouteName);
          }
          setRoutingSource(routeSource);
          setWaypoints([]);

          // Build notification message
          let notificationTitle = useFamiliarWaypoints ? 'Familiar Route Generated!' : 'Route Generated!';
          let notificationMessage = `${distanceKm} km ${type} route`;
          if (familiarityScore) {
            notificationMessage += ` • ${familiarityScore.familiarityPercent || 0}% familiar roads`;
          }
          if (useFamiliarWaypoints) {
            notificationMessage += ` (${familiarWaypointsData.segments?.length || 0} segments used)`;
          }

          notifications.update({
            id: 'generating-route',
            title: notificationTitle,
            message: notificationMessage,
            color: 'lime',
            loading: false,
            autoClose: 4000
          });

          console.log(`✅ Route generated: ${distanceKm} km via ${routeSource}`);
          return; // Exit early - route is complete
        }

        // Original smart waypoints approach
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

      // Score the route if user prefers familiar roads
      let familiarityScore = null;
      if (parsed.preferences?.preferFamiliar && accessToken) {
        console.log('🧠 Scoring route against riding history...');
        familiarityScore = await scoreRoutePreference(routeResult.coordinates, accessToken);
        if (familiarityScore) {
          console.log('🧠 Route familiarity:', familiarityScore);
        }
      }

      setRouteGeometry({
        type: 'LineString',
        coordinates: routeResult.coordinates
      });

      setRouteStats({
        distance: distanceKm, // Now a number, not string
        elevation: routeResult.elevationGain || 0,
        duration: Math.round(routeResult.duration / 60),
        familiarityScore: familiarityScore // Include familiarity in stats
      });

      // Only update route name if not already set from calendar context
      if (!calendarContext) {
        setRouteName(generatedRouteName);
      }
      setRoutingSource(routeResult.source);
      setWaypoints([]); // Clear manual waypoints since we're using AI route

      // Build notification message with familiarity info if available
      let notificationMessage = `${distanceKm} km ${parsed.routeType || 'loop'} route created`;
      if (familiarityScore) {
        notificationMessage += ` • ${familiarityScore.familiarityPercent || 0}% familiar roads`;
      }

      notifications.update({
        id: 'generating-route',
        title: 'Route Generated!',
        message: notificationMessage,
        color: 'lime',
        loading: false,
        autoClose: 4000
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
  }, [naturalLanguageInput, viewport, useIterativeBuilder, speedProfile, timeAvailable, trainingGoal, calendarContext, accessToken]);

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
            <Text style={{ color: 'var(--tribos-text-secondary)' }}>Loading route...</Text>
          </Stack>
        </Box>
      </AppShell>
    );
  }

  // Render route stats for the bottom sheet peek content
  const safeStats = routeStats || { distance: 0, elevation: 0, duration: 0 };
  const renderPeekContent = () => (
    <Group justify="space-between" style={{ width: '100%' }}>
      <Box>
        <Text size="xs" c="dimmed">Distance</Text>
        <Text fw={600} size="sm">{formatDist(safeStats.distance)}</Text>
      </Box>
      <Box>
        <Text size="xs" c="dimmed">Elevation</Text>
        <Text fw={600} size="sm">{safeStats.elevation > 0 ? formatElev(safeStats.elevation) : '--'}</Text>
      </Box>
      <Box>
        <Text size="xs" c="dimmed">Time</Text>
        <Text fw={600} size="sm">
          {safeStats.duration > 0 ? `${Math.floor(safeStats.duration / 60)}h ${safeStats.duration % 60}m` : '--:--'}
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
      {/* My Routes button (mobile) */}
      <Button
        variant="light"
        color="gray"
        size="xs"
        leftSection={<IconFolderOpen size={14} />}
        onClick={() => setSavedRoutesOpen(true)}
        fullWidth
      >
        My Routes
      </Button>

      {/* Mode selector (mobile - ready mode) */}
      {builderMode === 'ready' && (
        <ModeSelector
          onSelectMode={(mode) => setBuilderMode(mode)}
          onImportGPX={handleImportGPX}
        />
      )}

      {/* AI / Editing controls (mobile) */}
      {(builderMode === 'ai' || builderMode === 'editing') && (
      <>

      {/* Back to mode selection (mobile) */}
      {builderMode === 'ai' && !routeGeometry && (
        <Button variant="subtle" color="gray" size="xs" onClick={() => setBuilderMode('ready')}>
          ← Back
        </Button>
      )}

      {/* Calendar Context Banner (mobile) */}
      {calendarContext && (
        <Paper
          p="sm"
          style={{
            backgroundColor: `${'var(--tribos-lime)'}15`,
            border: `1px solid ${'var(--tribos-lime)'}`,
          }}
          radius="md"
        >
          <Group justify="space-between" align="flex-start">
            <Group gap="xs">
              <IconCalendar size={16} style={{ color: 'var(--tribos-lime)' }} />
              <Box>
                <Text size="xs" fw={600} style={{ color: 'var(--tribos-lime)' }}>
                  Creating route for scheduled workout
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
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
        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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

      {/* Iterative Builder Toggle - Prominent placement */}
      <Paper
        p="sm"
        radius="md"
        style={{
          backgroundColor: useIterativeBuilder ? `${'var(--tribos-lime)'}15` : 'var(--tribos-bg-tertiary)',
          border: `1px solid ${useIterativeBuilder ? 'var(--tribos-lime)' : 'var(--tribos-bg-tertiary)'}`,
          transition: 'all 0.2s ease'
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <IconRefreshDot
              size={20}
              style={{
                color: useIterativeBuilder ? 'var(--tribos-lime)' : 'var(--tribos-text-muted)',
                transition: 'color 0.2s ease'
              }}
            />
            <Box>
              <Group gap="xs" align="center">
                <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                  Iterative Builder
                </Text>
                <Badge size="xs" variant="light" color="blue">Beta</Badge>
              </Group>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                Builds routes segment-by-segment for cleaner, more accurate paths
              </Text>
            </Box>
          </Group>
          <Switch
            checked={useIterativeBuilder}
            onChange={(e) => setUseIterativeBuilder(e.currentTarget.checked)}
            size="md"
            color="lime"
          />
        </Group>
      </Paper>

      {/* Natural Language Input */}
      <Box>
        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
            boxShadow: `0 0 20px ${'var(--tribos-lime)'}40`,
          } : undefined}
        >
          {calendarContext ? '✨ Generate Route for Workout' : 'Generate from Description'}
        </Button>
      </Box>

      {/* Pulse animation styles */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 5px ${'var(--tribos-lime)'}40;
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 25px ${'var(--tribos-lime)'}80;
            transform: scale(1.02);
          }
        }
      `}</style>

      <Divider label="or configure manually" labelPosition="center" size="xs" />

      {/* Route Profile */}
      <Box>
        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
            root: { backgroundColor: 'var(--tribos-bg-tertiary)' }
          }}
        />
      </Box>

      {/* Training Goal */}
      <Box>
        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
            root: { backgroundColor: 'var(--tribos-bg-tertiary)' }
          }}
        />
      </Box>

      <Group grow>
        <Box>
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
          WORKOUT (OPTIONAL)
        </Text>
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
        {/* Show color overlay toggle when workout is selected */}
        {selectedWorkout && (
          <Group justify="space-between" mt="xs">
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
              Show color-coded zones
            </Text>
            <Switch
              checked={showWorkoutOverlay}
              onChange={(e) => setShowWorkoutOverlay(e.currentTarget.checked)}
              size="xs"
              color="lime"
            />
          </Group>
        )}
      </Box>

      <Button
        onClick={handleGenerateAIRoutes}
        loading={generatingAI}
        leftSection={useIterativeBuilder ? <IconRefreshDot size={18} /> : <IconSparkles size={18} />}
        color="lime"
        fullWidth
      >
        {generatingAI ? 'Generating Routes...' : (useIterativeBuilder ? 'Generate Iterative Routes' : 'Generate AI Routes')}
      </Button>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <Box>
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
                  borderColor: convertingRoute === index ? 'var(--tribos-lime)' : 'var(--tribos-bg-tertiary)',
                  backgroundColor: 'var(--tribos-bg-primary)',
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
                    <Badge size="xs" variant="light" color="gray">
                      {typeof suggestion.distance === 'number' ? formatDist(suggestion.distance) : suggestion.distance}
                    </Badge>
                    {suggestion.elevationGain > 0 && (
                      <Badge size="xs" variant="light" color="gray">
                        {formatElev(suggestion.elevationGain)} ↗
                      </Badge>
                    )}
                    {suggestion.estimatedTime && (
                      <Badge size="xs" variant="light" color="gray">
                        {suggestion.estimatedTime}min
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" fw={500}>
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
        <Button
          color="lime"
          fullWidth
          size="sm"
          disabled={!routeGeometry}
          onClick={handleSaveRoute}
          loading={isSaving}
          leftSection={<IconDeviceFloppy size={16} />}
        >
          {savedRouteId ? 'Update Route' : 'Save Route'}
        </Button>
        <Group grow>
          <RouteExportMenu
            route={routeDataForExport}
            variant="light"
            size="sm"
            disabled={!routeGeometry}
          />
          <Button
            variant="outline"
            color="gray"
            size="sm"
            disabled={!routeGeometry && waypoints.length === 0}
            onClick={clearRoute}
            leftSection={<IconTrash size={14} />}
          >
            Clear Route
          </Button>
        </Group>

        {/* Edit Mode Toggle */}
        {routeGeometry && (
          <Button
            variant={editMode ? 'filled' : 'light'}
            color={editMode ? 'red' : 'gray'}
            size="sm"
            fullWidth
            onClick={() => {
              setEditMode(!editMode);
              setSelectedSegment(null);
            }}
            leftSection={<IconScissors size={16} />}
          >
            {editMode ? 'Exit Edit Mode' : 'Edit Route (Remove Tangents)'}
          </Button>
        )}

        {/* Selected Segment Actions */}
        {editMode && selectedSegment && (
          <Paper p="sm" withBorder style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444' }}>
            <Stack gap="xs">
              <Text size="sm" fw={500} c="red">Segment Selected</Text>
              <Text size="xs" c="dimmed">
                {selectedSegment.stats?.pointsRemoved || 0} points • ~{selectedSegment.stats?.distanceSaved || 0}m shorter
              </Text>
              <Group grow>
                <Button
                  size="xs"
                  color="red"
                  onClick={handleRemoveSegment}
                  loading={isRemovingSegment}
                  leftSection={<IconTrash size={14} />}
                >
                  Remove & Re-route
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="gray"
                  onClick={() => setSelectedSegment(null)}
                >
                  Cancel
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}

        {editMode && !selectedSegment && (
          <Text size="xs" c="dimmed" ta="center">
            Click on a tangent segment to select it for removal
          </Text>
        )}

        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={handleClearSession}
          leftSection={<IconRefresh size={14} />}
          fullWidth
        >
          New Route (Clear Session)
        </Button>
      </Stack>
      </>
      )}

      {/* Manual mode controls (mobile) */}
      {builderMode === 'manual' && (
      <>
        {!routeGeometry && (
          <Button variant="subtle" color="gray" size="xs" onClick={() => setBuilderMode('ready')}>
            ← Back
          </Button>
        )}
        <Box>
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">ROUTE NAME</Text>
          <TextInput
            value={routeName}
            onChange={(e) => setRouteName(e.target.value.slice(0, 50))}
            variant="filled"
            size="sm"
          />
        </Box>
        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
          {waypoints.length === 0 ? 'Tap on the map to place waypoints.' :
           `${waypoints.length} waypoints. Tap markers to remove.`}
        </Text>
        {routeGeometry && routeStats && (
          <RouteStatsPanel
            stats={routeStats}
            routingSource={routingSource}
            speedProfile={speedProfile}
            formatDist={formatDist}
            formatElev={formatElev}
            formatSpd={formatSpd}
            getUserSpeedForProfile={getUserSpeedForProfile}
            routeProfile={routeProfile}
            personalizedETA={personalizedETA}
          />
        )}
        <Button
          variant="light"
          color="lime"
          size="xs"
          leftSection={<IconRobot size={14} />}
          onClick={() => setBuilderMode('ai')}
          fullWidth
        >
          Switch to AI Builder
        </Button>
      </>
      )}
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
                onMouseMove={handleMapMouseMove}
                onMouseLeave={handleMapMouseLeave}
                onClick={handleMapClick}
                mapStyle={currentMapStyle}
                mapboxAccessToken={MAPBOX_TOKEN}
                style={{ width: '100%', height: '100%' }}
                cursor={builderMode === 'manual' || builderMode === 'editing' ? 'crosshair' : 'grab'}
              >
                {/* Bike Infrastructure Layer - renders below routes */}
                {showBikeInfrastructure && mapStyleId !== 'cyclosm' && (
                  <BikeInfrastructureLayer
                    data={infrastructureData}
                    visible={showBikeInfrastructure}
                  />
                )}

                {/* Smart POIs along route */}
                {showPOIs && poiData.length > 0 && (
                  <RoutePOILayer
                    pois={poiData}
                    activeCategories={poiCategories}
                    onSelect={handleSelectPOI}
                    selectedId={selectedPOI?.id}
                  />
                )}

                {/* Colored route segments */}
                {coloredSegments && (
                  <Source id="colored-route" type="geojson" data={coloredSegments}>
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

                {/* Surface-colored route line (paved/gravel/unpaved) */}
                {surfaceRouteGeoJSON && !coloredSegments && (
                  <Source id="surface-route" type="geojson" data={surfaceRouteGeoJSON}>
                    <Layer
                      id="route-surface"
                      type="line"
                      paint={{
                        'line-color': ['get', 'color'],
                        'line-width': 5,
                        'line-opacity': 0.9,
                      }}
                    />
                  </Source>
                )}

                {/* Gradient-colored route line (slope-based) */}
                {gradientRouteGeoJSON && !coloredSegments && !surfaceRouteGeoJSON && (
                  <Source id="gradient-route" type="geojson" data={gradientRouteGeoJSON}>
                    <Layer
                      id="route-gradient"
                      type="line"
                      paint={{
                        'line-color': ['get', 'color'],
                        'line-width': 5,
                        'line-opacity': 0.9,
                      }}
                    />
                  </Source>
                )}

                {/* Flat route line (fallback when no overlay active) */}
                {routeGeoJSON && !coloredSegments && !surfaceRouteGeoJSON && !gradientRouteGeoJSON && (
                  <Source id="route" type="geojson" data={routeGeoJSON}>
                    <Layer
                      id="route-line"
                      type="line"
                      paint={{
                        'line-color': editMode ? '#666666' : '#32CD32',
                        'line-width': 4,
                        'line-opacity': editMode ? 0.6 : 0.8,
                        ...(!snapToRoads && { 'line-dasharray': [2, 1] }),
                      }}
                    />
                  </Source>
                )}

                {/* Selected segment highlight (edit mode) */}
                {segmentHighlightGeoJSON && (
                  <Source id="segment-highlight" type="geojson" data={segmentHighlightGeoJSON}>
                    <Layer
                      id="segment-highlight-line"
                      type="line"
                      paint={{
                        'line-color': '#ef4444',
                        'line-width': 6,
                        'line-opacity': 0.9
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

                {/* Waypoint markers — draggable */}
                {waypoints.map((waypoint, index) => (
                  <Marker
                    key={waypoint.id}
                    longitude={waypoint.position[0]}
                    latitude={waypoint.position[1]}
                    anchor="bottom"
                    draggable
                    onDragStart={() => { waypointDragRef.current = true; }}
                    onDragEnd={(e) => handleWaypointDragEnd(waypoint.id, e)}
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      removeWaypoint(waypoint.id);
                    }}
                  >
                    <div style={{
                      backgroundColor: index === 0 ? '#22c55e' : index === waypoints.length - 1 ? '#ef4444' : '#32CD32',
                      color: 'white',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'grab',
                      border: '2px solid white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    }}>
                      {index + 1}
                    </div>
                  </Marker>
                ))}

                {/* Elevation profile hover marker */}
                {elevationHoverPosition && (
                  <Marker
                    longitude={elevationHoverPosition.lng}
                    latitude={elevationHoverPosition.lat}
                    anchor="center"
                  >
                    <div style={{
                      width: 14,
                      height: 14,
                      backgroundColor: '#32CD32',
                      borderRadius: '50%',
                      border: '2px solid white',
                      boxShadow: '0 0 0 2px #32CD32, 0 2px 12px rgba(50, 205, 50, 0.6)',
                    }} />
                  </Marker>
                )}
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
                  styles={{ input: { backgroundColor: 'var(--tribos-bg-secondary)' } }}
                />
                <Tooltip label="My Location">
                  <Button variant="filled" color="lime" size="md" onClick={handleGeolocate} loading={isLocating} style={{ padding: '0 12px' }}>
                    <IconCurrentLocation size={20} />
                  </Button>
                </Tooltip>
                <Tooltip label={showBikeInfrastructure ? 'Hide Bike Lanes' : 'Show Bike Lanes'}>
                  <Button
                    variant={showBikeInfrastructure ? 'filled' : 'default'}
                    color={showBikeInfrastructure ? 'green' : 'dark'}
                    size="md"
                    onClick={() => setShowBikeInfrastructure(!showBikeInfrastructure)}
                    loading={infrastructureLoading}
                    disabled={mapStyleId === 'cyclosm'}
                    style={{
                      padding: '0 12px',
                      backgroundColor: showBikeInfrastructure ? 'var(--tribos-lime)' : 'var(--tribos-bg-secondary)',
                      border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                    }}
                  >
                    <IconBike size={20} color={showBikeInfrastructure ? '#000' : '#fff'} />
                  </Button>
                </Tooltip>
                {routeGeometry && (
                  <Tooltip label={showPOIs ? 'Hide POIs' : 'Show Nearby POIs'}>
                    <Button
                      variant={showPOIs ? 'filled' : 'default'}
                      color={showPOIs ? 'blue' : 'dark'}
                      size="md"
                      onClick={() => setShowPOIs(!showPOIs)}
                      loading={poiLoading}
                      style={{
                        padding: '0 12px',
                        backgroundColor: showPOIs ? '#3b82f6' : 'var(--tribos-bg-secondary)',
                        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                      }}
                    >
                      <IconMapPin size={20} color={showPOIs ? '#fff' : '#fff'} />
                    </Button>
                  </Tooltip>
                )}
                <Menu position="bottom-end" withArrow shadow="md">
                  <Menu.Target>
                    <Button
                      variant="filled"
                      color="dark"
                      size="md"
                      style={{
                        padding: '0 12px',
                        backgroundColor: 'var(--tribos-bg-secondary)',
                        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                      }}
                    >
                      <IconMap size={20} />
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
                    <Menu.Label>Basemap</Menu.Label>
                    {BASEMAP_STYLES.map((style) => (
                      <Menu.Item
                        key={style.id}
                        onClick={() => setMapStyleId(style.id)}
                        style={{
                          backgroundColor: mapStyleId === style.id ? 'var(--tribos-bg-tertiary)' : 'transparent',
                        }}
                      >
                        {style.label}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
                <RouteSettingsButton
                  onClick={() => setPreferencesOpen(true)}
                  speedProfile={speedProfile}
                  isImperial={isImperial}
                />
                <Tooltip label="Route Learning - Prefer familiar roads">
                  <Button
                    variant="default"
                    color="dark"
                    size="md"
                    onClick={() => setRoadPreferencesOpen(true)}
                    style={{
                      padding: '0 12px',
                      backgroundColor: 'var(--tribos-bg-secondary)',
                      border: '1px solid var(--tribos-border)',
                    }}
                  >
                    <IconBrain size={20} color="var(--tribos-lime)" />
                  </Button>
                </Tooltip>
                {routeGeometry && (
                  <Tooltip label={editMode ? 'Exit Edit Mode' : 'Edit Route'}>
                    <Button
                      variant={editMode ? 'filled' : 'default'}
                      color={editMode ? 'red' : 'dark'}
                      size="md"
                      onClick={() => {
                        setEditMode(!editMode);
                        setSelectedSegment(null);
                      }}
                      style={{
                        padding: '0 12px',
                        backgroundColor: editMode ? '#ef4444' : 'var(--tribos-bg-secondary)',
                        border: `1px solid ${editMode ? '#ef4444' : 'var(--tribos-bg-tertiary)'}`,
                      }}
                    >
                      <IconScissors size={20} color={editMode ? '#fff' : '#fff'} />
                    </Button>
                  </Tooltip>
                )}
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
                  backgroundColor: 'var(--tribos-bg-secondary)',
                }}
              >
                {searchResults.map((result, index) => (
                  <Box
                    key={index}
                    p="sm"
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${'var(--tribos-bg-tertiary)'}` }}
                    onClick={() => handleSelectSearchResult(result)}
                  >
                    <Text size="sm">{result.place_name}</Text>
                  </Box>
                ))}
              </Paper>
            )}

            {/* Bike Infrastructure Legend */}
            {showBikeInfrastructure && mapStyleId !== 'cyclosm' && (
              <BikeInfrastructureLegend visible={showBikeInfrastructure} />
            )}

            {/* POI Panel (mobile) */}
            {showPOIs && (
              <POIPanel
                pois={poiData}
                loading={poiLoading}
                activeCategories={poiCategories}
                onToggleCategory={handleTogglePOICategory}
                onSelectPOI={handleSelectPOI}
                selectedId={selectedPOI?.id}
                onClose={() => setShowPOIs(false)}
                formatDist={formatDist}
              />
            )}

            {/* Edit Mode Floating Panel */}
            {editMode && (
              <Paper
                p="sm"
                shadow="md"
                style={{
                  position: 'absolute',
                  bottom: 120,
                  left: 16,
                  right: 16,
                  zIndex: 10,
                  backgroundColor: selectedSegment ? 'rgba(239, 68, 68, 0.95)' : 'var(--tribos-bg-secondary)',
                  border: `1px solid ${selectedSegment ? '#ef4444' : 'var(--tribos-bg-tertiary)'}`,
                }}
              >
                {selectedSegment ? (
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="sm" fw={500} c="white">Segment Selected</Text>
                      <Text size="xs" c="rgba(255,255,255,0.8)">
                        ~{selectedSegment.stats?.distanceSaved || 0}m shorter
                      </Text>
                    </Group>
                    <Group grow>
                      <Button
                        size="sm"
                        color="dark"
                        onClick={handleRemoveSegment}
                        loading={isRemovingSegment}
                        leftSection={<IconTrash size={16} />}
                      >
                        Remove & Re-route
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        color="white"
                        onClick={() => setSelectedSegment(null)}
                      >
                        Cancel
                      </Button>
                    </Group>
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed" ta="center">
                    Click on a tangent segment to select it for removal
                  </Text>
                )}
              </Paper>
            )}

            {/* Floating Route Settings */}
            <FloatingRouteSettings
              opened={preferencesOpen}
              onClose={() => setPreferencesOpen(false)}
              speedProfile={speedProfile}
              onSpeedProfileUpdate={setSpeedProfile}
              isImperial={isImperial}
            />

            {/* Road Preferences Modal */}
            <Modal
              opened={roadPreferencesOpen}
              onClose={() => setRoadPreferencesOpen(false)}
              title={null}
              size="lg"
              centered
              withCloseButton={false}
              styles={{
                content: {
                  backgroundColor: 'var(--tribos-bg-primary)',
                  border: '1px solid var(--tribos-border)',
                },
                body: { padding: 0 },
              }}
            >
              <RoadPreferencesCard />
              <Box p="md" pt={0}>
                <Button
                  fullWidth
                  variant="subtle"
                  color="gray"
                  onClick={() => setRoadPreferencesOpen(false)}
                >
                  Close
                </Button>
              </Box>
            </Modal>
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

        {/* Saved Routes Drawer (mobile) */}
        <SavedRoutesDrawer
          opened={savedRoutesOpen}
          onClose={() => setSavedRoutesOpen(false)}
          onRouteSelect={(id) => navigate(`/routes/${id}`)}
        />
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
            width: 380,
            backgroundColor: 'var(--tribos-bg-secondary)',
            borderRight: `1px solid ${'var(--tribos-bg-tertiary)'}`,
            display: 'flex',
            flexDirection: 'column',
          }}
          radius={0}
        >
          {/* Scrollable content area */}
          <Box style={{ flex: 1, overflowY: 'auto', padding: tokens.spacing.md }}>
            <Stack gap="md">
              {/* My Routes button - always visible */}
              <Button
                variant="light"
                color="gray"
                size="xs"
                leftSection={<IconFolderOpen size={14} />}
                onClick={() => setSavedRoutesOpen(true)}
                fullWidth
              >
                My Routes
              </Button>

              {/* === READY MODE: Mode selector === */}
              {builderMode === 'ready' && (
                <ModeSelector
                  onSelectMode={(mode) => setBuilderMode(mode)}
                  onImportGPX={handleImportGPX}
                />
              )}

              {/* === AI / EDITING MODE: Full AI builder controls === */}
              {(builderMode === 'ai' || builderMode === 'editing') && (
              <>
              {/* Back to mode selection (only if no route yet) */}
              {builderMode === 'ai' && !routeGeometry && (
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => setBuilderMode('ready')}
                  compact="true"
                >
                  ← Back
                </Button>
              )}

              {/* Step Indicator */}
              <StepIndicator
                currentStep={currentWizardStep}
                steps={wizardSteps}
              />

              {/* Calendar Context Banner */}
              {calendarContext && (
                <Paper
                  p="sm"
                  style={{
                    backgroundColor: `${'var(--tribos-lime)'}15`,
                    border: `1px solid ${'var(--tribos-lime)'}`,
                  }}
                  radius="md"
                >
                  <Group justify="space-between" align="flex-start">
                    <Group gap="xs">
                      <IconCalendar size={16} style={{ color: 'var(--tribos-lime)' }} />
                      <Box>
                        <Text size="xs" fw={600} style={{ color: 'var(--tribos-lime)' }}>
                          Creating route for scheduled workout
                        </Text>
                        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
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

              {/* Route Name Input with validation */}
              <Box>
                <Group justify="space-between" mb="xs">
                  <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    ROUTE NAME
                  </Text>
                  <Text size="xs" style={{ color: routeName.length > 40 ? 'var(--tribos-warning)' : 'var(--tribos-text-muted)' }}>
                    {routeName.length}/50
                  </Text>
                </Group>
                <TextInput
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value.slice(0, 50))}
                  variant="filled"
                  size="md"
                  styles={{
                    input: {
                      borderColor: routeName.length > 0 ? 'var(--tribos-lime)' : undefined,
                      '&:focus': { borderColor: 'var(--tribos-lime)' },
                    }
                  }}
                  rightSection={routeName.length > 0 && routeName !== 'Untitled Route' && (
                    <Box style={{ color: 'var(--tribos-lime)' }}>✓</Box>
                  )}
                />
              </Box>

              {/* AI Route Generator Section - Visual Card */}
              <Box
                style={{
                  backgroundColor: `${'var(--tribos-lime)'}08`,
                  border: `1px solid ${'var(--tribos-lime)'}25`,
                  borderRadius: tokens.radius.md,
                  padding: tokens.spacing.md,
                }}
              >
                <Group gap="xs" mb="md">
                  <IconRobot size={20} style={{ color: 'var(--tribos-lime)' }} />
                  <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
                    AI Route Generator
                  </Text>
                </Group>

                <Stack gap="sm">
                  {/* Iterative Builder Toggle - Mobile */}
                  <Paper
                    p="sm"
                    radius="md"
                    style={{
                      backgroundColor: useIterativeBuilder ? `${'var(--tribos-lime)'}15` : 'var(--tribos-bg-tertiary)',
                      border: `1px solid ${useIterativeBuilder ? 'var(--tribos-lime)' : 'var(--tribos-bg-tertiary)'}`,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Group justify="space-between" align="center">
                      <Group gap="sm">
                        <IconRefreshDot
                          size={20}
                          style={{
                            color: useIterativeBuilder ? 'var(--tribos-lime)' : 'var(--tribos-text-muted)',
                            transition: 'color 0.2s ease'
                          }}
                        />
                        <Box>
                          <Group gap="xs" align="center">
                            <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                              Iterative Builder
                            </Text>
                            <Badge size="xs" variant="light" color="blue">Beta</Badge>
                          </Group>
                          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                            Cleaner, more accurate paths
                          </Text>
                        </Box>
                      </Group>
                      <Switch
                        checked={useIterativeBuilder}
                        onChange={(e) => setUseIterativeBuilder(e.currentTarget.checked)}
                        size="md"
                        color="lime"
                      />
                    </Group>
                  </Paper>

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
                    leftSection={useIterativeBuilder ? <IconRefreshDot size={16} /> : <IconSparkles size={16} />}
                    color="lime"
                    variant={calendarContext ? 'filled' : 'light'}
                    size="sm"
                    fullWidth
                    style={calendarContext ? {
                      animation: 'pulse-glow 2s ease-in-out infinite',
                      boxShadow: `0 0 20px ${'var(--tribos-lime)'}40`,
                    } : undefined}
                  >
                    {calendarContext ? '✨ Generate Route for Workout' : (useIterativeBuilder ? 'Generate Iterative Route' : 'Generate from Description')}
                  </Button>
                </Stack>
              </Box>

              {/* Pulse animation styles (desktop) */}
              <style>{`
                @keyframes pulse-glow {
                  0%, 100% {
                    box-shadow: 0 0 5px ${'var(--tribos-lime)'}40;
                    transform: scale(1);
                  }
                  50% {
                    box-shadow: 0 0 25px ${'var(--tribos-lime)'}80;
                    transform: scale(1.02);
                  }
                }
              `}</style>

              {/* Manual Configuration Section - Collapsible */}
              <CollapsibleSection
                title="Manual Configuration"
                icon={<IconAdjustments size={18} />}
                defaultExpanded={!naturalLanguageInput}
              >
                <Stack gap="sm" mt="sm">
                  {/* Route Profile Selector */}
                  <Box>
                    <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
                        root: { backgroundColor: 'var(--tribos-bg-secondary)' }
                      }}
                    />
                  </Box>

                  {/* Training Goal */}
                  <Box>
                    <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
                        root: { backgroundColor: 'var(--tribos-bg-secondary)' }
                      }}
                    />
                  </Box>

                  <Group grow>
                    <Box>
                      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
                      {(timeAvailable < 30 || timeAvailable > 300) && (
                        <Text size="xs" style={{ color: 'var(--tribos-warning)' }} mt={4}>
                          {timeAvailable < 30 ? 'Very short ride' : 'Long ride!'}
                        </Text>
                      )}
                    </Box>

                    <Box>
                      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
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
                    <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="xs">
                      WORKOUT (OPTIONAL)
                    </Text>
                    <Select
                      placeholder="Select a workout for color-coded route..."
                      value={selectedWorkout?.id || null}
                      onChange={(value) => {
                        if (value) {
                          const workout = WORKOUT_LIBRARY[value];
                          setSelectedWorkout(workout);
                          if (workout.duration) {
                            setTimeAvailable(workout.duration);
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
                      <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">
                          Show color-coded zones
                        </Text>
                        <Switch
                          checked={showWorkoutOverlay}
                          onChange={(e) => setShowWorkoutOverlay(e.currentTarget.checked)}
                          size="xs"
                          color="lime"
                        />
                      </Group>
                    )}
                  </Box>

                  <Button
                    onClick={handleGenerateAIRoutes}
                    loading={generatingAI}
                    leftSection={useIterativeBuilder ? <IconRefreshDot size={18} /> : <IconSparkles size={18} />}
                    color="lime"
                    fullWidth
                  >
                    {generatingAI ? 'Generating Routes...' : (useIterativeBuilder ? 'Generate Iterative Routes' : 'Generate AI Routes')}
                  </Button>
                </Stack>
              </CollapsibleSection>

              {/* AI Suggestions Section - Collapsible with enhanced cards */}
              {aiSuggestions.length > 0 && (
                <CollapsibleSection
                  title="AI Suggestions"
                  icon={<IconSparkles size={18} />}
                  badge={`${aiSuggestions.length}`}
                  defaultExpanded={true}
                  accentColor={'var(--tribos-lime)'}
                >
                  <Stack gap="sm" mt="sm" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                    {aiSuggestions.map((suggestion, index) => (
                      <AISuggestionCard
                        key={index}
                        suggestion={suggestion}
                        index={index}
                        isConverting={convertingRoute === index}
                        isDisabled={convertingRoute !== null}
                        onSelect={handleSelectAISuggestion}
                        formatDistance={formatDist}
                        formatElevation={formatElev}
                      />
                    ))}
                  </Stack>
                </CollapsibleSection>
              )}

              {/* Route Stats Section - Collapsible */}
              <CollapsibleSection
                title="Route Stats"
                icon={<IconRoute size={18} />}
                defaultExpanded={!!routeGeometry}
              >
                <Box mt="sm">
                  <RouteStatsPanel
                    stats={routeStats}
                    routingSource={routingSource}
                    speedProfile={speedProfile}
                    formatDist={formatDist}
                    formatElev={formatElev}
                    formatSpd={formatSpd}
                    getUserSpeedForProfile={getUserSpeedForProfile}
                    routeProfile={routeProfile}
                    personalizedETA={personalizedETA}
                  />
                </Box>
              </CollapsibleSection>

              {/* Weather Section - Collapsible */}
              {userLocation && (
                <CollapsibleSection
                  title="Weather & Conditions"
                  icon={<Text size="sm">🌤️</Text>}
                  defaultExpanded={false}
                >
                  <Box mt="sm">
                    <WeatherWidget
                      latitude={userLocation.latitude}
                      longitude={userLocation.longitude}
                      coordinates={routeGeometry?.coordinates}
                      isImperial={isImperial}
                      showWindAnalysis={routeGeometry?.coordinates?.length >= 2}
                      onWeatherUpdate={setWeatherData}
                    />
                  </Box>
                </CollapsibleSection>
              )}

              {/* Fuel Plan Section - Collapsible */}
              {routeStats.duration >= 45 && routeGeometry && (
                <CollapsibleSection
                  title="Fuel Plan"
                  icon={<Text size="sm">🍌</Text>}
                  defaultExpanded={routeStats.duration >= 60}
                >
                  <Box mt="sm">
                    <FuelCard
                      route={{
                        estimatedDurationMinutes: routeStats.duration,
                        elevationGainMeters: routeStats.elevation || 0,
                      }}
                      weather={weatherData ? {
                        temperatureCelsius: weatherData.temperature,
                        humidity: weatherData.humidity,
                      } : undefined}
                      compact={true}
                      useImperial={isImperial}
                    />
                  </Box>
                </CollapsibleSection>
              )}

              {/* Workout Structure Section - Collapsible */}
              {intervalCues && intervalCues.length > 0 && (
                <CollapsibleSection
                  title="Workout Structure"
                  icon={<Text size="sm">🏋️</Text>}
                  badge={`${intervalCues.length}`}
                  defaultExpanded={false}
                >
                  <Box mt="sm">
                    <IntervalCues cues={intervalCues} formatDistance={formatDist} />
                  </Box>
                </CollapsibleSection>
              )}

              {/* Tools Section - Collapsible */}
              <CollapsibleSection
                title="Tools"
                icon={<Text size="sm">🔧</Text>}
                defaultExpanded={false}
              >
                <Box mt="sm">
                  <TirePressureCalculator />
                </Box>
              </CollapsibleSection>

              {/* Map Instructions */}
              <Box
                style={{
                  padding: tokens.spacing.md,
                  backgroundColor: 'var(--tribos-bg-tertiary)',
                  borderRadius: tokens.radius.md,
                  borderLeft: `3px solid ${'var(--tribos-lime)'}`,
                }}
              >
                <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  {waypoints.length === 0 ? '📍 Click on the map to add your first waypoint' :
                   waypoints.length === 1 ? '📍 Add another waypoint to create a route' :
                   `✅ Route created! ${isCalculating ? 'Calculating...' : ''}`}
                </Text>
                {waypoints.length > 0 && (
                  <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt={4}>
                    Click waypoint markers to remove them
                  </Text>
                )}
              </Box>
              </>
              )}

              {/* === MANUAL MODE: Manual builder controls === */}
              {builderMode === 'manual' && (
              <>
                {/* Back to mode selection (only if no route yet) */}
                {!routeGeometry && (
                  <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    onClick={() => setBuilderMode('ready')}
                    compact="true"
                  >
                    ← Back
                  </Button>
                )}

                {/* Route Name */}
                <Box>
                  <Group justify="space-between" mb="xs">
                    <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                      ROUTE NAME
                    </Text>
                  </Group>
                  <TextInput
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value.slice(0, 50))}
                    variant="filled"
                    size="md"
                  />
                </Box>

                {/* Manual mode hint */}
                <Box
                  style={{
                    padding: tokens.spacing.md,
                    backgroundColor: '#3b82f608',
                    border: '1px solid #3b82f625',
                    borderRadius: tokens.radius.md,
                  }}
                >
                  <Group gap="xs" mb="xs">
                    <IconHandClick size={18} style={{ color: '#3b82f6' }} />
                    <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
                      Manual Route Builder
                    </Text>
                  </Group>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    {waypoints.length === 0 ? 'Click on the map to place your first waypoint.' :
                     waypoints.length === 1 ? `Click again to add more waypoints. ${snapToRoads ? 'Routes auto-snap to roads.' : 'Freehand mode: straight lines between points.'}` :
                     `${waypoints.length} waypoints placed. Drag markers to adjust.`}
                  </Text>
                </Box>

                {/* Manual editing toolbar */}
                {waypoints.length > 0 && (
                  <Group gap="xs">
                    <Tooltip label="Undo">
                      <ActionIcon
                        variant="light"
                        color="gray"
                        size="md"
                        onClick={manualUndo}
                        disabled={!manualCanUndo}
                      >
                        <IconRefresh size={16} style={{ transform: 'scaleX(-1)' }} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Redo">
                      <ActionIcon
                        variant="light"
                        color="gray"
                        size="md"
                        onClick={manualRedo}
                        disabled={!manualCanRedo}
                      >
                        <IconRefresh size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Reverse Route">
                      <ActionIcon
                        variant="light"
                        color="gray"
                        size="md"
                        onClick={manualReverse}
                        disabled={waypoints.length < 2}
                      >
                        <IconArrowsExchange size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Clear Route">
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="md"
                        onClick={() => {
                          setWaypoints([]);
                          setRouteGeometry(null);
                          setRouteStats({ distance: 0, elevation: 0, duration: 0 });
                        }}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                )}

                {/* Snap to roads / freehand toggle */}
                <Tooltip label={snapToRoads ? 'Switch to freehand drawing' : 'Switch to snap-to-roads'}>
                  <Button
                    variant={snapToRoads ? 'light' : 'outline'}
                    color={snapToRoads ? 'blue' : 'gray'}
                    size="xs"
                    fullWidth
                    leftSection={snapToRoads ? <IconRoad size={16} /> : <IconPencil size={16} />}
                    onClick={() => {
                      setSnapToRoads(!snapToRoads);
                      // Route will recalculate via the effect below
                    }}
                  >
                    {snapToRoads ? 'Snap to Roads' : 'Freehand'}
                  </Button>
                </Tooltip>

                {/* Routing profile for manual mode (only relevant when snapping) */}
                {snapToRoads && (
                  <Select
                    label="Routing Profile"
                    size="xs"
                    value={routeProfile}
                    onChange={setRouteProfile}
                    data={[
                      { value: 'road', label: 'Road' },
                      { value: 'gravel', label: 'Gravel' },
                      { value: 'mountain', label: 'Mountain' },
                    ]}
                  />
                )}

                {/* Waypoint list with reorder controls */}
                {waypoints.length >= 2 && (
                  <WaypointList
                    waypoints={waypoints}
                    onReorder={reorderWaypoints}
                    onRemove={removeWaypoint}
                    onFocus={focusWaypoint}
                  />
                )}

                {/* Route stats (when route exists) */}
                {routeGeometry && routeStats && (
                  <RouteStatsPanel
                    stats={routeStats}
                    routingSource={routingSource}
                    speedProfile={speedProfile}
                    formatDist={formatDist}
                    formatElev={formatElev}
                    formatSpd={formatSpd}
                    getUserSpeedForProfile={getUserSpeedForProfile}
                    routeProfile={routeProfile}
                    personalizedETA={personalizedETA}
                  />
                )}

                {/* Switch to AI mode */}
                <Button
                  variant="light"
                  color="lime"
                  size="xs"
                  leftSection={<IconRobot size={14} />}
                  onClick={() => setBuilderMode('ai')}
                  fullWidth
                >
                  Switch to AI Builder
                </Button>
              </>
              )}
            </Stack>
          </Box>

          {/* Sticky Action Buttons Footer */}
          <Box
            style={{
              padding: tokens.spacing.md,
              borderTop: `1px solid ${'var(--tribos-bg-tertiary)'}`,
              backgroundColor: 'var(--tribos-bg-secondary)',
            }}
          >
            <Stack gap="sm">
              <Button
                color="lime"
                fullWidth
                size="md"
                disabled={!routeGeometry}
                onClick={handleSaveRoute}
                loading={isSaving}
                leftSection={<IconDeviceFloppy size={20} />}
                style={{
                  height: 48,
                  fontWeight: 600,
                  fontSize: '15px',
                }}
              >
                {savedRouteId ? 'Update Route' : 'Save Route'}
              </Button>
              <Group grow>
                <RouteExportMenu
                  route={routeDataForExport}
                  variant="light"
                  size="sm"
                  disabled={!routeGeometry}
                />
                <Button
                  variant="outline"
                  color="gray"
                  size="sm"
                  disabled={!routeGeometry && waypoints.length === 0}
                  onClick={clearRoute}
                  leftSection={<IconTrash size={16} />}
                  style={{ height: 40 }}
                >
                  Clear Route
                </Button>
              </Group>

              {/* Edit and Manual Mode Toggles */}
              {routeGeometry && (
                <Group grow>
                  <Button
                    variant={editMode ? 'filled' : 'light'}
                    color={editMode ? 'red' : 'gray'}
                    size="sm"
                    onClick={() => {
                      setEditMode(!editMode);
                      setSelectedSegment(null);
                    }}
                    leftSection={<IconScissors size={16} />}
                  >
                    {editMode ? 'Exit Edit' : 'Edit Route'}
                  </Button>
                  {builderMode !== 'manual' && (
                    <Button
                      variant="light"
                      color="blue"
                      size="sm"
                      onClick={() => setBuilderMode('manual')}
                      leftSection={<IconHandClick size={16} />}
                    >
                      Manual Edit
                    </Button>
                  )}
                </Group>
              )}

              {/* Selected Segment Actions (Mobile) */}
              {editMode && selectedSegment && (
                <Paper p="sm" withBorder style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444' }}>
                  <Stack gap="xs">
                    <Text size="sm" fw={500} c="red">Segment Selected</Text>
                    <Text size="xs" c="dimmed">
                      ~{selectedSegment.stats?.distanceSaved || 0}m shorter after removal
                    </Text>
                    <Group grow>
                      <Button
                        size="xs"
                        color="red"
                        onClick={handleRemoveSegment}
                        loading={isRemovingSegment}
                      >
                        Remove
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        color="gray"
                        onClick={() => setSelectedSegment(null)}
                      >
                        Cancel
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              )}

              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={handleClearSession}
                leftSection={<IconRefresh size={14} />}
                fullWidth
              >
                New Route (Clear Session)
              </Button>
            </Stack>
          </Box>
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
                flexWrap: 'wrap',
                gap: 8,
                maxWidth: 600,
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
                      backgroundColor: 'var(--tribos-bg-secondary)',
                      borderColor: 'var(--tribos-bg-tertiary)',
                      '&:focus': {
                        borderColor: 'var(--tribos-lime)',
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
                      backgroundColor: 'var(--tribos-bg-secondary)',
                      border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
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
                          borderBottom: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--tribos-bg-tertiary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
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
              <Tooltip label={showBikeInfrastructure ? 'Hide Bike Lanes' : 'Show Bike Lanes'}>
                <Button
                  variant={showBikeInfrastructure ? 'filled' : 'default'}
                  color={showBikeInfrastructure ? 'green' : 'dark'}
                  size="md"
                  onClick={() => setShowBikeInfrastructure(!showBikeInfrastructure)}
                  loading={infrastructureLoading}
                  disabled={mapStyleId === 'cyclosm'}
                  style={{
                    padding: '0 12px',
                    backgroundColor: showBikeInfrastructure ? 'var(--tribos-lime)' : 'var(--tribos-bg-secondary)',
                    border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                  }}
                >
                  <IconBike size={20} color={showBikeInfrastructure ? '#000' : '#fff'} />
                </Button>
              </Tooltip>
              {routeGeometry && (
                <Tooltip label={showPOIs ? 'Hide POIs' : 'Show Nearby POIs'}>
                  <Button
                    variant={showPOIs ? 'filled' : 'default'}
                    color={showPOIs ? 'blue' : 'dark'}
                    size="md"
                    onClick={() => setShowPOIs(!showPOIs)}
                    loading={poiLoading}
                    style={{
                      padding: '0 12px',
                      backgroundColor: showPOIs ? '#3b82f6' : 'var(--tribos-bg-secondary)',
                      border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                    }}
                  >
                    <IconMapPin size={20} color="#fff" />
                  </Button>
                </Tooltip>
              )}
              <Menu position="bottom-end" withArrow shadow="md">
                <Menu.Target>
                  <Tooltip label="Change Basemap">
                    <Button
                      variant="filled"
                      color="dark"
                      size="md"
                      style={{
                        padding: '0 12px',
                        backgroundColor: 'var(--tribos-bg-secondary)',
                        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
                      }}
                    >
                      <IconMap size={20} />
                    </Button>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
                  <Menu.Label>Basemap</Menu.Label>
                  {BASEMAP_STYLES.map((style) => (
                    <Menu.Item
                      key={style.id}
                      onClick={() => setMapStyleId(style.id)}
                      style={{
                        backgroundColor: mapStyleId === style.id ? 'var(--tribos-bg-tertiary)' : 'transparent',
                      }}
                    >
                      {style.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
              <RouteSettingsButton
                onClick={() => setPreferencesOpen(true)}
                speedProfile={speedProfile}
                isImperial={isImperial}
              />
              <Tooltip label="Route Learning - Prefer familiar roads">
                <Button
                  variant="default"
                  color="dark"
                  size="md"
                  onClick={() => setRoadPreferencesOpen(true)}
                  style={{
                    padding: '0 12px',
                    backgroundColor: 'var(--tribos-bg-secondary)',
                    border: '1px solid var(--tribos-border)',
                  }}
                >
                  <IconBrain size={20} color="var(--tribos-lime)" />
                </Button>
              </Tooltip>
              {routeGeometry && (
                <Tooltip label={editMode ? 'Exit Edit Mode' : 'Edit Route (Remove Tangents)'}>
                  <Button
                    variant={editMode ? 'filled' : 'default'}
                    color={editMode ? 'red' : 'dark'}
                    size="md"
                    onClick={() => {
                      setEditMode(!editMode);
                      setSelectedSegment(null);
                    }}
                    style={{
                      padding: '0 12px',
                      backgroundColor: editMode ? '#ef4444' : 'var(--tribos-bg-secondary)',
                      border: `1px solid ${editMode ? '#ef4444' : 'var(--tribos-bg-tertiary)'}`,
                    }}
                  >
                    <IconScissors size={20} color="#fff" />
                  </Button>
                </Tooltip>
              )}
              {routeGeometry && selectedWorkout && (
                <Tooltip label={showWorkoutOverlay ? 'Hide workout zones' : 'Show workout zone coloring'}>
                  <Button
                    variant={showWorkoutOverlay ? 'filled' : 'default'}
                    color={showWorkoutOverlay ? 'lime' : 'dark'}
                    size="md"
                    onClick={() => { setShowWorkoutOverlay(!showWorkoutOverlay); if (!showWorkoutOverlay) { setShowGradient(false); setShowSurface(false); } }}
                    style={{
                      padding: '0 12px',
                      backgroundColor: showWorkoutOverlay ? '#84cc16' : 'var(--tribos-bg-secondary)',
                      border: `1px solid ${showWorkoutOverlay ? '#84cc16' : 'var(--tribos-bg-tertiary)'}`,
                    }}
                  >
                    <IconHeartRateMonitor size={20} color="#fff" />
                  </Button>
                </Tooltip>
              )}
              {routeGeometry && (
                <Tooltip label={showGradient ? 'Hide slope gradient' : 'Show slope gradient on route'}>
                  <Button
                    variant={showGradient ? 'filled' : 'default'}
                    color={showGradient ? 'green' : 'dark'}
                    size="md"
                    onClick={() => { setShowGradient(!showGradient); if (!showGradient) { setShowSurface(false); setShowWorkoutOverlay(false); } }}
                    style={{
                      padding: '0 12px',
                      backgroundColor: showGradient ? '#22c55e' : 'var(--tribos-bg-secondary)',
                      border: `1px solid ${showGradient ? '#22c55e' : 'var(--tribos-bg-tertiary)'}`,
                    }}
                  >
                    <IconMountain size={20} color="#fff" />
                  </Button>
                </Tooltip>
              )}
              {routeGeometry && (
                <Tooltip label={showSurface ? 'Hide surface types' : 'Show surface types (paved/gravel/unpaved)'}>
                  <Button
                    variant={showSurface ? 'filled' : 'default'}
                    color={showSurface ? 'orange' : 'dark'}
                    size="md"
                    loading={surfaceLoading}
                    onClick={() => { setShowSurface(!showSurface); if (!showSurface) { setShowGradient(false); setShowWorkoutOverlay(false); } }}
                    style={{
                      padding: '0 12px',
                      backgroundColor: showSurface ? '#D97706' : 'var(--tribos-bg-secondary)',
                      border: `1px solid ${showSurface ? '#D97706' : 'var(--tribos-bg-tertiary)'}`,
                    }}
                  >
                    <IconRoad size={20} color="#fff" />
                  </Button>
                </Tooltip>
              )}
            </Box>
          )}

          {MAPBOX_TOKEN ? (
            <Map
              ref={mapRef}
              {...viewport}
              onMove={evt => setViewport(evt.viewState)}
              onMouseMove={handleMapMouseMove}
              onMouseLeave={handleMapMouseLeave}
              onClick={handleMapClick}
              mapStyle={currentMapStyle}
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              cursor={builderMode === 'manual' || builderMode === 'editing' ? 'crosshair' : 'grab'}
            >
              {/* Bike Infrastructure Layer - renders below routes */}
              {showBikeInfrastructure && mapStyleId !== 'cyclosm' && (
                <BikeInfrastructureLayer
                  data={infrastructureData}
                  visible={showBikeInfrastructure}
                />
              )}

              {/* Smart POIs along route */}
              {showPOIs && poiData.length > 0 && (
                <RoutePOILayer
                  pois={poiData}
                  activeCategories={poiCategories}
                  onSelect={handleSelectPOI}
                  selectedId={selectedPOI?.id}
                />
              )}

              {/* Route visualization layers — priority: workout > surface > gradient > flat */}
              {coloredSegments && (
                <Source id="colored-route" type="geojson" data={coloredSegments}>
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

              {surfaceRouteGeoJSON && !coloredSegments && (
                <Source id="surface-route" type="geojson" data={surfaceRouteGeoJSON}>
                  <Layer
                    id="route-surface"
                    type="line"
                    paint={{
                      'line-color': ['get', 'color'],
                      'line-width': 6,
                      'line-opacity': 0.85,
                    }}
                  />
                </Source>
              )}

              {gradientRouteGeoJSON && !coloredSegments && !surfaceRouteGeoJSON && (
                <Source id="gradient-route" type="geojson" data={gradientRouteGeoJSON}>
                  <Layer
                    id="route-gradient"
                    type="line"
                    paint={{
                      'line-color': ['get', 'color'],
                      'line-width': 6,
                      'line-opacity': 0.85,
                    }}
                  />
                </Source>
              )}

              {routeGeoJSON && !coloredSegments && !surfaceRouteGeoJSON && !gradientRouteGeoJSON && (
                <Source id="route" type="geojson" data={routeGeoJSON}>
                  <Layer
                    id="route-line"
                    type="line"
                    paint={{
                      'line-color': editMode ? '#666666' : '#32CD32',
                      'line-width': 4,
                      'line-opacity': editMode ? 0.6 : 0.8,
                      ...(!snapToRoads && { 'line-dasharray': [2, 1] }),
                    }}
                  />
                </Source>
              )}

              {/* Selected segment highlight (edit mode) */}
              {segmentHighlightGeoJSON && (
                <Source id="segment-highlight" type="geojson" data={segmentHighlightGeoJSON}>
                  <Layer
                    id="segment-highlight-line"
                    type="line"
                    paint={{
                      'line-color': '#ef4444',
                      'line-width': 6,
                      'line-opacity': 0.9
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

              {/* Render waypoint markers — draggable */}
              {waypoints.map((waypoint, index) => (
                <Marker
                  key={waypoint.id}
                  longitude={waypoint.position[0]}
                  latitude={waypoint.position[1]}
                  anchor="bottom"
                  draggable
                  onDragStart={() => { waypointDragRef.current = true; }}
                  onDragEnd={(e) => handleWaypointDragEnd(waypoint.id, e)}
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    removeWaypoint(waypoint.id);
                  }}
                >
                  <div style={{
                    backgroundColor: index === 0 ? '#22c55e' : index === waypoints.length - 1 ? '#ef4444' : '#32CD32',
                    color: 'white',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'grab',
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    {index === 0 ? 'S' : index === waypoints.length - 1 ? 'E' : index + 1}
                  </div>
                </Marker>
              ))}

              {/* Elevation profile hover marker */}
              {elevationHoverPosition && (
                <Marker
                  longitude={elevationHoverPosition.lng}
                  latitude={elevationHoverPosition.lat}
                  anchor="center"
                >
                  <div style={{
                    width: 16,
                    height: 16,
                    backgroundColor: '#32CD32',
                    borderRadius: '50%',
                    border: '3px solid white',
                    boxShadow: '0 0 0 2px #32CD32, 0 2px 12px rgba(50, 205, 50, 0.6)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                </Marker>
              )}
            </Map>
          ) : (
            <Box
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'var(--tribos-bg-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Stack align="center" gap="md">
                <Text size="4rem">🗺️</Text>
                <Title order={2} style={{ color: 'var(--tribos-text-primary)' }}>
                  Map Configuration Required
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)', maxWidth: 400, textAlign: 'center' }}>
                  Configure VITE_MAPBOX_TOKEN in your .env file to enable the map.
                </Text>
              </Stack>
            </Box>
          )}

          {/* Bike Infrastructure Legend */}
          {showBikeInfrastructure && mapStyleId !== 'cyclosm' && (
            <BikeInfrastructureLegend visible={showBikeInfrastructure} />
          )}

          {/* POI Panel (desktop) */}
          {showPOIs && (
            <Box style={{ position: 'absolute', bottom: 20, left: 20, width: 320, zIndex: 10 }}>
              <POIPanel
                pois={poiData}
                loading={poiLoading}
                activeCategories={poiCategories}
                onToggleCategory={handleTogglePOICategory}
                onSelectPOI={handleSelectPOI}
                selectedId={selectedPOI?.id}
                onClose={() => setShowPOIs(false)}
                formatDist={formatDist}
              />
            </Box>
          )}

          {/* Edit Mode Floating Panel */}
          {editMode && (
            <Paper
              p="md"
              shadow="md"
              style={{
                position: 'absolute',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
                minWidth: 320,
                backgroundColor: selectedSegment ? 'rgba(239, 68, 68, 0.95)' : 'var(--tribos-bg-secondary)',
                border: `1px solid ${selectedSegment ? '#ef4444' : 'var(--tribos-bg-tertiary)'}`,
              }}
            >
              {selectedSegment ? (
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" fw={500} c="white">Segment Selected</Text>
                    <Text size="xs" c="rgba(255,255,255,0.8)">
                      ~{selectedSegment.stats?.distanceSaved || 0}m shorter
                    </Text>
                  </Group>
                  <Group grow>
                    <Button
                      size="sm"
                      color="dark"
                      onClick={handleRemoveSegment}
                      loading={isRemovingSegment}
                      leftSection={<IconTrash size={16} />}
                    >
                      Remove & Re-route
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      color="white"
                      onClick={() => setSelectedSegment(null)}
                    >
                      Cancel
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Text size="sm" c="dimmed" ta="center">
                  Click on a tangent segment to select it for removal
                </Text>
              )}
            </Paper>
          )}

          {/* Floating Route Settings */}
          <FloatingRouteSettings
            opened={preferencesOpen}
            onClose={() => setPreferencesOpen(false)}
            speedProfile={speedProfile}
            onSpeedProfileUpdate={setSpeedProfile}
            isImperial={isImperial}
          />

          {/* Road Preferences Modal */}
          <Modal
            opened={roadPreferencesOpen}
            onClose={() => setRoadPreferencesOpen(false)}
            title={null}
            size="lg"
            centered
            withCloseButton={false}
            styles={{
              content: {
                backgroundColor: 'var(--tribos-bg-primary)',
                border: '1px solid var(--tribos-border)',
              },
              body: { padding: 0 },
            }}
          >
            <RoadPreferencesCard />
            <Box p="md" pt={0}>
              <Button
                fullWidth
                variant="subtle"
                color="gray"
                onClick={() => setRoadPreferencesOpen(false)}
              >
                Close
              </Button>
            </Box>
          </Modal>

          {/* Map Tutorial Overlay */}
          {MAPBOX_TOKEN && showTutorial && waypoints.length === 0 && !routeGeometry && (
            <MapTutorialOverlay
              show={showTutorial}
              onDismiss={() => setShowTutorial(false)}
              waypointCount={waypoints.length}
            />
          )}
        </Box>
      </Box>

      {/* Surface distribution bar — shown above elevation profile when surface overlay is active */}
      {showSurface && surfaceDistribution && Object.keys(surfaceDistribution).length > 0 && (
        <Box
          style={{
            position: 'fixed',
            bottom: 120, // above elevation profile
            left: isMobile ? 0 : 380,
            right: 0,
            zIndex: 100,
            padding: '4px 12px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {Object.entries(surfaceDistribution).map(([surface, pct]) => (
            <Group key={surface} gap={4}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: SURFACE_COLORS[surface] }} />
              <Text size="xs" style={{ color: '#fff' }}>
                {SURFACE_LABELS[surface]} {pct}%
              </Text>
            </Group>
          ))}
        </Box>
      )}

      {/* Elevation Profile - Fixed at bottom of screen, offset by sidebar width */}
      {routeGeometry?.coordinates && routeGeometry.coordinates.length > 1 && (
        <ElevationProfile
          coordinates={routeGeometry.coordinates}
          totalDistance={routeStats.distance}
          isImperial={isImperial}
          leftOffset={isMobile ? 0 : 380}
          onHoverPosition={setElevationHoverPosition}
          highlightDistance={mapHoverDistance}
        />
      )}

      {/* Saved Routes Drawer */}
      <SavedRoutesDrawer
        opened={savedRoutesOpen}
        onClose={() => setSavedRoutesOpen(false)}
        onRouteSelect={(id) => navigate(`/routes/${id}`)}
      />
    </AppShell>
  );
}

export default RouteBuilder;
