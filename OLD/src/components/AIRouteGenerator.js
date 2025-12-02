import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Paper,
  Text,
  Button,
  Group,
  Stack,
  Slider,
  Radio,
  Card,
  Badge,
  Grid,
  ActionIcon,
  Alert,
  Loader,
  Center,
  TextInput,
  Select,
  Divider,
  Switch,
  Tabs,
} from '@mantine/core';
import {
  Brain,
  Sun,
  Moon,
  Route,
  Play,
  RotateCcw,
  Navigation,
  Settings,
  Gauge,
  TrendingDown,
  TrendingUp,
  MapPin,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../utils/units';
import { getWeatherData, getMockWeatherData } from '../utils/weather';
import { generateAIRoutes } from '../utils/aiRouteGenerator';
import PreferenceSettings from './PreferenceSettings';
import { EnhancedContextCollector } from '../utils/enhancedContext';
import TrainingContextSelector from './TrainingContextSelector';
import WorkoutSelector from './WorkoutSelector';
import { estimateTSS, WORKOUT_TYPES } from '../utils/trainingPlans';
import { supabase } from '../supabase';
import { getUserSpeedProfile, suggestSpeedModifier, updateSpeedModifier } from '../utils/speedAnalysis';
import { generateIntervalCues, generateCuesFromWorkoutStructure } from '../utils/intervalCues';
import IntervalCues from './IntervalCues';
import { getCurrentFTP } from '../services/ftp';
import { getRouteRecommendation } from '../utils/trainingRecommendations';
import { calculateTrainingMetricsFromRides } from '../services/aiCoach';

const AIRouteGenerator = ({ mapRef, onRouteGenerated, onStartLocationSet, externalStartLocation }) => {
  const { user } = useAuth();
  const { formatDistance, formatElevation, formatTemperature, formatSpeed } = useUnits();
  const [searchParams, setSearchParams] = useSearchParams();

  
  // User inputs
  const [timeAvailable, setTimeAvailable] = useState(60); // minutes
  const [trainingGoal, setTrainingGoal] = useState('endurance');
  const [recreationalStyle, setRecreationalStyle] = useState('scenic'); // For recreational mode
  const [routeType, setRouteType] = useState('loop');
  const [startLocation, setStartLocation] = useState(null);
  const [addressInput, setAddressInput] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [isTrainingMode, setIsTrainingMode] = useState(true); // Toggle between training and recreational
  const [activeTab, setActiveTab] = useState('quick'); // Tab state: quick, training, preferences

  // Training context state
  const [trainingContext, setTrainingContext] = useState({
    workoutType: 'endurance',
    phase: 'base',
    targetDuration: 60,
    targetTSS: 75,
    primaryZone: 2
  });

  // Track if training context has been manually modified
  const [trainingContextManuallySet, setTrainingContextManuallySet] = useState(false);

  // Track the source of training context to avoid conflicts
  const [trainingContextSource, setTrainingContextSource] = useState(null);
  // null | 'library_workout' | 'plan_workout' | 'manual' | 'ride_style'

  // Training plan integration
  const [activePlans, setActivePlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [planWorkouts, setPlanWorkouts] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  // Workout library integration
  const [selectedLibraryWorkout, setSelectedLibraryWorkout] = useState(null);

  // Training metrics for smart suggestions
  const [currentFTP, setCurrentFTP] = useState(null);
  const [trainingMetrics, setTrainingMetrics] = useState(null);
  const [routeRecommendation, setRouteRecommendation] = useState(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedRoutes, setGeneratedRoutes] = useState([]);
  const [weatherData, setWeatherData] = useState(null);
  const [error, setError] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  const [userPreferences, setUserPreferences] = useState(null);

  // Feature toggles for debugging
  const [usePastRides, setUsePastRides] = useState(false); // Default OFF to avoid junk routes

  // Natural language route request
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [processingNaturalLanguage, setProcessingNaturalLanguage] = useState(false);
  const [useTrainingContext, setUseTrainingContext] = useState(true);

  // Speed profile and modifier
  const [speedProfile, setSpeedProfile] = useState(null);
  const [speedModifier, setSpeedModifier] = useState(1.0);
  const [suggestedModifier, setSuggestedModifier] = useState(null);

  // Ref to track the last processed external location to prevent re-render loops
  const lastExternalLocationRef = useRef(null);

  // Handler to set training context and mark as manually set
  const handleTrainingContextChange = useCallback((newContext) => {
    setTrainingContext(newContext);
    setTrainingContextSource('manual');
    setTrainingContextManuallySet(true);
  }, []);

  // Handler for workout library selection
  const handleLibraryWorkoutSelect = useCallback((workout) => {
    if (!workout) {
      console.error('No workout provided to handleLibraryWorkoutSelect');
      return;
    }

    console.log('Workout selected from library:', workout);
    setSelectedLibraryWorkout(workout);

    // Set source to track that library workout is controlling training context
    setTrainingContextSource('library_workout');

    // Update training context from workout
    setTrainingContext({
      workoutType: workout.category || 'endurance',
      phase: 'build', // Default phase
      targetDuration: workout.duration || 60,
      targetTSS: workout.targetTSS || 75,
      primaryZone: workout.primaryZone || 2
    });

    // Update time available to match workout
    setTimeAvailable(workout.duration || 60);

    // Mark as manually set so it doesn't get overridden
    setTrainingContextManuallySet(true);

    // Clear any training plan workout selection
    setSelectedWorkout(null);

    toast.success(`Workout selected: ${workout.name}`);
  }, []);

  // Sync training context with trainingGoal and timeAvailable (but only if not manually set)
  useEffect(() => {
    // ONLY auto-sync if:
    // 1. No workout is selected (library or plan) AND
    // 2. Not manually set AND
    // 3. Source is null or 'ride_style'

    const noWorkoutSelected = !selectedWorkout && !selectedLibraryWorkout;
    const canAutoSync = noWorkoutSelected &&
                        !trainingContextManuallySet &&
                        (trainingContextSource === null || trainingContextSource === 'ride_style');

    if (canAutoSync) {
      // Get default values for this workout type from WORKOUT_TYPES
      const workoutType = WORKOUT_TYPES[trainingGoal];

      setTrainingContext(prev => ({
        ...prev,
        workoutType: trainingGoal,
        targetDuration: timeAvailable,
        // Update primaryZone and targetTSS based on workout type defaults
        primaryZone: workoutType?.primaryZone || prev.primaryZone,
        targetTSS: workoutType?.defaultTSS || prev.targetTSS
      }));

      // Mark source as ride_style
      setTrainingContextSource('ride_style');
    }
  }, [trainingGoal, timeAvailable, trainingContextManuallySet, selectedWorkout, selectedLibraryWorkout, trainingContextSource]);

  // Training goal options
  const trainingGoals = [
    { value: 'endurance', label: 'Endurance', icon: '🚴', description: 'Steady, sustained effort' },
    { value: 'intervals', label: 'Intervals', icon: '⚡', description: 'High intensity training' },
    { value: 'recovery', label: 'Recovery', icon: '😌', description: 'Easy, restorative ride' },
    { value: 'hills', label: 'Hill Training', icon: '⛰️', description: 'Climbing focused workout' },
  ];

  // Recreational ride style options
  const recreationalStyles = [
    { value: 'scenic', label: 'Scenic', icon: '🌄', description: 'Beautiful views and quiet roads' },
    { value: 'urban', label: 'Urban Explorer', icon: '🏙️', description: 'City streets and neighborhoods' },
    { value: 'coffee', label: 'Coffee Ride', icon: '☕', description: 'Relaxed pace with cafe stops' },
    { value: 'social', label: 'Social Cruise', icon: '👥', description: 'Easy group-friendly route' },
  ];

  // Route type options
  const routeTypes = [
    { value: 'loop', label: 'Loop', description: 'Return to start point' },
    { value: 'out_back', label: 'Out & Back', description: 'Go out, return same way' },
    { value: 'point_to_point', label: 'Point-to-Point', description: 'End at different location' },
  ];

  // Fetch weather data when location is set
  const fetchWeatherData = useCallback(async (location) => {
    if (!location) return;

    try {
      const weather = await getWeatherData(location[1], location[0]);
      if (weather) {
        setWeatherData(weather);
        // Don't show toast here - location toast is already shown
      } else {
        // Use mock data as fallback
        setWeatherData(getMockWeatherData());
      }
    } catch (error) {
      console.warn('Weather fetch failed, using mock data:', error);
      setWeatherData(getMockWeatherData());
    }
  }, []);

  // Geocode address to coordinates using Mapbox Geocoding API
  const geocodeAddress = async (address, proximity = null) => {
    if (!address.trim()) return null;

    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!mapboxToken) {
      toast.error('Mapbox token not available for geocoding');
      return null;
    }

    try {
      setGeocoding(true);
      const encodedAddress = encodeURIComponent(address);

      // Add proximity bias if available (helps disambiguate locations)
      let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&country=US&types=place,locality,address,poi`;

      if (proximity) {
        url += `&proximity=${proximity[0]},${proximity[1]}`;
      }

      console.log(`🔍 Geocoding: "${address}"${proximity ? ' with proximity bias' : ''}`);

      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const [longitude, latitude] = feature.center;
        console.log(`✅ Geocoded "${address}" to:`, feature.place_name);
        return {
          coordinates: [longitude, latitude],
          address: feature.place_name
        };
      } else {
        toast.error('Address not found');
        return null;
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast.error('Failed to find address');
      return null;
    } finally {
      setGeocoding(false);
    }
  };

  // Reverse geocode coordinates to address
  const reverseGeocode = useCallback(async (location) => {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!mapboxToken || !location) return '';

    try {
      const [longitude, latitude] = location;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxToken}&types=address,poi`
      );

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        return data.features[0].place_name;
      }
      return '';
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      return '';
    }
  }, []);

  // Handle address search
  const handleAddressSearch = async () => {
    const result = await geocodeAddress(addressInput);
    if (result) {
      const location = result.coordinates;
      setStartLocation(location);
      setCurrentAddress(result.address);
      onStartLocationSet && onStartLocationSet(location);
      
      // Fetch weather for this location
      await fetchWeatherData(location);
      
      // Center map on the location
      if (mapRef?.current) {
        mapRef.current.flyTo({
          center: location,
          zoom: 13,
          duration: 1000
        });
      }
      
      toast.success('Location set from address');
    }
  };

  // Get current location
  const getCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location = [position.coords.longitude, position.coords.latitude];
        setStartLocation(location);
        onStartLocationSet && onStartLocationSet(location);

        // Get address for current location
        const address = await reverseGeocode(location);
        setCurrentAddress(address);

        toast.success('Current location set as start point');

        // Fetch weather for this location
        await fetchWeatherData(location);

        // Center map on current location
        if (mapRef?.current) {
          mapRef.current.flyTo({
            center: location,
            zoom: 13,
            duration: 1000
          });
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        // Don't show error toast as it's not critical
      },
      {
        enableHighAccuracy: false, // Use faster, less accurate location
        timeout: 15000, // Longer timeout
        maximumAge: 300000 // Accept cached location up to 5 minutes old
      }
    );
  }, [mapRef, onStartLocationSet, reverseGeocode, fetchWeatherData]);

  // Handle map click for start location
  useEffect(() => {
    if (!mapRef?.current) return;

    const map = mapRef.current.getMap();

    const handleMapClick = async (e) => {
      const { lng, lat } = e.lngLat;
      const location = [lng, lat];
      setStartLocation(location);
      onStartLocationSet && onStartLocationSet(location);

      // Get address for clicked location
      const address = await reverseGeocode(location);
      setCurrentAddress(address);

      toast.success('Start location set');

      // Fetch weather for clicked location
      await fetchWeatherData(location);
    };

    map.on('click', handleMapClick);
    return () => map.off('click', handleMapClick);
  }, [mapRef, onStartLocationSet, reverseGeocode, fetchWeatherData]);

  // Handle external location changes (e.g., from map marker dragging)
  // Uses a ref to track the last processed location and prevent infinite loops
  useEffect(() => {
    if (!externalStartLocation) return;

    // Create a stable string representation for comparison
    const externalKey = `${externalStartLocation[0]},${externalStartLocation[1]}`;
    const lastKey = lastExternalLocationRef.current;

    // Only process if this is truly a new location
    if (externalKey !== lastKey) {
      lastExternalLocationRef.current = externalKey;

      // Update the location without triggering circular updates
      setStartLocation(externalStartLocation);

      // Fetch address and weather in the background
      // Using Promise.all to avoid blocking and potential race conditions
      Promise.all([
        reverseGeocode(externalStartLocation),
        fetchWeatherData(externalStartLocation)
      ]).then(([address]) => {
        if (address) {
          setCurrentAddress(address);
        }
      }).catch(error => {
        console.warn('Failed to update location details:', error);
      });
    }
  }, [externalStartLocation, reverseGeocode, fetchWeatherData]);

  // Load user preferences for traffic avoidance
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!user?.id) return;

      try {
        console.log('🔧 Loading user preferences for traffic avoidance...');
        const preferences = await EnhancedContextCollector.getCompletePreferences(user.id);
        if (preferences) {
          setUserPreferences(preferences);
          console.log('✅ Loaded user preferences:', preferences);

          // Log key traffic avoidance settings
          if (preferences.routingPreferences?.trafficTolerance) {
            console.log(`🚫 Traffic tolerance: ${preferences.routingPreferences.trafficTolerance}`);
          }
          if (preferences.scenicPreferences?.quietnessLevel) {
            console.log(`🤫 Quietness level: ${preferences.scenicPreferences.quietnessLevel}`);
          }
        } else {
          console.log('⚠️ No user preferences found - using defaults');
        }
      } catch (error) {
        console.error('❌ Failed to load user preferences:', error);
      }
    };

    loadUserPreferences();
  }, [user?.id]);

  // Load active training plans
  useEffect(() => {
    const loadTrainingPlans = async () => {
      if (!user?.id) return;

      // Check for demo mode - skip training plans fetch
      const { isDemoMode } = await import('../utils/demoData');
      if (isDemoMode()) {
        console.log('✅ Demo mode: skipping training plans fetch');
        setActivePlans([]);
        return;
      }

      try {
        const { data: plans } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        setActivePlans(plans || []);
      } catch (error) {
        console.error('Failed to load training plans:', error);
      }
    };

    loadTrainingPlans();
  }, [user?.id]);

  // Load workouts when plan is selected
  useEffect(() => {
    const loadWorkouts = async () => {
      if (!selectedPlan) {
        setPlanWorkouts([]);
        setSelectedWorkout(null);
        return;
      }

      try {
        const { data: workouts } = await supabase
          .from('planned_workouts')
          .select('*')
          .eq('plan_id', selectedPlan)
          .neq('workout_type', 'rest')
          .order('week_number', { ascending: true })
          .order('day_of_week', { ascending: true });

        setPlanWorkouts(workouts || []);
      } catch (error) {
        console.error('Failed to load workouts:', error);
      }
    };

    loadWorkouts();
  }, [selectedPlan]);

  // Handle URL parameters for workout/plan deep linking
  useEffect(() => {
    const workoutId = searchParams.get('workout');
    const planId = searchParams.get('plan');

    if (workoutId && !selectedWorkout) {
      // Load workout from database and pre-populate
      const loadWorkoutFromURL = async () => {
        try {
          const { data: workout, error } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('id', workoutId)
            .single();

          if (error) throw error;

          if (workout) {
            // Set training context from workout
            setTrainingContext({
              workoutType: workout.workout_type,
              phase: workout.phase || 'base',
              targetDuration: workout.target_duration,
              targetTSS: workout.target_tss,
              primaryZone: workout.target_zone,
            });

            setTimeAvailable(workout.target_duration);
            setTrainingGoal(workout.workout_type);
            setSelectedWorkout(workoutId);

            // Auto-select the plan if provided
            if (planId) {
              setSelectedPlan(planId);
            }

            // Show success message
            toast.success(`Building route for: ${workout.workout_type} workout`);
          }
        } catch (error) {
          console.error('Failed to load workout from URL:', error);
          toast.error('Failed to load workout details');
        }
      };

      loadWorkoutFromURL();
    }
  }, [searchParams]);

  // Update training context when workout is selected
  useEffect(() => {
    if (!selectedWorkout) return;

    const workout = planWorkouts.find(w => w.id === selectedWorkout);
    if (workout) {
      // Set source to track that plan workout is controlling training context
      setTrainingContextSource('plan_workout');

      setTrainingContext({
        workoutType: workout.workout_type,
        phase: workout.phase || 'base',
        targetDuration: workout.target_duration,
        targetTSS: workout.target_tss,
        primaryZone: workout.target_zone,
      });

      // Mark as manually set to prevent auto-sync override
      setTrainingContextManuallySet(true);

      // Clear library workout selection
      setSelectedLibraryWorkout(null);

      // Also update time available to match workout duration
      setTimeAvailable(workout.target_duration);
    }
  }, [selectedWorkout, planWorkouts]);

  // Load training context (FTP, TSB, health metrics) for smart suggestions
  useEffect(() => {
    const loadTrainingContext = async () => {
      if (!user?.id) return;

      try {
        // 1. Load current FTP
        const ftpData = await getCurrentFTP(user.id);
        setCurrentFTP(ftpData);

        // 2. Load recent rides to calculate TSB
        const { data: rides, error: ridesError } = await supabase
          .from('routes')
          .select('*')
          .eq('user_id', user.id)
          .not('recorded_at', 'is', null)
          .order('recorded_at', { ascending: false })
          .limit(90);

        if (ridesError) throw ridesError;

        // 3. Calculate training metrics
        const metrics = calculateTrainingMetricsFromRides(rides || []);
        setTrainingMetrics(metrics);

        // 4. Get health metrics
        const { data: health, error: healthError } = await supabase
          .from('health_metrics')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(7);

        if (healthError) throw healthError;

        // 5. Generate recommendation
        const recommendation = getRouteRecommendation(metrics.tsb, health);
        setRouteRecommendation(recommendation);

        console.log('📊 Training Context Loaded:', {
          ftp: ftpData?.ftp,
          tsb: metrics.tsb,
          recommendation: recommendation.recommendedIntensity
        });
      } catch (error) {
        console.error('Failed to load training context:', error);
      }
    };

    loadTrainingContext();
  }, [user?.id]);

  // Automatically get current location on mount
  useEffect(() => {
    getCurrentLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle workout parameter from URL
  useEffect(() => {
    const workoutId = searchParams.get('workout');

    if (workoutId && !selectedWorkout && user?.id) {
      const loadWorkoutFromUrl = async () => {
        try {
          // Find the workout and its plan
          const { data: workout, error } = await supabase
            .from('planned_workouts')
            .select('*, training_plans!inner(id, name)')
            .eq('id', workoutId)
            .eq('training_plans.user_id', user.id)
            .single();

          if (error) {
            console.error('Failed to load workout from URL:', error);
            // Clear the invalid parameter
            setSearchParams({});
            return;
          }

          if (workout) {
            // Set the plan first
            setSelectedPlan(workout.plan_id);
            // Workout will be set after planWorkouts loads
            // Store the workout ID to select it once workouts are loaded
            sessionStorage.setItem('pendingWorkoutSelection', workoutId);
          }
        } catch (error) {
          console.error('Error loading workout from URL:', error);
          setSearchParams({});
        }
      };

      loadWorkoutFromUrl();
    }
  }, [searchParams, selectedWorkout, user?.id, setSearchParams]);

  // Select workout once plan workouts are loaded (for URL parameter flow)
  useEffect(() => {
    const pendingWorkoutId = sessionStorage.getItem('pendingWorkoutSelection');
    if (pendingWorkoutId && planWorkouts.length > 0 && !selectedWorkout) {
      // Check if the workout is in the loaded workouts
      const workout = planWorkouts.find(w => w.id === pendingWorkoutId);
      if (workout) {
        setSelectedWorkout(pendingWorkoutId);
        sessionStorage.removeItem('pendingWorkoutSelection');
        // Clear the URL parameter after selection
        setSearchParams({});
        toast.success(`Loaded workout: Week ${workout.week_number} - ${WORKOUT_TYPES[workout.workout_type]?.name || workout.workout_type}`);
      }
    }
  }, [planWorkouts, selectedWorkout, setSearchParams]);

  // Load speed profile and suggestion on mount
  useEffect(() => {
    if (!user?.id) return;

    const loadSpeedData = async () => {
      try {
        // Load speed profile
        const profile = await getUserSpeedProfile(user.id);
        setSpeedProfile(profile);
        setSpeedModifier(profile.currentSpeedModifier || 1.0);

        // Get fatigue-based suggestion
        const suggestion = await suggestSpeedModifier(user.id);
        setSuggestedModifier(suggestion);
      } catch (error) {
        console.error('Error loading speed profile:', error);
      }
    };

    loadSpeedData();
  }, [user?.id]);

  // Handle speed modifier change
  const handleSpeedModifierChange = async (newModifier) => {
    setSpeedModifier(newModifier);
    if (user?.id) {
      await updateSpeedModifier(user.id, newModifier);
    }
  };

  // Generate routes with natural language preferences (bypasses generic AI generation)
  const generateRoutesWithNaturalLanguage = async (parsedRoute) => {
    if (!parsedRoute.startLocation) {
      toast.error('No start location found');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      console.log('🗣️ Generating routes from natural language request:', parsedRoute);
      console.log('📍 Start location:', parsedRoute.startLocation);
      console.log('🎯 Preferences:', parsedRoute.preferences);

      // Import the routing utilities we need
      const { getSmartCyclingRoute } = await import('../utils/smartCyclingRouter');

      // For now, let's create routes that go through the specified waypoints
      // Build waypoints array: start -> intermediate locations -> back to start (if loop)
      const waypoints = [parsedRoute.startLocation];

      // Add waypoints if specified
      if (parsedRoute.waypoints && parsedRoute.waypoints.length > 0) {
        // Geocode each waypoint using the start location as proximity bias
        for (const waypointName of parsedRoute.waypoints) {
          console.log(`🔍 Geocoding waypoint: ${waypointName}`);
          const coords = await geocodeAddress(waypointName, parsedRoute.startLocation);
          if (coords) {
            console.log(`✅ Found coordinates for ${waypointName}:`, coords.coordinates);
            waypoints.push(coords.coordinates);
          } else {
            console.warn(`⚠️ Could not geocode waypoint: ${waypointName}`);
          }
        }
      }

      // If loop or out_back, return to start
      if (parsedRoute.routeType === 'loop' || parsedRoute.routeType === 'out_back') {
        waypoints.push(parsedRoute.startLocation);
      }

      console.log('🗺️ Waypoints for route:', waypoints);

      // Get Mapbox token
      const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
      if (!mapboxToken) {
        throw new Error('Mapbox token not available');
      }

      // Build routing preferences based on user's gravel/trail preferences
      let routingPreferences = null;
      const surfaceType = parsedRoute.preferences?.surfaceType || 'mixed';

      if (surfaceType === 'gravel' || parsedRoute.preferences?.trailPreference) {
        console.log('🌲 Gravel/trail preference detected - configuring for unpaved roads');
        // For gravel cycling, we want to INCLUDE unpaved roads and trails
        // This will be passed to directions.js which will NOT exclude unpaved roads
        routingPreferences = {
          surfaceType: 'gravel', // Pass to routing engine
          routingPreferences: {
            trafficTolerance: 'low', // Prefer quieter roads that are more likely unpaved
          },
          scenicPreferences: {
            quietnessLevel: 'high', // Quieter roads often correlate with gravel/dirt
          },
          safetyPreferences: {
            bikeInfrastructure: 'preferred' // Not required, as gravel roads may not have infrastructure
          }
        };
      } else if (surfaceType === 'paved') {
        console.log('🚴 Paved road cycling - using standard cycling preferences');
        routingPreferences = {
          surfaceType: 'paved',
          routingPreferences: {
            trafficTolerance: 'low', // Still prefer bike-friendly roads
          }
        };
      } else {
        console.log('🚴 Mixed surface cycling - balanced preferences');
        routingPreferences = {
          surfaceType: 'mixed',
          routingPreferences: {
            trafficTolerance: 'medium',
          }
        };
      }

      console.log(`🚴 Routing with ${waypoints.length} waypoints (gravel preference: ${parsedRoute.preferences?.trailPreference})`);
      console.log('🔧 Routing preferences:', routingPreferences);

      // Use smart cycling router for ALL routes (handles Stadia Maps, BRouter, GraphHopper, Mapbox)
      // Priority: Stadia Maps (Valhalla) → BRouter (gravel) → GraphHopper → Mapbox
      console.log(`🧠 Using smart cycling router for ${surfaceType} route`);

      const routeData = await getSmartCyclingRoute(waypoints, {
        profile: surfaceType === 'gravel' ? 'gravel' : routingPreferences?.profile || 'road',
        preferences: routingPreferences,
        trainingGoal: parsedRoute.trainingGoal || 'endurance',
        mapboxToken: mapboxToken
      });

      if (!routeData) {
        console.warn('⚠️ Smart routing failed - no route available for these waypoints');
        throw new Error(`Could not find ${surfaceType} route for these waypoints. Try different locations or fewer waypoints.`);
      }

      console.log(`✅ Smart cycling route generated via ${routeData.source}`);

      if (routeData && routeData.coordinates) {
        const waypointNames = parsedRoute.waypoints?.join(' → ') || 'waypoints';

        // Build description based on surface type and routing source
        let surfaceDescription = 'Cycling route';
        let routingSource = routeData.source || 'unknown';

        // Map routing source to readable names
        const sourceNames = {
          'stadia_maps': 'Stadia Maps (Valhalla)',
          'brouter': 'BRouter',
          'brouter_gravel': 'BRouter',
          'graphhopper': 'GraphHopper',
          'mapbox_optimized': 'Mapbox',
          'mapbox_gravel_fallback': 'Mapbox',
          'graphhopper_fallback': 'GraphHopper'
        };

        const sourceName = sourceNames[routingSource] || routingSource;

        if (surfaceType === 'gravel') {
          surfaceDescription = `Gravel/dirt focused route - prioritizes unpaved roads and trails (via ${sourceName})`;
        } else if (surfaceType === 'paved') {
          surfaceDescription = `Paved road route (via ${sourceName})`;
        }

        // Handle elevation data from different routing sources
        let elevationGain = 0;
        if (routeData.elevation?.ascent) {
          // GraphHopper format
          elevationGain = routeData.elevation.ascent;
        } else if (routeData.elevationGain) {
          // Mapbox format
          elevationGain = routeData.elevationGain;
        }

        const route = {
          name: `${parsedRoute.startLocationName} → ${waypointNames}`,
          description: `${surfaceDescription} from ${parsedRoute.startLocationName}`,
          difficulty: 'moderate',
          coordinates: routeData.coordinates,
          distance: (routeData.distance || 0) / 1000, // Convert meters to km
          elevationGain: elevationGain,
          routeType: parsedRoute.routeType || 'loop',
          source: 'natural_language',
          routingProvider: routingSource, // Track which routing service was used
          surfaceType: surfaceType, // Include surface type in route data
          elevationProfile: routeData.elevationProfile
        };

        console.log('✅ Generated natural language route:', route);
        setGeneratedRoutes([route]);

        // Disable training context when using natural language
        setUseTrainingContext(false);

        toast.success('Generated custom route based on your description!');
      } else {
        console.error('❌ Failed to generate route - no coordinates returned');
        toast.error('Could not generate route. The waypoints may be too far apart or unreachable by bike.');
      }

    } catch (err) {
      console.error('Natural language route generation error:', err);
      setError(err.message || 'Failed to generate routes');
      toast.error('Failed to generate route from description');
    } finally {
      setGenerating(false);
    }
  };

  // Handle natural language route generation
  const handleNaturalLanguageGenerate = async () => {
    if (!naturalLanguageInput.trim()) {
      toast.error('Please describe the route you want');
      return;
    }

    setProcessingNaturalLanguage(true);
    setError(null);
    setGeneratedRoutes([]);

    try {
      console.log('🧠 Processing natural language request:', naturalLanguageInput);

      // Build and validate prompt
      const prompt = buildNaturalLanguagePrompt(naturalLanguageInput, weatherData, startLocation, currentAddress);

      console.log('📝 Prompt details:', {
        length: prompt.length,
        preview: prompt.substring(0, 150) + '...'
      });

      // Validate prompt before sending
      if (!prompt || prompt.trim().length === 0) {
        throw new Error('Failed to build prompt - please try again');
      }

      if (prompt.length > 10000) {
        throw new Error(`Prompt too long (${prompt.length} chars). Please use a simpler description.`);
      }

      // Call the natural language API
      // Use port 3001 for local dev, same origin for production
      const apiUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3001/api/claude-routes'
        : `${window.location.origin}/api/claude-routes`;

      console.log('📡 Calling API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          maxTokens: 3000,
          temperature: 0.7
        })
      });

      console.log('📡 API Response status:', response.status);

      if (!response.ok) {
        // Try to get error details from response
        let errorMessage = `API request failed: ${response.status}`;
        try {
          const errorData = await response.json();
          console.error('❌ API Error Details:', errorData);
          errorMessage = errorData.error || errorMessage;

          // Log debug info if available
          if (errorData.debug) {
            console.error('Debug info:', errorData.debug);
          }
        } catch (e) {
          console.error('Could not parse error response');
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.success) {
        console.error('❌ API returned error:', data);
        throw new Error(data.error || 'Failed to process route request');
      }

      console.log('✅ Natural language response received');

      // Parse the response to extract route parameters
      const parsedRoute = parseNaturalLanguageResponse(data.content);

      // If we got a location name AND no location is currently set, geocode it to get coordinates
      // Otherwise, use the existing location (respects user's already-set waypoint)
      if (parsedRoute.startLocationName && !startLocation) {
        // Use current location as proximity bias (if available) to resolve location ambiguity
        const proximityBias = startLocation || null;
        const coords = await geocodeAddress(parsedRoute.startLocationName, proximityBias);
        if (coords) {
          parsedRoute.startLocation = coords.coordinates;
          setStartLocation(coords.coordinates);
          onStartLocationSet && onStartLocationSet(coords.coordinates);

          // Set the address
          setCurrentAddress(coords.address);

          // Fetch weather
          await fetchWeatherData(coords.coordinates);

          // Center map
          if (mapRef?.current) {
            mapRef.current.flyTo({
              center: coords.coordinates,
              zoom: 13,
              duration: 1000
            });
          }
        } else {
          toast.error(`Could not find location: ${parsedRoute.startLocationName}`);
          return;
        }
      } else if (startLocation) {
        // Use the existing location that's already set
        parsedRoute.startLocation = startLocation;
        console.log('📍 Using existing start location:', currentAddress || startLocation);
      }

      // Set other parameters from the parsed response
      if (parsedRoute.timeAvailable) {
        setTimeAvailable(parsedRoute.timeAvailable);
      }
      if (parsedRoute.routeType) {
        setRouteType(parsedRoute.routeType);
      }
      if (parsedRoute.trainingGoal) {
        setTrainingGoal(parsedRoute.trainingGoal);
      }

      toast.success('Route parameters extracted! Generating routes now...');

      // Generate routes with natural language preferences
      setTimeout(() => {
        // Check if we successfully set the start location
        if (parsedRoute.startLocation) {
          generateRoutesWithNaturalLanguage(parsedRoute);
        }
      }, 500);

    } catch (err) {
      console.error('Natural language processing error:', err);
      setError(err.message || 'Failed to process route request');
      toast.error('Failed to understand route request. Please try rephrasing.');
    } finally {
      setProcessingNaturalLanguage(false);
    }
  };

  // Generate intelligent routes
  const generateRoutes = async () => {
    if (!startLocation) {
      toast.error('Please set a start location first');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedRoutes([]);

    try {
      console.log('🚀 Starting route generation...');
      console.log('Parameters:', { startLocation, timeAvailable, trainingGoal, routeType });
      console.log('Weather data:', weatherData);
      console.log('🎛️ User preferences for traffic avoidance:', userPreferences);
      console.log('🔧 Feature toggles:', { usePastRides, useTrainingContext });
      console.log('📊 Passing userId:', usePastRides ? user?.id : null);
      console.log('🎯 Passing trainingContext:', useTrainingContext ? trainingContext : null);

      // Show traffic avoidance status
      if (userPreferences?.routingPreferences?.trafficTolerance === 'low') {
        console.log('🚫 TRAFFIC AVOIDANCE ACTIVE - Will prioritize quiet roads');
      } else if (userPreferences?.routingPreferences?.trafficTolerance === 'medium') {
        console.log('⚖️ MODERATE TRAFFIC TOLERANCE - Will avoid major highways');
      } else {
        console.log('🚗 HIGH TRAFFIC TOLERANCE - Will use any road type');
      }


      const routes = await generateAIRoutes({
        startLocation,
        timeAvailable,
        trainingGoal: isTrainingMode ? trainingGoal : recreationalStyle, // Use training goal or recreational style
        routeType,
        weatherData,
        userId: user?.id, // Always pass userId for personalized speeds and past ride analysis
        userPreferences: userPreferences,
        trainingContext: (useTrainingContext && isTrainingMode) ? trainingContext : null, // Only pass training context if enabled AND in training mode
        isRecreational: !isTrainingMode, // Flag to indicate recreational mode
        speedProfile: speedProfile, // Pass user's actual speed profile
        speedModifier: speedModifier, // Pass speed modifier slider value
      });
      
      console.log('🎯 Generated routes:', routes);

      // Defer state update to avoid React error #185
      setTimeout(() => {
        setGeneratedRoutes(routes);

        if (routes.length > 0) {
          toast.success(`Generated ${routes.length} optimized route options!`);
        } else {
          toast.warning('No suitable routes found. Try adjusting your parameters.');
        }
      }, 0);
    } catch (err) {
      console.error('Route generation error:', err);
      setError(err.message || 'Failed to generate routes');
      toast.error('Failed to generate routes');
    } finally {
      setGenerating(false);
    }
  };

  // Format time display
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Get time of day
  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 6) return { label: 'Early Morning', icon: Moon };
    if (hour < 12) return { label: 'Morning', icon: Sun };
    if (hour < 18) return { label: 'Afternoon', icon: Sun };
    return { label: 'Evening', icon: Moon };
  };

  const timeOfDay = getTimeOfDay();

  return (
    <>
      <PreferenceSettings 
        opened={preferencesOpened} 
        onClose={() => {
          setPreferencesOpened(false);
          // Refresh preferences after saving
          if (user?.id) {
            EnhancedContextCollector.getCompletePreferences(user.id).then(prefs => {
              setUserPreferences(prefs);
              console.log('🔄 Refreshed user preferences after saving');
            });
          }
        }} 
      />
      
      <Paper shadow="sm" p="xl" radius="md" style={{ backgroundColor: 'white' }}>
        <Stack gap="lg">
          {/* Header */}
          <div style={{ textAlign: 'center' }}>
            <Brain size={48} style={{ color: '#228be6', marginBottom: '1rem' }} />
            <Text size="xl" fw={600} mb="xs" c="dark.9">
              Smart Route Planner
            </Text>
            <Text size="sm" c="dark.7">
              Personalized routes optimized for your training goals and conditions
            </Text>
          </div>

          {/* TSB-Based Training Recommendation */}
          {routeRecommendation && routeRecommendation.shouldWarn && trainingMetrics && (
            <Alert
              color={routeRecommendation.color}
              title={`${routeRecommendation.icon} Training Recommendation`}
              withCloseButton
            >
              <Stack gap="xs">
                <Text size="sm" c="#1a202c">{routeRecommendation.message}</Text>
                <Text size="xs" c="#475569">
                  Your TSB is {trainingMetrics.tsb} ({routeRecommendation.formStatus}).
                  {routeRecommendation.healthNote && ` ${routeRecommendation.healthNote}`}
                </Text>
              </Stack>
            </Alert>
          )}

        {/* Natural Language Route Request */}
        <Card withBorder p="md" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(34, 211, 238, 0.05) 100%)' }}>
          <Stack gap="sm">
            <Group gap="xs">
              <Brain size={18} style={{ color: '#10b981' }} />
              <Text size="sm" fw={600} c="teal">
                Describe Your Route
              </Text>
            </Group>
            <Text size="xs" c="dark.7">
              Tell me where you want to ride, what you want to see, and any preferences.
              Example: "I want to ride the Colorado trail from Kenosha pass to Salida avoiding highways"
            </Text>
            <TextInput
              placeholder='Try: "40 mile loop from downtown with scenic views and coffee shops"'
              value={naturalLanguageInput}
              onChange={(e) => setNaturalLanguageInput(e.target.value)}
              size="md"
              leftSection={<Brain size={16} />}
              rightSection={
                naturalLanguageInput && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => setNaturalLanguageInput('')}
                  >
                    <RotateCcw size={16} />
                  </ActionIcon>
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && naturalLanguageInput.trim()) {
                  handleNaturalLanguageGenerate();
                }
              }}
            />
            <Button
              onClick={handleNaturalLanguageGenerate}
              loading={processingNaturalLanguage}
              disabled={!naturalLanguageInput.trim()}
              leftSection={!processingNaturalLanguage && <Play size={18} />}
              style={{
                background: naturalLanguageInput.trim()
                  ? 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)'
                  : undefined
              }}
            >
              {processingNaturalLanguage ? 'Creating Your Route...' : 'Generate Route'}
            </Button>
          </Stack>
        </Card>

        <Divider label="OR" labelPosition="center" />

        {/* Route Preferences - Prominent at top */}
        <Button
          variant="gradient"
          gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
          leftSection={<Settings size={18} />}
          onClick={() => setPreferencesOpened(true)}
          fullWidth
          size="md"
        >
          Route Preferences
        </Button>
        <Text size="xs" mt="-8" mb="sm" c="dark.7">
          Set safety, surface, scenic preferences and areas to avoid
        </Text>

        {/* Current Conditions - Compact */}
        <Card withBorder p="xs" style={{ backgroundColor: '#f8f9fa' }}>
          <Group justify="space-between" gap="xs">
            <Group gap="xs">
              <timeOfDay.icon size={14} />
              <Text size="xs" fw={500}>{timeOfDay.label}</Text>
            </Group>
            {weatherData && (
              <Group gap="sm">
                <Text size="xs">{formatTemperature(weatherData.temperature)}</Text>
                <Text size="xs">{formatSpeed(weatherData.windSpeed)}</Text>
              </Group>
            )}
          </Group>
        </Card>

        {/* Start Location */}
        <div>
          <Text size="sm" fw={500} mb="xs" c="dark.9">Start Location</Text>
          
          {/* Address Input */}
          <Group gap="sm" mb="sm">
            <TextInput
              placeholder="Enter address or location name..."
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              leftSection={<MapPin size={16} />}
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddressSearch();
                }
              }}
            />
            <Button
              variant="light"
              leftSection={geocoding ? <Loader size={16} /> : <Search size={16} />}
              onClick={handleAddressSearch}
              loading={geocoding}
              disabled={!addressInput.trim()}
              size="sm"
            >
              Search
            </Button>
          </Group>

          {/* Location Buttons */}
          <Group gap="sm">
            <Button
              variant="light"
              leftSection={<Navigation size={16} />}
              onClick={getCurrentLocation}
              size="sm"
            >
              Use Current Location
            </Button>
            {startLocation && (
              <Badge color="green" variant="light">
                Location Set
              </Badge>
            )}
          </Group>

          {/* Current Address Display */}
          {currentAddress && (
            <Text size="xs" c="blue" mt="xs">
              📍 {currentAddress}
            </Text>
          )}
          
          {!startLocation && (
            <Text size="xs" mt="xs" c="dark.7">
              Enter an address above, click on the map, or use current location
            </Text>
          )}
        </div>

        {/* Time Available */}
        <div>
          <Text size="sm" fw={500} mb="xs" c="dark.9">
            Time Available: {formatTime(timeAvailable)}
          </Text>
          <Slider
            value={timeAvailable}
            onChange={setTimeAvailable}
            min={15}
            max={240}
            step={15}
            marks={[
              { value: 30, label: '30m' },
              { value: 60, label: '1h' },
              { value: 120, label: '2h' },
              { value: 180, label: '3h' },
            ]}
            color="blue"
          />
        </div>

        {/* Tabbed Interface */}
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          variant="pills"
          styles={{
            root: {
              marginBottom: '16px'
            },
            list: {
              backgroundColor: '#f8f9fa',
              padding: '8px',
              borderRadius: '12px',
              border: '2px solid #e9ecef',
              marginBottom: '4px'
            },
            tab: {
              fontSize: '14px',
              fontWeight: 600,
              padding: '12px 16px',
              height: 'auto',
              minHeight: '44px',
              transition: 'all 0.2s ease',
              backgroundColor: 'white',
              border: '2px solid #dee2e6',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              cursor: 'pointer',
              color: '#495057',
              '&:hover': {
                backgroundColor: '#f1f3f5',
                borderColor: '#adb5bd',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
                color: '#212529',
              },
              '&[data-active]': {
                backgroundColor: '#51cf66',
                color: 'white',
                borderColor: '#51cf66',
                boxShadow: '0 3px 10px rgba(81, 207, 102, 0.4)',
                transform: 'translateY(-2px)',
              }
            }
          }}
        >
          <Tabs.List grow>
            <Tabs.Tab value="quick">
              <Text size="sm" fw={600}>Recreational</Text>
            </Tabs.Tab>
            <Tabs.Tab value="training" leftSection={<Settings size={16} />}>
              <Text size="sm" fw={600}>Training</Text>
            </Tabs.Tab>
          </Tabs.List>

          {/* QUICK START TAB */}
          <Tabs.Panel value="quick" pt="md">
            <Stack gap="md">
              {/* Recreational Ride Style Selector */}
              <Select
                label="Ride Style"
                description="Choose your ride type"
                placeholder="Select a ride style"
                value={recreationalStyle}
                onChange={(value) => setRecreationalStyle(value)}
                data={recreationalStyles.map(s => ({
                  value: s.value,
                  label: `${s.icon} ${s.label} - ${s.description}`
                }))}
              />

              {/* Route Type - Compact Radio */}
              <div>
                <Text size="sm" fw={500} mb="xs">Route Type</Text>
                <Radio.Group value={routeType} onChange={setRouteType}>
                  <Group gap="xs">
                    {routeTypes.map((type) => (
                      <Radio
                        key={type.value}
                        value={type.value}
                        label={type.label}
                        styles={{
                          body: { alignItems: 'center' },
                          label: { fontSize: '13px' }
                        }}
                      />
                    ))}
                  </Group>
                </Radio.Group>
              </div>

              {/* Speed Adjustment Slider */}
              {speedProfile && speedProfile.hasSufficientData && (
                <Card withBorder p="sm" style={{ backgroundColor: '#f0fff4' }}>
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <div>
                        <Group gap="xs">
                          <Gauge size={16} color="#10b981" />
                          <Text size="sm" fw={500}>Today's Pace</Text>
                        </Group>
                        <Text size="xs" c="dimmed">
                          Current: {formatSpeed(speedProfile.effectiveRoadSpeed)} road
                        </Text>
                      </div>
                      <Badge color={speedModifier === 1.0 ? 'blue' : speedModifier > 1.0 ? 'green' : 'yellow'}>
                        {Math.round(speedModifier * 100)}%
                      </Badge>
                    </Group>

                    <Slider
                      value={speedModifier}
                      onChange={handleSpeedModifierChange}
                      min={0.8}
                      max={1.2}
                      step={0.05}
                      marks={[
                        { value: 0.8, label: <TrendingDown size={12} /> },
                        { value: 1.0, label: '100%' },
                        { value: 1.2, label: <TrendingUp size={12} /> },
                      ]}
                      color="green"
                      styles={{
                        markLabel: { fontSize: '10px' }
                      }}
                    />

                    {suggestedModifier && suggestedModifier.modifier !== speedModifier && (
                      <Alert color="blue" p="xs">
                        <Group justify="space-between" align="center">
                          <Text size="xs" c="#1a202c">
                            💡 Suggested: {Math.round(suggestedModifier.modifier * 100)}% pace
                            <br />
                            <Text size="xs" c="#475569">{suggestedModifier.reason}</Text>
                          </Text>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => handleSpeedModifierChange(suggestedModifier.modifier)}
                          >
                            Use
                          </Button>
                        </Group>
                      </Alert>
                    )}
                  </Stack>
                </Card>
              )}
            </Stack>
          </Tabs.Panel>

          {/* TRAINING TAB */}
          <Tabs.Panel value="training" pt="md">
            <Stack gap="md">
              <Alert color="blue" variant="light" p="xs">
                <Text size="xs">
                  Choose from 40+ research-backed workouts, sync with your training plan, or manually configure workout parameters.
                </Text>
              </Alert>

              {/* Workout Active Indicator */}
              {(selectedWorkout || selectedLibraryWorkout) && (
                <Alert color="teal" variant="light" p="md">
                  <Group justify="space-between" align="flex-start">
                    <div style={{ flex: 1 }}>
                      <Text size="sm" fw={600} mb="xs">
                        🎯 Active Workout: {selectedLibraryWorkout?.name || 'Training Plan Workout'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Ride style is disabled while a workout is active. Adjust time slider to add cooldown riding.
                      </Text>
                    </div>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        setSelectedLibraryWorkout(null);
                        setSelectedWorkout(null);
                        setTrainingContextSource(null);
                        setTrainingContextManuallySet(false);
                        toast.info('Workout cleared - Ride style enabled');
                      }}
                    >
                      Clear Workout
                    </Button>
                  </Group>
                </Alert>
              )}

              {/* Training Ride Style Selector */}
              <Select
                label="Ride Style"
                description="Choose your training goal"
                placeholder="Select a ride style"
                value={trainingGoal}
                onChange={(value) => setTrainingGoal(value)}
                disabled={!!(selectedWorkout || selectedLibraryWorkout)}
                data={trainingGoals.map(g => ({
                  value: g.value,
                  label: `${g.icon} ${g.label} - ${g.description}`
                }))}
              />

              {/* Workout Library Selector */}
              <div>
                <Text size="sm" fw={600} mb="xs" c="dark.9">Workout Library</Text>
                <Text size="xs" mb="sm" c="dark.7">
                  40+ research-backed workouts from 2025 training science
                </Text>

                <WorkoutSelector
                  compact={true}
                  onWorkoutSelect={handleLibraryWorkoutSelect}
                  selectedWorkoutId={selectedLibraryWorkout?.id}
                />

                {selectedLibraryWorkout && (
                  <Alert color="blue" variant="light" p="xs" mt="xs">
                    <Stack gap={4}>
                      <Text size="xs" fw={600}>{selectedLibraryWorkout.name}</Text>
                      <Text size="xs">{selectedLibraryWorkout.description}</Text>
                      <Group gap="xs">
                        <Badge size="xs">{selectedLibraryWorkout.duration}min</Badge>
                        <Badge size="xs">{selectedLibraryWorkout.targetTSS} TSS</Badge>
                        <Badge size="xs" color={selectedLibraryWorkout.difficulty === 'beginner' ? 'green' : selectedLibraryWorkout.difficulty === 'intermediate' ? 'yellow' : 'red'}>
                          {selectedLibraryWorkout.difficulty}
                        </Badge>
                      </Group>
                      {selectedLibraryWorkout.coachNotes && (
                        <Text size="xs" c="#475569" italic mt={4}>
                          💡 {selectedLibraryWorkout.coachNotes}
                        </Text>
                      )}
                    </Stack>
                  </Alert>
                )}
              </div>

              <Divider label="OR" labelPosition="center" />

              {/* Training Plan Workout Selector */}
              {activePlans.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">Training Plan Workout</Text>
                  <Stack gap="sm">
                    <Select
                      label="Select Training Plan"
                      placeholder="Choose a plan"
                      data={(activePlans || []).map(plan => ({
                        value: plan.id,
                        label: plan.name
                      }))}
                      value={selectedPlan}
                      onChange={setSelectedPlan}
                      clearable
                      size="sm"
                    />

                    {selectedPlan && planWorkouts.length > 0 && (
                      <Select
                        label="Select Workout"
                        placeholder="Choose a workout"
                        data={(planWorkouts || []).map(workout => {
                          const workoutType = WORKOUT_TYPES[workout.workout_type];
                          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                          return {
                            value: workout.id,
                            label: `Week ${workout.week_number}, ${dayNames[workout.day_of_week]} - ${workoutType?.name || workout.workout_type} (${workout.target_duration}min, ${workout.target_tss} TSS)`
                          };
                        })}
                        value={selectedWorkout}
                        onChange={setSelectedWorkout}
                        clearable
                        maxDropdownHeight={300}
                        size="sm"
                      />
                    )}

                    {selectedWorkout && (
                      <Alert color="blue" variant="light" p="xs">
                        <Text size="xs">Training context updated from workout!</Text>
                      </Alert>
                    )}
                  </Stack>
                  <Divider my="sm" />
                </div>
              )}

              {/* Training Context - Manual */}
              <div>
                <Text size="sm" fw={600} mb="xs">Manual Training Context</Text>
                <Text size="xs" c="dimmed" mb="xs">
                  Adjusting these settings will override the "Ride Style" selection
                </Text>
                <TrainingContextSelector
                  value={trainingContext}
                  onChange={handleTrainingContextChange}
                />
              </div>

              <Divider />

              {/* Debug Toggles */}
              <div>
                <Text size="sm" fw={500} mb="xs">Route Generation Options</Text>
                <Stack gap="xs">
                  <Switch
                    label="Use Past Rides"
                    description="Learn from your riding history"
                    checked={usePastRides}
                    onChange={(e) => setUsePastRides(e.currentTarget.checked)}
                    size="sm"
                  />
                  <Switch
                    label="Use Training Context"
                    description="Match routes to workout requirements"
                    checked={useTrainingContext}
                    onChange={(e) => setUseTrainingContext(e.currentTarget.checked)}
                    size="sm"
                  />
                </Stack>
              </div>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Generate Button - PROMINENT POSITION */}
        <Button
          size="lg"
          leftSection={generating ? <Loader size={20} /> : <Brain size={20} />}
          onClick={generateRoutes}
          loading={generating}
          disabled={!startLocation || generating}
          fullWidth
          style={{
            fontSize: '16px',
            height: '50px',
            marginTop: '8px',
            marginBottom: '8px'
          }}
        >
          {generating ? 'Creating Your Routes...' : 'Find My Routes'}
        </Button>

        {/* Error Display */}
        {error && (
          <Alert color="red" title="Generation Failed">
            {error}
          </Alert>
        )}

        {/* Generated Routes */}
        {generatedRoutes.length > 0 && (
          <div>
            <Group justify="space-between" mb="sm">
              <Text size="sm" fw={500}>Generated Routes</Text>
              <ActionIcon
                variant="subtle"
                onClick={generateRoutes}
                disabled={generating}
              >
                <RotateCcw size={16} />
              </ActionIcon>
            </Group>
            
            <Stack gap="sm">
              {generatedRoutes.map((route, index) => {
                // Calculate estimated TSS for this route
                const estimatedRouteTSS = estimateTSS(
                  trainingContext.targetDuration || 60,
                  route.distance,
                  route.elevationGain || 0,
                  trainingContext.workoutType || 'endurance'
                );

                // Generate interval cues if in training mode
                let intervalCues = null;
                if (isTrainingMode && useTrainingContext) {
                  // If we have a selected library workout, use its detailed structure
                  if (selectedLibraryWorkout && selectedLibraryWorkout.structure) {
                    console.log('📚 Using workout library structure for cues:', selectedLibraryWorkout.name);
                    intervalCues = generateCuesFromWorkoutStructure(route, selectedLibraryWorkout);
                  } else {
                    // Otherwise use the generic training context
                    console.log('🎯 Using generic training context for cues');
                    intervalCues = generateIntervalCues(route, trainingContext);
                  }
                }

                return (
                <Card key={index} withBorder p="md">
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-start">
                      <div style={{ flex: 1 }}>
                        <Group gap="sm" mb="xs">
                          <Text size="sm" fw={600}>{route.name}</Text>
                          <Badge size="sm" color={route.difficulty === 'easy' ? 'green' : route.difficulty === 'hard' ? 'red' : 'yellow'}>
                            {route.difficulty}
                          </Badge>
                          {estimatedRouteTSS && (
                            <Badge size="sm" color="blue" variant="light">
                              {estimatedRouteTSS} TSS
                            </Badge>
                          )}
                        </Group>

                        <Grid gutter="xs">
                          <Grid.Col span={6}>
                            <Text size="xs" c="dimmed">Distance</Text>
                            <Text size="sm" fw={500}>{formatDistance(route.distance)}</Text>
                          </Grid.Col>
                          <Grid.Col span={6}>
                            <Text size="xs" c="dimmed">Elevation</Text>
                            <Text size="sm" fw={500}>+{formatElevation(route.elevationGain)}</Text>
                          </Grid.Col>
                        </Grid>

                        <Text size="xs" c="dimmed" mt="xs">
                          {route.description}
                        </Text>
                      </div>

                      <Button
                        size="sm"
                        leftSection={<Play size={14} />}
                        onClick={() => {
                          if (onRouteGenerated) {
                            // Add interval cues to route before passing
                            const routeWithCues = {
                              ...route,
                              intervalCues: intervalCues
                            };
                            // Defer to avoid React error #185
                            setTimeout(() => onRouteGenerated(routeWithCues), 0);
                          }
                        }}
                      >
                        Use Route
                      </Button>
                    </Group>

                    {/* Show interval cues if available */}
                    {intervalCues && (
                      <IntervalCues cues={intervalCues} />
                    )}
                  </Stack>
                </Card>
                );
              })}
            </Stack>
          </div>
        )}

        {/* No Routes Message */}
        {!generating && generatedRoutes.length === 0 && startLocation && (
          <Center p="xl">
            <Text size="sm" c="dark.7">
              Click "Find My Routes" to create personalized training routes
            </Text>
          </Center>
        )}
      </Stack>
    </Paper>
    </>
  );
};


