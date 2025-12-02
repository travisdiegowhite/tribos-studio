import React, { useState, useCallback, useRef, forwardRef, useImperativeHandle, useEffect, useMemo } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, ScaleControl, GeolocateControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { generateAIRoutes } from '../utils/aiRouteGenerator';
import {
  Paper,
  TextInput,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  Switch,
  Progress,
  Card,
  ThemeIcon,
  ScrollArea,
  Timeline,
  Alert,
  Transition,
  Menu,
  Divider,
  UnstyledButton,
  Modal,
  Select,
  Kbd,
  HoverCard,
  Loader,
  Center,
  RingProgress,
  Tabs,
  Radio,
} from '@mantine/core';
import { useHotkeys, useMediaQuery } from '@mantine/hooks';
import {
  Navigation2,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Upload,
  Route,
  Mountain,
  Clock,
  Save,
  ChevronDown,
  ChevronUp,
  X,
  Target,
  Flag,
  ArrowUpDown,
  AlertCircle,
  Plus,
  Layers,
  Bike,
  Car,
  Footprints,
  Settings,
  Check,
  MapPin,
  Share2,
  Copy,
  Grid3x3,
  Cloud,
  Sun,
  Wind,
  Eye,
  EyeOff,
  BarChart3,
  Info,
  Maximize2,
  Minimize2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { buildLineString, polylineDistance } from '../utils/geo';
import { pointsToGPX, parseGPX } from '../utils/gpx';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../utils/units';
import { useRouteManipulation } from '../hooks/useRouteManipulation';
import { EnhancedContextCollector } from '../utils/enhancedContext';
import ShareRouteDialog from './ShareRouteDialog';
import { fetchRouteSurfaceData, SURFACE_COLORS, smoothSurfaceTransitions } from '../utils/surfaceData';

/**
 * Analyze user's past rides to determine smart defaults for route generation
 * Returns the most common direction, typical terrain, and preferred surface type
 */
async function getUserRidingPatterns(userId, currentLocation) {
  if (!userId || !currentLocation) {
    return {
      preferredDirection: 'north',
      typicalTerrain: 'rolling',
      preferredSurface: 'gravel',
      confidence: 0
    };
  }

  try {
    // Fetch user's past rides (limit to recent 20 for speed)
    const { data: routes, error } = await supabase
      .from('routes')
      .select('id, track_points, distance_km')
      .eq('user_id', userId)
      .not('track_points', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !routes || routes.length === 0) {
      console.log('No past rides found, using defaults');
      return {
        preferredDirection: 'north',
        typicalTerrain: 'rolling',
        preferredSurface: 'gravel',
        confidence: 0
      };
    }

    console.log(`📊 Analyzing ${routes.length} past rides for patterns...`);

    // Analyze directions
    const directions = { north: 0, south: 0, east: 0, west: 0 };

    routes.forEach(route => {
      if (!route.track_points || route.track_points.length < 2) return;

      const start = route.track_points[0];
      const midPoint = route.track_points[Math.floor(route.track_points.length / 4)]; // First quarter

      const latDiff = midPoint.latitude - start.latitude;
      const lonDiff = midPoint.longitude - start.longitude;

      // Determine primary direction based on which axis has more movement
      if (Math.abs(latDiff) > Math.abs(lonDiff)) {
        if (latDiff > 0) directions.north++;
        else directions.south++;
      } else {
        if (lonDiff > 0) directions.east++;
        else directions.west++;
      }
    });

    // Find most common direction
    const preferredDirection = Object.entries(directions)
      .sort(([,a], [,b]) => b - a)[0][0];

    const totalRides = Object.values(directions).reduce((a, b) => a + b, 0);
    const confidence = totalRides > 0 ? directions[preferredDirection] / totalRides : 0;

    console.log(`✅ Preferred direction: ${preferredDirection} (${Math.round(confidence * 100)}% confidence)`);
    console.log(`   Direction breakdown:`, directions);

    return {
      preferredDirection,
      typicalTerrain: 'rolling', // Could analyze elevation data here
      preferredSurface: 'gravel',
      confidence: Math.round(confidence * 100),
      sampleSize: routes.length
    };

  } catch (error) {
    console.error('Error analyzing riding patterns:', error);
    return {
      preferredDirection: 'north',
      typicalTerrain: 'rolling',
      preferredSurface: 'gravel',
      confidence: 0
    };
  }
}

/**
 * Interactive SVG Elevation Chart Component with route location highlighting
 */
const ElevationChart = ({ data, width = 800, height = 280, useImperial = true, elevationUnit = 'ft', distanceUnit = 'mi', onHover, onLeave, hoveredPoint }) => {
  
  if (!data || data.length < 2) {
    console.log('ElevationChart: insufficient data');
    return (
      <div style={{ padding: 20, textAlign: 'center', backgroundColor: '#2d3748', color: '#D5E1EE', width: '100%' }}>
        No elevation data to display (got {data?.length || 0} points)
      </div>
    );
  }

  // Handle responsive width
  const actualWidth = width === "100%" ? 800 : width; // Use 800 as base for calculations when 100%
  const margin = { top: 20, right: 30, bottom: 40, left: 70 };
  const chartWidth = actualWidth - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Convert elevation data from meters to display units
  // Note: elevation data should already be in meters from the API
  const elevations = data.map(d => useImperial ? d.elevation * 3.28084 : d.elevation);
  const distances = data.map(d => d.distance || 0);
  
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const maxDistance = Math.max(...distances);
  
  // Add padding to elevation range for better visualization
  const elevationRange = maxElevation - minElevation;
  const paddedMin = minElevation - elevationRange * 0.1;
  const paddedMax = maxElevation + elevationRange * 0.1;

  // Create SVG path
  const pathData = data
    .map((point, i) => {
      const x = (point.distance / maxDistance) * chartWidth;
      const elevation = useImperial ? point.elevation * 3.28084 : point.elevation; // Convert for display
      const y = chartHeight - ((elevation - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Create area fill path
  const areaPath = pathData + 
    ` L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

  // Generate elevation grid lines
  const elevationTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const elevation = paddedMin + (paddedMax - paddedMin) * (i / tickCount);
    const y = chartHeight - (i / tickCount) * chartHeight;
    elevationTicks.push({ elevation: Math.round(elevation), y });
  }

  // Generate distance grid lines
  const distanceTicks = [];
  const distanceTickCount = 6;
  for (let i = 0; i <= distanceTickCount; i++) {
    const distance = maxDistance * (i / distanceTickCount); // Already in miles/km
    const x = (i / distanceTickCount) * chartWidth;
    distanceTicks.push({ distance: distance.toFixed(1), x });
  }

  // Handle mouse interaction
  const handleMouseMove = (event) => {
    if (!onHover) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - margin.left;
    const y = event.clientY - rect.top - margin.top;
    
    if (x >= 0 && x <= chartWidth && y >= 0 && y <= chartHeight) {
      // Find the closest point based on x position
      const distanceAtX = (x / chartWidth) * maxDistance;
      let closestIndex = 0;
      let minDiff = Math.abs(data[0].distance - distanceAtX);
      
      for (let i = 1; i < data.length; i++) {
        const diff = Math.abs(data[i].distance - distanceAtX);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
      
      const point = data[closestIndex];
      const elevation = useImperial ? point.elevation * 3.28084 : point.elevation;
      
      onHover({
        index: closestIndex,
        distance: point.distance,
        elevation: elevation,
        coordinate: point.coordinate,
        x: (point.distance / maxDistance) * chartWidth,
        y: chartHeight - ((elevation - paddedMin) / (paddedMax - paddedMin)) * chartHeight
      });
    }
  };

  const handleMouseLeave = () => {
    if (onLeave) onLeave();
  };

  return (
    <svg 
      width={width === "100%" ? "100%" : width} 
      height={height} 
      viewBox={width === "100%" ? `0 0 ${actualWidth} ${height}` : undefined}
      style={{ 
        background: '#f8f9fa', 
        borderRadius: '4px',
        width: '100%',
        height: '100%',
        cursor: onHover ? 'crosshair' : 'default'
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background grid */}
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Horizontal grid lines */}
        {elevationTicks.map((tick, i) => (
          <g key={`h-${i}`}>
            <line
              x1={0}
              y1={tick.y}
              x2={chartWidth}
              y2={tick.y}
              stroke="#d0d0d0"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={-10}
              y={tick.y + 4}
              textAnchor="end"
              fontSize="12"
              fill="#666"
            >
              {tick.elevation}{elevationUnit}
            </text>
          </g>
        ))}
        
        {/* Vertical grid lines */}
        {distanceTicks.map((tick, i) => (
          <g key={`v-${i}`}>
            <line
              x1={tick.x}
              y1={0}
              x2={tick.x}
              y2={chartHeight}
              stroke="#d0d0d0"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={tick.x}
              y={chartHeight + 20}
              textAnchor="middle"
              fontSize="12"
              fill="#666"
            >
              {tick.distance}{distanceUnit}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path
          d={areaPath}
          fill="rgba(37, 99, 235, 0.2)"
          stroke="none"
        />

        {/* Elevation line */}
        <path
          d={pathData}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 20)) === 0 || i === data.length - 1).map((point, i) => {
          const x = (point.distance / maxDistance) * chartWidth;
          const elevation = useImperial ? point.elevation * 3.28084 : point.elevation; // Convert for display
          const y = chartHeight - ((elevation - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill="#2563eb"
              stroke="white"
              strokeWidth="1"
            />
          );
        })}

        {/* Crosshair and highlighted point when hovering */}
        {hoveredPoint && (
          <g>
            {/* Vertical crosshair line */}
            <line
              x1={hoveredPoint.x}
              y1={0}
              x2={hoveredPoint.x}
              y2={chartHeight}
              stroke="#ff4444"
              strokeWidth="2"
              strokeDasharray="4,4"
              opacity="0.8"
            />
            {/* Horizontal crosshair line */}
            <line
              x1={0}
              y1={hoveredPoint.y}
              x2={chartWidth}
              y2={hoveredPoint.y}
              stroke="#ff4444"
              strokeWidth="2"
              strokeDasharray="4,4"
              opacity="0.8"
            />
            {/* Highlighted point */}
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="6"
              fill="#ff4444"
              stroke="white"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Interactive overlay for mouse events */}
        <rect
          x={0}
          y={0}
          width={chartWidth}
          height={chartHeight}
          fill="transparent"
          style={{ pointerEvents: 'all' }}
        />
      </g>

      {/* Tooltip */}
      {hoveredPoint && (
        <g>
          <rect
            x={hoveredPoint.x + margin.left + 10}
            y={hoveredPoint.y + margin.top - 35}
            width="120"
            height="30"
            fill="rgba(0, 0, 0, 0.8)"
            rx="4"
            ry="4"
          />
          <text
            x={hoveredPoint.x + margin.left + 70}
            y={hoveredPoint.y + margin.top - 20}
            textAnchor="middle"
            fontSize="10"
            fill="white"
            fontWeight="500"
          >
            {hoveredPoint.distance.toFixed(1)}{distanceUnit} · {Math.round(hoveredPoint.elevation)}{elevationUnit}
          </text>
        </g>
      )}

      {/* Axis labels */}
      <text
        x={margin.left + chartWidth / 2}
        y={height - 5}
        textAnchor="middle"
        fontSize="12"
        fill="#333"
        fontWeight="600"
      >
        Distance ({distanceUnit})
      </text>
      <text
        x={15}
        y={margin.top + chartHeight / 2}
        textAnchor="middle"
        fontSize="12"
        fill="#333"
        fontWeight="600"
        transform={`rotate(-90 15 ${margin.top + chartHeight / 2})`}
      >
        Elevation ({elevationUnit})
      </text>
    </svg>
  );
};

/**
 * Professional RouteBuilder Component
 * Full-featured route building with all requested capabilities
 */
const ProfessionalRouteBuilder = forwardRef(({ 
  active, 
  onExit, 
  onSaved, 
  inline = false,
  mapRef: propMapRef,
}, ref) => {
  const { user } = useAuth();
  const { formatDistance, formatElevation, useImperial, setUseImperial, distanceUnit, elevationUnit } = useUnits();
  
  // Create local mapRef if not provided via props
  const localMapRef = useRef(null);
  const mapRef = propMapRef || localMapRef;
  
  // === Core State ===
  const [waypoints, setWaypoints] = useState([]);
  const [routeName, setRouteName] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [activeMode, setActiveMode] = useState('edit'); // Unified edit mode (draw + edit combined)
  const [routingProfile, setRoutingProfile] = useState('road'); // road, gravel, mountain, commuting, walking, driving
  const [autoRoute, setAutoRoute] = useState(true); // Auto-snap to roads
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [useSmartRouting, setUseSmartRouting] = useState(true); // NEW: Toggle for smart cycling routing (default ON for Stadia Maps)
  const [userPreferences, setUserPreferences] = useState(null); // NEW: User preferences for traffic avoidance
  const [naturalLanguageInput, setNaturalLanguageInput] = useState(''); // Natural language route description
  const [processingNL, setProcessingNL] = useState(false); // Loading state for NL processing
  const [showClarificationModal, setShowClarificationModal] = useState(false); // Modal for clarifying vague prompts
  const [pendingRouteRequest, setPendingRouteRequest] = useState(null); // Store parsed request while getting clarification
  const [clarificationAnswers, setClarificationAnswers] = useState({
    direction: null, // 'north', 'south', 'east', 'west', or custom place
    routeStyle: 'new', // 'past_rides' or 'new'
    terrain: 'rolling', // 'flat', 'rolling', 'hilly'
  });

  // === Route Data State ===
  const [saving, setSaving] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [snapProgress, setSnapProgress] = useState(0);
  const [snappedRoute, setSnappedRoute] = useState(null);
  const [elevationProfile, setElevationProfile] = useState([]);
  const [elevationStats, setElevationStats] = useState(null);
  const [error, setError] = useState(null);

  // === UI State ===
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);

  // Quick tips card dismissal state (persisted in localStorage)
  const [tipsCardDismissed, setTipsCardDismissed] = useState(() => {
    return localStorage.getItem('routeBuilderTipsDismissed') === 'true';
  });
  const [hoveredWaypoint, setHoveredWaypoint] = useState(null);
  const [draggingWaypoint, setDraggingWaypoint] = useState(null); // Track which waypoint is being dragged
  const [mapStyle, setMapStyle] = useState('streets');
  const [elevationHoverPoint, setElevationHoverPoint] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [showCyclingOverlay, setShowCyclingOverlay] = useState(false);
  const [cyclingData, setCyclingData] = useState(null);
  const [fetchTimeout, setFetchTimeout] = useState(null);
  const [loadingCyclingData, setLoadingCyclingData] = useState(false);

  // === Import/Export Modal State ===
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // === Responsive Breakpoints ===
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Mobile-specific state
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);

  // Fetch cycling infrastructure data from OpenStreetMap (optimized)
  const fetchCyclingData = useCallback(async (bounds, zoom) => {
    if (!bounds || zoom < 12) {
      console.log(`Cycling data fetch skipped - zoom level ${zoom} is below minimum of 12`);
      return; // Only fetch at zoom 12+
    }
    
    setLoadingCyclingData(true);
    
    const { north, south, east, west } = bounds;
    
    // Calculate area to limit query size
    const area = (north - south) * (east - west);
    console.log(`Cycling data fetch - zoom: ${zoom}, area: ${area.toFixed(6)}`);
    if (area > 0.01) { // Limit to small areas only
      console.log('Area too large for cycling data fetch - zoom in more');
      setLoadingCyclingData(false);
      return;
    }
    
    // Simplified query focusing on major cycling infrastructure only
    const overpassQuery = `
      [out:json][timeout:10];
      (
        way["highway"="cycleway"](${south},${west},${north},${east});
        way["highway"~"^(primary|secondary|tertiary)$"]["cycleway"~"^(lane|track)$"](${south},${west},${north},${east});
        way["bicycle"="designated"]["highway"!~"^(footway|path|service)$"](${south},${west},${north},${east});
      );
      out geom;
    `;
    
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: overpassQuery
      });
      
      if (!response.ok) throw new Error('Failed to fetch cycling data');
      
      const data = await response.json();
      
      // Limit number of features to prevent performance issues
      const limitedElements = data.elements.slice(0, 500);
      
      // Convert OSM data to GeoJSON
      const features = limitedElements
        .filter(element => element.type === 'way' && element.geometry && element.geometry.length > 1)
        .map(way => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: way.geometry.map(node => [node.lon, node.lat])
          },
          properties: {
            highway: way.tags?.highway,
            cycleway: way.tags?.cycleway,
            bicycle: way.tags?.bicycle,
            surface: way.tags?.surface
          }
        }));
      
      console.log(`Loaded ${features.length} cycling features`);
      
      if (features.length === 0) {
        console.log('No cycling infrastructure found in this area');
      }
      
      setCyclingData({
        type: 'FeatureCollection',
        features
      });
      
    } catch (error) {
      console.error('Error fetching cycling data:', error);
      toast.error(`Failed to load cycling infrastructure data: ${error.message}`);
    } finally {
      setLoadingCyclingData(false);
    }
  }, []);

  // Debounced cycling data fetch to prevent excessive API calls
  const debouncedFetchCyclingData = useCallback((bounds, zoom) => {
    if (fetchTimeout) {
      clearTimeout(fetchTimeout);
    }
    const newTimeout = setTimeout(() => {
      fetchCyclingData(bounds, zoom);
    }, 500); // Wait 500ms after user stops moving
    setFetchTimeout(newTimeout);
  }, [fetchCyclingData, fetchTimeout]);
  const [showElevationChart, setShowElevationChart] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(true);
  const [colorRouteBy, setColorRouteBy] = useState('none'); // 'none' | 'grade' | 'surface'
  const [surfaceData, setSurfaceData] = useState(null);
  const [loadingSurfaceData, setLoadingSurfaceData] = useState(false);

  // === History for Undo/Redo ===
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // === Saved Routes ===
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false);

  // === Share Dialog ===
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [lastSavedRoute, setLastSavedRoute] = useState(null);
  
  // === Map Styles Configuration ===
  const mapStyles = [
    { value: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
    { value: 'outdoors', label: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
    { value: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { value: 'terrain', label: 'Terrain', url: 'mapbox://styles/mapbox/satellite-v9' },
  ];
  
  // === Load User Preferences for Traffic Avoidance ===
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.id) return;

      try {
        const prefs = await EnhancedContextCollector.getCompletePreferences(user.id);
        if (prefs) {
          setUserPreferences(prefs);
          console.log('✅ Loaded user preferences for route builder:', prefs);
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error);
      }
    };

    loadPreferences();
  }, [user?.id]);

  // === Route Manipulation Functions ===
  const {
    addWaypoint,
    snapToRoads,
    fetchElevation,
    clearRoute,
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
    userPreferences, // NEW: Pass user preferences
    useSmartRouting, // NEW: Pass smart routing toggle
  });

  // === Insert waypoint on route click ===
  const insertWaypointOnRoute = useCallback((lngLat) => {
    if (waypoints.length < 2) {
      // If less than 2 waypoints, just add normally at the end
      const newWaypoint = {
        id: `wp_${Date.now()}`,
        position: [lngLat.lng, lngLat.lat],
        type: waypoints.length === 0 ? 'start' : 'end',
        name: waypoints.length === 0 ? 'Start' : 'End'
      };
      setWaypoints([...waypoints, newWaypoint]);
      setSnappedRoute(null);
      return;
    }

    // Find the closest segment to insert the waypoint
    const clickedPoint = [lngLat.lng, lngLat.lat];
    let closestSegmentIndex = 0;
    let minDistance = Infinity;

    // Helper: Calculate distance from point to line segment
    const distanceToSegment = (point, lineStart, lineEnd) => {
      const [px, py] = point;
      const [x1, y1] = lineStart;
      const [x2, y2] = lineEnd;

      const A = px - x1;
      const B = py - y1;
      const C = x2 - x1;
      const D = y2 - y1;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;

      if (lenSq !== 0) param = dot / lenSq;

      let xx, yy;

      if (param < 0) {
        xx = x1;
        yy = y1;
      } else if (param > 1) {
        xx = x2;
        yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }

      const dx = px - xx;
      const dy = py - yy;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Find closest segment
    for (let i = 0; i < waypoints.length - 1; i++) {
      const distance = distanceToSegment(
        clickedPoint,
        waypoints[i].position,
        waypoints[i + 1].position
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestSegmentIndex = i;
      }
    }

    // Insert waypoint after the closest segment start
    const newWaypoint = {
      id: `wp_${Date.now()}`,
      position: clickedPoint,
      type: 'waypoint',
      name: `Waypoint ${waypoints.filter(w => w.type === 'waypoint').length + 1}`
    };

    const updatedWaypoints = [
      ...waypoints.slice(0, closestSegmentIndex + 1),
      newWaypoint,
      ...waypoints.slice(closestSegmentIndex + 1)
    ];

    setWaypoints(updatedWaypoints);
    setSnappedRoute(null);
  }, [waypoints, setWaypoints, setSnappedRoute]);

  // === Keyboard Shortcuts ===
  useHotkeys([
    ['mod+Z', () => undo()],
    ['mod+shift+Z', () => redo()],
    ['mod+Y', () => redo()],
    ['Delete', () => selectedWaypoint && removeWaypoint(selectedWaypoint)],
    ['Escape', () => setSelectedWaypoint(null)],
    ['mod+S', (e) => { e.preventDefault(); saveRoute(); }],
    ['mod+E', (e) => { e.preventDefault(); exportGPX(); }],
    ['Space', (e) => { e.preventDefault(); toggleAutoRoute(); }],
    ['mod+R', (e) => { e.preventDefault(); snapToRoads(); }],
    ['mod+shift+R', (e) => { e.preventDefault(); reverseRoute(); }],
  ]);
  
  // === Smart Routing Labels (memoized to prevent re-renders) ===
  const smartRoutingConfig = useMemo(() => {
    if (routingProfile === 'gravel') {
      return {
        label: 'Prioritize dirt roads & trails',
        description: 'Extremely high preference for unpaved surfaces'
      };
    }
    if (routingProfile === 'mountain') {
      return {
        label: 'Mountain bike trails',
        description: 'Prioritize singletrack and technical terrain'
      };
    }
    if (routingProfile === 'commuting') {
      return {
        label: 'Optimize for commuting',
        description: 'Balance speed with safety for daily commutes'
      };
    }
    return {
      label: 'Prefer bike lanes & quiet roads',
      description: 'Avoid high-traffic roads (uses your route preferences)'
    };
  }, [routingProfile]);

  // === Calculate Route Statistics ===
  const routeStats = useMemo(() => {
    const coords = snappedRoute?.coordinates || waypoints.map(w => w.position);
    // polylineDistance returns km, so multiply by 1000 for meters
    // But snappedRoute.distance is already in meters from Mapbox API
    const distance = snappedRoute?.distance || (coords.length > 1 ? polylineDistance(coords) * 1000 : 0);
    const duration = snappedRoute?.duration || ((distance / 1000) / 25 * 3600); // Assume 25km/h average

    return {
      distance, // in meters
      duration, // in seconds
      elevationGain: elevationStats?.gain || 0,
      elevationLoss: elevationStats?.loss || 0,
      maxElevation: elevationStats?.max || 0,
      minElevation: elevationStats?.min || 0,
      avgGrade: elevationStats?.avgGrade || 0,
      maxGrade: elevationStats?.maxGrade || 0,
      confidence: snappedRoute?.confidence || 0,
    };
  }, [snappedRoute, waypoints, elevationStats]);
  
  // === Toggle Auto-Route ===
  const toggleAutoRoute = useCallback(() => {
    setAutoRoute(prev => !prev);
    toast.success(autoRoute ? 'Auto-routing disabled' : 'Auto-routing enabled');
  }, [autoRoute]);

  const dismissTipsCard = useCallback(() => {
    setTipsCardDismissed(true);
    localStorage.setItem('routeBuilderTipsDismissed', 'true');
  }, []);

  // === Fetch Saved Routes ===
  const fetchSavedRoutes = useCallback(async () => {
    if (!user?.id) return;
    
    setLoadingSavedRoutes(true);
    try {
      const { data, error } = await supabase
        .from('user_routes')
        .select('id, name, distance_km, elevation_gain_m, duration_seconds, snapped, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      setSavedRoutes(data.map(route => ({
        id: route.id,
        name: route.name || `Route ${route.id}`,
        distance: route.distance_km || 0,
        elevation: route.elevation_gain_m || 0,
        duration: route.duration_seconds || 0,
        snapped: route.snapped || false,
      })));
    } catch (err) {
      console.error('Error fetching saved routes:', err);
    } finally {
      setLoadingSavedRoutes(false);
    }
  }, [user?.id]);
  
  // === Load saved route ===
  const loadSavedRoute = useCallback(async (routeId) => {
    try {
      const { data, error } = await supabase
        .from('user_routes')
        .select('*')
        .eq('id', routeId)
        .single();

      if (error) throw error;

      // Load the route data
      setRouteName(data.name);
      setRouteDescription(data.description || '');
      setRoutingProfile(data.routing_profile || 'cycling');
      setAutoRoute(data.auto_routed || false);
      
      // Load waypoints
      if (data.waypoints && Array.isArray(data.waypoints)) {
        setWaypoints(data.waypoints);
      }
      
      // If route was snapped, reconstruct the route
      if (data.snapped && data.track_points && Array.isArray(data.track_points)) {
        const coordinates = data.track_points.map(point => [point.longitude, point.latitude]);
        setSnappedRoute({
          coordinates,
          distance: (data.distance_km || 0) * 1000, // Convert km to meters
          duration: data.duration_seconds || 0,
          confidence: data.confidence || 0,
        });
      }

      toast.success(`Loaded route "${data.name}"`);
    } catch (err) {
      console.error('Failed to load route:', err);
      toast.error('Failed to load route');
    }
  }, [setWaypoints, setSnappedRoute]);
  
  // === Load saved routes on mount ===
  useEffect(() => {
    fetchSavedRoutes();
  }, [fetchSavedRoutes]);
  
  // === Re-fetch elevation when units change ===
  useEffect(() => {
    if (snappedRoute && snappedRoute.coordinates && snappedRoute.coordinates.length > 0) {
      fetchElevation(snappedRoute.coordinates);
    }
  }, [useImperial, fetchElevation, snappedRoute]);
  
  // === Auto-route when waypoints are ADDED (not when dragged/edited) ===
  useEffect(() => {
    // Only auto-route when the NUMBER of waypoints changes (added/removed)
    // NOT when waypoint positions change (dragging/editing)
    // This prevents the glitchy snap-back behavior when dragging waypoints
    if (waypoints.length >= 2 && autoRoute) {
      const timer = setTimeout(() => {
        snapToRoads();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [waypoints.length, autoRoute, snapToRoads]); // Only watch waypoints.length, not waypoints array
  
  // === Export GPX ===
  const exportGPX = useCallback(() => {
    const coords = snappedRoute?.coordinates || waypoints.map(w => w.position);
    if (coords.length < 2) {
      toast.error('Need at least 2 points to export');
      return;
    }

    const gpxData = pointsToGPX(coords, routeName || 'My Route', {
      description: routeDescription,
      elevationProfile,
    });

    const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${routeName || 'route'}_${new Date().toISOString().split('T')[0]}.gpx`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('GPX file exported');
    setShowExportModal(false);
  }, [snappedRoute, waypoints, routeName, routeDescription, elevationProfile]);

  // === Send to Garmin ===
  const sendToGarmin = useCallback(async () => {
    try {
      const coords = snappedRoute?.coordinates || waypoints.map(w => w.position);
      if (coords.length < 2) {
        toast.error('Need at least 2 points to send to Garmin');
        return;
      }

      // First export as GPX
      const gpxData = pointsToGPX(coords, routeName || 'My Route', {
        description: routeDescription,
        elevationProfile,
      });

      // TODO: Integrate with Garmin API to upload route
      // For now, we'll use the GarminService to check connection
      const { GarminService } = await import('../utils/garminService');
      const garminService = new GarminService();

      if (!garminService.isConfigured()) {
        toast.error('Garmin integration not configured. Please connect your Garmin account in Settings.');
        return;
      }

      // Show toast that this feature is coming soon
      toast.success('Garmin export coming soon! For now, download the GPX and upload manually to Garmin Connect.', {
        duration: 5000
      });

      // Auto-download GPX as fallback
      exportGPX();
    } catch (error) {
      console.error('Error sending to Garmin:', error);
      toast.error('Failed to send to Garmin. Try downloading GPX instead.');
    }
  }, [snappedRoute, waypoints, routeName, routeDescription, elevationProfile, exportGPX]);
  
  // === Import GPX ===
  const importGPX = useCallback(async (file) => {
    try {
      const text = await file.text();
      const { waypoints: importedWaypoints, name, description } = parseGPX(text);
      
      if (importedWaypoints.length < 2) {
        throw new Error('GPX file must contain at least 2 points');
      }
      
      // Convert to our waypoint format
      const newWaypoints = importedWaypoints.map((coord, index) => ({
        id: `wp_${Date.now()}_${index}`,
        position: coord,
        type: index === 0 ? 'start' : index === importedWaypoints.length - 1 ? 'end' : 'waypoint',
        name: index === 0 ? 'Start' : `Waypoint ${index}`,
      }));
      
      setWaypoints(newWaypoints);
      if (name) setRouteName(name);
      if (description) setRouteDescription(description);
      
      toast.success('GPX file imported successfully');
      
      // Auto-snap if enabled
      if (autoRoute) {
        setTimeout(() => snapToRoads(), 500);
      }
    } catch (err) {
      console.error('GPX import failed:', err);
      toast.error(`Failed to import GPX: ${err.message}`);
    }
  }, [autoRoute, snapToRoads]);

  // === Natural Language Route Generation ===
  const handleNaturalLanguageRoute = useCallback(async () => {
    if (!naturalLanguageInput.trim()) {
      toast.error('Please describe the route you want to create');
      return;
    }

    setProcessingNL(true);
    setError(null);

    try {
      console.log('🧠 Processing natural language route request:', naturalLanguageInput);

      // Build prompt for Claude (same as Smart Route Planner)
      const prompt = `You are a cycling route planning assistant. The user wants to create a cycling route.

User's request: "${naturalLanguageInput}"

Current location: ${userLocation ? `${userLocation.latitude}, ${userLocation.longitude}` : 'Unknown'}

Extract the following information and return ONLY a JSON object:
{
  "startLocation": "city or address" (or null if using current location),
  "waypoints": ["city1", "city2", ...] (intermediate stops if mentioned),
  "routeType": "loop" or "point_to_point",
  "distance": number in km (or null if not specified),
  "timeAvailable": number in minutes (or null if distance-based),
  "surfaceType": "gravel" | "paved" | "mixed",
  "terrain": "flat" | "rolling" | "hilly",
  "avoidHighways": true/false,
  "avoidTraffic": true/false,
  "trainingGoal": "endurance" | "intervals" | "recovery" | "tempo" | "hills" (or null)
}

Examples:
- "20 mile gravel ride" → {"distance": 32.19, "surfaceType": "gravel", "routeType": "loop"}
- "flat 50km loop" → {"distance": 50, "terrain": "flat", "routeType": "loop"}
- "ride from Boulder to Lyons" → {"startLocation": "Boulder, CO", "waypoints": ["Lyons, CO"], "routeType": "point_to_point"}`;

      // Call Claude API
      const apiUrl = process.env.REACT_APP_VERCEL_ENV === 'production'
        ? 'https://www.tribos.studio/api/claude-routes'
        : '/api/claude-routes';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 1000,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to process route request');
      }

      // Parse Claude's response
      const jsonMatch = data.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse route parameters');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log('📝 Parsed route parameters:', parsed);

      // Check if this is a simple distance request without waypoints
      // Instead of showing modal, use smart defaults based on riding history
      const hasWaypoints = parsed.waypoints && parsed.waypoints.length > 0;
      const isSimpleDistanceRequest = (parsed.distance || parsed.timeAvailable) && !hasWaypoints;

      if (isSimpleDistanceRequest) {
        console.log('🎯 Simple distance request - using smart defaults based on riding history');

        // Get user's riding patterns to determine preferred direction
        const patterns = await getUserRidingPatterns(user?.id, userLocation);
        console.log('📊 Using riding patterns:', patterns);

        // Set routing profile based on surface type
        if (parsed.surfaceType === 'gravel') {
          setRoutingProfile('gravel');
        } else if (parsed.surfaceType === 'paved') {
          setRoutingProfile('road');
        }

        // Generate route using smart defaults
        const loadingToast = toast.loading('Creating your route...');

        try {
          const startCoords = [userLocation.longitude, userLocation.latitude];
          const distanceKm = parsed.distance || 20; // Default to 20km if not specified
          const direction = patterns.preferredDirection;

          // Calculate target coordinates based on preferred direction
          const offsetKm = distanceKm / 2; // Go halfway in the direction
          const latOffset = offsetKm / 111;
          const lonOffset = offsetKm / (111 * Math.cos(userLocation.latitude * Math.PI / 180));

          let targetCoords;
          switch (direction) {
            case 'north':
              targetCoords = [userLocation.longitude, userLocation.latitude + latOffset];
              break;
            case 'south':
              targetCoords = [userLocation.longitude, userLocation.latitude - latOffset];
              break;
            case 'east':
              targetCoords = [userLocation.longitude + lonOffset, userLocation.latitude];
              break;
            case 'west':
              targetCoords = [userLocation.longitude - lonOffset, userLocation.latitude];
              break;
            default:
              targetCoords = [userLocation.longitude, userLocation.latitude + latOffset];
          }

          console.log(`🧭 Using ${direction} direction (${patterns.confidence}% confidence)`);

          // Use AI route generation with smart defaults (instead of geometric patterns)
          console.log('🤖 Using AI route generation with smart defaults');

          try {
            const routes = await generateAIRoutes({
              startLocation: startCoords,
              timeAvailable: Math.round((distanceKm / 20) * 60), // Assume 20km/h avg speed
              trainingGoal: 'endurance',
              routeType: 'loop',
              weatherData: null,
              userId: user?.id,
              userPreferences: {
                preferredDirection: direction,
                terrain: patterns.typicalTerrain,
                surfaceType: parsed.surfaceType || 'gravel'
              }
            });

            if (!routes || routes.length === 0) {
              throw new Error('Could not generate route with smart defaults');
            }

            const bestRoute = routes[0];
            console.log('✅ Generated AI route with smart defaults:', bestRoute);

            // Convert to waypoints (same as clarification handler)
            const routeCoords = bestRoute.coordinates || bestRoute.route?.coordinates;
            if (!routeCoords || routeCoords.length < 2) {
              throw new Error('Generated route has no coordinates');
            }

            // Sample waypoints from the generated route
            const waypointInterval = Math.max(1, Math.floor(routeCoords.length / 8));
            const sampledWaypoints = [];
            for (let i = 0; i < routeCoords.length; i += waypointInterval) {
              sampledWaypoints.push(routeCoords[i]);
            }
            if (sampledWaypoints[sampledWaypoints.length - 1] !== routeCoords[routeCoords.length - 1]) {
              sampledWaypoints.push(routeCoords[routeCoords.length - 1]);
            }

            const formattedWaypoints = sampledWaypoints.map((coord, index) => ({
              id: `wp_${Date.now()}_${index}`,
              position: coord,
              type: index === 0 ? 'start' : index === sampledWaypoints.length - 1 ? 'end' : 'waypoint',
              name: index === 0 ? 'Start' : index === sampledWaypoints.length - 1 ? 'End' : `Waypoint ${index + 1}`
            }));

            setWaypoints(formattedWaypoints);
            setRouteName(bestRoute.name || `${Math.round(distanceKm * 0.621371)}mi ${parsed.surfaceType || 'cycling'} route`);
            setRouteDescription(naturalLanguageInput);
            setAutoRoute(true);

            // Trigger route generation
            setTimeout(() => snapToRoads(), 500);

            toast.dismiss(loadingToast);

            // Show success with customize option
            const confidenceText = patterns.confidence > 50 ? ' (your usual direction)' : '';
            toast.success(
              `Created ${Math.round(distanceKm * 0.621371)}mi ${parsed.surfaceType || ''} route heading ${direction}${confidenceText}`,
              {
                duration: 6000,
                action: {
                  label: 'Customize',
                  onClick: () => {
                    setPendingRouteRequest(parsed);
                    setShowClarificationModal(true);
                  }
                }
              }
            );

            setProcessingNL(false);
            return;

          } catch (aiError) {
            console.error('Smart defaults AI generation failed:', aiError);
            toast.dismiss(loadingToast);

            // Fall back to clarification modal if AI generation fails
            console.log('⚠️ Falling back to clarification modal due to AI generation error');
            setPendingRouteRequest(parsed);
            setShowClarificationModal(true);
            setProcessingNL(false);
            return;
          }

        } catch (error) {
          console.error('Smart defaults route generation failed:', error);
          toast.dismiss(loadingToast);

          // Fall back to showing clarification modal if smart defaults fail
          console.log('⚠️ Falling back to clarification modal');
          setPendingRouteRequest(parsed);
          setShowClarificationModal(true);
          setProcessingNL(false);
          return;
        }
      }

      // If user specified waypoints (like "towards Boulder"), just generate the route!
      console.log('✅ Request has clear destination/waypoints - generating route directly');

      // Geocoding helper function
      const geocodeAddress = async (address, proximity = null) => {
        const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
        if (!mapboxToken) {
          throw new Error('Mapbox token not available');
        }

        const encodedAddress = encodeURIComponent(address);
        let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&country=US&types=place,locality,address,poi`;

        if (proximity) {
          url += `&proximity=${proximity[0]},${proximity[1]}`;
        }

        console.log(`🔍 Geocoding: "${address}"`);

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
        }
        return null;
      };

      // Determine start location
      let startCoords = userLocation ? [userLocation.longitude, userLocation.latitude] : null;
      if (parsed.startLocation) {
        const result = await geocodeAddress(parsed.startLocation);
        if (result) {
          startCoords = result.coordinates;
        }
      }

      if (!startCoords) {
        throw new Error('Could not determine start location');
      }

      // Set routing profile based on surface type
      if (parsed.surfaceType === 'gravel') {
        setRoutingProfile('gravel');
      } else if (parsed.surfaceType === 'paved') {
        setRoutingProfile('road');
      }

      // Geocode waypoints if provided
      console.log('📍 Geocoding waypoints and planning route');

      const newWaypoints = [startCoords];
      let targetCoords = null;

      // Geocode intermediate waypoints
      if (parsed.waypoints && parsed.waypoints.length > 0) {
        for (const waypoint of parsed.waypoints) {
          const result = await geocodeAddress(waypoint, startCoords);
          if (result) {
            newWaypoints.push(result.coordinates);
            targetCoords = result.coordinates; // Use last waypoint as target
          }
        }
      }

      // If distance is specified and this is a loop, add intermediate waypoints to hit target distance
      if (parsed.distance && parsed.routeType === 'loop' && targetCoords) {
        console.log(`🎯 Creating ${parsed.distance}km loop via ${parsed.waypoints[0]}`);

        // Calculate direction from start to target
        const bearing = Math.atan2(
          targetCoords[0] - startCoords[0],
          targetCoords[1] - startCoords[1]
        ) * 180 / Math.PI;

        // Add 2-3 additional waypoints to create a proper loop of the target distance
        const distanceKm = parsed.distance;
        const radiusKm = distanceKm / (2 * Math.PI) * 1.2; // Slightly larger for routing
        const radiusLat = radiusKm / 111;
        const radiusLon = radiusKm / (111 * Math.cos(startCoords[1] * Math.PI / 180));

        // Add waypoint perpendicular to the main bearing
        const perpBearing = bearing + 90;
        const lat1 = startCoords[1] + radiusLat * Math.cos(perpBearing * Math.PI / 180);
        const lon1 = startCoords[0] + radiusLon * Math.sin(perpBearing * Math.PI / 180);
        newWaypoints.push([lon1, lat1]);

        console.log(`✅ Added intermediate waypoints for ${distanceKm}km loop`);
      } else if (parsed.routeType === 'loop') {
        // Simple loop without distance requirement
        newWaypoints.push(newWaypoints[0]);
      }

      // Always end where we started for loops
      if (parsed.routeType === 'loop' && newWaypoints[newWaypoints.length - 1] !== startCoords) {
        newWaypoints.push(startCoords);
      }

      if (newWaypoints.length < 2) {
        throw new Error('Could not geocode enough waypoints. Try being more specific with location names.');
      }

      // Convert to Professional Route Builder waypoint format
      const formattedWaypoints = newWaypoints.map((coord, index) => ({
        id: `wp_${Date.now()}_${index}`,
        position: coord,
        type: index === 0 ? 'start' : index === newWaypoints.length - 1 ? 'end' : 'waypoint',
        name: index === 0 ? 'Start' : index === newWaypoints.length - 1 ? 'End' : `Waypoint ${index}`
      }));

      setWaypoints(formattedWaypoints);
      setRouteName(parsed.startLocation || 'AI Generated Route');
      setRouteDescription(`${parsed.surfaceType || 'Mixed'} route - ${naturalLanguageInput}`);
      setAutoRoute(true);

      toast.success(`Created route with ${newWaypoints.length} waypoints`);

      // Trigger routing after a short delay
      setTimeout(() => {
        snapToRoads();
      }, 500);

      // Clear input
      setNaturalLanguageInput('');

    } catch (err) {
      console.error('Natural language route generation error:', err);
      toast.error(err.message || 'Failed to process route request');
      setError(err.message);
    } finally {
      setProcessingNL(false);
    }
  }, [naturalLanguageInput, userLocation, user, snapToRoads]);

  // === Handle Clarified Route Generation ===
  const handleClarifiedRouteGeneration = useCallback(async () => {
    if (!pendingRouteRequest || !userLocation) {
      toast.error('Missing route request or location');
      return;
    }

    setProcessingNL(true);
    setShowClarificationModal(false);

    try {
      const { distance, surfaceType, routeType, trainingGoal, waypoints: requestWaypoints } = pendingRouteRequest;
      const { direction, customPlace, routeStyle, terrain } = clarificationAnswers;

      // Set routing profile based on surface type
      if (surfaceType === 'gravel') {
        setRoutingProfile('gravel');
      } else if (surfaceType === 'paved') {
        setRoutingProfile('road');
      }

      // Determine target location based on:
      // 1. Waypoints from original request (e.g., "Boulder")
      // 2. Custom place from clarification
      // 3. Direction from clarification
      let targetCoords = null;
      let startCoords = [userLocation.longitude, userLocation.latitude];

      // Check if original request had waypoints (like "towards Boulder")
      if (requestWaypoints && requestWaypoints.length > 0 && !customPlace && !direction) {
        // Geocode the first waypoint from the original request
        const waypointName = requestWaypoints[0];
        console.log(`🔍 Using waypoint from original request: "${waypointName}"`);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(waypointName)}.json?access_token=${process.env.REACT_APP_MAPBOX_TOKEN}&proximity=${userLocation.longitude},${userLocation.latitude}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
          targetCoords = data.features[0].center;
          console.log(`✅ Geocoded "${waypointName}" to: ${data.features[0].place_name}`);
        } else {
          console.warn(`Could not geocode "${waypointName}", will use direction fallback`);
        }
      } else if (customPlace && customPlace.trim()) {
        // Geocode custom place
        console.log(`🔍 Geocoding custom place: "${customPlace}"`);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(customPlace)}.json?access_token=${process.env.REACT_APP_MAPBOX_TOKEN}&proximity=${userLocation.longitude},${userLocation.latitude}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
          targetCoords = data.features[0].center;
          console.log(`✅ Geocoded to: ${data.features[0].place_name}`);
        } else {
          throw new Error('Could not find the place you specified');
        }
      } else if (direction) {
        // Calculate offset based on direction and distance
        const distanceKm = distance || 20; // Default to 20km if no distance specified
        const offsetKm = distanceKm / 2; // Go halfway in the direction

        // Calculate offset coordinates (rough approximation)
        // 1 degree latitude ≈ 111km, longitude varies by latitude
        const latOffset = offsetKm / 111;
        const lonOffset = offsetKm / (111 * Math.cos(userLocation.latitude * Math.PI / 180));

        switch (direction) {
          case 'north':
            targetCoords = [userLocation.longitude, userLocation.latitude + latOffset];
            break;
          case 'south':
            targetCoords = [userLocation.longitude, userLocation.latitude - latOffset];
            break;
          case 'east':
            targetCoords = [userLocation.longitude + lonOffset, userLocation.latitude];
            break;
          case 'west':
            targetCoords = [userLocation.longitude - lonOffset, userLocation.latitude];
            break;
          default:
            targetCoords = [userLocation.longitude, userLocation.latitude + latOffset]; // Default north
        }

        console.log(`🧭 Direction ${direction} offset to:`, targetCoords);
      }

      if (routeStyle === 'past_rides') {
        // Use AI route generation with past ride analysis
        console.log('🤖 Using AI route generation based on past rides');

        const loadingToast = toast.loading('Analyzing your past rides and generating route...');

        const routes = await generateAIRoutes({
          startLocation: startCoords,
          timeAvailable: pendingRouteRequest.timeAvailable || Math.round((distance / 20) * 60),
          trainingGoal: trainingGoal || 'endurance',
          routeType: routeType || 'loop',
          weatherData: null,
          userId: user?.id,
          userPreferences: {
            preferredDirection: direction,
            terrain: terrain,
            surfaceType: surfaceType
          }
        });

        if (!routes || routes.length === 0) {
          throw new Error('Could not generate route based on your past rides');
        }

        const bestRoute = routes[0];
        console.log('✅ Generated AI route:', bestRoute);

        // Convert to waypoints
        const routeCoords = bestRoute.coordinates || bestRoute.route?.coordinates;
        if (!routeCoords || routeCoords.length < 2) {
          throw new Error('Generated route has no coordinates');
        }

        // Sample waypoints
        const waypointInterval = Math.max(1, Math.floor(routeCoords.length / 8));
        const sampledWaypoints = [];
        for (let i = 0; i < routeCoords.length; i += waypointInterval) {
          sampledWaypoints.push(routeCoords[i]);
        }
        if (sampledWaypoints[sampledWaypoints.length - 1] !== routeCoords[routeCoords.length - 1]) {
          sampledWaypoints.push(routeCoords[routeCoords.length - 1]);
        }

        const formattedWaypoints = sampledWaypoints.map((coord, index) => ({
          id: `wp_${Date.now()}_${index}`,
          position: coord,
          type: index === 0 ? 'start' : index === sampledWaypoints.length - 1 ? 'end' : 'waypoint',
          name: index === 0 ? 'Start' : index === sampledWaypoints.length - 1 ? 'End' : `Waypoint ${index + 1}`
        }));

        setWaypoints(formattedWaypoints);
        setRouteName(`${Math.round(distance || bestRoute.distance)}km ${surfaceType || 'cycling'} route`);
        setRouteDescription(naturalLanguageInput);
        setAutoRoute(true);

        toast.dismiss(loadingToast);
        toast.success(`Created ${Math.round(bestRoute.distance)}km route based on your riding history`);

      } else {
        // Create simple geometric loop (explore new area)
        console.log('🔄 Creating simple geometric loop');

        const loadingToast = toast.loading('Creating route...');

        const distanceKm = distance || 20;
        const numWaypoints = 6; // Create a hexagonal-ish loop

        // Create waypoints in a loop pattern
        const waypoints = [];
        const radiusKm = distanceKm / (2 * Math.PI); // Approximate radius for desired distance

        // Convert to degrees (rough approximation)
        const radiusLat = radiusKm / 111;
        const radiusLon = radiusKm / (111 * Math.cos(userLocation.latitude * Math.PI / 180));

        // Determine center point (offset in the chosen direction)
        let centerLat = userLocation.latitude;
        let centerLon = userLocation.longitude;

        if (targetCoords) {
          // Center between current location and target
          centerLat = (userLocation.latitude + targetCoords[1]) / 2;
          centerLon = (userLocation.longitude + targetCoords[0]) / 2;
        } else {
          // Default: center slightly to the chosen direction
          const offsetFactor = 0.3; // 30% offset towards direction
          switch (direction) {
            case 'north':
              centerLat += radiusLat * offsetFactor;
              break;
            case 'south':
              centerLat -= radiusLat * offsetFactor;
              break;
            case 'east':
              centerLon += radiusLon * offsetFactor;
              break;
            case 'west':
              centerLon -= radiusLon * offsetFactor;
              break;
          }
        }

        // Create loop waypoints around the center
        for (let i = 0; i < numWaypoints; i++) {
          const angle = (i / numWaypoints) * 2 * Math.PI;
          const lat = centerLat + radiusLat * Math.sin(angle);
          const lon = centerLon + radiusLon * Math.cos(angle);

          waypoints.push({
            id: `wp_${Date.now()}_${i}`,
            position: [lon, lat],
            type: i === 0 ? 'start' : 'waypoint',
            name: i === 0 ? 'Start' : `Waypoint ${i + 1}`
          });
        }

        // Add end point (same as start for loop)
        waypoints.push({
          id: `wp_${Date.now()}_end`,
          position: waypoints[0].position,
          type: 'end',
          name: 'End'
        });

        setWaypoints(waypoints);
        setRouteName(`${Math.round(distanceKm)}km ${direction || 'exploration'} ${surfaceType || 'cycling'} route`);
        setRouteDescription(`${naturalLanguageInput} - exploring ${direction || 'new area'}`);
        setAutoRoute(true);

        toast.dismiss(loadingToast);
        toast.success(`Created ~${Math.round(distanceKm)}km exploration route`);
      }

      // Reset clarification state
      setPendingRouteRequest(null);
      setClarificationAnswers({
        direction: null,
        customPlace: '',
        routeStyle: 'new',
        terrain: 'rolling'
      });

    } catch (error) {
      console.error('❌ Error generating clarified route:', error);
      toast.error(error.message || 'Failed to generate route');
    } finally {
      setProcessingNL(false);
    }
  }, [pendingRouteRequest, clarificationAnswers, userLocation, user, naturalLanguageInput]);

  // === Save Route ===
  const saveRoute = useCallback(async () => {
    if (!routeName.trim()) {
      toast.error('Please enter a route name');
      return;
    }
    
    if (waypoints.length < 2) {
      toast.error('Route must have at least 2 points');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const coords = snappedRoute?.coordinates || waypoints.map(w => w.position);
      const distanceKm = routeStats.distance / 1000; // Convert meters to km for database
      
      const track_points = coords.map((coord, index) => ({
        order_index: index,
        longitude: coord[0],
        latitude: coord[1],
        elevation: elevationProfile[index]?.elevation || null,
        cumulative_distance: elevationProfile[index]?.distance || 0,
      }));

      const routeData = {
        user_id: user.id,
        name: routeName,
        description: routeDescription,
        track_points,
        waypoints: waypoints,
        routing_profile: routingProfile,
        auto_routed: autoRoute,
        snapped: !!snappedRoute,
        confidence: routeStats.confidence,
        distance_km: distanceKm,
        duration_seconds: Math.round(routeStats.duration || 0),
        elevation_gain_m: elevationStats?.gain || 0,
        elevation_loss_m: elevationStats?.loss || 0,
        elevation_min_m: elevationStats?.min || null,
        elevation_max_m: elevationStats?.max || null,
      };
      
      const { data, error } = await supabase.from('user_routes').insert([routeData]).select();

      if (error) throw error;

      // Store the saved route for sharing
      if (data && data[0]) {
        setLastSavedRoute(data[0]);
      }

      toast.success(`Route "${routeName}" saved successfully!`);

      // Refresh saved routes
      fetchSavedRoutes();

      // Clear form
      setRouteName('');
      setRouteDescription('');

      // Don't clear the route - keep it visible after saving
      // Don't call parent callback to prevent redirect
      
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save route');
      toast.error(err.message || 'Failed to save route');
    } finally {
      setSaving(false);
    }
  }, [routeName, routeDescription, waypoints, snappedRoute, routeStats, elevationProfile, elevationStats, routingProfile, autoRoute, user.id, fetchSavedRoutes]);

  // === Share Route (removed - now using ShareRouteDialog) ===
  // Old implementation removed to prevent conflicts

  // === Expose methods to parent ===
  useImperativeHandle(ref, () => ({
    addPoint: addWaypoint,
    clearAll: clearRoute,
    saveRoute,
  }), [addWaypoint, clearRoute, saveRoute]);
  
  // === Elevation Chart Interaction ===
  const handleElevationHover = useCallback((point) => {
    setElevationHoverPoint(point);
  }, []);

  const handleElevationLeave = useCallback(() => {
    setElevationHoverPoint(null);
  }, []);

  // === Get User's Current Location ===
  const getUserLocation = useCallback(() => {
    console.log('🌍 Starting geolocation request...');
    console.log('🔒 Current location protocol:', window.location.protocol);
    console.log('🌐 Current hostname:', window.location.hostname);
    setLocationLoading(true);
    
    if (!navigator.geolocation) {
      console.log('❌ Geolocation not supported by browser');
      setLocationLoading(false);
      return;
    }

    // Check for secure context (required for geolocation)
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      console.log('❌ Geolocation requires HTTPS or localhost');
      setLocationLoading(false);
      return;
    }

    console.log('📍 Requesting current position...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log('✅ Got user location:', { latitude, longitude, accuracy });
        setUserLocation({
          longitude,
          latitude,
          zoom: 13,
        });
        setLocationLoading(false);
      },
      (error) => {
        console.log('❌ Geolocation error:', {
          code: error.code,
          message: error.message
        });
        console.log('Error codes: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT');
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: false, // Don't need high accuracy for initial map view
        timeout: 10000, // 10 second timeout
        maximumAge: 300000 // Use cached location up to 5 minutes old
      }
    );
  }, []);

  // === Get user location on component mount ===
  useEffect(() => {
    getUserLocation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // === Update map view when we get user location ===
  useEffect(() => {
    if (userLocation && mapRef?.current) {
      console.log('🗺️ Flying to user location:', userLocation);
      try {
        mapRef.current.flyTo({
          center: [userLocation.longitude, userLocation.latitude],
          zoom: userLocation.zoom,
          duration: 2000 // 2 second animation
        });
      } catch (error) {
        console.log('❌ Error flying to location:', error);
        // Fallback: try setting the view directly
        try {
          mapRef.current.setCenter([userLocation.longitude, userLocation.latitude]);
          mapRef.current.setZoom(userLocation.zoom);
        } catch (fallbackError) {
          console.log('❌ Fallback also failed:', fallbackError);
        }
      }
    }
  }, [userLocation, mapRef]);

  // === Format helpers ===
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  // === Build route line for map ===
  const routeLine = useMemo(() => {
    const coords = snappedRoute?.coordinates || (waypoints.length > 1 ? waypoints.map(w => w.position) : null);
    return coords ? buildLineString(coords) : null;
  }, [snappedRoute, waypoints]);

  // === Create grade-colored route segments ===
  const gradeColoredRoute = useMemo(() => {
    if (colorRouteBy !== 'grade' || !elevationProfile || elevationProfile.length < 2) {
      return null;
    }

    // Smooth elevation data to reduce noise
    const smoothedElevations = [];
    const windowSize = Math.min(5, Math.floor(elevationProfile.length / 10)); // Adaptive window size
    
    for (let i = 0; i < elevationProfile.length; i++) {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(elevationProfile.length - 1, i + windowSize);
      let sum = 0;
      let count = 0;
      
      for (let j = start; j <= end; j++) {
        sum += elevationProfile[j].elevation;
        count++;
      }
      
      smoothedElevations.push({
        ...elevationProfile[i],
        elevation: sum / count,
        originalElevation: elevationProfile[i].elevation
      });
    }

    const segments = [];
    let debugInfo = { extremeGrades: 0, totalSegments: 0, avgDistance: 0 };
    
    for (let i = 0; i < smoothedElevations.length - 1; i++) {
      const current = smoothedElevations[i];
      const next = smoothedElevations[i + 1];
      
      // Calculate grade between consecutive points
      const elevationDiff = next.elevation - current.elevation; // in meters
      const distanceDiff = (next.distance - current.distance) * (useImperial ? 1609.34 : 1000); // convert to meters
      
      debugInfo.totalSegments++;
      debugInfo.avgDistance += distanceDiff;
      
      let grade = 0;
      if (distanceDiff > 5) { // Only calculate grade if distance is meaningful (>5 meters)
        grade = (elevationDiff / distanceDiff) * 100; // percentage
        
        // More aggressive smoothing for very small elevation changes
        if (Math.abs(elevationDiff) < 1.5) { // Less than 1.5m elevation change
          grade = grade * 0.3; // Reduce grade significantly
        }
        
        grade = Math.max(-25, Math.min(25, grade)); // Cap at reasonable values
        
        if (Math.abs(grade) > 15) {
          debugInfo.extremeGrades++;
        }
      }
      
      // Granular color thresholds: 0,1,2,3,4,5,6,7-9,10-13,14+
      let color;
      const absGrade = Math.abs(grade);

      if (absGrade < 0.5) { // 0%: Flat
        color = '#4a7c7e'; // Teal
      } else if (absGrade < 1.5) { // 1%
        color = grade > 0 ? '#5c9961' : '#7ab8d4'; // Light green / Light blue
      } else if (absGrade < 2.5) { // 2%
        color = grade > 0 ? '#6db35c' : '#6aa8c9'; // Green / Medium blue
      } else if (absGrade < 3.5) { // 3%
        color = grade > 0 ? '#7fc954' : '#5a98be'; // Bright green / Blue
      } else if (absGrade < 4.5) { // 4%
        color = grade > 0 ? '#9fd147' : '#4a88b3'; // Yellow-green / Deep blue
      } else if (absGrade < 5.5) { // 5%
        color = grade > 0 ? '#c4d938' : '#3a78a8'; // Yellow / Deeper blue
      } else if (absGrade < 6.5) { // 6%
        color = grade > 0 ? '#e8c82a' : '#2a689d'; // Golden yellow / Dark blue
      } else if (absGrade < 9.5) { // 7-9%
        color = grade > 0 ? '#f5a623' : '#1a5892'; // Orange / Very dark blue
      } else if (absGrade < 13.5) { // 10-13%
        color = grade > 0 ? '#f57c2b' : '#0a4887'; // Deep orange / Navy
      } else { // 14%+
        color = grade > 0 ? '#e74c3c' : '#003f7c'; // Red / Dark navy
      }
      
      segments.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [current.coordinate, next.coordinate]
        },
        properties: {
          grade: Math.round(grade * 10) / 10,
          color: color,
          direction: grade > 0 ? 'uphill' : grade < 0 ? 'downhill' : 'flat',
          elevationDiff: Math.round(elevationDiff * 10) / 10,
          distanceDiff: Math.round(distanceDiff)
        }
      });
    }
    
    debugInfo.avgDistance = debugInfo.avgDistance / debugInfo.totalSegments;
    if (debugInfo.extremeGrades > 0) {
      console.log('Grade calculation debug:', debugInfo); // Only log if there are issues
    }
    
    return {
      type: 'FeatureCollection',
      features: segments
    };
  }, [colorRouteBy, elevationProfile, useImperial]);

  // === Create surface-colored route segments ===
  const surfaceColoredRoute = useMemo(() => {
    if (colorRouteBy !== 'surface' || !surfaceData || !routeLine) {
      return null;
    }

    const coordinates = routeLine.geometry.coordinates;
    const segments = [];

    // surfaceData contains one entry per coordinate segment
    // Each entry has { surface, color, startIdx, endIdx }
    for (const data of surfaceData) {
      const startIdx = data.startIdx;
      const endIdx = data.endIdx;

      if (startIdx < coordinates.length && endIdx < coordinates.length) {
        const segment = {
          type: 'Feature',
          properties: {
            surfaceType: data.surface,
            color: data.color
          },
          geometry: {
            type: 'LineString',
            coordinates: [coordinates[startIdx], coordinates[endIdx]]
          }
        };
        segments.push(segment);
      }
    }

    console.log('🎨 Surface colored route segments:', segments.length);

    return {
      type: 'FeatureCollection',
      features: segments
    };
  }, [colorRouteBy, surfaceData, routeLine]);

  // === Fetch surface data when surface coloring is enabled ===
  useEffect(() => {
    if (colorRouteBy === 'surface' && routeLine && !surfaceData && !loadingSurfaceData) {
      const fetchSurface = async () => {
        setLoadingSurfaceData(true);
        try {
          const coordinates = routeLine.geometry.coordinates;
          console.log('🗺️ Fetching surface data for route...');

          const data = await fetchRouteSurfaceData(coordinates, {
            bufferMeters: 10,
            maxSegments: 100
          });

          // Apply smoothing to reduce noise
          const smoothed = smoothSurfaceTransitions(data);
          setSurfaceData(smoothed);

          console.log('✅ Surface data loaded');
        } catch (error) {
          console.error('❌ Error fetching surface data:', error);
          toast.error('Failed to load surface data');
        } finally {
          setLoadingSurfaceData(false);
        }
      };

      fetchSurface();
    }

    // Clear surface data when switching away from surface mode
    if (colorRouteBy !== 'surface' && surfaceData) {
      setSurfaceData(null);
    }
  }, [colorRouteBy, routeLine, surfaceData, loadingSurfaceData]);

  // Map style is handled reactively by the Map component's mapStyle prop
  // No need for manual setStyle calls

  // === Fetch cycling data when overlay is enabled ===
  useEffect(() => {
    if (showCyclingOverlay && mapRef?.current) {
      const map = mapRef.current.getMap();
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      if (bounds) {
        fetchCyclingData({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        }, zoom);
      }
    } else if (!showCyclingOverlay) {
      setCyclingData(null);
    }
  }, [showCyclingOverlay, fetchCyclingData]);
  
  // === Inline mode - return just map elements ===
  if (inline) {
    return (
      <>
        {/* Grid overlay */}
        {showGrid && (
          <Source
            type="geojson"
            data={{
              type: 'FeatureCollection',
              features: []
            }}
          >
            <Layer
              id="grid-layer"
              type="line"
              paint={{
                'line-color': '#000000',
                'line-width': 0.5,
                'line-opacity': 0.1,
              }}
            />
          </Source>
        )}
        
        {/* Route line */}
        {routeLine && colorRouteBy === 'none' && (
          <Source type="geojson" data={routeLine}>
            {/* Route outline for better visibility */}
            <Layer
              id="route-builder-line-outline"
              type="line"
              paint={{
                'line-color': 'rgba(0, 0, 0, 0.6)',
                'line-width': snappedRoute ? 7 : 5,
                'line-opacity': 0.8,
              }}
            />
            <Layer
              id="route-builder-line"
              type="line"
              paint={{
                'line-color': snappedRoute ? '#4a7c7e' : 'rgba(255, 255, 255, 0.5)',
                'line-width': snappedRoute ? 5 : 3,
                'line-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {/* Grade-colored route segments */}
        {gradeColoredRoute && colorRouteBy === 'grade' && (
          <Source type="geojson" data={gradeColoredRoute}>
            {/* Outline for visibility */}
            <Layer
              id="route-grade-outline-inline"
              type="line"
              paint={{
                'line-color': 'rgba(0, 0, 0, 0.6)',
                'line-width': 8,
                'line-opacity': 0.8,
              }}
            />
            {/* Grade-colored segments */}
            <Layer
              id="route-grade-segments-inline"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 6,
                'line-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {/* Surface-colored route segments */}
        {surfaceColoredRoute && colorRouteBy === 'surface' && (
          <Source type="geojson" data={surfaceColoredRoute}>
            {/* Outline for visibility */}
            <Layer
              id="route-surface-outline-inline"
              type="line"
              paint={{
                'line-color': 'rgba(0, 0, 0, 0.6)',
                'line-width': 8,
                'line-opacity': 0.8,
              }}
            />
            {/* Surface-colored segments */}
            <Layer
              id="route-surface-segments-inline"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 6,
                'line-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {/* Cycling Infrastructure Overlay - Rendered AFTER routes so it appears on top */}
        {showCyclingOverlay && cyclingData && (
          <Source
            id="cycling-data-inline"
            type="geojson"
            data={cyclingData}
          >
            {/* Black border layer for contrast */}
            <Layer
              id="cycling-border-inline"
              type="line"
              paint={{
                'line-color': '#000000',
                'line-width': 4,
                'line-opacity': 0.6,
                'line-dasharray': [3, 2]
              }}
            />
            {/* Colored cycling lanes on top */}
            <Layer
              id="cycling-lanes-inline"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['==', ['get', 'highway'], 'cycleway'], '#ff6b35',
                  ['==', ['get', 'bicycle'], 'designated'], '#4a7c7e',
                  '#6b5b95'
                ],
                'line-width': 3,
                'line-opacity': 1.0,
                'line-dasharray': [3, 2]
              }}
            />
          </Source>
        )}

        {/* Elevation hover marker for inline mode */}
        {elevationHoverPoint && elevationHoverPoint.coordinate && (
          <Marker
            longitude={elevationHoverPoint.coordinate[0]}
            latitude={elevationHoverPoint.coordinate[1]}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#ff4444',
                border: '3px solid white',
                boxShadow: '0 2px 8px rgba(255, 68, 68, 0.4)',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
              }}
            />
          </Marker>
        )}

        {/* Waypoint markers */}
        {waypoints.map((waypoint, index) => (
          <Marker
            key={waypoint.id}
            longitude={waypoint.position[0]}
            latitude={waypoint.position[1]}
            draggable={true}
            onDragStart={() => {
              setDraggingWaypoint(waypoint.id);
            }}
            onDrag={(e) => {
              // Update waypoint position during drag for smooth visual feedback
              const updatedWaypoints = [...waypoints];
              updatedWaypoints[index] = {
                ...waypoint,
                position: [e.lngLat.lng, e.lngLat.lat]
              };
              setWaypoints(updatedWaypoints);
            }}
            onDragEnd={(e) => {
              const updatedWaypoints = [...waypoints];
              updatedWaypoints[index] = {
                ...waypoint,
                position: [e.lngLat.lng, e.lngLat.lat]
              };
              setWaypoints(updatedWaypoints);
              setSnappedRoute(null); // Clear snapped route on edit
              setDraggingWaypoint(null);
            }}
          >
            <div
              style={{
                // Touch-friendly size on mobile (44x44px), smaller on desktop
                width: isMobile ? 44 : 28,
                height: isMobile ? 44 : 28,
                borderRadius: '50%',
                background: waypoint.type === 'start' ? '#4a7c7e' :
                            waypoint.type === 'end' ? '#ff6b35' : '#6b5b95',
                border: selectedWaypoint === waypoint.id ? '3px solid #ff6b35' : '3px solid rgba(255, 255, 255, 0.8)',
                cursor: 'move',
                boxShadow: hoveredWaypoint === waypoint.id ?
                  '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: hoveredWaypoint === waypoint.id ? 'scale(1.15)' : 'scale(1)',
                transition: 'all 0.2s ease',
              }}
              onClick={() => setSelectedWaypoint(waypoint.id)}
              onMouseEnter={() => setHoveredWaypoint(waypoint.id)}
              onMouseLeave={() => setHoveredWaypoint(null)}
              onTouchStart={() => setHoveredWaypoint(waypoint.id)}
              onTouchEnd={() => setHoveredWaypoint(null)}
            >
              {waypoint.type === 'start' && <Flag size={isMobile ? 20 : 14} color="white" />}
              {waypoint.type === 'end' && <Target size={isMobile ? 20 : 14} color="white" />}
              {waypoint.type === 'waypoint' && (
                <div style={{ width: isMobile ? 12 : 8, height: isMobile ? 12 : 8, borderRadius: '50%', background: 'white' }} />
              )}
            </div>
          </Marker>
        ))}
      </>
    );
  }
  
  // === Full interface for standalone mode ===
  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.7; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }
        `}
      </style>
      <div style={{ 
        display: 'flex', 
        height: '100vh', 
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        background: '#3d4e5e',
        zIndex: 1000
      }}>
      {/* Keyboard shortcuts help */}
      <HoverCard width={320} shadow="md" position="bottom-start">
        <HoverCard.Target>
          <Badge 
            variant="light" 
            size="sm" 
            style={{ 
              position: 'absolute', 
              top: 10, 
              right: 10, 
              zIndex: 20, 
              cursor: 'help' 
            }}
          >
            Keyboard Shortcuts
          </Badge>
        </HoverCard.Target>
        <HoverCard.Dropdown>
          <Text size="sm" fw={500} mb="xs">Keyboard Shortcuts</Text>
          <Stack gap={4}>
            <Group justify="space-between">
              <Text size="xs">Undo/Redo</Text>
              <Group gap={4}>
                <Kbd size="xs">Ctrl</Kbd>+<Kbd size="xs">Z</Kbd>/<Kbd size="xs">Y</Kbd>
              </Group>
            </Group>
            <Group justify="space-between">
              <Text size="xs">Save Route</Text>
              <Group gap={4}>
                <Kbd size="xs">Ctrl</Kbd>+<Kbd size="xs">S</Kbd>
              </Group>
            </Group>
            <Group justify="space-between">
              <Text size="xs">Export GPX</Text>
              <Group gap={4}>
                <Kbd size="xs">Ctrl</Kbd>+<Kbd size="xs">E</Kbd>
              </Group>
            </Group>
            <Group justify="space-between">
              <Text size="xs">Snap to Roads</Text>
              <Group gap={4}>
                <Kbd size="xs">Ctrl</Kbd>+<Kbd size="xs">R</Kbd>
              </Group>
            </Group>
            <Group justify="space-between">
              <Text size="xs">Toggle Mode</Text>
              <Kbd size="xs">Space</Kbd>
            </Group>
            <Group justify="space-between">
              <Text size="xs">Delete Waypoint</Text>
              <Kbd size="xs">Del</Kbd>
            </Group>
          </Stack>
        </HoverCard.Dropdown>
      </HoverCard>
      
      {/* Left Sidebar - Desktop/Tablet Only */}
      {!isMobile && (
        <Transition mounted={!sidebarCollapsed} transition="slide-right" duration={300}>
          {(styles) => (
            <Paper
              shadow="sm"
              style={{
                ...styles,
                width: isTablet ? 320 : 400,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 0,
                zIndex: 10,
              }}
            >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #475569' }}>
              <Group justify="space-between" mb="md">
                <Group>
                  <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                    <Route size={20} />
                  </ThemeIcon>
                  <div>
                    <Text size="lg" fw={600}>Professional Route Builder</Text>
                    <Text size="xs" c="#D5E1EE">Design your perfect ride</Text>
                  </div>
                </Group>
                <Group gap="xs">
                  {onExit && (
                    <Tooltip label="Exit">
                      <ActionIcon onClick={onExit} variant="subtle">
                        <X size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label="Collapse sidebar">
                    <ActionIcon onClick={() => setSidebarCollapsed(true)} variant="subtle">
                      <ChevronDown size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              {/* Helper Text */}
              <Text size="xs" c="#D5E1EE" ta="center" mt="xs" px="sm">
                Click map to add waypoints • Click route to insert • Drag to move
              </Text>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="route" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Tabs.List>
                <Tabs.Tab value="route" leftSection={<Route size={14} />}>Route</Tabs.Tab>
                <Tabs.Tab value="saved" leftSection={<Save size={14} />}>Saved</Tabs.Tab>
                <Tabs.Tab value="settings" leftSection={<Settings size={14} />}>Settings</Tabs.Tab>
              </Tabs.List>
              
              {/* Route Tab */}
              <Tabs.Panel value="route" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ScrollArea style={{ flex: 1 }} p="md">
                  <Stack gap="md">
                    {/* Natural Language Route Generation */}
                    <Card withBorder style={{ backgroundColor: '#2d3748' }}>
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <ThemeIcon size="sm" variant="light" color="violet">
                              <Info size={14} />
                            </ThemeIcon>
                            <Text fw={500} size="sm">AI Route Assistant</Text>
                          </Group>
                          <Badge size="xs" variant="light" color="violet">Beta</Badge>
                        </Group>
                        <TextInput
                          placeholder="Describe your route in plain English (e.g., 'gravel route from Boulder to Lyons avoiding highways')"
                          leftSection={<Route size={16} />}
                          value={naturalLanguageInput}
                          onChange={(e) => setNaturalLanguageInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !processingNL) {
                              handleNaturalLanguageRoute();
                            }
                          }}
                          rightSection={
                            processingNL ? (
                              <Loader size="xs" />
                            ) : (
                              <ActionIcon
                                variant="filled"
                                color="violet"
                                size="sm"
                                onClick={handleNaturalLanguageRoute}
                                disabled={!naturalLanguageInput.trim()}
                              >
                                <Navigation2 size={14} />
                              </ActionIcon>
                            )
                          }
                          size="sm"
                          disabled={processingNL}
                        />
                        <Text size="xs" c="#D5E1EE">
                          Try: "50km loop from here with gravel roads" or "paved route to Longmont via quiet roads"
                        </Text>
                      </Stack>
                    </Card>

                    {/* Route Details */}
                    <Card withBorder>
                      <Stack gap="sm">
                        <TextInput
                          placeholder="Route name"
                          value={routeName}
                          onChange={(e) => setRouteName(e.target.value)}
                          leftSection={<Route size={16} />}
                          error={!routeName && waypoints.length > 0 ? 'Name required' : null}
                        />
                        <TextInput
                          placeholder="Description (optional)"
                          value={routeDescription}
                          onChange={(e) => setRouteDescription(e.target.value)}
                          leftSection={<Info size={16} />}
                        />
                      </Stack>
                    </Card>

                    {/* Route Stats */}
                    {waypoints.length > 0 && (
                      <Card withBorder>
                        <Group justify="space-between" mb="sm">
                          <Text fw={500} size="sm">Route Statistics</Text>
                          <Group gap="xs">
                            <Badge size="sm" variant="light" color={
                              routingProfile === 'road' ? 'blue' :
                              routingProfile === 'gravel' ? 'brown' :
                              routingProfile === 'mountain' ? 'grape' : 'cyan'
                            }>
                              {routingProfile === 'road' && <Bike size={12} />}
                              {routingProfile === 'gravel' && '🌾'}
                              {routingProfile === 'mountain' && '⛰️'}
                              {routingProfile === 'commuting' && '🚲'}
                            </Badge>
                            {snappedRoute && (
                              <Badge size="sm" variant="light" color="green">
                                Snapped ✓
                              </Badge>
                            )}
                          </Group>
                        </Group>
                        
                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Group gap="xs">
                              <Route size={14} />
                              <Text size="sm">Distance</Text>
                            </Group>
                            <Text size="sm" fw={600}>{formatDistance(routeStats.distance / 1000)}</Text>
                          </Group>
                          
                          <Group justify="space-between">
                            <Group gap="xs">
                              <Clock size={14} />
                              <Text size="sm">Duration</Text>
                            </Group>
                            <Text size="sm" fw={600}>{formatDuration(routeStats.duration)}</Text>
                          </Group>
                          
                          {elevationStats && (
                            <>
                              <Group justify="space-between">
                                <Group gap="xs">
                                  <Mountain size={14} />
                                  <Text size="sm">Elevation</Text>
                                </Group>
                                <Text size="sm" fw={600}>
                                  +{formatElevation(routeStats.elevationGain)} / -{formatElevation(routeStats.elevationLoss)}
                                </Text>
                              </Group>
                              
                              <Group justify="space-between">
                                <Group gap="xs">
                                  <ArrowUpDown size={14} />
                                  <Text size="sm">Grade</Text>
                                </Group>
                                <Text size="sm" fw={600}>
                                  avg {routeStats.avgGrade.toFixed(1)}% / max {routeStats.maxGrade.toFixed(1)}%
                                </Text>
                              </Group>
                            </>
                          )}
                          
                          {routeStats.confidence > 0 && (
                            <Group justify="space-between">
                              <Text size="sm">Confidence</Text>
                              <RingProgress
                                size={40}
                                thickness={4}
                                sections={[{ value: routeStats.confidence * 100, color: 'blue' }]}
                                label={
                                  <Text size="xs" ta="center">
                                    {Math.round(routeStats.confidence * 100)}%
                                  </Text>
                                }
                              />
                            </Group>
                          )}
                        </Stack>
                        
                        {elevationProfile.length > 0 && (
                          <Button
                            variant="light"
                            size="xs"
                            leftSection={<BarChart3 size={12} />}
                            onClick={() => console.log('Elevation profile is now shown inline below!')}
                            mt="xs"
                            fullWidth
                          >
                            View Elevation Profile
                          </Button>
                        )}
                      </Card>
                    )}

                    {/* Waypoints */}
                    {waypoints.length > 0 && (
                      <Card withBorder>
                        <Group justify="space-between" mb="sm">
                          <Text fw={500} size="sm">Waypoints ({waypoints.length})</Text>
                          <Group gap="xs">
                            <Tooltip label="Reverse route">
                              <ActionIcon size="sm" variant="subtle" onClick={reverseRoute}>
                                <ArrowUpDown size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Clear all">
                              <ActionIcon size="sm" variant="subtle" color="red" onClick={clearRoute}>
                                <Trash2 size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Group>
                        
                        <Timeline active={waypoints.length - 1} bulletSize={24} lineWidth={2}>
                          {waypoints.map((wp) => (
                            <Timeline.Item
                              key={wp.id}
                              bullet={
                                wp.type === 'start' ? 
                                  <ThemeIcon size={20} color="green" radius="xl">
                                    <Flag size={12} />
                                  </ThemeIcon> :
                                wp.type === 'end' ? 
                                  <ThemeIcon size={20} color="red" radius="xl">
                                    <Target size={12} />
                                  </ThemeIcon> :
                                  <ThemeIcon size={20} color="blue" radius="xl">
                                    <MapPin size={12} />
                                  </ThemeIcon>
                              }
                              title={
                                <Group justify="space-between">
                                  <Text size="sm" fw={selectedWaypoint === wp.id ? 600 : 400}>
                                    {wp.name}
                                  </Text>
                                  <ActionIcon 
                                    size="xs" 
                                    variant="subtle" 
                                    color="red"
                                    onClick={() => removeWaypoint(wp.id)}
                                  >
                                    <X size={12} />
                                  </ActionIcon>
                                </Group>
                              }
                            >
                              <Text size="xs" c="dimmed">
                                {wp.position[1].toFixed(5)}, {wp.position[0].toFixed(5)}
                              </Text>
                            </Timeline.Item>
                          ))}
                        </Timeline>
                      </Card>
                    )}

                    {/* Error Display */}
                    {error && (
                      <Alert color="red" icon={<AlertCircle size={16} />}>
                        {error}
                      </Alert>
                    )}

                    {/* Snapping Progress */}
                    {snapping && (
                      <Card withBorder>
                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Text size="sm">Snapping to roads...</Text>
                            <Text size="xs" c="dimmed">{Math.round(snapProgress * 100)}%</Text>
                          </Group>
                          <Progress value={snapProgress * 100} size="sm" animated />
                        </Stack>
                      </Card>
                    )}
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>
              
              {/* Saved Tab */}
              <Tabs.Panel value="saved" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ScrollArea style={{ flex: 1 }} p="md">
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text fw={500}>Saved Routes</Text>
                      <ActionIcon 
                        size="sm" 
                        variant="subtle" 
                        onClick={fetchSavedRoutes} 
                        loading={loadingSavedRoutes}
                      >
                        <RefreshCw size={16} />
                      </ActionIcon>
                    </Group>
                    
                    {savedRoutes.length === 0 ? (
                      <Text size="sm" c="#D5E1EE" ta="center" py="xl">
                        No saved routes yet
                      </Text>
                    ) : (
                      <Stack gap="xs">
                        {savedRoutes.map(route => (
                          <UnstyledButton
                            key={route.id}
                            onClick={() => loadSavedRoute(route.id)}
                            style={{
                              padding: '12px',
                              borderRadius: '8px',
                              border: '1px solid #e9ecef',
                              transition: 'all 0.2s',
                              '&:hover': { background: '#f8f9fa' }
                            }}
                          >
                            <Group justify="space-between">
                              <div>
                                <Text size="sm" fw={500}>{route.name}</Text>
                                <Group gap="xs" mt={4}>
                                  <Badge size="xs" variant="light">
                                    {formatDistance(route.distance)}
                                  </Badge>
                                  <Badge size="xs" variant="light" color="orange">
                                    +{Math.round(route.elevation)}m
                                  </Badge>
                                  <Badge size="xs" variant="light" color="violet">
                                    {formatDuration(route.duration)}
                                  </Badge>
                                  {route.snapped && (
                                    <Badge size="xs" variant="light" color="green">
                                      Snapped
                                    </Badge>
                                  )}
                                </Group>
                              </div>
                              <ActionIcon size="sm" variant="subtle">
                                <ExternalLink size={14} />
                              </ActionIcon>
                            </Group>
                          </UnstyledButton>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>
              
              {/* Settings Tab */}
              <Tabs.Panel value="settings" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ScrollArea style={{ flex: 1 }} p="md">
                  <Stack gap="md">
                    <Card withBorder>
                      <Text fw={500} size="sm" mb="sm">Routing Options</Text>
                      <Stack gap="xs">
                        <Select
                          label="Routing Profile"
                          value={routingProfile}
                          onChange={setRoutingProfile}
                          data={[
                            { value: 'road', label: '🚴 Road' },
                            { value: 'gravel', label: '🌾 Gravel' },
                            { value: 'mountain', label: '⛰️ Mountain (Coming Soon)', disabled: true },
                            { value: 'commuting', label: '🚲 Commuting (Coming Soon)', disabled: true },
                          ]}
                          size="sm"
                        />
                        
                        <Switch
                          label="Auto-route between points"
                          description="Automatically snap to roads"
                          checked={autoRoute}
                          onChange={(e) => setAutoRoute(e.currentTarget.checked)}
                          size="sm"
                        />

                        <Switch
                          label={smartRoutingConfig.label}
                          description={smartRoutingConfig.description}
                          checked={useSmartRouting}
                          onChange={(e) => setUseSmartRouting(e.currentTarget.checked)}
                          disabled={!['road', 'gravel', 'mountain', 'commuting'].includes(routingProfile)}
                          size="sm"
                        />
                      </Stack>
                    </Card>
                    
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>
            </Tabs>

            {/* Footer Actions */}
            <div style={{ padding: '16px', borderTop: '1px solid #475569' }}>
              <Stack gap="sm">
                <Group grow>
                  <Tooltip label="Snap to roads (Ctrl+R)">
                    <Button
                      variant="default"
                      leftSection={<Navigation2 size={16} />}
                      onClick={snapToRoads}
                      disabled={waypoints.length < 2 || snapping}
                      loading={snapping}
                      size="sm"
                      style={{ backgroundColor: '#2d3748', color: '#E8E8E8', borderColor: '#475569' }}
                    >
                      Snap
                    </Button>
                  </Tooltip>

                  <Button
                    variant="default"
                    leftSection={<Upload size={14} />}
                    size="sm"
                    onClick={() => setShowImportModal(true)}
                    style={{ backgroundColor: '#2d3748', color: '#E8E8E8', borderColor: '#475569' }}
                  >
                    Import
                  </Button>

                  <Button
                    variant="default"
                    leftSection={<Download size={14} />}
                    size="sm"
                    onClick={() => setShowExportModal(true)}
                    disabled={waypoints.length < 2}
                    style={{ backgroundColor: '#2d3748', color: '#E8E8E8', borderColor: '#475569' }}
                  >
                    Export
                  </Button>
                </Group>

                <Button
                  fullWidth
                  leftSection={<Save size={16} />}
                  onClick={saveRoute}
                  disabled={!routeName || waypoints.length < 2 || saving}
                  loading={saving}
                  variant="filled"
                  color="lime"
                  style={{ backgroundColor: '#32CD32', color: '#1a202c' }}
                >
                  Save Route
                </Button>
              </Stack>
            </div>
          </Paper>
        )}
      </Transition>
      )}

      {/* Collapsed Sidebar Toggle - Desktop/Tablet Only */}
      {!isMobile && sidebarCollapsed && (
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10 }}>
          <Button
            leftSection={<ChevronUp size={16} style={{ transform: 'rotate(-90deg)' }} />}
            onClick={() => setSidebarCollapsed(false)}
            variant="filled"
            size="sm"
          >
            Show Panel
          </Button>
        </div>
      )}

      {/* Map Container (for standalone mode) */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          key={`map-${mapStyle}`}
          ref={mapRef}
          mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
          initialViewState={userLocation || {
            longitude: -104.9903,
            latitude: 39.7392,
            zoom: 13,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyles.find(s => s.value === mapStyle)?.url || 'mapbox://styles/mapbox/streets-v12'}
          interactiveLayerIds={['route-builder-line', 'route-grade-segments']}
          onClick={(e) => {
            // Check if clicking on route line (to insert waypoint)
            const features = e.features;
            if (features && features.length > 0) {
              // Clicked on route - insert waypoint at this location
              insertWaypointOnRoute(e.lngLat);
            } else if (!e.originalEvent.defaultPrevented) {
              // Clicked on empty map - add new waypoint at end
              addWaypoint(e.lngLat);
            }
          }}
          onMoveEnd={(e) => {
            if (showCyclingOverlay) {
              const bounds = e.target.getBounds();
              const zoom = e.target.getZoom();
              debouncedFetchCyclingData({
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest()
              }, zoom);
            }
          }}
          cursor="crosshair"
        >
          {/* Map Controls */}
          <NavigationControl position="top-right" />
          <ScaleControl position="bottom-right" />
          <GeolocateControl position="top-right" />
          
          {/* Grid overlay */}
          {showGrid && (
            <Source
              type="geojson"
              data={{
                type: 'FeatureCollection',
                features: []
              }}
            >
              <Layer
                id="grid-layer"
                type="line"
                paint={{
                  'line-color': '#000000',
                  'line-width': 0.5,
                  'line-opacity': 0.1,
                }}
              />
            </Source>
          )}
          
          {/* Route line */}
          {routeLine && colorRouteBy === 'none' && (
            <Source type="geojson" data={routeLine}>
              {/* Route outline for better visibility */}
              <Layer
                id="route-builder-line-outline"
                type="line"
                paint={{
                  'line-color': 'rgba(0, 0, 0, 0.6)',
                  'line-width': snappedRoute ? 7 : 5,
                  'line-opacity': 0.8,
                }}
                />
              <Layer
                id="route-builder-line"
                type="line"
                paint={{
                  'line-color': snappedRoute ? '#4a7c7e' : 'rgba(255, 255, 255, 0.5)',
                  'line-width': snappedRoute ? 5 : 3,
                  'line-opacity': 0.9,
                }}
              />
            </Source>
          )}

          {/* Grade-colored route segments */}
          {gradeColoredRoute && colorRouteBy === 'grade' && (
            <Source type="geojson" data={gradeColoredRoute}>
              {/* Outline for visibility */}
              <Layer
                id="route-grade-outline"
                type="line"
                paint={{
                  'line-color': 'rgba(0, 0, 0, 0.6)',
                  'line-width': 8,
                  'line-opacity': 0.8,
                }}
              />
              {/* Grade-colored segments */}
              <Layer
                id="route-grade-segments"
                type="line"
                paint={{
                  'line-color': ['get', 'color'],
                  'line-width': 6,
                  'line-opacity': 0.9,
                }}
              />
            </Source>
          )}

          {/* Surface-colored route segments */}
          {surfaceColoredRoute && colorRouteBy === 'surface' && (
            <Source type="geojson" data={surfaceColoredRoute}>
              {/* Outline for visibility */}
              <Layer
                id="route-surface-outline"
                type="line"
                paint={{
                  'line-color': 'rgba(0, 0, 0, 0.6)',
                  'line-width': 8,
                  'line-opacity': 0.8,
                }}
              />
              {/* Surface-colored segments */}
              <Layer
                id="route-surface-segments"
                type="line"
                paint={{
                  'line-color': ['get', 'color'],
                  'line-width': 6,
                  'line-opacity': 0.9,
                }}
              />
            </Source>
          )}

          {/* Cycling Infrastructure Overlay - Rendered AFTER routes so it appears on top */}
          {showCyclingOverlay && cyclingData && (
            <Source
              id="cycling-data"
              type="geojson"
              data={cyclingData}
            >
              {/* Black border layer for contrast */}
              <Layer
                id="cycling-border"
                type="line"
                paint={{
                  'line-color': '#000000',
                  'line-width': 4,
                  'line-opacity': 0.6,
                  'line-dasharray': [3, 2]
                }}
              />
              {/* Colored cycling lanes on top */}
              <Layer
                id="cycling-lanes"
                type="line"
                paint={{
                  'line-color': [
                    'case',
                    ['==', ['get', 'highway'], 'cycleway'], '#ff6b35',
                    ['==', ['get', 'bicycle'], 'designated'], '#4a7c7e',
                    '#6b5b95'
                  ],
                  'line-width': 3,
                  'line-opacity': 1.0,
                  'line-dasharray': [3, 2]
                }}
              />
            </Source>
          )}

          {/* Elevation hover marker */}
          {elevationHoverPoint && elevationHoverPoint.coordinate && (
            <Marker
              longitude={elevationHoverPoint.coordinate[0]}
              latitude={elevationHoverPoint.coordinate[1]}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#ff4444',
                  border: '3px solid white',
                  boxShadow: '0 2px 8px rgba(255, 68, 68, 0.4)',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 1000,
                  animation: 'pulse 2s infinite'
                }}
              />
            </Marker>
          )}

          {/* Waypoint markers */}
          {waypoints.map((waypoint, index) => (
            <Marker
              key={waypoint.id}
              longitude={waypoint.position[0]}
              latitude={waypoint.position[1]}
              draggable={activeMode === 'edit'}
              onDragStart={() => {
                setDraggingWaypoint(waypoint.id);
              }}
              onDrag={(e) => {
                // Update waypoint position during drag for smooth visual feedback
                const updatedWaypoints = [...waypoints];
                updatedWaypoints[index] = {
                  ...waypoint,
                  position: [e.lngLat.lng, e.lngLat.lat]
                };
                setWaypoints(updatedWaypoints);
              }}
              onDragEnd={(e) => {
                const updatedWaypoints = [...waypoints];
                updatedWaypoints[index] = {
                  ...waypoint,
                  position: [e.lngLat.lng, e.lngLat.lat]
                };
                setWaypoints(updatedWaypoints);
                setSnappedRoute(null); // Clear snapped route on edit
                setDraggingWaypoint(null);
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: waypoint.type === 'start' ? '#4a7c7e' : 
                              waypoint.type === 'end' ? '#ff6b35' : '#6b5b95',
                  border: selectedWaypoint === waypoint.id ? '3px solid #ff6b35' : '3px solid rgba(255, 255, 255, 0.8)',
                  cursor: activeMode === 'edit' ? 'move' : 'pointer',
                  boxShadow: hoveredWaypoint === waypoint.id ? 
                    '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: hoveredWaypoint === waypoint.id ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => setSelectedWaypoint(waypoint.id)}
                onMouseEnter={() => setHoveredWaypoint(waypoint.id)}
                onMouseLeave={() => setHoveredWaypoint(null)}
              >
                {waypoint.type === 'start' && <Flag size={14} color="white" />}
                {waypoint.type === 'end' && <Target size={14} color="white" />}
                {waypoint.type === 'waypoint' && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
                )}
              </div>
            </Marker>
          ))}
        </Map>
        
        {/* Map Overlay Controls - Top Center */}
        <div
          style={{
            position: 'absolute',
            top: isMobile ? 10 : 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            maxWidth: isMobile ? '95vw' : 'auto',
          }}
        >
          <Paper
            shadow="sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: isMobile ? 4 : 8,
              padding: isMobile ? '6px' : '8px',
              backgroundColor: '#2d3748',
              borderRadius: '8px',
              flexWrap: isMobile ? 'wrap' : 'nowrap',
            }}
          >
            <Tooltip label="Undo - Undo last action (Ctrl+Z)" position="bottom" zIndex={9999}>
              <ActionIcon onClick={undo} disabled={historyIndex <= 0} variant="default">
                <Undo2 size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Redo - Redo last undone action (Ctrl+Y)" position="bottom" zIndex={9999}>
              <ActionIcon onClick={redo} disabled={historyIndex >= history.length - 1} variant="default">
                <Redo2 size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Divider orientation="vertical" />
            
            <Tooltip label="Clear Route - Remove all waypoints and clear the current route" position="bottom" zIndex={9999}>
              <ActionIcon onClick={clearRoute} disabled={waypoints.length === 0} variant="default">
                <Trash2 size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Snap to Roads - Connect waypoints using actual roads and paths for realistic routing" position="bottom" zIndex={9999}>
              <ActionIcon 
                onClick={snapToRoads} 
                disabled={waypoints.length < 2 || snapping} 
                variant="default"
                loading={snapping}
              >
                <Route size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Divider orientation="vertical" />
            
            <Tooltip label="Save route">
              <ActionIcon 
                onClick={saveRoute} 
                disabled={waypoints.length < 2 || !routeName} 
                variant="default"
              >
                <Save size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Export Route">
              <ActionIcon
                onClick={() => setShowExportModal(true)}
                disabled={waypoints.length < 2}
                variant="default"
              >
                <Download size={18} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Import Route">
              <ActionIcon
                onClick={() => setShowImportModal(true)}
                variant="default"
              >
                <Upload size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Divider orientation="vertical" />

            <Tooltip label="Elevation Grade Coloring - Color route by steepness (red for climbs, blue for descents)" position="bottom" zIndex={9999}>
              <ActionIcon
                onClick={() => setColorRouteBy(colorRouteBy === 'grade' ? 'none' : 'grade')}
                variant={colorRouteBy === 'grade' ? "filled" : "light"}
                color={colorRouteBy === 'grade' ? "green" : "gray"}
                disabled={!elevationProfile || elevationProfile.length < 2}
              >
                <Mountain size={18} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Surface Type Coloring - Color route by road surface (paved, gravel, unpaved)" position="bottom" zIndex={9999}>
              <ActionIcon
                onClick={() => setColorRouteBy(colorRouteBy === 'surface' ? 'none' : 'surface')}
                variant={colorRouteBy === 'surface' ? "filled" : "light"}
                color={colorRouteBy === 'surface' ? "blue" : "gray"}
                disabled={!elevationProfile || elevationProfile.length < 2}
                loading={loadingSurfaceData}
              >
                <Layers size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label={locationLoading ? "Getting your current location..." : "My Location - Center the map on your current location"} position="bottom" zIndex={9999}>
              <ActionIcon 
                onClick={getUserLocation}
                loading={locationLoading}
                variant={userLocation ? "filled" : "light"}
                color={userLocation ? "blue" : "gray"}
              >
                <MapPin size={18} />
              </ActionIcon>
            </Tooltip>
            
            <Divider orientation="vertical" />
            
            <Tooltip label={`${useImperial ? 'Imperial' : 'Metric'} Units - Switch to ${useImperial ? 'metric (km, m)' : 'imperial (mi, ft)'} measurements`} position="bottom" zIndex={9999}>
              <ActionIcon 
                onClick={() => setUseImperial(!useImperial)}
                variant={useImperial ? "filled" : "light"}
                color={useImperial ? "blue" : "gray"}
              >
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
                  {useImperial ? 'FT' : 'M'}
                </div>
              </ActionIcon>
            </Tooltip>
            
            {/* Display Options - Hide on mobile to simplify */}
            {!isMobile && (
              <>
                <Divider orientation="vertical" />

                <Tooltip label="Grid Overlay" position="bottom" zIndex={9999}>
                  <ActionIcon
                    onClick={() => setShowGrid(!showGrid)}
                    variant={showGrid ? "filled" : "light"}
                    color={showGrid ? "blue" : "gray"}
                    size="md"
                  >
                    <Grid3x3 size={18} />
                  </ActionIcon>
                </Tooltip>

                <Tooltip label="Cycling Infrastructure - Highlight dedicated bike lanes, paths, and cycling routes" position="bottom" zIndex={9999}>
                  <ActionIcon
                    onClick={() => setShowCyclingOverlay(!showCyclingOverlay)}
                    variant={showCyclingOverlay ? "filled" : "light"}
                    color={showCyclingOverlay ? "blue" : "gray"}
                    loading={loadingCyclingData}
                    disabled={loadingCyclingData}
                  >
                    <Bike size={18} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}

            {/* Basemap Selector - Always visible (moved outside !isMobile conditional) */}
            <Divider orientation="vertical" />

            <Menu position="bottom-end" zIndex={10000}>
              <Menu.Target>
                <ActionIcon variant="default">
                  <Layers size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Map Style</Menu.Label>
                {mapStyles.map(style => (
                  <Menu.Item
                    key={style.value}
                    onClick={() => setMapStyle(style.value)}
                    leftSection={mapStyle === style.value && <Check size={14} />}
                  >
                    {style.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            
            {/* Routing Profile Selector - Desktop/Tablet Only (on mobile it's in bottom sheet) */}
            {!isMobile && (
              <Select
                value={routingProfile}
                onChange={(value) => {
                  console.log('Profile changed to:', value);
                  setRoutingProfile(value);
                }}
                data={[
                  { value: 'road', label: '🚴 Road' },
                  { value: 'gravel', label: '🌾 Gravel' },
                  { value: 'mountain', label: '⛰️ Mountain (Coming Soon)', disabled: true },
                  { value: 'commuting', label: '🚲 Commuting (Coming Soon)', disabled: true },
                ]}
                size="sm"
                style={{ width: isTablet ? 150 : 180 }}
                placeholder="Select Profile"
                allowDeselect={false}
                comboboxProps={{ zIndex: 10000 }}
              />
            )}

            <Divider orientation="vertical" />

            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="default">
                  <Settings size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Quick Settings</Menu.Label>
                <Menu.Item
                  leftSection={<Target size={14} />}
                  onClick={() => setAutoRoute(!autoRoute)}
                  rightSection={autoRoute && <Check size={14} />}
                >
                  Auto-route
                </Menu.Item>
                <Menu.Item
                  leftSection={<Route size={14} />}
                  onClick={() => setUseSmartRouting(!useSmartRouting)}
                  rightSection={useSmartRouting && <Check size={14} />}
                  disabled={!['road', 'gravel', 'mountain', 'commuting'].includes(routingProfile)}
                >
                  Smart Routing
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Paper>
        </div>

        {/* Mobile Bottom Sheet */}
        {isMobile && (
          <Paper
            shadow="xl"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: mobileSheetExpanded ? '80vh' : '40vh',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              transition: 'height 0.3s ease',
            }}
          >
            {/* Drag Handle */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '12px',
                cursor: 'pointer',
                borderBottom: '1px solid #e9ecef',
              }}
              onClick={() => setMobileSheetExpanded(!mobileSheetExpanded)}
            >
              <div
                style={{
                  width: '40px',
                  height: '4px',
                  backgroundColor: '#dee2e6',
                  borderRadius: '2px',
                }}
              />
            </div>

            {/* Mobile Content */}
            <ScrollArea style={{ flex: 1 }} p="md">
              <Stack gap="md">
                {/* Routing Profile - Full Width */}
                <Select
                  value={routingProfile}
                  onChange={(value) => {
                    console.log('Profile changed to:', value);
                    setRoutingProfile(value);
                  }}
                  data={[
                    { value: 'road', label: '🚴 Road' },
                    { value: 'gravel', label: '🌾 Gravel' },
                    { value: 'mountain', label: '⛰️ Mountain (Coming Soon)', disabled: true },
                    { value: 'commuting', label: '🚲 Commuting (Coming Soon)', disabled: true },
                  ]}
                  size="md"
                  label="Routing Profile"
                  allowDeselect={false}
                />

                {/* Quick Actions */}
                <Group grow>
                  <Button
                    variant="light"
                    leftSection={<Undo2 size={16} />}
                    onClick={undo}
                    disabled={historyIndex <= 0}
                    size="md"
                  >
                    Undo
                  </Button>
                  <Button
                    variant="light"
                    leftSection={<Redo2 size={16} />}
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                    size="md"
                  >
                    Redo
                  </Button>
                </Group>

                {/* Route Info */}
                {waypoints.length > 0 && (
                  <Card withBorder>
                    <Group justify="space-between" mb="sm">
                      <Text fw={500} size="sm">Route Stats</Text>
                      <Badge size="sm" variant="light" color={
                        routingProfile === 'road' ? 'blue' :
                        routingProfile === 'gravel' ? 'brown' :
                        routingProfile === 'mountain' ? 'grape' : 'cyan'
                      }>
                        {routingProfile === 'road' && <Bike size={12} />}
                        {routingProfile === 'gravel' && '🌾'}
                        {routingProfile === 'mountain' && '⛰️'}
                        {routingProfile === 'commuting' && '🚲'}
                      </Badge>
                    </Group>

                    <Stack gap="xs">
                      <Group justify="apart">
                        <Text size="sm" c="dimmed">Distance</Text>
                        <Text size="sm" fw={500}>{formatDistance(routeStats.distance / 1000)}</Text>
                      </Group>
                      <Group justify="apart">
                        <Text size="sm" c="dimmed">Elevation Gain</Text>
                        <Text size="sm" fw={500}>{formatElevation(routeStats.elevationGain)}</Text>
                      </Group>
                      <Group justify="apart">
                        <Text size="sm" c="dimmed">Duration</Text>
                        <Text size="sm" fw={500}>
                          {Math.floor(routeStats.duration / 3600)}h {Math.floor((routeStats.duration % 3600) / 60)}m
                        </Text>
                      </Group>
                    </Stack>
                  </Card>
                )}

                {/* Save Button */}
                {waypoints.length > 0 && (
                  <>
                    <TextInput
                      label="Route Name"
                      placeholder="Enter route name..."
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                      size="md"
                    />
                    <Button
                      fullWidth
                      size="lg"
                      leftSection={<Save size={18} />}
                      onClick={saveRoute}
                      loading={saving}
                      disabled={!routeName.trim() || waypoints.length < 2}
                    >
                      Save Route
                    </Button>

                    {lastSavedRoute && (
                      <Button
                        fullWidth
                        size="md"
                        variant="light"
                        leftSection={<Share2 size={18} />}
                        onClick={() => setShareDialogOpen(true)}
                      >
                        Share Route
                      </Button>
                    )}
                  </>
                )}

                {/* Settings */}
                <Card withBorder>
                  <Text fw={500} size="sm" mb="sm">Settings</Text>
                  <Stack gap="md">
                    <Switch
                      label="Auto-route"
                      description="Automatically snap to roads"
                      checked={autoRoute}
                      onChange={(e) => setAutoRoute(e.currentTarget.checked)}
                      size="md"
                    />
                    <Switch
                      label={smartRoutingConfig.label}
                      description={smartRoutingConfig.description}
                      checked={useSmartRouting}
                      onChange={(e) => setUseSmartRouting(e.currentTarget.checked)}
                      disabled={!['road', 'gravel', 'mountain', 'commuting'].includes(routingProfile)}
                      size="md"
                    />
                  </Stack>
                </Card>
              </Stack>
            </ScrollArea>
          </Paper>
        )}

        {/* Floating Legends */}
        <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 5 }}>
          {/* Cycling Infrastructure Legend */}
          {showCyclingOverlay && (
            <Paper shadow="md" p="sm" style={{ marginBottom: '8px', maxWidth: '200px' }}>
              <Text size="xs" fw={600} mb="xs">Cycling Infrastructure</Text>
              <Stack gap={4}>
                <Group gap="xs" align="center">
                  <div style={{ 
                    width: '20px', 
                    height: '3px', 
                    backgroundColor: '#ff6b35',
                    borderRadius: '2px',
                    background: `repeating-linear-gradient(to right, #ff6b35 0px, #ff6b35 6px, transparent 6px, transparent 10px)`
                  }} />
                  <Text size="xs" c="dimmed">Dedicated Cycleways</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ 
                    width: '20px', 
                    height: '3px', 
                    backgroundColor: '#4a7c7e',
                    borderRadius: '2px',
                    background: `repeating-linear-gradient(to right, #4a7c7e 0px, #4a7c7e 6px, transparent 6px, transparent 10px)`
                  }} />
                  <Text size="xs" c="dimmed">Bicycle Designated</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ 
                    width: '20px', 
                    height: '3px', 
                    backgroundColor: '#6b5b95',
                    borderRadius: '2px',
                    background: `repeating-linear-gradient(to right, #6b5b95 0px, #6b5b95 6px, transparent 6px, transparent 10px)`
                  }} />
                  <Text size="xs" c="dimmed">Other Cycle Routes</Text>
                </Group>
              </Stack>
            </Paper>
          )}

          {/* Grade Color Legend */}
          {colorRouteBy === 'grade' && elevationProfile && elevationProfile.length > 1 && (
            <Paper shadow="md" p="sm" style={{ maxWidth: '220px' }}>
              <Text size="xs" fw={600} mb="xs">Grade % (uphill)</Text>
              <Stack gap={2}>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#4a7c7e', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">0% Flat</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#5c9961', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">1%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#6db35c', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">2%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#7fc954', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">3%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#9fd147', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">4%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#c4d938', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">5%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#e8c82a', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">6%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#f5a623', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">7-9%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#f57c2b', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">10-13%</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{ width: '20px', height: '3px', backgroundColor: '#e74c3c', borderRadius: '2px' }} />
                  <Text size="xs" c="dimmed">14%+</Text>
                </Group>
                <Text size="xs" c="#D5E1EE" mt="xs" style={{ fontStyle: 'italic' }}>
                  Downhills shown in blue shades
                </Text>
              </Stack>
            </Paper>
          )}

          {/* Surface Type Legend */}
          {colorRouteBy === 'surface' && surfaceData && (
            <Paper shadow="md" p="sm" style={{ maxWidth: '200px' }}>
              <Text size="xs" fw={600} mb="xs">Surface Type</Text>
              <Stack gap={2}>
                <Group gap="xs" align="center">
                  <div style={{
                    width: '20px',
                    height: '3px',
                    backgroundColor: SURFACE_COLORS.paved,
                    borderRadius: '2px'
                  }} />
                  <Text size="xs" c="dimmed">Paved</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{
                    width: '20px',
                    height: '3px',
                    backgroundColor: SURFACE_COLORS.gravel,
                    borderRadius: '2px'
                  }} />
                  <Text size="xs" c="dimmed">Gravel</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{
                    width: '20px',
                    height: '3px',
                    backgroundColor: SURFACE_COLORS.unpaved,
                    borderRadius: '2px'
                  }} />
                  <Text size="xs" c="dimmed">Unpaved</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{
                    width: '20px',
                    height: '3px',
                    backgroundColor: SURFACE_COLORS.mixed,
                    borderRadius: '2px'
                  }} />
                  <Text size="xs" c="dimmed">Mixed</Text>
                </Group>
                <Group gap="xs" align="center">
                  <div style={{
                    width: '20px',
                    height: '3px',
                    backgroundColor: SURFACE_COLORS.unknown,
                    borderRadius: '2px'
                  }} />
                  <Text size="xs" c="dimmed">Unknown</Text>
                </Group>
              </Stack>
            </Paper>
          )}
        </div>

        {/* Quick Tips - Top Left Corner */}
        {waypoints.length === 0 && !tipsCardDismissed && (
          <Card
            withBorder
            p="md"
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              zIndex: 10,
              maxWidth: '280px',
              backgroundColor: 'rgba(45, 55, 72, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #475569',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <Stack gap="xs">
              <Group justify="space-between" mb="xs">
                <Group gap="xs">
                  <ThemeIcon size="sm" variant="light" color="blue">
                    <MapPin size={14} />
                  </ThemeIcon>
                  <Text size="sm" fw={600}>Quick Tips</Text>
                </Group>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={dismissTipsCard}
                  aria-label="Dismiss tips"
                >
                  <X size={14} />
                </ActionIcon>
              </Group>

              <Stack gap={6}>
                <Group gap={6} align="flex-start">
                  <Text size="xs" c="#D5E1EE">🎯</Text>
                  <Text size="xs" c="#D5E1EE">
                    Use natural language: <Text span fw={500}>"20 mile gravel loop"</Text>
                  </Text>
                </Group>

                <Group gap={6} align="flex-start">
                  <Text size="xs" c="#D5E1EE">🖱️</Text>
                  <Text size="xs" c="#D5E1EE">
                    Click on map to add waypoints manually
                  </Text>
                </Group>

                <Group gap={6} align="flex-start">
                  <Text size="xs" c="#D5E1EE">⌨️</Text>
                  <Text size="xs" c="#D5E1EE">
                    <Kbd size="xs">Space</Kbd> = Toggle mode, <Kbd size="xs">Ctrl+R</Kbd> = Snap to roads
                  </Text>
                </Group>
              </Stack>
            </Stack>
          </Card>
        )}

        {/* Quick Stats with Elevation Chart */}
        {waypoints.length > 0 && (
          <Card
            withBorder
            style={{
              position: 'absolute',
              bottom: 20,
              left: sidebarCollapsed ? 20 : 420,
              right: 20,
              zIndex: 5,
              maxWidth: sidebarCollapsed ? 'calc(100vw - 40px)' : 'calc(100vw - 460px)',
              backgroundColor: 'rgba(45, 55, 72, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #475569',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <Stack gap="md">
              {/* Stats Row */}
              <Group justify="space-between">
                <Group gap="xl">
                  <div>
                    <Text size="xs" c="dimmed">Distance</Text>
                    <Text size="lg" fw={600}>{formatDistance(routeStats.distance / 1000)}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Duration</Text>
                    <Text size="lg" fw={600}>{formatDuration(routeStats.duration)}</Text>
                  </div>
                  {elevationStats && (
                    <>
                      <div>
                        <Text size="xs" c="dimmed">Elevation Gain</Text>
                        <Text size="lg" fw={600}>+{formatElevation(elevationStats.gain)}</Text>
                      </div>
                      <div>
                        <Text size="xs" c="dimmed">Max Elevation</Text>
                        <Text size="sm" fw={500}>{formatElevation(elevationStats.max)}</Text>
                      </div>
                    </>
                  )}
                </Group>
                
                {/* Chart Toggle Button */}
                {elevationProfile.length > 0 && (
                  <ActionIcon
                    variant={showElevationChart ? "filled" : "light"}
                    size="sm"
                    onClick={() => setShowElevationChart(!showElevationChart)}
                    title={showElevationChart ? "Hide elevation chart" : "Show elevation chart"}
                  >
                    <BarChart3 size={16} />
                  </ActionIcon>
                )}
              </Group>
              
              {/* Elevation Chart */}
              {elevationProfile.length > 0 && showElevationChart && (
                <div style={{ 
                  borderTop: '1px solid rgba(0, 0, 0, 0.1)', 
                  paddingTop: '12px',
                  backgroundColor: 'rgba(248, 249, 250, 0.7)',
                  borderRadius: '4px',
                  margin: '-8px',
                  padding: '12px'
                }}>
                  <Text size="xs" c="dimmed" mb="xs">Elevation Profile</Text>
                  <div style={{
                    height: 220,
                    width: '100%',
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'stretch'
                  }}>
                    <ElevationChart
                      data={elevationProfile}
                      width="100%"
                      height={200}
                      useImperial={useImperial}
                      elevationUnit={elevationUnit}
                      distanceUnit={distanceUnit}
                      onHover={handleElevationHover}
                      onLeave={handleElevationLeave}
                      hoveredPoint={elevationHoverPoint}
                    />
                  </div>
                </div>
              )}
              
              {elevationProfile.length === 0 && (
                <div style={{ borderTop: '1px solid #475569', paddingTop: '12px', textAlign: 'center' }}>
                  <Text size="xs" c="#D5E1EE">No elevation data yet - snap route to roads to get elevation</Text>
                </div>
              )}
            </Stack>
          </Card>
        )}
      </div>

      </div>

      {/* Share Route Dialog */}
      {lastSavedRoute && (
        <ShareRouteDialog
          opened={shareDialogOpen}
          onClose={() => setShareDialogOpen(false)}
          route={lastSavedRoute}
        />
      )}

      {/* Import Modal */}
      <Modal
        opened={showImportModal}
        onClose={() => setShowImportModal(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size="lg" variant="light" color="blue">
              <Upload size={20} />
            </ThemeIcon>
            <Text fw={600} size="lg">Import Route</Text>
          </Group>
        }
        size="lg"
        centered
        zIndex={10000}
      >
        <Stack gap="lg">
          {/* Upload GPX File */}
          <Paper p="md" withBorder style={{ cursor: 'pointer' }} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.gpx';
            input.onchange = (e) => {
              const file = e.target.files[0];
              if (file) {
                importGPX(file);
                setShowImportModal(false);
              }
            };
            input.click();
          }}>
            <Group>
              <ThemeIcon size="xl" variant="light" color="violet">
                <Upload size={24} />
              </ThemeIcon>
              <div>
                <Text fw={500}>Upload GPX File</Text>
                <Text size="sm" c="#D5E1EE">Import a route from your computer</Text>
              </div>
            </Group>
          </Paper>

          <Divider label="OR" labelPosition="center" />

          {/* Saved Routes */}
          <div>
            <Group justify="space-between" mb="sm">
              <Text fw={500} size="sm">Your Saved Routes</Text>
              <ActionIcon
                variant="subtle"
                onClick={fetchSavedRoutes}
                loading={false}
              >
                <RefreshCw size={16} />
              </ActionIcon>
            </Group>

            <ScrollArea h={300}>
              {savedRoutes.length === 0 ? (
                <Text size="sm" c="#D5E1EE" ta="center" py="xl">
                  No saved routes yet. Create and save your first route!
                </Text>
              ) : (
                <Stack gap="xs">
                  {savedRoutes.map(route => (
                    <Paper
                      key={route.id}
                      p="sm"
                      withBorder
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        loadSavedRoute(route.id);
                        setShowImportModal(false);
                      }}
                    >
                      <Group justify="space-between">
                        <div style={{ flex: 1 }}>
                          <Text fw={500} size="sm">{route.name}</Text>
                          <Group gap="xs" mt={4}>
                            <Badge size="xs" variant="light" color="blue">
                              {formatDistance(route.distance_km * 1000)}
                            </Badge>
                            {route.elevation_gain && (
                              <Badge size="xs" variant="light" color="orange">
                                +{formatElevation(route.elevation_gain)}
                              </Badge>
                            )}
                          </Group>
                        </div>
                        <ActionIcon variant="subtle" color="blue">
                          <ExternalLink size={16} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </ScrollArea>
          </div>
        </Stack>
      </Modal>

      {/* Export Modal */}
      <Modal
        opened={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size="lg" variant="light" color="green">
              <Download size={20} />
            </ThemeIcon>
            <Text fw={600} size="lg">Export Route</Text>
          </Group>
        }
        size="md"
        centered
        zIndex={10000}
      >
        <Stack gap="md">
          <Text size="sm" c="#D5E1EE">
            Choose how you'd like to export your route
          </Text>

          {/* Download GPX */}
          <Paper
            p="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={exportGPX}
          >
            <Group>
              <ThemeIcon size="xl" variant="light" color="blue">
                <Download size={24} />
              </ThemeIcon>
              <div>
                <Text fw={500}>Download GPX File</Text>
                <Text size="sm" c="#D5E1EE">Save to your computer for any GPS device</Text>
              </div>
            </Group>
          </Paper>

          {/* Send to Garmin */}
          <Paper
            p="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={sendToGarmin}
          >
            <Group>
              <ThemeIcon size="xl" variant="light" color="orange">
                <Share2 size={24} />
              </ThemeIcon>
              <div>
                <Text fw={500}>Send to Garmin</Text>
                <Text size="sm" c="#D5E1EE">Upload directly to Garmin Connect</Text>
              </div>
            </Group>
          </Paper>
        </Stack>
      </Modal>

      {/* Route Clarification Modal */}
      <Modal
        opened={showClarificationModal}
        onClose={() => {
          setShowClarificationModal(false);
          setPendingRouteRequest(null);
          setClarificationAnswers({ direction: null, routeStyle: 'new', terrain: 'rolling' });
        }}
        title={
          <Group gap="xs">
            <ThemeIcon size="lg" variant="light" color="violet">
              <Navigation2 size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="lg">Let's plan your route!</Text>
              <Text size="sm" c="#D5E1EE">
                {pendingRouteRequest?.distance ?
                  `${Math.round(pendingRouteRequest.distance * 0.621371)} mile ${pendingRouteRequest.surfaceType || 'cycling'} ride` :
                  'Tell me more about your route'
                }
              </Text>
            </div>
          </Group>
        }
        size="lg"
        centered
      >
        <Stack gap="lg">
          {/* Direction Selection */}
          <div>
            <Text fw={500} size="sm" mb="xs">Where would you like to go?</Text>
            {pendingRouteRequest?.waypoints && pendingRouteRequest.waypoints.length > 0 ? (
              <>
                <Text size="sm" c="blue" mb="xs">
                  You mentioned: <strong>{pendingRouteRequest.waypoints[0]}</strong>
                </Text>
                <Text size="xs" c="#D5E1EE" mb="xs">
                  I'll use this as your destination, or you can change it below:
                </Text>
                <SegmentedControl
                  value={clarificationAnswers.direction || 'none'}
                  onChange={(value) => setClarificationAnswers(prev => ({ ...prev, direction: value === 'none' ? null : value, customPlace: null }))}
                  data={[
                    { label: `📍 ${pendingRouteRequest.waypoints[0]}`, value: 'none' },
                    { label: '⬆️ North', value: 'north' },
                    { label: '⬇️ South', value: 'south' },
                    { label: '⬅️ West', value: 'west' },
                    { label: '➡️ East', value: 'east' },
                  ]}
                  fullWidth
                />
              </>
            ) : (
              <SegmentedControl
                value={clarificationAnswers.direction || 'north'}
                onChange={(value) => setClarificationAnswers(prev => ({ ...prev, direction: value, customPlace: null }))}
                data={[
                  { label: '⬆️ North', value: 'north' },
                  { label: '⬇️ South', value: 'south' },
                  { label: '⬅️ West', value: 'west' },
                  { label: '➡️ East', value: 'east' },
                ]}
                fullWidth
              />
            )}
            <Text size="xs" c="#D5E1EE" mt="xs">
              Or enter a different place below
            </Text>
            <TextInput
              placeholder="e.g., Boulder, Lyons, Nederland..."
              mt="xs"
              leftSection={<MapPin size={14} />}
              value={clarificationAnswers.customPlace || ''}
              onChange={(e) => setClarificationAnswers(prev => ({ ...prev, customPlace: e.target.value, direction: null }))}
            />
          </div>

          {/* Route Style */}
          <div>
            <Text fw={500} size="sm" mb="xs">How should I plan the route?</Text>
            <Radio.Group
              value={clarificationAnswers.routeStyle}
              onChange={(value) => setClarificationAnswers(prev => ({ ...prev, routeStyle: value }))}
            >
              <Stack gap="xs">
                <Radio
                  value="past_rides"
                  label={
                    <div>
                      <Text size="sm" fw={500}>🎯 Based on my riding history</Text>
                      <Text size="xs" c="#D5E1EE">Uses AI to analyze your past rides and create a similar route</Text>
                    </div>
                  }
                />
                <Radio
                  value="new"
                  label={
                    <div>
                      <Text size="sm" fw={500}>🗺️ Explore somewhere new</Text>
                      <Text size="xs" c="#D5E1EE">Creates a simple loop in the chosen direction</Text>
                    </div>
                  }
                />
              </Stack>
            </Radio.Group>
          </div>

          {/* Terrain Preference */}
          <div>
            <Text fw={500} size="sm" mb="xs">Terrain preference?</Text>
            <SegmentedControl
              value={clarificationAnswers.terrain}
              onChange={(value) => setClarificationAnswers(prev => ({ ...prev, terrain: value }))}
              data={[
                { label: '🏔️ Flat', value: 'flat' },
                { label: '🌊 Rolling', value: 'rolling' },
                { label: '⛰️ Hilly', value: 'hilly' },
              ]}
              fullWidth
            />
          </div>

          {/* Generate Button */}
          <Button
            fullWidth
            size="md"
            leftSection={<Route size={18} />}
            onClick={handleClarifiedRouteGeneration}
            loading={processingNL}
            gradient={{ from: 'violet', to: 'indigo', deg: 135 }}
            variant="gradient"
          >
            Generate Route
          </Button>
        </Stack>
      </Modal>
    </>
  );
});


ProfessionalRouteBuilder.displayName = 'ProfessionalRouteBuilder';

export default ProfessionalRouteBuilder;// Cache bust 1760191273
