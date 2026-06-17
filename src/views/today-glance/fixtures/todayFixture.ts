/**
 * One coherent `Today` fixture for static-wiring the glance (build phase 2)
 * and for tests. Deliberately internally consistent — a Tempo block day, a
 * tempo prescription, a matched gravel route, a "fresh / building" clearance,
 * and a coach take that agrees with all of it. (The old mocks were
 * inconsistent; that inconsistency is the source-of-truth bug the redesign
 * fixes, so the fixture must not reproduce it.)
 */

import type { Today } from '../types';

// A small, recognizable loop near Boulder, CO — [lng, lat] canonical.
const LOOP: number[][] = [
  [-105.2705, 40.015],
  [-105.262, 40.02],
  [-105.25, 40.018],
  [-105.245, 40.027],
  [-105.255, 40.034],
  [-105.27, 40.032],
  [-105.2785, 40.025],
  [-105.2705, 40.015],
];

export const todayFixture: Today = {
  date: '2026-06-17',
  heroState: 'matched',
  prescription: {
    type: 'tempo',
    title: 'Tempo Intervals',
    durationMin: 75,
    targetRSS: 90,
    structure: '3x12min @ tempo, 5min recovery',
    workoutId: 'fixture-workout-1',
  },
  route: {
    id: 'fixture-route-1',
    name: 'Lefthand Canyon Loop',
    geojson: { type: 'LineString', coordinates: LOOP },
    polyline: null,
    distanceKm: 38.4,
    elevationGainM: 420,
    matchPct: 100,
    intervalSegments: [
      { startFraction: 0.18, endFraction: 0.34, kind: 'work', zone: 'tempo' },
      { startFraction: 0.46, endFraction: 0.62, kind: 'work', zone: 'tempo' },
      { startFraction: 0.72, endFraction: 0.88, kind: 'work', zone: 'tempo' },
    ],
    start: [-105.2705, 40.015],
  },
  coach: {
    personaId: 'pragmatist',
    personaName: 'The Pragmatist',
    oneLineTake:
      'You’re fresh and the block is building — hold the tempo blocks steady and let the climbs do the work.',
  },
  athleteState: {
    fs: 8,
    tfi: 62,
    afi: 54,
    formBand: 'fresh',
    formWord: 'Sweet spot',
    formColor: '#2A8C82',
    formRampPos: 0.63,
    confidenceTier: 'high',
  },
  planContext: {
    blockName: 'Tempo block',
    dayIndex: 2,
    dayTotal: 5,
    chipLabel: 'Tempo block · Day 2 of 5',
  },
  ribbon: [
    { date: '2026-06-11', kind: 'ride' },
    { date: '2026-06-12', kind: 'rest' },
    { date: '2026-06-13', kind: 'ride' },
    { date: '2026-06-14', kind: 'run' },
    { date: '2026-06-15', kind: 'ride' },
    { date: '2026-06-16', kind: 'rest' },
    { date: '2026-06-17', kind: 'today' },
  ],
};
