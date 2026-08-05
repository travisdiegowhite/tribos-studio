/**
 * Tests for the activity-stream normalization layer that feeds the flagship
 * activity chart: source-resolution ladder, per-shape normalizers (real,
 * pause-honest time axes), and payload decimation.
 */

import { describe, it, expect } from 'vitest';
import {
  STREAM_SHAPE_VERSION,
  MAX_STREAM_SAMPLES,
  streamCachePath,
  hasFaithfulStoredStreams,
  resolveStreamSource,
  detectSampleSeconds,
  normalizeFromFitDataPoints,
  normalizeFromStoredStreams,
  normalizeFromStravaStreams,
  normalizeFromCoachContext,
  normalizeSimplifiedStreams,
  decimateToCap,
} from './activityStreams.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** 1 Hz FIT-style points with a 60 s autopause gap after the 10th sample. */
function fitPointsWithPause() {
  const start = Date.parse('2026-08-01T09:00:00Z');
  const points = [];
  for (let i = 0; i < 20; i++) {
    const gap = i >= 10 ? 60_000 : 0; // pause between sample 9 and 10
    points.push({
      timestamp: new Date(start + i * 1000 + gap).toISOString(),
      power: 200 + i,
      heartRate: 140,
      cadence: 90,
      speed: 8.333333,
      distance: i * 8.3333,
      elevation: 1600.04 + i,
      latitude: 40.0 + i * 0.0001,
      longitude: -105.3 - i * 0.0001,
    });
  }
  return points;
}

const coachContext = {
  interval_seconds: 10,
  time_series: [
    { t: 0, power: 180, hr: 130, cadence: 85 },
    { t: 10, power: 0, hr: 132, cadence: 0 },
    { t: 20, power: 250, hr: 140, cadence: 95 },
  ],
};

const stravaStreams = {
  time: { data: [0, 1, 2, 3, 5] }, // gap at pause between 3 and 5
  watts: { data: [100, 3000, 250, null, 220] }, // 3000 = sentinel-invalid
  heartrate: { data: [120, 121, 122, 123, 124] },
  cadence: { data: [80, 81, 82, 83, 84] },
  velocity_smooth: { data: [7.123456, 7.2, 7.3, 7.4, 7.5] },
  altitude: { data: [1500.06, 1500.1, 1500.2, 1500.3, 1500.4] },
  distance: { data: [0, 7.12, 14.3, 21.5, 35.9] },
  latlng: { data: [[40.0, -105.3], [40.0001, -105.3001], null, [40.0003, -105.3003], [40.0004, -105.3004]] },
};

const simplifiedStreams = {
  coords: [[-105.3, 40.0], [-105.31, 40.01], [-105.32, 40.02]],
  power: [200, 210, 220],
  heartRate: [140, 141, 142],
  elevation: [1600, 1610, 1620],
  speed: [8.0, 8.1, 8.2],
};

// ── Source resolution ladder ────────────────────────────────────────────────

describe('resolveStreamSource', () => {
  it('prefers fit_storage above everything', () => {
    expect(
      resolveStreamSource({
        fit_storage_path: 'garmin/u/a.fit',
        activity_streams: simplifiedStreams,
        stravaId: '123',
      }).kind
    ).toBe('fit_storage');
  });

  it('serves faithful 1Hz stored streams (indoor path)', () => {
    const row = {
      moving_time: 3600,
      activity_streams: { power: new Array(3500).fill(150) },
    };
    expect(resolveStreamSource(row).kind).toBe('stored_streams');
  });

  it('rejects simplified streams as a time series and falls to Strava', () => {
    const row = {
      moving_time: 7200,
      activity_streams: { power: new Array(700).fill(150), coords: [[0, 0]] },
      stravaId: '9876',
    };
    const source = resolveStreamSource(row);
    expect(source.kind).toBe('strava_api');
    expect(source.stravaId).toBe('9876');
  });

  it('falls to coach context when no Strava id (Wahoo-shaped row)', () => {
    const row = {
      moving_time: 7200,
      fit_coach_context: coachContext,
    };
    expect(resolveStreamSource(row).kind).toBe('fit_coach_context');
  });

  it('falls to simplified streams as last data-bearing tier', () => {
    const row = {
      moving_time: 7200,
      activity_streams: { power: new Array(700).fill(150) },
    };
    expect(resolveStreamSource(row).kind).toBe('activity_streams');
  });

  it('returns none for a summary-only row', () => {
    expect(resolveStreamSource({ moving_time: 3600 }).kind).toBe('none');
  });
});

