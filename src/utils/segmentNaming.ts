/**
 * Segment Naming & Description Generator
 *
 * Generates meaningful names and training character descriptions for segments.
 * Uses reverse geocoding (Mapbox) to derive road names and landmarks.
 */

import type { DetectedSegment } from './segmentDetector';

// ============================================================================
// TYPES
// ============================================================================

export interface SegmentIdentity {
  autoName: string;         // "Spine Rd Climb"
  description: string;      // "12 min sustained climb, 4.2% avg, no stops"
  shortDescription: string; // "12 min climb, 4.2%"
}

interface ReverseGeocodeResult {
  roadName: string | null;
  placeName: string | null;
  neighborhood: string | null;
  locality: string | null;
}

// ============================================================================
// MAIN NAMING FUNCTION
// ============================================================================

/**
 * Generate name and description for a segment.
 * If Mapbox token is available, uses reverse geocoding for road names.
 * Otherwise falls back to coordinate-based naming.
 */
export async function generateSegmentIdentity(
  segment: DetectedSegment,
  options?: {
    mapboxToken?: string;
    userHomeLat?: number;
    userHomeLng?: number;
  }
): Promise<SegmentIdentity> {
  const description = generateDescription(segment);
  const shortDescription = generateShortDescription(segment);

  // Try to get geographic name via reverse geocoding
  let geoName: string | null = null;

  if (options?.mapboxToken) {
    try {
      geoName = await generateGeoName(segment, options.mapboxToken);
    } catch {
      // Fall back to coordinate-based naming
    }
  }

  // Fallback: generate name from terrain + direction
  const autoName = geoName || generateFallbackName(segment, options?.userHomeLat, options?.userHomeLng);

  return { autoName, description, shortDescription };
}

/**
 * Synchronous version that generates names without geocoding.
 * Use when Mapbox token is not available or for batch processing.
 */
export function generateSegmentIdentitySync(
  segment: DetectedSegment,
  options?: {
    userHomeLat?: number;
    userHomeLng?: number;
  }
): SegmentIdentity {
  return {
    autoName: generateFallbackName(segment, options?.userHomeLat, options?.userHomeLng),
    description: generateDescription(segment),
    shortDescription: generateShortDescription(segment),
  };
}

// ============================================================================
// GEOGRAPHIC NAME GENERATION (via Mapbox)
// ============================================================================

async function generateGeoName(
  segment: DetectedSegment,
  mapboxToken: string
): Promise<string | null> {
  // Reverse geocode the midpoint (most recognizable location)
  const midIdx = Math.floor(segment.coordinates.length / 2);
  const midpoint = segment.coordinates[midIdx] || segment.coordinates[0];
  const [midLng, midLat] = midpoint;

  // Also reverse geocode start and end for cross-street info
  const [startResult, midResult, endResult] = await Promise.all([
    reverseGeocode(segment.startLat, segment.startLng, mapboxToken),
    reverseGeocode(midLat, midLng, mapboxToken),
    reverseGeocode(segment.endLat, segment.endLng, mapboxToken),
  ]);

  // Primary road name (from midpoint, as it's the most "on" the segment)
  const primaryRoad = midResult.roadName || startResult.roadName;
  const crossStreet = endResult.roadName !== primaryRoad ? endResult.roadName : null;
  const landmark = midResult.placeName || midResult.neighborhood || midResult.locality;

  if (!primaryRoad && !landmark) return null;

  return composeName(segment.terrainType, primaryRoad, crossStreet, landmark);
}

