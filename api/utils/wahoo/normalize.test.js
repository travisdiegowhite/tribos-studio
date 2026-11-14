import { describe, it, expect } from 'vitest';
import { buildWahooActivity, fitResultToActivityFields, num, splitWahooPayload, toLocalFakeUtc } from './normalize.js';
import { mapWahooWorkoutType } from './workoutTypes.js';
import { checkWahooFileUrl } from './fileHosts.js';
import { webhookWorkoutSummary } from './__fixtures__/webhookWorkoutSummary.js';

const PROD = { VERCEL_ENV: 'production' };

function build(body = webhookWorkoutSummary(), extra = {}) {
  const { summary, workout } = splitWahooPayload({ summary: body.workout_summary });
  return buildWahooActivity({ userId: 'u1', summary, workout, source: 'wahoo_webhook', ...extra });
}

describe('mapWahooWorkoutType', () => {
  it('maps the numeric workout_type_id, not a string type', () => {
    expect(mapWahooWorkoutType(0)).toMatchObject({ type: 'Ride', trainer: false });
    expect(mapWahooWorkoutType(12)).toMatchObject({ type: 'VirtualRide', trainer: true });
    expect(mapWahooWorkoutType(61)).toMatchObject({ type: 'VirtualRide', trainer: true });
    expect(mapWahooWorkoutType(13)).toMatchObject({ type: 'MountainBikeRide' });
    expect(mapWahooWorkoutType(64)).toMatchObject({ type: 'EBikeRide' });
    expect(mapWahooWorkoutType(1)).toMatchObject({ type: 'Run', trainer: false });
    expect(mapWahooWorkoutType(4)).toMatchObject({ type: 'TrailRun' });
    expect(mapWahooWorkoutType(5)).toMatchObject({ type: 'Run', trainer: true });
    expect(mapWahooWorkoutType('15')).toMatchObject({ type: 'Ride' });
  });

  it('skips sports we do not import and garbage', () => {
    for (const id of [6, 9, 25, 42, 66, 255, null, undefined, '', 'cycling', 1.5]) {
      expect(mapWahooWorkoutType(id)).toBeNull();
    }
  });
});

describe('buildWahooActivity', () => {
  it('reads the nested webhook shape and parses string decimals', () => {
    const { row, skipReason } = build();
    expect(skipReason).toBeNull();
    expect(row).toMatchObject({
      user_id: 'u1',
      provider: 'wahoo',
      provider_activity_id: '1001',
      name: 'Morning Ride',
      type: 'Ride',
      sport_type: 'Ride',
      start_date: '2026-11-14T15:00:00.000Z',
      distance: 42195.3,
      moving_time: 5400,
      elapsed_time: 5520,
      total_elevation_gain: 412,
      average_speed: 7.81,
      average_watts: 205.3,
      average_heartrate: 142.7,
      average_cadence: 86.4,
      kilojoules: 1108.62,
      trainer: false,
      imported_from: 'wahoo_webhook',
    });
    expect(Number.isInteger(row.moving_time)).toBe(true);
  });

  it('never writes columns activities does not have', () => {
    const { row } = build();
    expect(row).not.toHaveProperty('calories');
    expect(row).not.toHaveProperty('sync_error');
  });

  it('dual-writes NP/EP and TSS/RSS from the device summary', () => {
    const { row } = build(webhookWorkoutSummary(), { ftp: 250 });
    expect(row.normalized_power).toBe(228);
    expect(row.effective_power).toBe(228);
    expect(row.tss).toBe(86.5);
    expect(row.rss).toBe(86.5);
    expect(row.ride_intensity).toBeCloseTo(0.912, 3);
    expect(row.intensity_factor).toBe(row.ride_intensity);
  });

  it('omits power metrics a run does not have instead of writing nulls', () => {
    const body = webhookWorkoutSummary({
      workout_summary: { name: null, power_bike_np_last: null, power_bike_tss_last: null, power_avg: null, workout: { workout_type_id: 1, name: '' } },
    });
    const { row } = build(body);
    expect(row.type).toBe('Run');
    expect(row.name).toBe('Wahoo run');
    for (const k of ['normalized_power', 'effective_power', 'tss', 'rss', 'average_watts']) {
      expect(row).not.toHaveProperty(k);
    }
  });

  it('writes start_date_local as fake-UTC wall time in the workout time zone', () => {
    const { row } = build();
    // 15:00Z in Denver (MST, UTC-7 in November) is 08:00 local.
    expect(row.start_date_local).toBe('2026-11-14T08:00:00.000Z');
  });

  it('keeps the payload in raw_data with the Wahoo type name', () => {
    const { row } = build();
    expect(row.raw_data.wahoo_type).toBe('BIKING');
  });

  it('skips unsupported sports, missing ids and workouts with no summary', () => {
    expect(build(webhookWorkoutSummary({ workout_summary: { workout: { workout_type_id: 25 } } })).row).toBeNull();
    expect(build(webhookWorkoutSummary({ workout_summary: { workout: { id: null } } })).skipReason).toBe('missing workout id');
    const listItem = { id: 7, starts: '2026-11-01T10:00:00Z', workout_type_id: 0, workout_summary: null };
    const { summary, workout } = splitWahooPayload({ workout: listItem });
    expect(buildWahooActivity({ userId: 'u1', summary, workout, source: 'wahoo_manual_sync' }).skipReason)
      .toBe('no workout_summary yet');
  });

  it('reads the GET /v1/workouts list shape (summary nested in the workout)', () => {
    const body = webhookWorkoutSummary();
    const { workout: nested, ...summary } = body.workout_summary;
    const listItem = { ...nested, workout_summary: summary };
    const split = splitWahooPayload({ workout: listItem });
    const { row } = buildWahooActivity({ userId: 'u1', ...split, source: 'wahoo_manual_sync' });
    expect(row.provider_activity_id).toBe('1001');
    expect(row.distance).toBe(42195.3);
  });
});