// Helper function to build detailed route prompt for natural language requests
function buildDetailedRoutePrompt(parsedRoute) {
  const { startLocationName, endLocationName, preferences, timeAvailable, routeType } = parsedRoute;

  return `You are an expert cycling route planner. Create 2-3 specific cycling route options based on this request:

START LOCATION: ${startLocationName}
${endLocationName ? `END LOCATION: ${endLocationName}` : ''}
ROUTE TYPE: ${routeType || 'loop'}
TIME/DISTANCE: ${timeAvailable ? `${timeAvailable} minutes` : 'flexible'}

PREFERENCES:
${preferences?.trailPreference ? '- PRIORITIZE gravel/dirt/unpaved roads and trails' : ''}
${preferences?.avoidHighways ? '- Avoid highways and major roads' : ''}
${preferences?.avoidTraffic ? '- Minimize traffic' : ''}
${preferences?.terrain ? `- Terrain: ${preferences.terrain}` : ''}
${preferences?.pointsOfInterest?.length ? `- Include: ${preferences.pointsOfInterest.join(', ')}` : ''}
${preferences?.specialRequirements ? `- Special: ${preferences.specialRequirements}` : ''}

Please provide 2-3 specific route options with actual waypoints (lat/lon coordinates). For each route:

1. Route Name (creative, descriptive)
2. Description (what makes this route special)
3. Waypoints: List of 3-5 key locations with coordinates
   - Start: ${startLocationName}
   - Intermediate waypoints (with coordinates)
   ${endLocationName ? `- End: ${endLocationName}` : '- Return to start'}

Format your response as JSON:
{
  "routes": [
    {
      "name": "Route Name",
      "description": "What makes this route special",
      "difficulty": "easy|moderate|hard",
      "waypoints": [
        {"name": "Start", "lat": 40.0195584, "lon": -105.0574848},
        {"name": "Waypoint description", "lat": XX.XXXXX, "lon": -XXX.XXXXX},
        ...
      ]
    }
  ]
}

IMPORTANT:
- Provide REAL coordinates for actual locations
- For gravel/dirt preferences, choose trails, canal paths, dirt roads
- Ensure waypoints create a logical route
- Return ONLY valid JSON`;
}