async function reverseGeocode(
  lat: number,
  lng: number,
  token: string
): Promise<ReverseGeocodeResult> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?types=address,poi,neighborhood,locality&limit=1&access_token=${token}`;

  const response = await fetch(url);
  if (!response.ok) {
    return { roadName: null, placeName: null, neighborhood: null, locality: null };
  }

  const data = await response.json();
  const features = data.features || [];

  let roadName: string | null = null;
  let placeName: string | null = null;
  let neighborhood: string | null = null;
  let locality: string | null = null;

  for (const feature of features) {
    const type = feature.place_type?.[0];
    if (type === 'address' && !roadName) {
      // Extract street name (remove house number)
      roadName = feature.text || null;
    }
    if (type === 'poi' && !placeName) {
      placeName = feature.text || null;
    }
    if (type === 'neighborhood' && !neighborhood) {
      neighborhood = feature.text || null;
    }
    if (type === 'locality' && !locality) {
      locality = feature.text || null;
    }
  }

  // Also extract from context (which includes parent places)
  if (!locality && features[0]?.context) {
    for (const ctx of features[0].context) {
      if (ctx.id?.startsWith('locality') && !locality) {
        locality = ctx.text;
      }
      if (ctx.id?.startsWith('neighborhood') && !neighborhood) {
        neighborhood = ctx.text;
      }
    }
  }

  return { roadName, placeName, neighborhood, locality };
}

// ============================================================================
// NAME COMPOSITION
// ============================================================================

function composeName(
  terrainType: string,
  primaryRoad: string | null,
  crossStreet: string | null,
  landmark: string | null
): string {
  const suffix = getTerrainSuffix(terrainType);

  // Pattern: "[Road Name] [Terrain Suffix]"
  if (primaryRoad) {
    // Abbreviate common road suffixes
    const road = abbreviateRoad(primaryRoad);

    if (crossStreet) {
      return `${road} via ${abbreviateRoad(crossStreet)}`;
    }
    if (suffix) {
      return `${road} ${suffix}`;
    }
    return road;
  }

  // Pattern: "[Terrain Suffix] to [Landmark]"
  if (landmark && suffix) {
    return `${suffix} to ${landmark}`;
  }

  // Pattern: "[Landmark] [Terrain Suffix]"
  if (landmark) {
    return `${landmark} ${suffix || 'Segment'}`;
  }

  return `${suffix || 'Segment'}`;
}

function getTerrainSuffix(terrainType: string): string {
  switch (terrainType) {
    case 'climb': return 'Climb';
    case 'descent': return 'Descent';
    case 'flat': return 'Flat';
    case 'rolling': return 'Rolling';
    default: return '';
  }
}

function abbreviateRoad(name: string): string {
  return name
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bRoad\b/gi, 'Rd')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bBoulevard\b/gi, 'Blvd')
    .replace(/\bDrive\b/gi, 'Dr')
    .replace(/\bLane\b/gi, 'Ln')
    .replace(/\bCourt\b/gi, 'Ct')
    .replace(/\bPlace\b/gi, 'Pl')
    .replace(/\bHighway\b/gi, 'Hwy')
    .replace(/\bParkway\b/gi, 'Pkwy')
    .replace(/\bCircle\b/gi, 'Cir')
    .replace(/\bNorth\b/gi, 'N')
    .replace(/\bSouth\b/gi, 'S')
    .replace(/\bEast\b/gi, 'E')
    .replace(/\bWest\b/gi, 'W');
}

// ============================================================================
// FALLBACK NAMING (no geocoding)
// ============================================================================

function generateFallbackName(
  segment: DetectedSegment,
  homeLat?: number,
  homeLng?: number
): string {
  const suffix = getTerrainSuffix(segment.terrainType);
  const distKm = segment.distanceMeters / 1000;

  // If we have a home location, use direction + distance
  if (homeLat !== undefined && homeLng !== undefined) {
    const bearing = calculateBearing(homeLat, homeLng, segment.startLat, segment.startLng);
    const direction = bearingToCardinal(bearing);
    const distFromHome = haversineKm(homeLat, homeLng, segment.startLat, segment.startLng);

    return `${direction} ${suffix} (${distFromHome.toFixed(1)}km)`;
  }

  // Otherwise, use terrain + distance description
  if (segment.terrainType === 'climb') {
    return `${formatDuration(segment.durationSeconds)} ${suffix} ${segment.avgGradient.toFixed(1)}%`;
  }

  return `${suffix} ${distKm.toFixed(1)}km`;
}

// ============================================================================
// DESCRIPTION GENERATION
// ============================================================================

/**
 * Generate training character description.
 * Format: "[Duration] [terrain type], [gradient info], [obstruction info]"
 */
function generateDescription(segment: DetectedSegment): string {
  const parts: string[] = [];

  // Duration + terrain
  const duration = formatDuration(segment.durationSeconds);
  const terrainDesc = getTerrainDescription(segment);
  parts.push(`${duration} ${terrainDesc}`);

  // Gradient info
  if (segment.terrainType === 'climb' || segment.terrainType === 'rolling') {
    parts.push(`${segment.avgGradient.toFixed(1)}% avg`);
  }

  // Obstruction info
  if (segment.stopCount === 0) {
    parts.push('no stops');
  } else if (segment.stopCount === 1) {
    parts.push('1 stop');
  } else {
    parts.push(`${segment.stopCount} stops`);
  }

  return parts.join(', ');
}

function generateShortDescription(segment: DetectedSegment): string {
  const duration = formatDuration(segment.durationSeconds);
  const terrain = segment.terrainType;

  if (terrain === 'climb') {
    return `${duration} climb, ${segment.avgGradient.toFixed(1)}%`;
  }
  if (terrain === 'rolling') {
    return `${duration} rolling, ${segment.avgGradient.toFixed(1)}%`;
  }
  return `${duration} ${terrain}`;
}

function getTerrainDescription(segment: DetectedSegment): string {
  switch (segment.terrainType) {
    case 'climb':
      if (segment.avgGradient >= 8) return 'steep climb';
      if (segment.avgGradient >= 5) return 'sustained climb';
      return 'gradual climb';
    case 'descent':
      return 'descent';
    case 'rolling':
      return 'rolling';
    case 'flat':
      return 'flat';
    default:
      return 'mixed terrain';
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  if (remainingMin === 0) return `${hours}h`;
  return `${hours}h ${remainingMin}m`;
}

function calculateBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function bearingToCardinal(bearing: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