describe('hasFaithfulStoredStreams', () => {
  it('uses the 0.8 × moving_time threshold', () => {
    const streams = (n) => ({ activity_streams: { power: new Array(n).fill(1) }, moving_time: 1000 });
    expect(hasFaithfulStoredStreams(streams(800))).toBe(true);
    expect(hasFaithfulStoredStreams(streams(799))).toBe(false);
  });

  it('checks HR-only streams too (power-less indoor rides)', () => {
    expect(
      hasFaithfulStoredStreams({
        activity_streams: { heartRate: new Array(900).fill(120) },
        moving_time: 1000,
      })
    ).toBe(true);
  });

  it('is false without moving_time or streams', () => {
    expect(hasFaithfulStoredStreams({ moving_time: 1000 })).toBe(false);
    expect(hasFaithfulStoredStreams({ activity_streams: { power: [1, 2] } })).toBe(false);
  });
});

// ── Normalizers ─────────────────────────────────────────────────────────────

describe('normalizeFromFitDataPoints', () => {
  it('builds a real time axis that jumps across pauses (no uniform spread)', () => {
    const payload = normalizeFromFitDataPoints(fitPointsWithPause());
    expect(payload.tier).toBe('per_second');
    expect(payload.source).toBe('fit_storage');
    expect(payload.t[9]).toBe(9);
    expect(payload.t[10]).toBe(70); // 10 s elapsed + 60 s pause
    expect(payload.t[19]).toBe(79);
  });

  it('detects 1 Hz sampling despite the pause gap', () => {
    const payload = normalizeFromFitDataPoints(fitPointsWithPause());
    expect(payload.sample_seconds).toBe(1);
  });

  it('emits canonical [lng, lat] coords rounded to 5 dp', () => {
    const payload = normalizeFromFitDataPoints(fitPointsWithPause());
    expect(payload.coords[0]).toEqual([-105.3, 40.0]);
    expect(payload.coords[5][0]).toBeCloseTo(-105.3005, 5);
  });

  it('rounds floats (elevation 1dp, speed 2dp)', () => {
    const payload = normalizeFromFitDataPoints(fitPointsWithPause());
    expect(payload.elevation_m[0]).toBe(1600.0);
    expect(payload.speed_mps[0]).toBe(8.33);
  });

  it('omits series with no data and returns null for <2 points', () => {
    const points = fitPointsWithPause().map((p) => ({ ...p, heartRate: null }));
    const payload = normalizeFromFitDataPoints(points);
    expect(payload.hr).toBeUndefined();
    expect(normalizeFromFitDataPoints([fitPointsWithPause()[0]])).toBeNull();
    expect(normalizeFromFitDataPoints([])).toBeNull();
  });

  it('drops points with unparseable timestamps', () => {
    const points = fitPointsWithPause();
    points[3] = { ...points[3], timestamp: 'not-a-date' };
    const payload = normalizeFromFitDataPoints(points);
    expect(payload.t).toHaveLength(19);
  });
});

describe('normalizeFromStoredStreams', () => {
  it('produces an index time axis at 1 Hz', () => {
    const payload = normalizeFromStoredStreams({
      power: [100, 110, 120],
      heartRate: [130, 131, 132],
    });
    expect(payload.tier).toBe('streams_1hz');
    expect(payload.t).toEqual([0, 1, 2]);
    expect(payload.sample_seconds).toBe(1);
    expect(payload.hr).toEqual([130, 131, 132]);
  });

  it('pads shorter arrays with nulls to keep arrays parallel', () => {
    const payload = normalizeFromStoredStreams({
      power: [100, 110, 120],
      heartRate: [130],
    });
    expect(payload.hr).toEqual([130, null, null]);
  });

  it('returns null when empty', () => {
    expect(normalizeFromStoredStreams({})).toBeNull();
    expect(normalizeFromStoredStreams(null)).toBeNull();
  });
});

