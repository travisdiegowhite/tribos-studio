import { describe, it, expect } from 'vitest';
import { parseTcxRoute, parseFitRoute, routeFileKind } from '../routeFileParsers';
import { encodeFitCourse } from '../fitCourseEncoder';

const TCX_COURSE = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Courses><Course><Name>Lefthand Loop</Name>
    <Track>
      <Trackpoint><Position><LatitudeDegrees>40.0150</LatitudeDegrees><LongitudeDegrees>-105.2705</LongitudeDegrees></Position><AltitudeMeters>1600</AltitudeMeters><DistanceMeters>0</DistanceMeters></Trackpoint>
      <Trackpoint><Position><LatitudeDegrees>40.0200</LatitudeDegrees><LongitudeDegrees>-105.2800</LongitudeDegrees></Position><AltitudeMeters>1650</AltitudeMeters><DistanceMeters>1050</DistanceMeters></Trackpoint>
      <Trackpoint><Position><LatitudeDegrees>40.0250</LatitudeDegrees><LongitudeDegrees>-105.2900</LongitudeDegrees></Position><AltitudeMeters>1700</AltitudeMeters><DistanceMeters>2100</DistanceMeters></Trackpoint>
    </Track>
  </Course></Courses>
</TrainingCenterDatabase>`;

const TCX_ACTIVITY = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Biking"><Id>2026-11-20T15:00:00Z</Id>
    <Lap StartTime="2026-11-20T15:00:00Z"><TotalTimeSeconds>600</TotalTimeSeconds><Track>
      <Trackpoint><Time>2026-11-20T15:00:00Z</Time><Position><LatitudeDegrees>40.01</LatitudeDegrees><LongitudeDegrees>-105.27</LongitudeDegrees></Position></Trackpoint>
      <Trackpoint><Time>2026-11-20T15:00:05Z</Time></Trackpoint>
      <Trackpoint><Time>2026-11-20T15:10:00Z</Time><Position><LatitudeDegrees>40.02</LatitudeDegrees><LongitudeDegrees>-105.26</LongitudeDegrees></Position></Trackpoint>
    </Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`;

describe('routeFileKind', () => {
  it('knows gpx, tcx and fit by extension', () => {
    expect(routeFileKind('ride.GPX')).toBe('gpx');
    expect(routeFileKind('course.tcx')).toBe('tcx');
    expect(routeFileKind('Morning.fit')).toBe('fit');
    expect(routeFileKind('notes.kml')).toBeNull();
  });
});

describe('parseTcxRoute', () => {
  it('reads a course: name, points with elevation, distance and climbing', () => {
    const r = parseTcxRoute(TCX_COURSE);
    expect(r.name).toBe('Lefthand Loop');
    expect(r.trackPoints).toHaveLength(3);
    expect(r.trackPoints[0]).toEqual({ latitude: 40.015, longitude: -105.2705, elevation: 1600 });
    expect(r.distance_km).toBeCloseTo(2.1, 3);
    expect(r.ascent_m).toBe(100);
  });

  it('reads an activity, skipping trackpoints without a position', () => {
    const r = parseTcxRoute(TCX_ACTIVITY);
    expect(r.name).toBeNull();
    expect(r.trackPoints).toHaveLength(2);
    expect(r.duration_s).toBe(600);
  });

  it('throws on broken XML', () => {
    expect(() => parseTcxRoute('<TrainingCenterDatabase><Courses>')).toThrow(/TCX/);
  });
});

describe('parseFitRoute', () => {
  it('reads a FIT course (round trip through our own encoder)', () => {
    const coords: [number, number, number][] = [
      [-105.2705, 40.015, 1600],
      [-105.28, 40.02, 1650],
      [-105.29, 40.025, 1700],
    ];
    const bytes = encodeFitCourse({ name: 'Lefthand Loop', coordinates: coords, climbs: [] });
    const r = parseFitRoute(bytes);
    expect(r.name).toBe('Lefthand Loop');
    expect(r.trackPoints).toHaveLength(3);
    expect(r.trackPoints[1].latitude).toBeCloseTo(40.02, 5);
    expect(r.trackPoints[1].longitude).toBeCloseTo(-105.28, 5);
    expect(r.trackPoints[2].elevation).toBeCloseTo(1700, 0);
    expect(r.distance_km).toBeGreaterThan(1);
  });

  it('rejects something that is not a FIT file', () => {
    expect(() => parseFitRoute(new TextEncoder().encode('<gpx/>'))).toThrow(/FIT/);
  });
});
