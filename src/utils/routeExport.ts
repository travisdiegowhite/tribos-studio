/**
 * Route Export Utility
 * Generates route files for bike computers and navigation in various formats:
 * - GPX (GPS Exchange Format) - Universal format for GPS devices
 * - TCX (Training Center XML) - Garmin's course format
 *
 * Supports exporting routes with:
 * - Full coordinate data (lat, lng, elevation)
 * - Route metadata (name, description, distance, elevation gain)
 * - Waypoints/cuepoints for navigation
 */

// ============================================================
// TYPES
// ============================================================

export interface RouteCoordinate {
  lng: number;
  lat: number;
  ele?: number;
}

export interface RouteWaypoint {
  lat: number;
  lng: number;
  name?: string;
  description?: string;
  type?: 'start' | 'end' | 'waypoint' | 'poi';
}

export interface RouteData {
  name: string;
  description?: string;
  coordinates: [number, number][] | [number, number, number][]; // [lng, lat] or [lng, lat, ele]
  waypoints?: RouteWaypoint[];
  distanceKm?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  routeType?: 'loop' | 'out_back' | 'point_to_point';
  surfaceType?: 'paved' | 'gravel' | 'mixed';
}

export interface RouteExportOptions {
  format: 'gpx' | 'tcx';
  includeWaypoints?: boolean;
  includeElevation?: boolean;
  author?: string;
}

export interface RouteExportResult {
  content: string;
  filename: string;
  mimeType: string;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function escapeXml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_');
}

function formatCoordinate(coord: number): string {
  return coord.toFixed(7);
}

function formatElevation(ele: number | undefined): string {
  if (ele === undefined || ele === null) return '0.0';
  return ele.toFixed(1);
}

// ============================================================
// GPX EXPORT
// ============================================================

/**
 * Generate GPX (GPS Exchange Format) file
 * Reference: https://www.topografix.com/gpx/1/1/
 *
 * GPX is the universal standard for GPS data exchange.
 * Compatible with virtually all GPS devices and mapping software.
 */
export function generateGPX(route: RouteData, options: RouteExportOptions = { format: 'gpx' }): string {
  const lines: string[] = [];
  const now = new Date().toISOString();
  const author = options.author || 'Tribos Studio';
  const includeElevation = options.includeElevation !== false;
  const includeWaypoints = options.includeWaypoints !== false;

  // XML declaration and GPX root
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<gpx version="1.1" creator="' + escapeXml(author) + '"');
  lines.push('  xmlns="http://www.topografix.com/GPX/1/1"');
  lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push('  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">');

  // Metadata
  lines.push('  <metadata>');
  lines.push(`    <name>${escapeXml(route.name)}</name>`);
  if (route.description) {
    lines.push(`    <desc>${escapeXml(route.description)}</desc>`);
  }
  lines.push(`    <time>${now}</time>`);
  lines.push('    <author>');
  lines.push(`      <name>${escapeXml(author)}</name>`);
  lines.push('    </author>');

  // Add bounds if we have coordinates
  if (route.coordinates.length > 0) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const coord of route.coordinates) {
      const [lng, lat] = coord;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lng);
      maxLon = Math.max(maxLon, lng);
    }
    lines.push(`    <bounds minlat="${formatCoordinate(minLat)}" minlon="${formatCoordinate(minLon)}" maxlat="${formatCoordinate(maxLat)}" maxlon="${formatCoordinate(maxLon)}"/>`);
  }
  lines.push('  </metadata>');

  // Waypoints (for navigation points of interest)
  if (includeWaypoints && route.waypoints && route.waypoints.length > 0) {
    for (const wp of route.waypoints) {
      lines.push(`  <wpt lat="${formatCoordinate(wp.lat)}" lon="${formatCoordinate(wp.lng)}">`);
      if (wp.name) {
        lines.push(`    <name>${escapeXml(wp.name)}</name>`);
      }
      if (wp.description) {
        lines.push(`    <desc>${escapeXml(wp.description)}</desc>`);
      }
      if (wp.type) {
        lines.push(`    <type>${escapeXml(wp.type)}</type>`);
      }
      lines.push('  </wpt>');
    }
  }

  // Route element (for navigation - ordered waypoints)
  lines.push('  <rte>');
  lines.push(`    <name>${escapeXml(route.name)}</name>`);
  if (route.description) {
    lines.push(`    <desc>${escapeXml(route.description)}</desc>`);
  }

  // Route points
  for (let i = 0; i < route.coordinates.length; i++) {
    const coord = route.coordinates[i];
    const [lng, lat, ele] = coord.length === 3 ? coord : [coord[0], coord[1], undefined];

    lines.push(`    <rtept lat="${formatCoordinate(lat)}" lon="${formatCoordinate(lng)}">`);
    if (includeElevation) {
      lines.push(`      <ele>${formatElevation(ele as number | undefined)}</ele>`);
    }
    lines.push('    </rtept>');
  }
  lines.push('  </rte>');

  // Track element (for recording - continuous path)
  lines.push('  <trk>');
  lines.push(`    <name>${escapeXml(route.name)}</name>`);
  if (route.description) {
    lines.push(`    <desc>${escapeXml(route.description)}</desc>`);
  }
  lines.push('    <trkseg>');

  // Track points
  for (const coord of route.coordinates) {
    const [lng, lat, ele] = coord.length === 3 ? coord : [coord[0], coord[1], undefined];

    lines.push(`      <trkpt lat="${formatCoordinate(lat)}" lon="${formatCoordinate(lng)}">`);
    if (includeElevation) {
      lines.push(`        <ele>${formatElevation(ele as number | undefined)}</ele>`);
    }
    lines.push('      </trkpt>');
  }

  lines.push('    </trkseg>');
  lines.push('  </trk>');

  lines.push('</gpx>');

  return lines.join('\n');
}

