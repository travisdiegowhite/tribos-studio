import { describe, it, expect } from 'vitest';
import {
  parseWayTags,
  parseBRouterMessages,
  taggedWaysFromBRouter,
  taggedWaysFromBRouterProperties,
  taggedWaysCoverage,
} from '../wayTags';
import { brouterUsesFerry } from '../ferryGuard';
import type { Coordinate } from '../../types/geo';

// A 10-vertex straight line heading east along 40.0°N, ~89 m per step.
const LINE: Coordinate[] = Array.from({ length: 10 }, (_, i) => [-105.0 + i * 0.001, 40.0]);

const HEADER = [
  'Longitude', 'Latitude', 'Elevation', 'Distance', 'CostPerKm',
  'ElevCost', 'TurnCost', 'NodeCost', 'InitialCost', 'WayTags',
  'NodeTags', 'Time', 'Energy',
];

/** BRouter emits lon/lat as integer microdegrees, as strings. */
function row(end: Coordinate, distance: number, wayTags: string) {
  return [
    String(Math.round(end[0] * 1e6)),
    String(Math.round(end[1] * 1e6)),
    '1600', String(distance), '1000', '0', '0', '0', '0', wayTags, '', '10', '0',
  ];
}

const PROPERTIES = {
  'track-length': '800',
  messages: [
    HEADER,
    row(LINE[3], 267, 'highway=track surface=gravel tracktype=grade2'),
    row(LINE[6], 267, 'highway=residential surface=asphalt maxspeed=40 cycleway=lane'),
    row(LINE[9], 267, 'highway=unclassified'),
  ],
};

describe('parseWayTags', () => {
  it('splits key=value pairs on whitespace', () => {
    expect(parseWayTags('highway=track surface=gravel')).toEqual({
      highway: 'track',
      surface: 'gravel',
    });
  });

  it('keeps values that themselves contain "="', () => {
    expect(parseWayTags('note=a=b')).toEqual({ note: 'a=b' });
  });

  it('is empty for blanks and non-strings', () => {
    expect(parseWayTags('')).toEqual({});
    expect(parseWayTags(undefined)).toEqual({});
    expect(parseWayTags(42)).toEqual({});
  });
});

describe('parseBRouterMessages', () => {
  it('parses rows by header name with microdegree coordinates', () => {
    const rows = parseBRouterMessages(PROPERTIES);
    expect(rows).toHaveLength(3);
    expect(rows[0].end[0]).toBeCloseTo(LINE[3][0], 6);
    expect(rows[0].end[1]).toBeCloseTo(40.0, 6);
    expect(rows[0].distance_m).toBe(267);
    expect(rows[0].tags.surface).toBe('gravel');
    expect(rows[1].tags.cycleway).toBe('lane');
    expect(rows[2].tags).toEqual({ highway: 'unclassified' });
  });

  it('tolerates a reordered header', () => {
    const header = ['WayTags', 'Distance', 'Latitude', 'Longitude'];
    const rows = parseBRouterMessages({
      messages: [header, ['surface=gravel', '100', '40000000', '-105000000']],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].end).toEqual([-105, 40]);
    expect(rows[0].tags.surface).toBe('gravel');
  });

  it('is empty on missing, header-only, or column-less tables', () => {
    expect(parseBRouterMessages(undefined)).toEqual([]);
    expect(parseBRouterMessages({})).toEqual([]);
    expect(parseBRouterMessages({ messages: [HEADER] })).toEqual([]);
    expect(parseBRouterMessages({ messages: [['Foo'], ['bar']] })).toEqual([]);
    expect(parseBRouterMessages({ messages: 'nope' })).toEqual([]);
  });

  it('skips rows with unparseable coordinates', () => {
    const rows = parseBRouterMessages({
      messages: [HEADER, ['x', 'y', 0, 0, 0, 0, 0, 0, 0, 'surface=gravel', '', 0, 0]],
    });
    expect(rows).toEqual([]);
  });
});