describe('normalizeFromStravaStreams', () => {
  it('uses the Strava time stream verbatim (pause gaps preserved)', () => {
    const payload = normalizeFromStravaStreams(stravaStreams);
    expect(payload.tier).toBe('per_second');
    expect(payload.source).toBe('strava_api');
    expect(payload.t).toEqual([0, 1, 2, 3, 5]);
  });

  it('nulls sentinel-invalid power values', () => {
    const payload = normalizeFromStravaStreams(stravaStreams);
    expect(payload.power).toEqual([100, null, 250, null, 220]);
  });

  it('flips latlng to canonical [lng, lat]', () => {
    const payload = normalizeFromStravaStreams(stravaStreams);
    expect(payload.coords[0]).toEqual([-105.3, 40.0]);
    expect(payload.coords[2]).toBeNull();
  });

  it('returns null without a time stream', () => {
    expect(normalizeFromStravaStreams({ watts: { data: [1, 2, 3] } })).toBeNull();
  });
});

describe('normalizeFromCoachContext', () => {
  it('carries the real resampled axis and preserves power zeros', () => {
    const payload = normalizeFromCoachContext(coachContext);
    expect(payload.tier).toBe('coach_ts');
    expect(payload.sample_seconds).toBe(10);
    expect(payload.t).toEqual([0, 10, 20]);
    expect(payload.power).toEqual([180, 0, 250]);
  });

  it('returns null for missing/short series', () => {
    expect(normalizeFromCoachContext(null)).toBeNull();
    expect(normalizeFromCoachContext({ time_series: [{ t: 0 }] })).toBeNull();
  });
});

describe('normalizeSimplifiedStreams', () => {
  it('has NO time axis — simplified points must not fake a clock', () => {
    const payload = normalizeSimplifiedStreams(simplifiedStreams);
    expect(payload.tier).toBe('simplified');
    expect(payload.t).toBeUndefined();
    expect(payload.sample_seconds).toBeNull();
    expect(payload.coords).toHaveLength(3);
    expect(payload.power).toEqual([200, 210, 220]);
  });

  it('returns null when there is nothing to chart', () => {
    expect(normalizeSimplifiedStreams({})).toBeNull();
    expect(normalizeSimplifiedStreams({ coords: [[0, 0]] })).toBeNull();
  });
});

// ── Sampling detection & decimation ─────────────────────────────────────────

describe('detectSampleSeconds', () => {
  it('detects a regular interval', () => {
    expect(detectSampleSeconds([0, 5, 10, 15, 20])).toBe(5);
  });

  it('tolerates up to 10% irregular deltas (pauses)', () => {
    const t = Array.from({ length: 100 }, (_, i) => i);
    t[99] = 199; // one big pause among 99 deltas
    expect(detectSampleSeconds(t)).toBe(1);
  });

  it('returns null for irregular axes', () => {
    expect(detectSampleSeconds([0, 1, 3, 7, 20])).toBeNull();
    expect(detectSampleSeconds([0, 1])).toBeNull();
  });
});

describe('decimateToCap', () => {
  const bigPayload = () => {
    const n = 50_000;
    return {
      version: STREAM_SHAPE_VERSION,
      tier: 'per_second',
      source: 'fit_storage',
      sample_seconds: 1,
      t: Array.from({ length: n }, (_, i) => i),
      power: Array.from({ length: n }, (_, i) => 100 + (i % 50)),
    };
  };

  it('leaves payloads under the cap untouched', () => {
    const small = { t: [0, 1, 2], power: [1, 2, 3], sample_seconds: 1 };
    expect(decimateToCap(small)).toBe(small);
  });

  it('strides down to the cap, keeping first and last samples with real t', () => {
    const out = decimateToCap(bigPayload(), MAX_STREAM_SAMPLES);
    expect(out.t.length).toBeLessThanOrEqual(MAX_STREAM_SAMPLES + 1);
    expect(out.t[0]).toBe(0);
    expect(out.t[out.t.length - 1]).toBe(49_999);
    expect(out.decimated).toBe(true);
    expect(out.power.length).toBe(out.t.length); // arrays stay parallel
  });

  it('scales sample_seconds by the stride', () => {
    const out = decimateToCap(bigPayload(), MAX_STREAM_SAMPLES);
    expect(out.sample_seconds).toBe(Math.ceil(50_000 / MAX_STREAM_SAMPLES));
  });
});

describe('streamCachePath', () => {
  it('bakes the shape version into the key', () => {
    expect(streamCachePath('user-1', 'act-2')).toBe(`user-1/act-2.v${STREAM_SHAPE_VERSION}.json`);
  });
});
