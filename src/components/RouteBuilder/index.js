/**
 * Shared Route Builder Components
 *
 * These components are shared between:
 * - AIRouteBuilder (current RouteBuilder.jsx) - AI-assisted route generation
 * - ManualRouteBuilder - Traditional click-to-place waypoint building
 *
 * Re-exports from existing components for convenience.
 */

// Map Components
export { default as MapControls } from '../MapControls.jsx';
export { default as BikeInfrastructureLayer } from '../BikeInfrastructureLayer.jsx';
export { default as BikeInfrastructureLegend } from '../BikeInfrastructureLegend.jsx';

// Route Display
export { default as ElevationProfile } from '../ElevationProfile.jsx';
export { default as RouteStatsPanel } from '../RouteStatsPanel.jsx';
export { default as DifficultyBadge } from '../DifficultyBadge.jsx';

// Route Operations
export { default as RouteExportMenu } from '../RouteExportMenu.jsx';
export { default as FloatingRouteSettings, RouteSettingsButton } from '../FloatingRouteSettings.jsx';

// UI Components
export { default as CollapsibleSection } from '../CollapsibleSection.jsx';
export { default as MapTutorialOverlay } from '../MapTutorialOverlay.jsx';

// Constants shared between builders
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// CyclOSM raster tile style
export const CYCLOSM_STYLE = {
  version: 8,
  name: 'CyclOSM',
  sources: {
    'cyclosm-tiles': {
      type: 'raster',
      tiles: [
        'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://www.cyclosm.org">CyclOSM</a> | © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: 'cyclosm-layer',
      type: 'raster',
      source: 'cyclosm-tiles',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

// Basemap style options
export const BASEMAP_STYLES = [
  { id: 'dark', label: 'Dark', style: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'outdoors', label: 'Outdoors', style: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'satellite', label: 'Satellite', style: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { id: 'streets', label: 'Streets', style: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'cyclosm', label: 'CyclOSM', style: CYCLOSM_STYLE },
];

// Route profile options (cycling)
export const ROUTE_PROFILES = [
  { value: 'road', label: 'Road' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'mountain', label: 'Mountain' },
  { value: 'commuting', label: 'Commuting' },
  { value: 'walking', label: 'Walking' },
];

// Route profile options (running)
export const RUNNING_ROUTE_PROFILES = [
  { value: 'road', label: 'Road' },
  { value: 'trail', label: 'Trail' },
  { value: 'track', label: 'Track' },
  { value: 'mixed', label: 'Mixed' },
];

export function getRouteProfiles(sportType) {
  return sportType === 'running' ? RUNNING_ROUTE_PROFILES : ROUTE_PROFILES;
}

// Training goals (cycling)
export const CYCLING_TRAINING_GOALS = [
  { label: 'Recovery', value: 'recovery' },
  { label: 'Endurance', value: 'endurance' },
  { label: 'Intervals', value: 'intervals' },
  { label: 'Hills', value: 'hills' },
];

// Training goals (running)
export const RUNNING_TRAINING_GOALS = [
  { label: 'Easy Run', value: 'easy_run' },
  { label: 'Tempo', value: 'tempo' },
  { label: 'Long Run', value: 'long_run' },
  { label: 'Intervals', value: 'intervals' },
  { label: 'Hills', value: 'hills' },
  { label: 'Recovery', value: 'recovery' },
];

export function getTrainingGoals(sportType) {
  return sportType === 'running' ? RUNNING_TRAINING_GOALS : CYCLING_TRAINING_GOALS;
}

// Waypoint marker colors
export const WAYPOINT_COLORS = {
  start: '#6B8C72', // Sage
  end: '#9E5A3C',   // Terracotta
  waypoint: '#5C7A5E', // Teal
};