describe('taggedWaysFromBRouter', () => {
  it('slices the track into one way per row, sharing end vertices', () => {
    const ways = taggedWaysFromBRouterProperties(LINE, PROPERTIES);
    expect(ways).toHaveLength(3);
    expect(ways[0].geometry).toEqual(LINE.slice(0, 4));
    expect(ways[1].geometry).toEqual(LINE.slice(3, 7));
    expect(ways[2].geometry).toEqual(LINE.slice(6, 10));
    expect(ways.map((w) => w.tags.surface)).toEqual(['gravel', 'asphalt', undefined]);
    // Negative sequential ids never collide with real OSM way ids.
    expect(ways.map((w) => w.id)).toEqual([-1, -2, -3]);
  });

  it('matches end nodes that are slightly off the track', () => {
    const nudged: Coordinate = [LINE[3][0] + 0.0001, LINE[3][1] + 0.0001]; // ~14 m
    const rows = parseBRouterMessages({
      messages: [HEADER, row(nudged, 267, 'surface=gravel'), row(LINE[9], 533, 'surface=asphalt')],
    });
    const ways = taggedWaysFromBRouter(LINE, rows);
    expect(ways).toHaveLength(2);
    expect(ways[0].geometry).toEqual(LINE.slice(0, 4));
  });

  it('skips a row whose end node is nowhere near the track', () => {
    const rows = parseBRouterMessages({
      messages: [HEADER, row([-104.0, 41.0], 100, 'surface=gravel'), row(LINE[9], 800, 'surface=asphalt')],
    });
    const ways = taggedWaysFromBRouter(LINE, rows);
    expect(ways).toHaveLength(1);
    expect(ways[0].tags.surface).toBe('asphalt');
    expect(ways[0].geometry).toEqual(LINE);
  });

  it('walks forward only, so a self-crossing track keeps row order', () => {
    // Out-and-back: vertices 0..4 then back to 0.
    const outBack: Coordinate[] = [...LINE.slice(0, 5), ...LINE.slice(0, 4).reverse()];
    const rows = parseBRouterMessages({
      messages: [
        HEADER,
        row(LINE[4], 356, 'surface=gravel'),
        row(LINE[0], 356, 'surface=asphalt'),
      ],
    });
    const ways = taggedWaysFromBRouter(outBack, rows);
    expect(ways).toHaveLength(2);
    expect(ways[0].geometry).toEqual(outBack.slice(0, 5));
    expect(ways[1].geometry).toEqual(outBack.slice(4));
  });

  it('is empty for degenerate input', () => {
    expect(taggedWaysFromBRouter([], [])).toEqual([]);
    expect(taggedWaysFromBRouter(LINE, [])).toEqual([]);
    expect(taggedWaysFromBRouter([LINE[0]], parseBRouterMessages(PROPERTIES))).toEqual([]);
  });
});

describe('taggedWaysCoverage', () => {
  it('sums the way lengths in metres', () => {
    const ways = taggedWaysFromBRouterProperties(LINE, PROPERTIES);
    const total = taggedWaysCoverage(ways);
    // 9 steps of 0.001° longitude at 40°N ≈ 9 × 85.4 m.
    expect(total).toBeGreaterThan(740);
    expect(total).toBeLessThan(800);
  });
});

describe('ferryGuard still reads the same table', () => {
  it('detects a ferry row in a full messages table', () => {
    const withFerry = {
      messages: [...PROPERTIES.messages, row(LINE[9], 50, 'route=ferry')],
    };
    expect(brouterUsesFerry(withFerry)).toBe(true);
    expect(brouterUsesFerry(PROPERTIES)).toBe(false);
  });
});

describe('remembered tagged ways', () => {
  it('recalls by geometry, tolerating sub-metre float noise, and forgets nothing it was not told', async () => {
    const { rememberTaggedWays, recallTaggedWays, clearRememberedTaggedWays } = await import('../wayTags');
    clearRememberedTaggedWays();
    const ways = taggedWaysFromBRouterProperties(LINE, PROPERTIES);
    rememberTaggedWays(LINE, ways);
    const noisy = LINE.map(([lng, lat]) => [lng + 1e-7, lat - 1e-7] as [number, number]);
    expect(recallTaggedWays(noisy)).toEqual(ways);
    expect(recallTaggedWays(LINE.slice(0, 5))).toBeNull();
    rememberTaggedWays(LINE.slice(0, 5), []);
    expect(recallTaggedWays(LINE.slice(0, 5))).toBeNull();
    clearRememberedTaggedWays();
    expect(recallTaggedWays(LINE)).toBeNull();
  });
});
