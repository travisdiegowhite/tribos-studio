import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, ScaleControl, GeolocateControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Paper,
  TextInput,
  Button,
  Group,
  Stack,
  Text,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  Card,
  ThemeIcon,
  ScrollArea,
  Timeline,
  Alert,
  Divider,
  Modal,
  Select,
  RingProgress,
  Container,
  Textarea,
} from '@mantine/core';
import { useHotkeys, useMediaQuery } from '@mantine/hooks';
import {
  Undo2,
  Redo2,
  Trash2,
  Download,
  Route,
  Save,
  X,
  Target,
  Flag,
  Check,
  MapPin,
  Info,
  Brain,
  Zap,
  Sparkles,
  Lightbulb,
  TrendingUp,
  Shield,
  Camera,
  Settings,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { buildLineString, polylineDistance } from '../utils/geo';
import { pointsToGPX, parseGPX } from '../utils/gpx';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../utils/units';
import { useRouteManipulation } from '../hooks/useRouteManipulation';
import { useNavigate } from 'react-router-dom';
import { analyzeAndEnhanceRoute } from '../utils/aiRouteEnhancer';
import { EnhancedContextCollector } from '../utils/enhancedContext';
import { getWeatherData, getMockWeatherData } from '../utils/weather';
import PreferenceSettings from './PreferenceSettings';
import TrainingContextSelector from './TrainingContextSelector';
import { estimateTSS } from '../utils/trainingPlans';

const RouteStudio = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { useImperial, distanceUnit, elevationUnit, formatDistance, formatElevation, formatTemperature } = useUnits();
  
  // Core route building state (similar to ProfessionalRouteBuilder)
  const [viewState, setViewState] = useState({
    longitude: -122.4194,
    latitude: 37.7749,
    zoom: 13,
    pitch: 0,
    bearing: 0
  });

  // Geolocate to user's current position on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('📍 User location found:', position.coords);
          setViewState(prev => ({
            ...prev,
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
            zoom: 13
          }));
        },
        (error) => {
          console.log('📍 Geolocation error (using default location):', error.message);
          // Silently fail and keep default San Francisco location
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 0
        }
      );
    }
  }, []); // Run once on mount

  // Core state - must be declared before useEffect hooks that reference them
  const [waypoints, setWaypoints] = useState([]);
  const [snappedRoute, setSnappedRoute] = useState(null);
  const [elevationProfile, setElevationProfile] = useState([]);
  const [elevationStats, setElevationStats] = useState({});
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [hoveredWaypoint, setHoveredWaypoint] = useState(null);
  const [activeMode, setActiveMode] = useState('draw');
  const [routingProfile, setRoutingProfile] = useState('cycling');
  const [mapStyle, setMapStyle] = useState('outdoors');
  const [routeName, setRouteName] = useState('');
  const [snapping, setSnapping] = useState(false);
  const [snapProgress, setSnapProgress] = useState(0);
  const [error, setError] = useState(null);

  // User preferences and context
  const [userPreferences, setUserPreferences] = useState(null);
  const [trainingGoal, setTrainingGoal] = useState('endurance');
  const [trainingContext, setTrainingContext] = useState({
    workoutType: 'endurance',
    phase: 'base',
    targetDuration: 60,
    targetTSS: 75,
    primaryZone: 2
  });
  const [weatherData, setWeatherData] = useState(null);
  const [preferencesOpened, setPreferencesOpened] = useState(false);
  
  // Smart Enhancement state
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingAISuggestions, setLoadingAISuggestions] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState(new Set());
  
  // Route comparison state
  const [previewingSuggestion, setPreviewingSuggestion] = useState(null);
  const [originalRoute, setOriginalRoute] = useState(null);
  const [suggestedRoute, setSuggestedRoute] = useState(null);
  
  // History for Undo/Redo (including smart suggestions)
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [aiSuggestionHistory, setAiSuggestionHistory] = useState([]);
  
  // Save modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [routeDescription, setRouteDescription] = useState('');
  const [saving, setSaving] = useState(false);
  
  const mapRef = useRef(null);

  // Load user preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user) return;

      try {
        console.log('📋 Loading user preferences...');
        const preferences = await EnhancedContextCollector.gatherDetailedPreferences(
          user.id,
          { startLocation: waypoints[0]?.position || [viewState.longitude, viewState.latitude] }
        );
        setUserPreferences(preferences);
        console.log('✅ User preferences loaded');
      } catch (error) {
        console.error('Failed to load preferences:', error);
        // Continue without preferences
      }
    };

    loadPreferences();
  }, [user, viewState.longitude, viewState.latitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch weather when first waypoint is added
  useEffect(() => {
    const fetchWeather = async () => {
      if (waypoints.length === 0 || weatherData) return;

      const location = waypoints[0].position;
      try {
        console.log('🌤️ Fetching weather data...');
        const weather = await getWeatherData(location[1], location[0]);
        if (weather) {
          setWeatherData(weather);
          console.log('✅ Weather data loaded:', weather.description);
        } else {
          setWeatherData(getMockWeatherData());
        }
      } catch (error) {
        console.warn('Weather fetch failed, using mock data');
        setWeatherData(getMockWeatherData());
      }
    };

    fetchWeather();
  }, [waypoints.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save state before smart suggestion for undo
  const saveStateBeforeAISuggestion = useCallback(() => {
    const state = {
      waypoints: [...waypoints],
      snappedRoute: snappedRoute ? { ...snappedRoute } : null,
      elevationProfile: [...elevationProfile],
      elevationStats: { ...elevationStats },
      timestamp: Date.now()
    };
    setAiSuggestionHistory(prev => [...prev, state]);
    return state;
  }, [waypoints, snappedRoute, elevationProfile, elevationStats]);

  // Undo last smart suggestion
  const undoLastAISuggestion = useCallback(() => {
    if (aiSuggestionHistory.length > 0) {
      const lastState = aiSuggestionHistory[aiSuggestionHistory.length - 1];
      setWaypoints(lastState.waypoints);
      setSnappedRoute(lastState.snappedRoute);
      setElevationProfile(lastState.elevationProfile);
      setElevationStats(lastState.elevationStats);
      setAiSuggestionHistory(prev => prev.slice(0, -1));
      setAppliedSuggestions(new Set()); // Reset applied suggestions
      toast.success('Undid last smart suggestion');
    }
  }, [aiSuggestionHistory]);

  // Use the same route manipulation hook as ProfessionalRouteBuilder
  const {
    addWaypoint,
    snapToRoads,
    fetchElevation,
    clearRoute: baseClearRoute,
    undo,
    redo,
    reverseRoute,
    removeWaypoint,
  } = useRouteManipulation({
    waypoints,
    setWaypoints,
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    selectedWaypoint,
    setSelectedWaypoint,
    snappedRoute,
    setSnappedRoute,
    elevationProfile,
    setElevationProfile,
    elevationStats,
    setElevationStats,
    routingProfile,
    snapping,
    setSnapping,
    snapProgress,
    setSnapProgress,
    error,
    setError,
    useImperial,
  });

  // Custom clear route that also clears smart suggestion-specific state
  const clearRoute = useCallback(() => {
    console.log('🗑️ Clearing route - resetting all state');
    baseClearRoute();
    setOriginalRoute(null);
    setSuggestedRoute(null);
    setPreviewingSuggestion(null);
    setAiSuggestions([]);
    setAppliedSuggestions(new Set());
    setAiSuggestionHistory([]);
    setRouteName('');
    setRouteDescription('');
    setShowAIPanel(false); // Close smart panel on clear
    console.log('✅ Route cleared - ready for new route');
  }, [baseClearRoute]);

  // Auto-fetch elevation when route is snapped
  useEffect(() => {
    if (snappedRoute && snappedRoute.coordinates && snappedRoute.coordinates.length > 0) {
      fetchElevation();
    }
  }, [snappedRoute, fetchElevation]);

  // Debug waypoints and route state
  useEffect(() => {
    console.log('📍 Waypoints updated:', {
      count: waypoints.length,
      waypoints: waypoints.map(w => ({ id: w.id, type: w.type, position: w.position })),
      hasSnappedRoute: !!snappedRoute,
      snappedRouteCoords: snappedRoute?.coordinates?.length || 0,
      previewingSuggestion: !!previewingSuggestion
    });
  }, [waypoints, snappedRoute, previewingSuggestion]);

  // Clear snapped route when waypoints change (user is modifying the route)
  // This ensures new waypoints are visible in the route line
  useEffect(() => {
    if (snappedRoute && waypoints.length > 0) {
      // Check if waypoints have changed from what was snapped
      const snappedWaypointCount = snappedRoute.waypointCount || 0;
      if (waypoints.length !== snappedWaypointCount) {
        console.log('🔄 Waypoints changed - clearing snapped route to show new waypoints');
        setSnappedRoute(null);
      }
    }
  }, [waypoints.length]); // Only trigger when waypoint count changes

  // Real smart suggestion generation using aiRouteEnhancer
  const generateAISuggestions = useCallback(async () => {
    if (waypoints.length < 2) {
      toast.error('Create a route with at least 2 waypoints first');
      return;
    }

    if (!snappedRoute || !snappedRoute.coordinates) {
      toast.error('Please snap route to roads first to get smart suggestions');
      return;
    }

    setLoadingAISuggestions(true);

    try {
      console.log('🤖 Generating smart suggestions...');

      // Prepare route data for analysis
      const routeForAnalysis = {
        coordinates: snappedRoute.coordinates,
        distance: snappedRoute.distance,
        duration: snappedRoute.duration,
        elevationProfile: elevationProfile,
        waypoints: waypoints
      };

      // Get user preferences or use defaults
      const prefs = userPreferences || {
        routingPreferences: { trafficTolerance: 'low', hillPreference: 'moderate' },
        scenicPreferences: { scenicImportance: 'medium' },
        safetyPreferences: {}
      };

      // Get smart suggestions
      const suggestions = await analyzeAndEnhanceRoute(
        routeForAnalysis,
        prefs,
        trainingGoal,
        weatherData,
        trainingContext // Include workout type, phase, TSS, duration
      );

      // Map suggestions to include icons
      const iconMap = {
        safety: <Shield size={16} />,
        scenic: <Camera size={16} />,
        training: <TrendingUp size={16} />,
        elevation: <Lightbulb size={16} />,
        weather: <Sparkles size={16} />
      };

      const suggestionsWithIcons = suggestions.map((sug, index) => ({
        ...sug,
        id: index + 1,
        icon: iconMap[sug.type] || <Brain size={16} />
      }));

      setAiSuggestions(suggestionsWithIcons);
      setLoadingAISuggestions(false);

      if (suggestions.length > 0) {
        toast.success(`Generated ${suggestions.length} smart suggestions! 🎯`);
      } else {
        toast.success('Your route looks great! No major improvements needed.');
      }
    } catch (error) {
      console.error('Smart suggestion generation failed:', error);
      toast.error('Failed to generate smart suggestions. Please try again.');
      setLoadingAISuggestions(false);
    }
  }, [waypoints, snappedRoute, elevationProfile, userPreferences, trainingGoal, weatherData]);

  // Preview suggestion - show both routes for comparison
  const previewSuggestion = useCallback(async (suggestion) => {
    try {
      // Save original route state
      const originalRouteState = {
        waypoints: [...waypoints],
        snappedRoute: snappedRoute ? { ...snappedRoute } : null,
      };
      setOriginalRoute(originalRouteState);
      
      // Generate suggested route waypoints based on suggestion type
      let suggestedWaypoints = [...waypoints];
      
      switch (suggestion.type) {
        case 'scenery':
          if (waypoints.length >= 2) {
            const midpoint = waypoints[Math.floor(waypoints.length / 2)];
            const startPoint = waypoints[0];
            const scenicWaypoint = {
              id: `wp_scenic_preview_${Date.now()}`,
              position: [
                (startPoint.position[0] + midpoint.position[0]) / 2 + 0.01,
                (startPoint.position[1] + midpoint.position[1]) / 2 + 0.01
              ],
              type: 'waypoint',
              name: 'Scenic Point'
            };
            
            suggestedWaypoints = [...waypoints];
            suggestedWaypoints.splice(Math.ceil(waypoints.length / 2), 0, scenicWaypoint);
            
            if (suggestedWaypoints.length > 1) {
              suggestedWaypoints[suggestedWaypoints.length - 1].type = 'end';
              suggestedWaypoints[suggestedWaypoints.length - 1].name = 'End';
            }
          }
          break;
          
        case 'safety':
          if (waypoints.length >= 2) {
            suggestedWaypoints = waypoints.map((wp, index) => {
              if (index > 0 && index < waypoints.length - 1) {
                return {
                  ...wp,
                  position: [
                    wp.position[0] + (Math.random() - 0.5) * 0.005,
                    wp.position[1] + (Math.random() - 0.5) * 0.005
                  ]
                };
              }
              return wp;
            });
          }
          break;
          
        case 'performance':
          if (waypoints.length >= 2) {
            const startPoint = waypoints[0];
            const trainingWaypoint = {
              id: `wp_training_preview_${Date.now()}`,
              position: [
                startPoint.position[0] + 0.008,
                startPoint.position[1] + 0.008
              ],
              type: 'waypoint',
              name: 'Training Loop'
            };
            
            suggestedWaypoints = [waypoints[0], trainingWaypoint, ...waypoints.slice(1)];
            
            if (suggestedWaypoints.length > 1) {
              suggestedWaypoints[suggestedWaypoints.length - 1].type = 'end';
              suggestedWaypoints[suggestedWaypoints.length - 1].name = 'End';
            }
          }
          break;
          
        case 'efficiency':
          if (waypoints.length > 2) {
            suggestedWaypoints = [
              waypoints[0],
              waypoints[waypoints.length - 1]
            ];
            
            if (waypoints.length > 3) {
              const intermediateWaypoint = {
                ...waypoints[1],
                position: [
                  (waypoints[0].position[0] + waypoints[waypoints.length - 1].position[0]) / 2,
                  (waypoints[0].position[1] + waypoints[waypoints.length - 1].position[1]) / 2 - 0.003
                ],
                name: 'Efficiency Point'
              };
              suggestedWaypoints.splice(1, 0, intermediateWaypoint);
            }
            
            suggestedWaypoints[0].type = 'start';
            suggestedWaypoints[suggestedWaypoints.length - 1].type = 'end';
            for (let i = 1; i < suggestedWaypoints.length - 1; i++) {
              suggestedWaypoints[i].type = 'waypoint';
            }
          }
          break;
      }
      
      // Generate suggested route line
      if (suggestedWaypoints.length >= 2) {
        try {
          const coordinates = suggestedWaypoints.map(wp => wp.position);
          const coordinatesString = coordinates.map(coord => coord.join(',')).join(';');
          
          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/${routingProfile}/${coordinatesString}?geometries=geojson&access_token=${process.env.REACT_APP_MAPBOX_TOKEN}`
          );
          
          const data = await response.json();
          
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            setSuggestedRoute({
              coordinates: route.geometry.coordinates,
              distance: route.distance,
              duration: route.duration,
              waypoints: suggestedWaypoints
            });
          }
        } catch (error) {
          console.error('Error generating suggested route:', error);
          setSuggestedRoute({
            coordinates: suggestedWaypoints.map(wp => wp.position),
            waypoints: suggestedWaypoints
          });
        }
      }
      
      setPreviewingSuggestion(suggestion);
      toast.success('Comparing routes - original in blue, suggested in green');
      
    } catch (error) {
      console.error('Error previewing suggestion:', error);
      toast.error('Failed to preview suggestion');
    }
  }, [waypoints, snappedRoute, routingProfile]);

  // Accept the previewed suggestion
  const acceptSuggestion = useCallback(async () => {
    if (!previewingSuggestion || !suggestedRoute) return;
    
    try {
      // Save current state before applying suggestion
      saveStateBeforeAISuggestion();
      
      setAppliedSuggestions(prev => new Set([...prev, previewingSuggestion.id]));
      
      const suggestionTitle = previewingSuggestion.title;
      
      // Clear preview state first
      setPreviewingSuggestion(null);
      setOriginalRoute(null);
      setSuggestedRoute(null);
      
      // Apply the suggested waypoints and clear snapped route to force re-snapping
      setWaypoints(suggestedRoute.waypoints);
      setSnappedRoute(null);
      
      // Auto-snap to roads after applying waypoints
      setTimeout(() => {
        if (suggestedRoute.waypoints && suggestedRoute.waypoints.length >= 2) {
          snapToRoads();
        }
      }, 100);
      
      toast.success(`Applied: ${suggestionTitle}`);
      
    } catch (error) {
      console.error('Error accepting suggestion:', error);
      toast.error('Failed to apply suggestion');
    }
  }, [previewingSuggestion, suggestedRoute, saveStateBeforeAISuggestion, snapToRoads]);

  // Cancel the preview
  const cancelPreview = useCallback(() => {
    setPreviewingSuggestion(null);
    setOriginalRoute(null);
    setSuggestedRoute(null);
    toast('Preview cancelled');
  }, []);

  const applySuggestion = useCallback(async (suggestion) => {
    try {
      // Save current state before applying suggestion
      saveStateBeforeAISuggestion();
      
      setAppliedSuggestions(prev => new Set([...prev, suggestion.id]));
      
      // Apply different modifications based on suggestion type
      switch (suggestion.type) {
        case 'scenery':
          // Add a scenic waypoint in the middle of the route
          if (waypoints.length >= 2) {
            const midpoint = waypoints[Math.floor(waypoints.length / 2)];
            const startPoint = waypoints[0];
            const scenicWaypoint = {
              id: `wp_scenic_${Date.now()}`,
              position: [
                (startPoint.position[0] + midpoint.position[0]) / 2 + 0.01, // Slight offset for scenic route
                (startPoint.position[1] + midpoint.position[1]) / 2 + 0.01
              ],
              type: 'waypoint',
              name: 'Scenic Point'
            };
            
            // Insert scenic waypoint in the middle
            const updatedWaypoints = [...waypoints];
            updatedWaypoints.splice(Math.ceil(waypoints.length / 2), 0, scenicWaypoint);
            
            // Update types
            if (updatedWaypoints.length > 1) {
              updatedWaypoints[updatedWaypoints.length - 1].type = 'end';
              updatedWaypoints[updatedWaypoints.length - 1].name = 'End';
            }
            
            setWaypoints(updatedWaypoints);
            setSnappedRoute(null); // Clear snapped route to force re-snapping
            toast.success(`Added scenic waypoint to your route`);
          }
          break;
          
        case 'safety':
          // Modify the route to use a safer path by adjusting waypoint positions
          if (waypoints.length >= 2) {
            const updatedWaypoints = waypoints.map((wp, index) => {
              if (index > 0 && index < waypoints.length - 1) {
                // Slightly adjust intermediate waypoints for "safer" routing
                return {
                  ...wp,
                  position: [
                    wp.position[0] + (Math.random() - 0.5) * 0.005, // Small random adjustment
                    wp.position[1] + (Math.random() - 0.5) * 0.005
                  ]
                };
              }
              return wp;
            });
            
            setWaypoints(updatedWaypoints);
            setSnappedRoute(null);
            toast.success(`Adjusted route for safer cycling paths`);
          }
          break;
          
        case 'performance':
          // Add training waypoints for interval training
          if (waypoints.length >= 2) {
            const startPoint = waypoints[0];
            const endPoint = waypoints[waypoints.length - 1];
            
            // Add a training loop waypoint
            const trainingWaypoint = {
              id: `wp_training_${Date.now()}`,
              position: [
                startPoint.position[0] + 0.008, // Create a small loop
                startPoint.position[1] + 0.008
              ],
              type: 'waypoint',
              name: 'Training Loop'
            };
            
            const updatedWaypoints = [waypoints[0], trainingWaypoint, ...waypoints.slice(1)];
            
            // Update types
            if (updatedWaypoints.length > 1) {
              updatedWaypoints[updatedWaypoints.length - 1].type = 'end';
              updatedWaypoints[updatedWaypoints.length - 1].name = 'End';
            }
            
            setWaypoints(updatedWaypoints);
            setSnappedRoute(null);
            toast.success(`Added training interval to your route`);
          }
          break;
          
        case 'efficiency':
          // Remove intermediate waypoints to create a more direct route
          if (waypoints.length > 2) {
            // Keep only start and end waypoints for efficiency
            const efficientWaypoints = [
              waypoints[0],
              waypoints[waypoints.length - 1]
            ];
            
            // Optionally add one intermediate waypoint for a slight detour that avoids hills
            if (waypoints.length > 3) {
              const intermediateWaypoint = {
                ...waypoints[1],
                position: [
                  (waypoints[0].position[0] + waypoints[waypoints.length - 1].position[0]) / 2,
                  (waypoints[0].position[1] + waypoints[waypoints.length - 1].position[1]) / 2 - 0.003 // Slight southern route to "avoid hills"
                ],
                name: 'Efficiency Point'
              };
              efficientWaypoints.splice(1, 0, intermediateWaypoint);
            }
            
            // Update types
            efficientWaypoints[0].type = 'start';
            efficientWaypoints[efficientWaypoints.length - 1].type = 'end';
            for (let i = 1; i < efficientWaypoints.length - 1; i++) {
              efficientWaypoints[i].type = 'waypoint';
            }
            
            setWaypoints(efficientWaypoints);
            setSnappedRoute(null);
            toast.success(`Optimized route for efficiency - reduced waypoints`);
          } else {
            toast.info(`Route is already efficient with minimal waypoints`);
          }
          break;
          
        default:
          toast.success(`Applied: ${suggestion.title}`);
      }
      
      // Auto-snap to roads after applying suggestion
      setTimeout(() => {
        if (waypoints.length >= 2) {
          snapToRoads();
        }
      }, 100);
      
    } catch (error) {
      console.error('Error applying suggestion:', error);
      toast.error('Failed to apply suggestion');
    }
  }, [waypoints, routingProfile]);

  // Keyboard shortcuts (enhanced version of ProfessionalRouteBuilder shortcuts)
  useHotkeys([
    ['mod+Z', () => undo()],
    ['mod+shift+Z', () => redo()],
    ['mod+Y', () => redo()],
    ['Delete', () => selectedWaypoint && removeWaypoint(selectedWaypoint)],
    ['Escape', () => { setSelectedWaypoint(null); setShowAIPanel(false); }],
    ['mod+S', (e) => { e.preventDefault(); openSaveModal(); }],
    ['mod+E', (e) => { e.preventDefault(); exportGPX(); }],
    ['Space', (e) => { e.preventDefault(); toggleMode(); }],
    ['mod+R', (e) => { e.preventDefault(); snapToRoads(); }],
    ['mod+shift+R', (e) => { e.preventDefault(); reverseRoute(); }],
    ['mod+A', (e) => { e.preventDefault(); setShowAIPanel(!showAIPanel); }], // Toggle smart panel
    ['mod+G', (e) => { e.preventDefault(); generateAISuggestions(); }], // Generate smart suggestions
    ['mod+U', (e) => { e.preventDefault(); undoLastAISuggestion(); }], // Undo smart suggestion
    ['Enter', (e) => { if (previewingSuggestion) { e.preventDefault(); acceptSuggestion(); } }], // Accept preview
    ['mod+Escape', (e) => { if (previewingSuggestion) { e.preventDefault(); cancelPreview(); } }], // Cancel preview
  ]);

  const toggleMode = () => {
    setActiveMode(activeMode === 'draw' ? 'edit' : 'draw');
  };

  const openSaveModal = () => {
    if (waypoints.length < 2) {
      toast.error('Add at least 2 waypoints to save the route');
      return;
    }
    setSaveModalOpen(true);
  };

  const saveRoute = async () => {
    if (!routeName.trim() || waypoints.length < 2) {
      toast.error('Please add a route name and at least 2 waypoints');
      return;
    }

    setSaving(true);
    try {
      // Convert coordinates to track_points format to match database schema
      const coordinates = snappedRoute?.coordinates || waypoints.map(wp => wp.position);
      const track_points = coordinates.map((coord, index) => ({
        longitude: coord[0],
        latitude: coord[1],
        elevation: elevationProfile[index]?.elevation || null,
        cumulative_distance: elevationProfile[index]?.distance || 0,
      }));
      
      const routeData = {
        user_id: user.id,
        name: routeName.trim(),
        description: routeDescription.trim() || null,
        track_points: track_points,
        waypoints: waypoints,
        routing_profile: routingProfile,
        auto_routed: false, // Route Studio is manual with smart assistance
        snapped: !!snappedRoute,
        confidence: snappedRoute?.confidence || null,
        distance_km: snappedRoute?.distance ? snappedRoute.distance / 1000 : 0,
        duration_seconds: snappedRoute?.duration ? Math.round(snappedRoute.duration) : 0,
        elevation_gain_m: elevationStats?.gain || 0,
        elevation_loss_m: elevationStats?.loss || 0,
        elevation_min_m: elevationStats?.min || null,
        elevation_max_m: elevationStats?.max || null,
      };

      console.log('Route data to save:', routeData);

      const { error } = await supabase
        .from('user_routes')
        .insert([routeData]);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      toast.success('Route saved successfully!');
      setSaveModalOpen(false);
      setRouteName('');
      setRouteDescription('');
      navigate('/map');
    } catch (error) {
      console.error('Error saving route:', error);
      toast.error('Failed to save route');
    } finally {
      setSaving(false);
    }
  };

  const exportGPX = () => {
    if (waypoints.length < 2) {
      toast.error('Need at least 2 waypoints to export');
      return;
    }

    const coordinates = snappedRoute?.coordinates || waypoints.map(wp => wp.position);
    const gpx = pointsToGPX(coordinates, routeName || 'Route Studio Route');
    
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${routeName || 'route'}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate route stats
  const routeStats = useMemo(() => {
    if (!snappedRoute || !snappedRoute.coordinates) return null;

    // snappedRoute.distance is in METERS from Mapbox API
    // polylineDistance returns KILOMETERS
    // formatDistance expects KILOMETERS
    const distanceInKm = snappedRoute.distance
      ? snappedRoute.distance / 1000  // Convert meters to km
      : polylineDistance(snappedRoute.coordinates); // Already in km

    const elevationGain = elevationStats?.gain || 0;
    const elevationLoss = elevationStats?.loss || 0;
    const minElevation = elevationStats?.min || 0;
    const maxElevation = elevationStats?.max || 0;

    return {
      distance: formatDistance(distanceInKm),
      elevationGain: formatElevation(elevationGain),
      elevationLoss: formatElevation(elevationLoss),
      minElevation: formatElevation(minElevation),
      maxElevation: formatElevation(maxElevation),
      confidence: snappedRoute.confidence || 0,
    };
  }, [snappedRoute, elevationStats, formatDistance, formatElevation]);

  const mapStyles = [
    { value: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
    { value: 'outdoors', label: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
    { value: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  ];

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      flexDirection: isMobile ? 'column' : 'row',
      position: 'relative'
    }}>
      {/* Left Sidebar - Route Building Controls */}
      <div style={{
        width: isMobile ? '100%' : showAIPanel ? '300px' : '350px',
        maxHeight: isMobile ? '40vh' : '100vh',
        overflowY: 'auto',
        backgroundColor: '#475569',
        borderRight: '1px solid #32CD32',
        transition: 'width 0.3s ease'
      }}>
        <Container p="md" size="100%">
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <Zap size={24} color="#10b981" style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))' }} />
              <Text size="lg" fw={800} style={{ 
                background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                Route Studio
              </Text>
            </Group>
            <ActionIcon 
              variant="subtle" 
              onClick={() => navigate('/map')}
            >
              <X size={18} />
            </ActionIcon>
          </Group>

          <Stack gap="sm">
            {/* Route Name Input */}
            <TextInput
              label="Route Name"
              placeholder="Enter route name"
              value={routeName}
              onChange={(e) => setRouteName(e.currentTarget.value)}
              required
            />

            {/* Mode Selection */}
            <div>
              <Text size="sm" fw={500} mb="xs">Mode</Text>
              <SegmentedControl
                value={activeMode}
                onChange={setActiveMode}
                data={[
                  { label: 'Draw', value: 'draw' },
                  { label: 'Edit', value: 'edit' },
                ]}
                fullWidth
                size="sm"
              />
            </div>

            {/* Routing Profile */}
            <Select
              label="Routing Profile"
              value={routingProfile}
              onChange={setRoutingProfile}
              data={[
                { value: 'cycling', label: '🚴 Cycling' },
                { value: 'walking', label: '🚶 Walking' },
                { value: 'driving', label: '🚗 Driving' },
              ]}
              size="sm"
            />

            {/* Training Goal */}
            <Select
              label="Training Goal"
              value={trainingGoal}
              onChange={setTrainingGoal}
              data={[
                { value: 'endurance', label: '🚴 Endurance' },
                { value: 'intervals', label: '⚡ Intervals' },
                { value: 'recovery', label: '😌 Recovery' },
                { value: 'hills', label: '⛰️ Hills' },
              ]}
              size="sm"
              description="Smart suggestions optimized for your goal"
            />

            {/* Training Context */}
            <TrainingContextSelector
              value={trainingContext}
              onChange={setTrainingContext}
              showEstimatedTSS={snappedRoute?.coordinates?.length > 0}
              routeDistance={snappedRoute ? (snappedRoute.distance / 1000) : 0}
              routeElevation={elevationStats?.gain || 0}
            />

            {/* Weather Display */}
            {weatherData && (
              <Card withBorder p="sm">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>Current Weather</Text>
                  <Text size="xs" c="dimmed">{weatherData.description}</Text>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs">
                    <Text size="xs">🌡️</Text>
                    <Text size="xs">{formatTemperature(weatherData.temperature)}</Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs">💨</Text>
                    <Text size="xs">{weatherData.windSpeed} km/h</Text>
                  </Group>
                </Group>
              </Card>
            )}

            {/* Route Stats */}
            {routeStats && (
              <Card withBorder p="sm">
                <Text size="sm" fw={500} mb="xs">Route Statistics</Text>
                <Group justify="space-between">
                  <Text size="xs">Distance</Text>
                  <Text size="xs" fw={600}>{routeStats.distance}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs">Elevation Gain</Text>
                  <Text size="xs" fw={600}>{routeStats.elevationGain}</Text>
                </Group>
              </Card>
            )}

            {/* Waypoints List */}
            {waypoints.length > 0 && (
              <Card withBorder p="sm">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>Waypoints ({waypoints.length})</Text>
                  <ActionIcon size="sm" variant="subtle" color="red" onClick={clearRoute}>
                    <Trash2 size={14} />
                  </ActionIcon>
                </Group>
                
                <ScrollArea.Autosize maxHeight={200}>
                  <Timeline active={waypoints.length - 1} bulletSize={16} lineWidth={1}>
                    {waypoints.map((wp, index) => (
                      <Timeline.Item
                        key={wp.id}
                        bullet={
                          <ThemeIcon size={14} color={wp.type === 'start' ? 'green' : wp.type === 'end' ? 'red' : 'blue'} radius="xl">
                            {wp.type === 'start' ? <Flag size={8} /> : wp.type === 'end' ? <Target size={8} /> : <MapPin size={8} />}
                          </ThemeIcon>
                        }
                        title={
                          <Group justify="space-between">
                            <Text size="xs">{wp.name}</Text>
                            <ActionIcon size="xs" variant="subtle" color="red" onClick={() => removeWaypoint(wp.id)}>
                              <X size={10} />
                            </ActionIcon>
                          </Group>
                        }
                      />
                    ))}
                  </Timeline>
                </ScrollArea.Autosize>
              </Card>
            )}

            {/* Instructions */}
            <Alert icon={<Info size={16} />} color="blue" variant="light">
              <Text size="xs">
                {activeMode === 'draw' ? 'Click on the map to add waypoints' : 'Drag waypoints to edit the route'}
              </Text>
            </Alert>
          </Stack>
        </Container>
      </div>

      {/* Main Map Area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyles.find(s => s.value === mapStyle)?.url || 'mapbox://styles/mapbox/outdoors-v12'}
          onClick={activeMode === 'draw' ? (e) => {
            if (e.lngLat && 
                typeof e.lngLat.lng === 'number' && 
                typeof e.lngLat.lat === 'number' && 
                !isNaN(e.lngLat.lng) && 
                !isNaN(e.lngLat.lat)) {
              const position = [e.lngLat.lng, e.lngLat.lat];
              console.log('Calling addWaypoint with position:', position);
              addWaypoint(position);
              
              // Fallback: if hook doesn't work, create waypoint manually
              setTimeout(() => {
                const waypointExists = waypoints.some(wp => 
                  wp.position && 
                  Math.abs(wp.position[0] - position[0]) < 0.00001 &&
                  Math.abs(wp.position[1] - position[1]) < 0.00001
                );
                
                if (!waypointExists) {
                  console.log('Hook failed, creating waypoint manually');
                  const newWaypoint = {
                    id: `wp_${Date.now()}`,
                    position: position,
                    type: waypoints.length === 0 ? 'start' : 'waypoint',
                    name: waypoints.length === 0 ? 'Start' : `Waypoint ${waypoints.length}`
                  };
                  
                  const updatedWaypoints = [...waypoints, newWaypoint];
                  if (updatedWaypoints.length > 1) {
                    updatedWaypoints[updatedWaypoints.length - 1].type = 'end';
                    updatedWaypoints[updatedWaypoints.length - 1].name = 'End';
                    if (updatedWaypoints.length > 2) {
                      updatedWaypoints[updatedWaypoints.length - 2].type = 'waypoint';
                      updatedWaypoints[updatedWaypoints.length - 2].name = `Waypoint ${updatedWaypoints.length - 2}`;
                    }
                  }
                  
                  setWaypoints(updatedWaypoints);
                }
              }, 100);
            }
          } : undefined}
          cursor={activeMode === 'draw' ? 'crosshair' : 'default'}
        >
          <NavigationControl position="top-right" />
          <GeolocateControl
            position="top-right"
            trackUserLocation
            showUserHeading
            showAccuracyCircle={false}
          />
          <ScaleControl position="bottom-left" />
          
          {/* Original Route Line */}
          {(() => {
            const shouldShowRoute = !previewingSuggestion && ((snappedRoute && snappedRoute.coordinates && snappedRoute.coordinates.length > 0) || (waypoints.length >= 2));
            const routeCoordinates = snappedRoute?.coordinates || waypoints.map(wp => wp.position);

            console.log('🗺️ Route line render:', {
              shouldShowRoute,
              previewingSuggestion: !!previewingSuggestion,
              hasSnappedRoute: !!snappedRoute,
              snappedCoordCount: snappedRoute?.coordinates?.length || 0,
              waypointCount: waypoints.length,
              routeCoordCount: routeCoordinates?.length || 0
            });

            return shouldShowRoute ? (
              <Source
                key={`route-line-${waypoints.length}-${snappedRoute?.coordinates?.length || 0}`}
                id="route-line"
                type="geojson"
                data={buildLineString(routeCoordinates)}
              >
                <Layer
                  id="route"
                  type="line"
                  paint={{
                    'line-color': snappedRoute ? '#228be6' : '#ff6b35',
                    'line-width': 4,
                    'line-opacity': snappedRoute ? 0.8 : 0.6,
                    ...(snappedRoute ? {} : { 'line-dasharray': [2, 2] })
                  }}
                />
              </Source>
            ) : null;
          })()}

          {/* Original Route (when previewing) */}
          {previewingSuggestion && originalRoute && (
            <Source 
              id="original-route-line" 
              type="geojson" 
              data={buildLineString(originalRoute.snappedRoute?.coordinates || originalRoute.waypoints.map(wp => wp.position))}
            >
              <Layer
                id="original-route"
                type="line"
                paint={{
                  'line-color': '#228be6',
                  'line-width': 4,
                  'line-opacity': 0.7,
                  'line-dasharray': [5, 5]
                }}
              />
            </Source>
          )}

          {/* Suggested Route (when previewing) */}
          {previewingSuggestion && suggestedRoute && suggestedRoute.coordinates && (
            <Source 
              id="suggested-route-line" 
              type="geojson" 
              data={buildLineString(suggestedRoute.coordinates)}
            >
              <Layer
                id="suggested-route"
                type="line"
                paint={{
                  'line-color': '#40c057',
                  'line-width': 4,
                  'line-opacity': 0.8
                }}
              />
            </Source>
          )}
          
          {/* Waypoint Markers */}
          {waypoints.filter(waypoint => 
            waypoint.position && 
            Array.isArray(waypoint.position) && 
            typeof waypoint.position[0] === 'number' && 
            typeof waypoint.position[1] === 'number' &&
            !isNaN(waypoint.position[0]) && 
            !isNaN(waypoint.position[1])
          ).map((waypoint) => (
            <Marker
              key={waypoint.id}
              longitude={waypoint.position[0]}
              latitude={waypoint.position[1]}
              anchor="center"
              draggable={activeMode === 'edit'}
              onDragEnd={activeMode === 'edit' ? (e) => {
                if (e.lngLat && 
                    typeof e.lngLat.lng === 'number' && 
                    typeof e.lngLat.lat === 'number' && 
                    !isNaN(e.lngLat.lng) && 
                    !isNaN(e.lngLat.lat)) {
                  const updatedWaypoints = waypoints.map(wp =>
                    wp.id === waypoint.id ? 
                      { ...wp, position: [e.lngLat.lng, e.lngLat.lat] } : 
                      wp
                  );
                  setWaypoints(updatedWaypoints);
                  setSnappedRoute(null);
                }
              } : undefined}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: waypoint.type === 'start' ? '#40c057' : 
                              waypoint.type === 'end' ? '#fa5252' : '#228be6',
                  border: selectedWaypoint === waypoint.id ? '3px solid #ff6b35' : '3px solid white',
                  cursor: activeMode === 'edit' ? 'move' : 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  position: 'relative',
                }}
                onClick={() => setSelectedWaypoint(waypoint.id)}
              >
                {waypoint.type === 'start' && <Flag size={10} color="white" />}
                {waypoint.type === 'end' && <Target size={10} color="white" />}
                {waypoint.type === 'waypoint' && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
                )}
              </div>
            </Marker>
          ))}
        </Map>
        
        {/* Top Toolbar */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          <Paper shadow="sm" p="xs" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tooltip label="Undo (Ctrl+Z)">
              <ActionIcon onClick={undo} disabled={historyIndex <= 0} variant="default">
                <Undo2 size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Redo (Ctrl+Y)">
              <ActionIcon onClick={redo} disabled={historyIndex >= history.length - 1} variant="default">
                <Redo2 size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Divider orientation="vertical" />
            
            <Tooltip label="Snap to Roads">
              <ActionIcon 
                onClick={snapToRoads} 
                disabled={waypoints.length < 2 || snapping} 
                variant="default"
                loading={snapping}
              >
                <Route size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Clear Route">
              <ActionIcon onClick={clearRoute} disabled={waypoints.length === 0} variant="default">
                <Trash2 size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Divider orientation="vertical" />
            
            {/* Smart Enhancement Tools */}
            <Tooltip label="Toggle Smart Panel (Ctrl+A)">
              <ActionIcon
                onClick={() => setShowAIPanel(!showAIPanel)}
                variant={showAIPanel ? 'filled' : 'default'}
                color={showAIPanel ? 'blue' : undefined}
              >
                <Brain size={18} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Generate Smart Suggestions (Ctrl+G)">
              <ActionIcon 
                onClick={generateAISuggestions}
                disabled={waypoints.length < 2 || loadingAISuggestions}
                variant="default"
                loading={loadingAISuggestions}
              >
                <Sparkles size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Divider orientation="vertical" />
            
            <Tooltip label="Save Route (Ctrl+S)">
              <ActionIcon 
                onClick={openSaveModal} 
                disabled={waypoints.length < 2 || !routeName} 
                variant="default"
              >
                <Save size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Export GPX">
              <ActionIcon
                onClick={exportGPX}
                disabled={waypoints.length < 2}
                variant="default"
              >
                <Download size={18} />
              </ActionIcon>
            </Tooltip>

            <Divider orientation="vertical" />

            <Tooltip label="Preferences">
              <ActionIcon
                onClick={() => setPreferencesOpened(true)}
                variant="default"
              >
                <Settings size={18} />
              </ActionIcon>
            </Tooltip>
          </Paper>
        </div>
      </div>

      {/* Right Smart Panel */}
      {showAIPanel && (
        <div style={{
          width: '300px',
          height: '100vh',
          overflowY: 'auto',
          backgroundColor: '#475569',
          borderLeft: '1px solid #32CD32',
          position: isMobile ? 'absolute' : 'relative',
          right: 0,
          top: 0,
          zIndex: 1001
        }}>
          <Container p="md" size="100%">
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <Brain size={18} />
                <Text size="md" fw={600}>Smart Assist</Text>
              </Group>
              <ActionIcon variant="subtle" onClick={() => setShowAIPanel(false)}>
                <X size={16} />
              </ActionIcon>
            </Group>

            {waypoints.length < 2 ? (
              <Alert icon={<Info size={16} />} color="blue" variant="light">
                <Text size="sm">
                  Create a route with at least 2 waypoints to get smart suggestions
                </Text>
              </Alert>
            ) : (
              <Stack gap="sm">
                <Group>
                  <Button
                    onClick={generateAISuggestions}
                    loading={loadingAISuggestions}
                    leftSection={<Sparkles size={16} />}
                    style={{ flex: 1 }}
                    variant="light"
                  >
                    Get Smart Suggestions
                  </Button>
                  {aiSuggestionHistory.length > 0 && (
                    <Tooltip label="Undo Last Smart Suggestion">
                      <ActionIcon
                        onClick={undoLastAISuggestion}
                        variant="light"
                        color="orange"
                      >
                        <Undo2 size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>

                {aiSuggestions.length > 0 && (
                  <Stack gap="xs">
                    <Text size="sm" fw={500}>Suggestions ({aiSuggestions.length})</Text>
                    {aiSuggestions.map(suggestion => (
                      <Card key={suggestion.id} withBorder p="sm" style={{
                        opacity: appliedSuggestions.has(suggestion.id) ? 0.6 : 1
                      }}>
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <Group gap="xs">
                            <ThemeIcon size="sm" variant="light" color={
                              suggestion.type === 'scenery' ? 'green' :
                              suggestion.type === 'safety' ? 'orange' :
                              suggestion.type === 'performance' ? 'blue' : 'purple'
                            }>
                              {suggestion.icon}
                            </ThemeIcon>
                            <div style={{ flex: 1 }}>
                              <Text size="sm" fw={500}>{suggestion.title}</Text>
                            </div>
                          </Group>
                          <RingProgress
                            size={32}
                            thickness={3}
                            sections={[{ value: suggestion.confidence * 100, color: 'blue' }]}
                            label={
                              <Text size="xs" ta="center">
                                {Math.round(suggestion.confidence * 100)}%
                              </Text>
                            }
                          />
                        </Group>
                        
                        <Text size="xs" mb="xs" c="dimmed">
                          {suggestion.description}
                        </Text>
                        
                        <Group justify="space-between" align="center">
                          <Text size="xs" c="dimmed">
                            {suggestion.impact}
                          </Text>
                          {appliedSuggestions.has(suggestion.id) ? (
                            <Button size="xs" variant="light" disabled>
                              <Check size={12} />
                            </Button>
                          ) : (
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() => previewSuggestion(suggestion)}
                                disabled={previewingSuggestion?.id === suggestion.id}
                              >
                                {previewingSuggestion?.id === suggestion.id ? 'Previewing' : 'Preview'}
                              </Button>
                              <Button
                                size="xs"
                                variant="filled"
                                onClick={() => applySuggestion(suggestion)}
                              >
                                Apply
                              </Button>
                            </Group>
                          )}
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                )}

                {/* Preview Controls */}
                {previewingSuggestion && (
                  <Card withBorder p="md" mt="md" style={{ backgroundColor: '#3d4e5e' }}>
                    <Stack gap="sm">
                      <Group gap="xs">
                        <Text size="sm" fw={500} c="#F5F5F5">Route Comparison</Text>
                        <Text size="xs" c="#D5E1EE">
                          {previewingSuggestion.title}
                        </Text>
                      </Group>
                      
                      <Group gap="xs">
                        <div style={{ width: 12, height: 3, backgroundColor: '#228be6', borderRadius: 2 }} />
                        <Text size="xs">Original Route</Text>
                      </Group>
                      <Group gap="xs">
                        <div style={{ width: 12, height: 3, backgroundColor: '#40c057', borderRadius: 2 }} />
                        <Text size="xs">Suggested Route</Text>
                      </Group>
                      
                      <Group gap="sm" mt="xs">
                        <Button
                          size="sm"
                          variant="filled"
                          color="green"
                          onClick={acceptSuggestion}
                          leftSection={<Check size={16} />}
                          style={{ flex: 1 }}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelPreview}
                          leftSection={<X size={16} />}
                          style={{ flex: 1 }}
                        >
                          Cancel
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                )}
              </Stack>
            )}
          </Container>
        </div>
      )}

      {/* Save Modal */}
      <Modal
        opened={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title={
          <Group gap="sm">
            <Save size={20} color="#10b981" />
            <Text fw={600}>Save Route</Text>
          </Group>
        }
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Route Name"
            placeholder="Enter route name..."
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            required
          />
          
          <Textarea
            label="Description (optional)"
            placeholder="Add route description..."
            value={routeDescription}
            onChange={(e) => setRouteDescription(e.target.value)}
            rows={3}
          />

          {routeStats && (
            <Alert color="blue" variant="light">
              <Text size="sm">
                Route: {routeStats.distance} • ↗ {routeStats.elevationGain}
              </Text>
            </Alert>
          )}

          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={() => setSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveRoute}
              loading={saving}
              disabled={!routeName.trim()}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)'
              }}
            >
              Save Route
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Preferences Modal */}
      <Modal
        opened={preferencesOpened}
        onClose={() => setPreferencesOpened(false)}
        title="Route Preferences"
        size="lg"
      >
        <PreferenceSettings
          userId={user?.id}
          onSave={(prefs) => {
            setUserPreferences(prefs);
            setPreferencesOpened(false);
            toast.success('Preferences saved! Smart suggestions will use your updated preferences.');
          }}
        />
      </Modal>
    </div>
  );
};

export default RouteStudio;