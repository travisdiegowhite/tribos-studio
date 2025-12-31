/**
 * BikeInfrastructureLayer
 * Renders bike infrastructure overlay on the map with safety-focused color coding
 * Uses a white outline technique for universal visibility across all basemaps
 */

import { Source, Layer } from 'react-map-gl';
import { INFRASTRUCTURE_TYPES, INFRASTRUCTURE_COLORS } from '../utils/bikeInfrastructureService';

/**
 * Layer paint properties for each infrastructure tier
 * Using Mapbox GL expressions for data-driven styling
 */

// White outline layer for contrast on all basemaps
const outlineLayerPaint = {
  'line-color': '#ffffff',
  'line-width': [
    'interpolate',
    ['linear'],
    ['zoom'],
    10, 4,   // At zoom 10: 4px
    14, 6,   // At zoom 14: 6px
    18, 8,   // At zoom 18: 8px
  ],
  'line-opacity': 0.6,
  'line-blur': 1,
};

// Main colored layer with data-driven colors
const mainLayerPaint = {
  'line-color': ['get', 'color'],
  'line-width': [
    'interpolate',
    ['linear'],
    ['zoom'],
    10, 2,   // At zoom 10: 2px
    14, 3,   // At zoom 14: 3px
    18, 5,   // At zoom 18: 5px
  ],
  'line-opacity': 0.9,
};

// Dashed pattern for lower-tier infrastructure (bike-friendly streets, sharrows)
const dashedLayerPaint = {
  'line-color': ['get', 'color'],
  'line-width': [
    'interpolate',
    ['linear'],
    ['zoom'],
    10, 2,
    14, 3,
    18, 5,
  ],
  'line-opacity': 0.9,
  'line-dasharray': [2, 2],
};

/**
 * Filter expressions for different infrastructure tiers
 */
const SOLID_TYPES = [
  INFRASTRUCTURE_TYPES.PROTECTED_CYCLEWAY,
  INFRASTRUCTURE_TYPES.BIKE_LANE,
  INFRASTRUCTURE_TYPES.SHARED_PATH,
];

const DASHED_TYPES = [
  INFRASTRUCTURE_TYPES.BIKE_FRIENDLY,
  INFRASTRUCTURE_TYPES.SHARED_LANE,
];

const solidFilter = ['in', ['get', 'infraType'], ['literal', SOLID_TYPES]];
const dashedFilter = ['in', ['get', 'infraType'], ['literal', DASHED_TYPES]];

/**
 * BikeInfrastructureLayer Component
 *
 * @param {Object} props
 * @param {Object} props.data - GeoJSON FeatureCollection of infrastructure
 * @param {boolean} props.visible - Whether the layer is visible
 * @param {string} props.beforeId - Layer ID to render before (for z-ordering)
 */
export default function BikeInfrastructureLayer({ data, visible = true, beforeId }) {
  if (!data || !visible) {
    return null;
  }

  return (
    <Source
      id="bike-infrastructure"
      type="geojson"
      data={data}
    >
      {/* White outline layer for universal contrast */}
      <Layer
        id="bike-infrastructure-outline"
        type="line"
        paint={outlineLayerPaint}
        layout={{
          'line-cap': 'round',
          'line-join': 'round',
        }}
        beforeId={beforeId}
      />

      {/* Solid lines for protected/bike lane/shared path (Tiers 1-3) */}
      <Layer
        id="bike-infrastructure-solid"
        type="line"
        paint={mainLayerPaint}
        filter={solidFilter}
        layout={{
          'line-cap': 'round',
          'line-join': 'round',
        }}
        beforeId={beforeId}
      />

      {/* Dashed lines for bike-friendly/sharrows (Tiers 4-5) */}
      <Layer
        id="bike-infrastructure-dashed"
        type="line"
        paint={dashedLayerPaint}
        filter={dashedFilter}
        layout={{
          'line-cap': 'butt',
          'line-join': 'round',
        }}
        beforeId={beforeId}
      />
    </Source>
  );
}

/**
 * Legend data for UI display
 */
export const INFRASTRUCTURE_LEGEND = [
  {
    type: INFRASTRUCTURE_TYPES.PROTECTED_CYCLEWAY,
    label: 'Protected Cycleway',
    description: 'Separated bike path, safest option',
    color: INFRASTRUCTURE_COLORS[INFRASTRUCTURE_TYPES.PROTECTED_CYCLEWAY],
    style: 'solid',
  },
  {
    type: INFRASTRUCTURE_TYPES.BIKE_LANE,
    label: 'Bike Lane',
    description: 'On-road painted bike lane',
    color: INFRASTRUCTURE_COLORS[INFRASTRUCTURE_TYPES.BIKE_LANE],
    style: 'solid',
  },
  {
    type: INFRASTRUCTURE_TYPES.SHARED_PATH,
    label: 'Shared Path',
    description: 'Multi-use trail or greenway',
    color: INFRASTRUCTURE_COLORS[INFRASTRUCTURE_TYPES.SHARED_PATH],
    style: 'solid',
  },
  {
    type: INFRASTRUCTURE_TYPES.BIKE_FRIENDLY,
    label: 'Bike-Friendly Street',
    description: 'Low-traffic road, bikes allowed',
    color: INFRASTRUCTURE_COLORS[INFRASTRUCTURE_TYPES.BIKE_FRIENDLY],
    style: 'dashed',
  },
  {
    type: INFRASTRUCTURE_TYPES.SHARED_LANE,
    label: 'Shared Lane',
    description: 'Sharrow marking, share with cars',
    color: INFRASTRUCTURE_COLORS[INFRASTRUCTURE_TYPES.SHARED_LANE],
    style: 'dashed',
  },
];
