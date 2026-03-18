/**
 * FIT Course Encoder
 *
 * Converts RouteData → FIT binary Uint8Array using @garmin/fitsdk.
 * Produces course files that can be loaded onto Garmin, Wahoo, and
 * Hammerhead devices for turn-by-turn navigation.
 *
 * FIT message sequence:
 *   1. file_id (type=course)
 *   2. course (name, sport)
 *   3. event (timer start)
 *   4. record × N (timestamp, position, altitude, distance)
 *   5. lap (summary of entire course)
 *   6. event (timer stop)
 *   7. course_point × M (waypoints with position, name, type)
 *
 * Coordinates use FIT semicircle convention: degrees × (2^31 / 180)
 */

// @ts-expect-error — @garmin/fitsdk has no type declarations
import { Encoder } from '@garmin/fitsdk';
import type { RouteData } from './routeExport';

// ============================================================================
// FIT CONSTANTS
// ============================================================================

const MESG_NUM_FILE_ID = 0;
const MESG_NUM_LAP = 19;
const MESG_NUM_RECORD = 20;
const MESG_NUM_EVENT = 21;
const MESG_NUM_COURSE = 31;
const MESG_NUM_COURSE_POINT = 32;

/** FIT semicircle conversion factor */
const SEMICIRCLES_PER_DEGREE = Math.pow(2, 31) / 180;

/** Average cycling speed in m/s (20 km/h) for synthetic timestamps */
const AVG_SPEED_MPS = 20 * 1000 / 3600;

// ============================================================================
// HELPERS
// ============================================================================

function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * SEMICIRCLES_PER_DEGREE);
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Map waypoint type to FIT CoursePoint type string.
 */
function mapCoursePointType(type?: string): string {
  switch (type) {
    case 'poi':
      return 'summit';
    default:
      return 'generic';
  }
}

// ============================================================================
// MAIN ENCODER
// ============================================================================

/**
 * Encode route data into a FIT course binary file.
 * Returns a Uint8Array ready for download.
 */
export function encodeFitCourse(route: RouteData): Uint8Array {
  const encoder = new Encoder();
  const coords = route.coordinates;

  // Build cumulative distances and synthetic timestamps
  const baseTime = new Date('2024-01-01T00:00:00Z');
  const cumulativeDistances: number[] = [0];

  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    cumulativeDistances.push(
      cumulativeDistances[i - 1] + haversineDistance(lat1, lng1, lat2, lng2)
    );
  }

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
  const totalTimeSeconds = totalDistance > 0 ? totalDistance / AVG_SPEED_MPS : 0;

  function timestampAtIndex(i: number): Date {
    const elapsed = totalDistance > 0
      ? (cumulativeDistances[i] / totalDistance) * totalTimeSeconds
      : 0;
    return new Date(baseTime.getTime() + elapsed * 1000);
  }

  // 1. file_id
  encoder.writeMesg({
    mesgNum: MESG_NUM_FILE_ID,
    type: 'course',
    manufacturer: 1,
    product: 0,
    serialNumber: 0,
    timeCreated: new Date(),
  });

  // 2. course
  encoder.writeMesg({
    mesgNum: MESG_NUM_COURSE,
    name: (route.name || 'Course').substring(0, 15),
    sport: 'cycling',
  });

  // 3. event — timer start
  encoder.writeMesg({
    mesgNum: MESG_NUM_EVENT,
    event: 'timer',
    eventType: 'start',
    timestamp: baseTime,
  });

  // 4. record messages (one per coordinate)
  for (let i = 0; i < coords.length; i++) {
    const coord = coords[i];
    const [lng, lat] = coord;
    const ele = coord.length === 3 ? (coord as [number, number, number])[2] : 0;

    encoder.writeMesg({
      mesgNum: MESG_NUM_RECORD,
      timestamp: timestampAtIndex(i),
      positionLat: degreesToSemicircles(lat),
      positionLong: degreesToSemicircles(lng),
      altitude: ele,
      distance: cumulativeDistances[i],
    });
  }

  // 5. lap (single lap covering entire course)
  const firstCoord = coords[0];
  const lastCoord = coords[coords.length - 1];

  encoder.writeMesg({
    mesgNum: MESG_NUM_LAP,
    timestamp: timestampAtIndex(coords.length - 1),
    startTime: baseTime,
    startPositionLat: degreesToSemicircles(firstCoord[1]),
    startPositionLong: degreesToSemicircles(firstCoord[0]),
    endPositionLat: degreesToSemicircles(lastCoord[1]),
    endPositionLong: degreesToSemicircles(lastCoord[0]),
    totalDistance: totalDistance,
    totalTimerTime: totalTimeSeconds,
    totalElapsedTime: totalTimeSeconds,
  });

  // 6. event — timer stop
  encoder.writeMesg({
    mesgNum: MESG_NUM_EVENT,
    event: 'timer',
    eventType: 'stopAll',
    timestamp: timestampAtIndex(coords.length - 1),
  });

  // 7. course_point messages (waypoints)
  if (route.waypoints && route.waypoints.length > 0) {
    for (const wp of route.waypoints) {
      // Find nearest coordinate to determine timestamp
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const [lng, lat] = coords[i];
        const d = haversineDistance(wp.lat, wp.lng, lat, lng);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }

      encoder.writeMesg({
        mesgNum: MESG_NUM_COURSE_POINT,
        timestamp: timestampAtIndex(nearestIdx),
        positionLat: degreesToSemicircles(wp.lat),
        positionLong: degreesToSemicircles(wp.lng),
        name: (wp.name || 'Waypoint').substring(0, 16),
        type: mapCoursePointType(wp.type),
      });
    }
  }

  return encoder.close();
}
