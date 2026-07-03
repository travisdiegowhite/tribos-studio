import { describe, it, expect } from 'vitest';
import { generateGPX, generateTCX } from './routeExport';
import type { RouteData } from './routeExport';

const COORDS_3D: [number, number, number][] = [
  [-105.2705, 40.015, 1655.2],
  [-105.28, 40.02, 1672.8],
  [-105.29, 40.025, 1690.1],
];

const COORDS_2D: [number, number][] = COORDS_3D.map(([lng, lat]) => [lng, lat]);

const baseRoute = (coordinates: RouteData['coordinates']): RouteData => ({
  name: 'Test Route',
  coordinates,
  distanceKm: 3.2,
  elevationGainM: 35,
});

describe('generateGPX', () => {
  it('writes per-point elevation for [lng, lat, ele] coordinates', () => {
    const gpx = generateGPX(baseRoute(COORDS_3D));
    expect(gpx).toContain('<ele>1655.2</ele>');
    expect(gpx).toContain('<ele>1672.8</ele>');
    expect(gpx).toContain('<ele>1690.1</ele>');
  });

  it('falls back to 0.0 elevation for 2-tuple coordinates', () => {
    const gpx = generateGPX(baseRoute(COORDS_2D));
    expect(gpx).toContain('<ele>0.0</ele>');
    expect(gpx).not.toContain('<ele>1655.2</ele>');
  });

  it('writes lat/lon for every track point', () => {
    const gpx = generateGPX(baseRoute(COORDS_3D));
    const trkpts = gpx.match(/<trkpt /g) ?? [];
    expect(trkpts.length).toBe(COORDS_3D.length);
    expect(gpx).toContain('lat="40.0150000" lon="-105.2705000"');
  });
});

describe('generateTCX', () => {
  it('writes AltitudeMeters for [lng, lat, ele] coordinates', () => {
    const tcx = generateTCX(baseRoute(COORDS_3D));
    expect(tcx).toContain('<AltitudeMeters>1655.2</AltitudeMeters>');
    expect(tcx).toContain('<AltitudeMeters>1690.1</AltitudeMeters>');
  });

  it('emits turn CoursePoints from provider cues', () => {
    const tcx = generateTCX({
      ...baseRoute(COORDS_2D),
      cues: [
        {
          type: 1,
          direction: 'depart',
          instruction: 'Head north on Main St.',
          streetNames: ['Main St'],
          distance_km: 0,
          coordinate: [-105.2705, 40.015],
        },
        {
          type: 15,
          direction: 'left',
          instruction: 'Turn left onto Oak Ave.',
          streetNames: ['Oak Ave'],
          distance_km: 1.2,
          coordinate: [-105.28, 40.02],
        },
        {
          type: 10,
          direction: 'right',
          instruction: 'Turn right onto Pine Rd.',
          streetNames: ['Pine Rd'],
          distance_km: 2.4,
          coordinate: [-105.29, 40.025],
        },
      ],
    });
    expect(tcx).toContain('<PointType>Left</PointType>');
    expect(tcx).toContain('<PointType>Right</PointType>');
    expect(tcx).toContain('Turn left onto Oak Ave.');
    // Depart/continue noise is filtered from the cue sheet.
    expect(tcx).not.toContain('Head north on Main St.');
  });
});
