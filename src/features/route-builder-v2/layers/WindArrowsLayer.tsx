/**
 * WindArrowsLayer — Route Builder 2.0 wind annotation on the map.
 *
 * Samples points along the route and drops a small arrow at each, pointing
 * the direction the wind blows TOWARD (uniform across the route) and colored
 * by how that part of the route sits relative to the wind: headwind (coral),
 * tailwind (teal), crosswind (gold). Reuses the same calculateBearing /
 * analyzeWindForBearing math the weather panel's summary is built on.
 *
 * Rendered as <Marker> children of the map (matching the waypoint markers)
 * rather than a symbol layer, to avoid registering an icon image; the arrow
 * count is capped so this stays light. Non-interactive — never intercepts
 * map clicks.
 */

import { Marker } from 'react-map-gl';
import type { Coordinate } from '../../../types/geo';
import { calculateBearing, analyzeWindForBearing } from '../../../utils/weather.js';

export interface WindArrowsLayerProps {
  coordinates: Coordinate[];
  windDegrees: number;
  windSpeed: number; // km/h
  /** Below this the wind has minimal effect and no arrows are drawn. */
  minWindSpeed?: number;
  /** Maximum number of arrows to place along the route. */
  maxArrows?: number;
}

const HEAD = '#C43C2A'; // coral
const TAIL = '#2A8C82'; // teal
const CROSS = '#C49A0A'; // gold

const bearingFn = calculateBearing as (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => number;
const analyzeFn = analyzeWindForBearing as (
  routeBearing: number,
  windDegrees: number,
  windSpeed: number,
) => { type: string };

function colorForType(type: string): string | null {
  switch (type) {
    case 'headwind':
    case 'quartering-head':
      return HEAD;
    case 'tailwind':
    case 'quartering-tail':
      return TAIL;
    case 'crosswind':
      return CROSS;
    default:
      return null; // neutral — skip
  }
}

export function WindArrowsLayer({
  coordinates,
  windDegrees,
  windSpeed,
  minWindSpeed = 5,
  maxArrows = 12,
}: WindArrowsLayerProps) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    windSpeed < minWindSpeed ||
    windDegrees == null
  ) {
    return null;
  }

  // Direction the wind travels toward (windDegrees is where it comes FROM).
  const towardDeg = (windDegrees + 180) % 360;

  const step = Math.max(1, Math.floor(coordinates.length / maxArrows));
  const arrows: Array<{ key: string; pos: Coordinate; color: string }> = [];

  for (let i = step; i < coordinates.length; i += step) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    const bearing = bearingFn(lat1, lon1, lat2, lon2);
    const { type } = analyzeFn(bearing, windDegrees, windSpeed);
    const color = colorForType(type);
    if (!color) continue;
    arrows.push({ key: `wind-${i}`, pos: coordinates[i], color });
  }

  return (
    <>
      {arrows.map((a) => (
        <Marker key={a.key} longitude={a.pos[0]} latitude={a.pos[1]} anchor="center">
          <div
            data-testid="rb2-wind-arrow"
            data-wind-color={a.color}
            style={{
              transform: `rotate(${towardDeg}deg)`,
              pointerEvents: 'none',
              lineHeight: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              {/* Arrow pointing up (north) at 0°; the wrapper rotates it. */}
              <path
                d="M9 1 L14 11 L9 8.5 L4 11 Z"
                fill={a.color}
                stroke="#FFFFFF"
                strokeWidth="0.75"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Marker>
      ))}
    </>
  );
}

export default WindArrowsLayer;