// ============================================================
// TCX COURSE EXPORT (GARMIN FORMAT)
// ============================================================

/**
 * Generate TCX Course file (Training Center XML)
 * Reference: https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
 *
 * TCX is Garmin's native format for courses (routes).
 * Can be directly imported into Garmin Connect and synced to devices.
 *
 * Key differences from GPX:
 * - Uses "Course" element instead of "Route/Track"
 * - Includes lap data with distance metrics
 * - Supports course points (cue sheets) for turn-by-turn navigation
 */
export function generateTCX(route: RouteData, options: RouteExportOptions = { format: 'tcx' }): string {
  const lines: string[] = [];
  const now = new Date().toISOString();
  const author = options.author || 'Tribos Studio';
  const includeElevation = options.includeElevation !== false;

  // Calculate total distance if not provided
  let totalDistanceMeters = (route.distanceKm || 0) * 1000;
  if (totalDistanceMeters === 0 && route.coordinates.length > 1) {
    // Estimate distance from coordinates using haversine formula
    totalDistanceMeters = calculateRouteDistance(route.coordinates);
  }

  // XML declaration and TCX root
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<TrainingCenterDatabase');
  lines.push('  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"');
  lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push('  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">');

  // Courses container
  lines.push('  <Courses>');
  lines.push('    <Course>');
  lines.push(`      <Name>${escapeXml(route.name.substring(0, 15))}</Name>`); // Garmin limits course names to 15 chars

  // Lap element (required for TCX courses)
  lines.push('      <Lap>');
  lines.push(`        <TotalTimeSeconds>${estimateRideTime(totalDistanceMeters)}</TotalTimeSeconds>`);
  lines.push(`        <DistanceMeters>${totalDistanceMeters.toFixed(1)}</DistanceMeters>`);
  lines.push('        <BeginPosition>');
  if (route.coordinates.length > 0) {
    const [lng, lat] = route.coordinates[0];
    lines.push(`          <LatitudeDegrees>${formatCoordinate(lat)}</LatitudeDegrees>`);
    lines.push(`          <LongitudeDegrees>${formatCoordinate(lng)}</LongitudeDegrees>`);
  }
  lines.push('        </BeginPosition>');
  lines.push('        <EndPosition>');
  if (route.coordinates.length > 0) {
    const lastCoord = route.coordinates[route.coordinates.length - 1];
    const [lng, lat] = lastCoord;
    lines.push(`          <LatitudeDegrees>${formatCoordinate(lat)}</LatitudeDegrees>`);
    lines.push(`          <LongitudeDegrees>${formatCoordinate(lng)}</LongitudeDegrees>`);
  }
  lines.push('        </EndPosition>');
  lines.push('        <Intensity>Active</Intensity>');
  lines.push('      </Lap>');

  // Track with trackpoints
  lines.push('      <Track>');

  let cumulativeDistance = 0;
  let prevCoord: [number, number] | null = null;

  for (let i = 0; i < route.coordinates.length; i++) {
    const coord = route.coordinates[i];
    const [lng, lat, ele] = coord.length === 3 ? coord : [coord[0], coord[1], undefined];

    // Calculate cumulative distance
    if (prevCoord) {
      cumulativeDistance += haversineDistance(prevCoord[1], prevCoord[0], lat, lng);
    }
    prevCoord = [lng, lat];

    lines.push('        <Trackpoint>');
    lines.push(`          <Time>${now}</Time>`); // TCX requires time, use creation time
    lines.push('          <Position>');
    lines.push(`            <LatitudeDegrees>${formatCoordinate(lat)}</LatitudeDegrees>`);
    lines.push(`            <LongitudeDegrees>${formatCoordinate(lng)}</LongitudeDegrees>`);
    lines.push('          </Position>');
    if (includeElevation) {
      lines.push(`          <AltitudeMeters>${formatElevation(ele as number | undefined)}</AltitudeMeters>`);
    }
    lines.push(`          <DistanceMeters>${cumulativeDistance.toFixed(1)}</DistanceMeters>`);
    lines.push('        </Trackpoint>');
  }

  lines.push('      </Track>');

  // Course points (waypoints for cue sheet / turn-by-turn)
  if (route.waypoints && route.waypoints.length > 0) {
    for (const wp of route.waypoints) {
      lines.push('      <CoursePoint>');
      lines.push(`        <Name>${escapeXml((wp.name || 'Waypoint').substring(0, 10))}</Name>`);
      lines.push(`        <Time>${now}</Time>`);
      lines.push('        <Position>');
      lines.push(`          <LatitudeDegrees>${formatCoordinate(wp.lat)}</LatitudeDegrees>`);
      lines.push(`          <LongitudeDegrees>${formatCoordinate(wp.lng)}</LongitudeDegrees>`);
      lines.push('        </Position>');
      lines.push(`        <PointType>${mapWaypointType(wp.type)}</PointType>`);
      if (wp.description) {
        lines.push(`        <Notes>${escapeXml(wp.description)}</Notes>`);
      }
      lines.push('      </CoursePoint>');
    }
  }

  lines.push('    </Course>');
  lines.push('  </Courses>');

  // Author info
  lines.push('  <Author xsi:type="Application_t">');
  lines.push(`    <Name>${escapeXml(author)}</Name>`);
  lines.push('    <Build>');
  lines.push('      <Version>');
  lines.push('        <VersionMajor>1</VersionMajor>');
  lines.push('        <VersionMinor>0</VersionMinor>');
  lines.push('      </Version>');
  lines.push('    </Build>');
  lines.push('    <LangID>EN</LangID>');
  lines.push('  </Author>');

  lines.push('</TrainingCenterDatabase>');

  return lines.join('\n');
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Calculate distance between two points using Haversine formula
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate total route distance from coordinates
 */
function calculateRouteDistance(coordinates: [number, number][] | [number, number, number][]): number {
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    totalDistance += haversineDistance(lat1, lng1, lat2, lng2);
  }
  return totalDistance;
}

