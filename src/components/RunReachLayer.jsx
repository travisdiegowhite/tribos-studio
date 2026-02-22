/**
 * RunReachLayer
 * Renders road network reachability visualization on the map.
 *
 * Two rendering modes:
 * - Valhalla (primary): Individual road edges as colored lines radiating from origin
 * - Mapbox (fallback): Filled polygon bands showing reachable area
 *
 * Uses the same Source/Layer pattern as BikeInfrastructureLayer.jsx
 */

import { Source, Layer } from 'react-map-gl';
import { REACH_COLORS } from '../utils/isochroneService';

// --- Valhalla road edge layers ---

// Build Mapbox GL color interpolation expression from our color ramp
const edgeColorExpression = [
  'interpolate',
  ['linear'],
  ['get', 'normalizedDistance'],
  ...REACH_COLORS.flatMap(({ ratio, color }) => [ratio, color]),
];

// White outline for visibility on any basemap
const edgeOutlinePaint = {
  'line-color': '#ffffff',
  'line-width': [
    'interpolate', ['linear'], ['zoom'],
    10, 3,
    14, 5,
    18, 7,
  ],
  'line-opacity': 0.5,
  'line-blur': 1,
};

// Main colored edges
const edgePaint = {
  'line-color': edgeColorExpression,
  'line-width': [
    'interpolate', ['linear'], ['zoom'],
    10, 1.5,
    14, 3,
    18, 5,
  ],
  'line-opacity': 0.85,
};

// --- Mapbox polygon fallback layers ---

const polygonFillColors = ['#22c55e', '#eab308', '#ef4444']; // green, yellow, red

function getPolygonFillPaint(bandIndex) {
  return {
    'fill-color': polygonFillColors[bandIndex] || '#ef4444',
    'fill-opacity': 0.15 - bandIndex * 0.03,
  };
}

function getPolygonOutlinePaint(bandIndex) {
  return {
    'line-color': polygonFillColors[bandIndex] || '#ef4444',
    'line-width': 2,
    'line-opacity': 0.6,
  };
}

// --- Origin marker layer ---

const originPulsePaint = {
  'circle-radius': [
    'interpolate', ['linear'], ['zoom'],
    10, 6,
    14, 10,
    18, 14,
  ],
  'circle-color': '#3b82f6',
  'circle-opacity': 0.9,
  'circle-stroke-width': 3,
  'circle-stroke-color': '#ffffff',
};

/**
 * RunReachLayer Component
 *
 * @param {Object} props
 * @param {Object|null} props.data - GeoJSON data from isochroneService
 * @param {'valhalla'|'mapbox'|'none'} props.source - Which API provided the data
 * @param {[number, number]|null} props.origin - [lng, lat] starting point
 * @param {boolean} props.visible - Whether layer is visible
 */
export default function RunReachLayer({ data, source, origin, visible = true }) {
  if (!visible) return null;

  return (
    <>
      {/* Road edges from Valhalla */}
      {source === 'valhalla' && data && (
        <Source id="run-reach-edges" type="geojson" data={data}>
          <Layer
            id="run-reach-edges-outline"
            type="line"
            paint={edgeOutlinePaint}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="run-reach-edges-main"
            type="line"
            paint={edgePaint}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {/* Polygon bands from Mapbox (fallback) */}
      {source === 'mapbox' && data && data.features && data.features.map((feature, i) => (
        <Source
          key={`run-reach-poly-${i}`}
          id={`run-reach-poly-${i}`}
          type="geojson"
          data={feature}
        >
          <Layer
            id={`run-reach-poly-fill-${i}`}
            type="fill"
            paint={getPolygonFillPaint(i)}
          />
          <Layer
            id={`run-reach-poly-outline-${i}`}
            type="line"
            paint={getPolygonOutlinePaint(i)}
          />
        </Source>
      ))}

      {/* Origin marker */}
      {origin && (
        <Source
          id="run-reach-origin"
          type="geojson"
          data={{
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: origin },
              properties: {},
            }],
          }}
        >
          <Layer
            id="run-reach-origin-marker"
            type="circle"
            paint={originPulsePaint}
          />
        </Source>
      )}
    </>
  );
}