// Helper function to parse Claude's route response
function parseClaudeRouteResponse(responseText, parsedRoute) {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Claude response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('📝 Parsed Claude route response:', parsed);

    if (!parsed.routes || !Array.isArray(parsed.routes)) {
      console.error('Invalid route format from Claude');
      return null;
    }

    // Convert Claude's route format to our app's format
    const routes = parsed.routes.map(route => {
      // Convert waypoints to coordinates array
      const coordinates = route.waypoints.map(wp => [wp.lon, wp.lat]);

      return {
        name: route.name,
        description: route.description,
        difficulty: route.difficulty || 'moderate',
        coordinates: coordinates,
        distance: 0, // Will be calculated by routing service
        elevationGain: 0, // Will be calculated
        routeType: parsedRoute.routeType || 'loop',
        waypoints: route.waypoints,
        source: 'natural_language'
      };
    });

    return routes;

  } catch (error) {
    console.error('Failed to parse Claude route response:', error);
    return null;
  }
}

// Helper function to build natural language prompt
function buildNaturalLanguagePrompt(userRequest, weatherData, userLocation, userAddress) {
  // Extract region/area from user's address for context
  let regionContext = '';
  let gravelExamples = '';

  if (userAddress) {
    // Try to determine the general region
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
    } else if (addressLower.includes('oregon') || addressLower.includes(', or')) {
      regionContext = 'The cyclist is in Oregon.';
      gravelExamples = `
   **Oregon Examples:**
   - Small towns connected by forest service roads
   - Rural communities with logging roads
   - Coastal or valley towns with farm roads`;
    } else {
      regionContext = `The cyclist is near: ${userAddress}`;
      gravelExamples = `
   **General Strategy (works anywhere):**
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

  return `You are an expert cycling route planner with knowledge of cycling routes worldwide. A cyclist has requested: "${userRequest}"

${regionContext}

Your task is to extract and interpret the route requirements from this request and return a structured JSON response.

Extract the following information:
1. Start location (city/landmark) - if mentioned
2. Waypoints - intermediate locations to route through
3. Route type - CRITICAL TO GET THIS RIGHT:

   **ROUTE TYPE DEFINITIONS:**

   - "loop": Circular route that returns to start via DIFFERENT roads than outbound
     * If user mentions going TO a specific destination (e.g., "ride to Lochbuie"), ALWAYS include it as a waypoint
     * Loop routes naturally return via different roads - the routing engine will find alternate paths
     * Keywords: "loop", "different route back", "different way home", "circular", "round trip"

   - "out_back": Go to destination and return via the SAME route (retracing steps)
     * Use ONLY when user explicitly wants same road both ways OR doesn't mention alternate route
     * Keywords: "out and back", "there and back" (without "different" mentioned)

   - "point_to_point": One-way route, different start and end locations
     * Start location ≠ end location
     * Keywords: "from X to Y", "one way", "drop off"

4. Distance or time available (in km or minutes)
5. Terrain preferences (flat, rolling, hilly)
6. Things to avoid (highways, traffic, etc.)
7. Surface preference - CRITICAL FOR GRAVEL CYCLISTS

Current conditions:
${weatherData ? `- Weather: ${weatherData.temperature}°C, ${weatherData.description}
- Wind: ${weatherData.windSpeed} km/h` : '- Weather data not available'}

CRITICAL GRAVEL ROUTING INSTRUCTIONS:
If the user requests gravel, dirt, unpaved roads, or trails:
1. Set surfaceType to "gravel"
2. **SUGGEST 1-3 INTERMEDIATE TOWN/CITY WAYPOINTS** near the user's location that create a logical gravel cycling route
${gravelExamples}

**IMPORTANT**:
- Suggest ACTUAL TOWN NAMES that will geocode correctly (not trail names!)
- Choose towns that are logically between the start and destination
- Use towns near the cyclist's current location (${userAddress || 'unknown'})
- Fewer waypoints = better (1-2 is ideal, max 3)
- The routing between towns will naturally use back roads and county roads

Return ONLY a JSON object with this structure:
{
  "startLocation": "Erie, CO",
  "waypoints": ["Coal Creek Trail", "Marshall Mesa", "Community Ditch Trail"],
  "routeType": "loop",
  "distance": number in km (or null if time-based),
  "timeAvailable": number in minutes (or null if distance-based),
  "terrain": "flat|rolling|hilly",
  "avoidHighways": true/false,
  "avoidTraffic": true/false,
  "surfaceType": "gravel|paved|mixed",
  "trainingGoal": "endurance|intervals|recovery|tempo|hills" or null,
  "suggestedGravelWaypoints": ["waypoint1", "waypoint2", "waypoint3"]
}

CRITICAL EXAMPLES - STUDY THESE CAREFULLY:

Example 1: User wants to go TO a destination and return via DIFFERENT route
User: "I'd like to ride out to Lochbuie and back on a different route with dirt roads"
Response:
{
  "startLocation": "Erie, CO",
  "waypoints": ["Lochbuie"],
  "routeType": "loop",
  "surfaceType": "gravel",
  "avoidHighways": true
}
REASONING: Keywords "different route" = loop. Destination "Lochbuie" = waypoint. The routing engine will find different roads for return.

Example 2: Loop that must pass through specific towns
User: "40 mile loop through Boulder and Lyons"
Response:
{
  "startLocation": "current location",
  "waypoints": ["Boulder", "Lyons"],
  "routeType": "loop",
  "distance": 64
}
REASONING: "loop through" means these are required waypoints on the loop.

Example 3: Out-and-back on SAME route
User: "I want to ride to Nederland and back the same way"
Response:
{
  "startLocation": "current location",
  "waypoints": ["Nederland"],
  "routeType": "out_back"
}
REASONING: User explicitly says "same way" = out_back route type.

Example 4: Gravel loop from specific location
User: "gravel loop from Boulder through the mountains"
Response:
{
  "startLocation": "Boulder, CO",
  "waypoints": ["Nederland", "Ward"],
  "routeType": "loop",
  "surfaceType": "gravel",
  "avoidHighways": true
}
REASONING: "loop...through" = waypoints on a loop route.

Example 5: Point-to-point one-way
User: "I want to ride from Broomfield to Lyons on gravel roads"
Response:
{
  "startLocation": "Broomfield, CO",
  "waypoints": ["Lyons"],
  "routeType": "point_to_point",
  "surfaceType": "gravel",
  "avoidHighways": true
}
REASONING: "from X to Y" with no mention of return = point_to_point.

IMPORTANT KEYWORD DETECTION FOR ROUTE TYPES:

**Loop indicators** (use "loop" + include destination as waypoint):
- "different route back", "different way back", "different way home"
- "via different roads", "alternate route back", "slightly different route"
- "loop", "circular", "round trip"
- When user says "to [destination]" AND mentions variation on return

**Out-and-back indicators** (use "out_back"):
- "same route back", "same way", "retrace"
- "out and back" WITHOUT mentioning "different"
- User explicitly states wanting same roads both ways

**Point-to-point indicators**:
- "from X to Y" with no return mentioned
- "one way", "drop off", "shuttle"

FINAL REMINDERS:
- For gravel requests, ALWAYS suggest intermediate waypoints even if user doesn't mention them
- Waypoints should be ACTUAL TOWN/CITY NAMES that will geocode reliably (NOT trail names!)
- Keep it simple: 1-2 waypoints is usually enough
- If user mentions a DESTINATION in their request (e.g., "to Lochbuie"), include it as a waypoint
- Return ONLY valid JSON, no additional text`;
}

// Helper function to parse the Claude response
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
    }

    // Set training goal
    if (parsed.trainingGoal) {
      result.trainingGoal = parsed.trainingGoal;
    } else if (parsed.terrain === 'hilly') {
      result.trainingGoal = 'hills';
    } else {
      result.trainingGoal = 'endurance';
    }

    // Note: startLocation coordinates will need to be geocoded separately
    // Store the location names for geocoding
    result.startLocationName = parsed.startLocation;
    result.waypoints = parsed.waypoints || []; // Array of waypoint names
    result.endLocationName = parsed.endLocation;
    result.preferences = {
      avoidHighways: parsed.avoidHighways,
      avoidTraffic: parsed.avoidTraffic,
      pointsOfInterest: parsed.pointsOfInterest,
      surfaceType: parsed.surfaceType || 'mixed', // gravel, paved, or mixed
      trailPreference: parsed.surfaceType === 'gravel', // backward compatibility
      terrain: parsed.terrain,
      specialRequirements: parsed.specialRequirements
    };

    console.log('🎯 Converted to route parameters:', result);
    return result;

  } catch (error) {
    console.error('Failed to parse natural language response:', error);
    throw new Error('Could not understand the route request. Please try being more specific.');
  }
}

export default AIRouteGenerator;