describe('helpers', () => {
  it('num parses Wahoo strings and rejects junk', () => {
    expect(num('450.00')).toBe(450);
    expect(num(12)).toBe(12);
    expect(num('')).toBeNull();
    expect(num('abc')).toBeNull();
    expect(num(null)).toBeNull();
  });

  it('toLocalFakeUtc returns null for an unknown or missing zone', () => {
    expect(toLocalFakeUtc('2026-11-14T15:00:00Z', 'Not/AZone')).toBeNull();
    expect(toLocalFakeUtc('2026-11-14T15:00:00Z', null)).toBeNull();
  });

  it('fitResultToActivityFields applies stream-derived power over the summary', () => {
    const fields = fitResultToActivityFields({
      polyline: 'abc',
      activityStreams: { watts: [1] },
      summary: { maxHeartRate: 181, maxSpeed: 15.2 },
      powerMetrics: { avgPower: 210, normalizedPower: 231, maxPower: 900, trainingStressScore: 88, intensityFactor: 0.92, workKj: 1110 },
      fit_storage_path: 'wahoo/u1/1001.fit',
    }, 250);
    expect(fields).toMatchObject({
      map_summary_polyline: 'abc',
      max_heartrate: 181,
      normalized_power: 231,
      effective_power: 231,
      tss: 88,
      rss: 88,
      intensity_factor: 0.92,
      ride_intensity: 0.92,
      max_watts: 900,
      kilojoules: 1110,
      device_watts: true,
      fit_storage_path: 'wahoo/u1/1001.fit',
    });
    expect(fitResultToActivityFields({ error: 'Download failed: 404' })).toEqual({});
  });
});

describe('checkWahooFileUrl', () => {
  it('allows Wahoo hosts in production and refuses others', () => {
    expect(checkWahooFileUrl('https://cdn.wahooligan.com/x.fit', PROD).allowed).toBe(true);
    expect(checkWahooFileUrl('https://wahooligan.com/x.fit', PROD).allowed).toBe(true);
    expect(checkWahooFileUrl('https://evil.example.com/x.fit', PROD).allowed).toBe(false);
    expect(checkWahooFileUrl('https://wahooligan.com.evil.example/x.fit', PROD).allowed).toBe(false);
    expect(checkWahooFileUrl('http://cdn.wahooligan.com/x.fit', PROD).allowed).toBe(false);
    expect(checkWahooFileUrl('http://169.254.169.254/latest', PROD).allowed).toBe(false);
  });

  it('honours WAHOO_FILE_HOSTS and relaxes outside production', () => {
    expect(checkWahooFileUrl('https://files.newcdn.net/x.fit', { ...PROD, WAHOO_FILE_HOSTS: 'newcdn.net' }).allowed).toBe(true);
    expect(checkWahooFileUrl('https://example.supabase.co/x.fit', { VERCEL_ENV: 'preview' }).allowed).toBe(true);
    expect(checkWahooFileUrl('http://example.supabase.co/x.fit', { VERCEL_ENV: 'preview' }).allowed).toBe(false);
  });
});