/**
 * Estimate ride time in seconds based on distance
 * Assumes average cycling speed of 20 km/h
 */
function estimateRideTime(distanceMeters: number): number {
  const avgSpeedMps = 20 * 1000 / 3600; // 20 km/h in m/s
  return Math.round(distanceMeters / avgSpeedMps);
}

/**
 * Map waypoint type to TCX CoursePoint type
 */
function mapWaypointType(type?: string): string {
  switch (type) {
    case 'start':
      return 'Generic';
    case 'end':
      return 'Generic';
    case 'poi':
      return 'Summit'; // Use Summit for POIs
    default:
      return 'Generic';
  }
}

// ============================================================
// MAIN EXPORT FUNCTION
// ============================================================

/**
 * Export a route to the specified format
 */
export function exportRoute(route: RouteData, options: RouteExportOptions): RouteExportResult {
  const { format } = options;
  const cleanName = cleanFilename(route.name);

  switch (format) {
    case 'gpx':
      return {
        content: generateGPX(route, options),
        filename: `${cleanName}.gpx`,
        mimeType: 'application/gpx+xml'
      };

    case 'tcx':
      return {
        content: generateTCX(route, options),
        filename: `${cleanName}.tcx`,
        mimeType: 'application/vnd.garmin.tcx+xml'
      };

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Trigger download of exported route file
 */
export function downloadRoute(result: RouteExportResult): void {
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Quick export and download a route
 */
export function exportAndDownloadRoute(route: RouteData, format: 'gpx' | 'tcx'): void {
  const result = exportRoute(route, { format });
  downloadRoute(result);
}

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

export default {
  generateGPX,
  generateTCX,
  exportRoute,
  downloadRoute,
  exportAndDownloadRoute
};
