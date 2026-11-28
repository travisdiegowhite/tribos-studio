/**
 * Route file import beyond GPX: TCX and FIT (Phase 2,
 * docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.8).
 *
 * Both return the same small shape the route builder's import needs:
 * a name and track points as {latitude, longitude, elevation?} (the activity
 * import shape; useRoutePersistence converts to canonical [lng, lat] at its
 * seam), plus whatever totals the file carries. Courses and activities are
 * both accepted, so a ridden activity can become a route.
 */
import { Decoder, Stream } from '@garmin/fitsdk';

export interface ParsedRouteFile {
  name: string | null;
  trackPoints: Array<{ latitude: number; longitude: number; elevation?: number }>;
  distance_km: number | null;
  ascent_m: number | null;
  duration_s: number | null;
}

export type RouteFileKind = 'gpx' | 'tcx' | 'fit';

/** Which parser a file needs, by extension (null when unsupported). */
export function routeFileKind(fileName: string): RouteFileKind | null {
  const ext = fileName.toLowerCase().split('.').pop();
  return ext === 'gpx' || ext === 'tcx' || ext === 'fit' ? ext : null;
}

function num(text: string | null | undefined): number | null {
  if (text == null) return null;
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}

function ascentOf(elevations: number[]): number | null {
  if (elevations.length < 2) return null;
  let gain = 0;
  let last = elevations[0];
  for (const e of elevations) {
    // 3 m threshold against GPS/barometer noise (as calculateElevationStats).
    if (e - last >= 3) {
      gain += e - last;
      last = e;
    } else if (last - e >= 3) {
      last = e;
    }
  }
  return gain;
}

/** TCX course or activity → route. Throws on unreadable XML. */
export function parseTcxRoute(text: string): ParsedRouteFile {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('That TCX file isn’t valid XML.');
  }
  const byTag = (el: Element | Document, tag: string) => Array.from(el.getElementsByTagName(tag));
  const firstText = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? null;

  const trackPoints: ParsedRouteFile['trackPoints'] = [];
  let lastDistance_m: number | null = null;
  for (const tp of byTag(doc, 'Trackpoint')) {
    const lat = num(firstText(tp, 'LatitudeDegrees'));
    const lon = num(firstText(tp, 'LongitudeDegrees'));
    if (lat == null || lon == null) continue;
    const ele = num(firstText(tp, 'AltitudeMeters'));
    trackPoints.push(ele == null ? { latitude: lat, longitude: lon } : { latitude: lat, longitude: lon, elevation: ele });
    const d = num(firstText(tp, 'DistanceMeters'));
    if (d != null) lastDistance_m = d;
  }

  // A course has <Course><Name>; an activity has <Activity><Id> (a time).
  const course = byTag(doc, 'Course')[0];
  const name = course ? firstText(course, 'Name') : null;
  const lapTimes = byTag(doc, 'TotalTimeSeconds').map((e) => num(e.textContent) ?? 0);
  const duration = lapTimes.reduce((a, b) => a + b, 0);
  const elevations = trackPoints.map((p) => p.elevation).filter((e): e is number => typeof e === 'number');

  return {
    name: name?.trim() || null,
    trackPoints,
    distance_km: lastDistance_m != null ? lastDistance_m / 1000 : null,
    ascent_m: ascentOf(elevations),
    duration_s: duration > 0 ? duration : null,
  };
}

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

/** FIT course or activity → route. Throws when it isn't a FIT file. */
export function parseFitRoute(bytes: Uint8Array): ParsedRouteFile {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  if (!decoder.isFIT()) throw new Error('That isn’t a FIT file.');
  const { messages } = decoder.read({ applyScaleAndOffset: true, convertTypesToStrings: true });
  const m = messages as Record<string, Array<Record<string, unknown>> | undefined>;

  const trackPoints: ParsedRouteFile['trackPoints'] = [];
  let lastDistance_m: number | null = null;
  for (const r of m.recordMesgs ?? []) {
    const latSc = r.positionLat as number | undefined;
    const lonSc = r.positionLong as number | undefined;
    if (typeof latSc !== 'number' || typeof lonSc !== 'number') continue;
    const ele = (r.enhancedAltitude ?? r.altitude) as number | undefined;
    const point = { latitude: latSc * SEMICIRCLE_TO_DEG, longitude: lonSc * SEMICIRCLE_TO_DEG };
    trackPoints.push(typeof ele === 'number' && Number.isFinite(ele) ? { ...point, elevation: ele } : point);
    if (typeof r.distance === 'number') lastDistance_m = r.distance;
  }

  const session = m.sessionMesgs?.[0];
  const courseName = m.courseMesgs?.[0]?.name;
  const elevations = trackPoints.map((p) => p.elevation).filter((e): e is number => typeof e === 'number');
  const ascent = typeof session?.totalAscent === 'number' ? (session.totalAscent as number) : ascentOf(elevations);
  const distance_m = typeof session?.totalDistance === 'number' ? (session.totalDistance as number) : lastDistance_m;
  const duration = (session?.totalTimerTime ?? session?.totalElapsedTime) as number | undefined;

  return {
    name: typeof courseName === 'string' && courseName.trim() ? courseName.trim() : null,
    trackPoints,
    distance_km: distance_m != null ? distance_m / 1000 : null,
    ascent_m: ascent,
    duration_s: typeof duration === 'number' && duration > 0 ? duration : null,
  };
}
