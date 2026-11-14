import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webhookWorkoutSummary } from './__fixtures__/webhookWorkoutSummary.js';

vi.mock('../supabaseAdmin.js', () => ({ getSupabaseAdmin: () => { throw new Error('use deps.supabase'); } }));
vi.mock('../athleteProfile.js', () => ({ fetchAthleteProfile: vi.fn().mockResolvedValue({ ftp: 250 }) }));
vi.mock('../fitParser.js', () => ({ downloadAndParseFitFile: vi.fn() }));
const dedup = vi.hoisted(() => ({
  checkForDuplicate: vi.fn(),
  mergeActivityData: vi.fn(),
  takeoverActivity: vi.fn(),
}));
vi.mock('../activityDedup.js', () => dedup);
const activation = vi.hoisted(() => ({
  completeActivationStep: vi.fn().mockResolvedValue(undefined),
  enqueueProactiveInsight: vi.fn().mockResolvedValue(undefined),
  enqueueCheckIn: vi.fn().mockResolvedValue(null),
}));
vi.mock('../activation.js', () => activation);
vi.mock('../deviationProcessor.js', () => ({ enqueueDeviationAnalysis: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../trainingLoadRefresh.js', () => ({ triggerTrainingLoadRefresh: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../gearAssignment.js', () => ({ assignGearToActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../segmentAnalysisPipeline.js', () => ({ analyzeSegmentsForNewActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../metricsComputation.js', () => ({ computeAndStoreMetrics: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../fitnessSnapshots.js', () => ({ updateSnapshotForActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./tokens.js', () => ({ getValidWahooToken: vi.fn().mockResolvedValue('bearer-token') }));

const { ingestWahooWorkout } = await import('./ingest.js');

/** Fake supabase: records inserts/updates per table; `existing` is the stored Wahoo activity. */
function fakeSupabase({ existing = null, insertError = null } = {}) {
  const log = { inserts: [], updates: [] };
  return {
    log,
    from(table) {
      const q = {
        op: 'select',
        insert(row) { q.op = 'insert'; log.inserts.push({ table, row }); return q; },
        update(row) { q.op = 'update'; log.updates.push({ table, row }); return q; },
        select() { return q; },
        eq() { return q; },
        limit() { return q; },
        maybeSingle: () => Promise.resolve({ data: table === 'activities' ? existing : null, error: null }),
        single: () => Promise.resolve(
          insertError
            ? { data: null, error: { message: insertError } }
            : { data: { id: 'act-new', ...log.inserts.at(-1)?.row }, error: null },
        ),
        then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
      };
      return q;
    },
  };
}

const integration = (over = {}) => ({ id: 'int-1', user_id: 'u1', access_token: 't', token_expires_at: new Date(Date.now() + 3600e3).toISOString(), last_sync_at: '2026-11-01T00:00:00Z', ...over });
const payload = () => ({ summary: webhookWorkoutSummary().workout_summary });

let download;
beforeEach(async () => {
  vi.clearAllMocks();
  download = vi.fn().mockResolvedValue({
    polyline: 'poly',
    activityStreams: { watts: [200] },
    summary: { maxHeartRate: 175 },
    powerMetrics: { normalizedPower: 231, avgPower: 206, maxPower: 880, trainingStressScore: 88 },
  });
  dedup.checkForDuplicate.mockResolvedValue({ isDuplicate: false });
});

describe('ingestWahooWorkout', () => {
  it('inserts a new workout with FIT-derived fields and runs the live follow-ups', async () => {
    const supabase = fakeSupabase();
    const result = await ingestWahooWorkout(integration(), payload(), {
      source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download },
    });

    expect(result).toMatchObject({ status: 'inserted', activityId: 'act-new' });
    const { row } = supabase.log.inserts.find((i) => i.table === 'activities');
    expect(row).toMatchObject({ provider: 'wahoo', provider_activity_id: '1001', map_summary_polyline: 'poly', normalized_power: 231, effective_power: 231, tss: 88, rss: 88, max_heartrate: 175 });
    expect(row).not.toHaveProperty('calories');
    // FIT is fetched WITHOUT a token first, and retained under wahoo/
    expect(download.mock.calls[0][1]).toBeNull();
    expect(download.mock.calls[0][3]).toMatchObject({ keyPrefix: 'wahoo', userId: 'u1', activityId: '1001' });
    expect(activation.enqueueCheckIn).toHaveBeenCalled();
    const intUpdate = supabase.log.updates.find((u) => u.table === 'bike_computer_integrations');
    expect(intUpdate.row).toMatchObject({ status: 'active', error_message: null });
    expect(intUpdate.row).not.toHaveProperty('sync_error');
  });

  it('retries the FIT with a bearer token only when the CDN refuses', async () => {
    download.mockResolvedValueOnce({ error: 'Download failed: 403 Forbidden' });
    const supabase = fakeSupabase();
    await ingestWahooWorkout(integration(), payload(), { source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download } });
    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls[1][1]).toBe('bearer-token');
  });

  it('still imports from the summary when the FIT cannot be read', async () => {
    download.mockResolvedValue({ error: 'Download failed: 404 Not Found' });
    const supabase = fakeSupabase();
    const result = await ingestWahooWorkout(integration(), payload(), { source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download } });
    expect(result.status).toBe('inserted');
    expect(result.fitNote).toMatch(/404/);
    const { row } = supabase.log.inserts.find((i) => i.table === 'activities');
    expect(row.normalized_power).toBe(228); // device summary fallback
  });

  it('is idempotent: a re-delivered workout updates the existing row', async () => {
    const supabase = fakeSupabase({ existing: { id: 'act-old', start_date: '2026-11-14T15:00:00Z' } });
    const result = await ingestWahooWorkout(integration(), payload(), { source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download } });
    expect(result).toMatchObject({ status: 'updated', activityId: 'act-old' });
    expect(supabase.log.inserts).toHaveLength(0);
    const upd = supabase.log.updates.find((u) => u.table === 'activities');
    expect(upd.row).not.toHaveProperty('user_id');
    expect(upd.row).not.toHaveProperty('provider_activity_id');
    expect(activation.enqueueCheckIn).not.toHaveBeenCalled();
  });

  it('manual sync skips already-imported workouts without downloading', async () => {
    const supabase = fakeSupabase({ existing: { id: 'act-old' } });
    const result = await ingestWahooWorkout(integration(), payload(), {
      source: 'wahoo_manual_sync', skipExisting: true, deps: { supabase, downloadAndParseFitFile: download },
    });
    expect(result.status).toBe('unchanged');
    expect(download).not.toHaveBeenCalled();
  });

  it('takes over a lower-priority copy (e.g. Strava) of the same ride', async () => {
    dedup.checkForDuplicate.mockResolvedValue({ isDuplicate: true, shouldTakeover: true, existingActivity: { id: 'act-strava', provider: 'strava' } });
    dedup.takeoverActivity.mockResolvedValue({ success: true });
    const supabase = fakeSupabase();
    const result = await ingestWahooWorkout(integration(), payload(), { source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download } });
    expect(result).toMatchObject({ status: 'takeover', activityId: 'act-strava' });
    expect(dedup.takeoverActivity).toHaveBeenCalledWith('act-strava', expect.any(Object), 'wahoo', '1001');
    const extra = supabase.log.updates.find((u) => u.table === 'activities');
    expect(extra.row).toMatchObject({ activity_streams: { watts: [200] }, tss: 88 });
  });

  it('merges into a higher-priority copy (e.g. Garmin) instead of duplicating', async () => {
    dedup.checkForDuplicate.mockResolvedValue({ isDuplicate: true, shouldTakeover: false, existingActivity: { id: 'act-garmin', provider: 'garmin' } });
    const supabase = fakeSupabase();
    const result = await ingestWahooWorkout(integration(), payload(), { source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download } });
    expect(result).toMatchObject({ status: 'merged', activityId: 'act-garmin' });
    expect(dedup.mergeActivityData).toHaveBeenCalledWith('act-garmin', expect.any(Object), 'wahoo');
    expect(supabase.log.inserts).toHaveLength(0);
  });

  it('turns Strava auto-import off only on the FIRST successful import', async () => {
    const first = fakeSupabase();
    await ingestWahooWorkout(integration({ last_sync_at: null }), payload(), { source: 'wahoo_webhook', deps: { supabase: first, downloadAndParseFitFile: download } });
    expect(first.log.updates.find((u) => u.table === 'user_profiles')?.row).toEqual({ strava_auto_sync_enabled: false });

    const later = fakeSupabase();
    await ingestWahooWorkout(integration(), payload(), { source: 'wahoo_webhook', deps: { supabase: later, downloadAndParseFitFile: download } });
    expect(later.log.updates.some((u) => u.table === 'user_profiles')).toBe(false);
  });

  it('throws on an insert failure so the webhook returns 5xx and Wahoo retries', async () => {
    const supabase = fakeSupabase({ insertError: 'connection reset' });
    await expect(
      ingestWahooWorkout(integration({ last_sync_at: null }), payload(), { source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download } }),
    ).rejects.toThrow(/insert failed/);
    expect(supabase.log.updates.some((u) => u.table === 'user_profiles')).toBe(false);
  });

  it('skips sports it does not import', async () => {
    const body = webhookWorkoutSummary({ workout_summary: { workout: { workout_type_id: 25 } } });
    const supabase = fakeSupabase();
    const result = await ingestWahooWorkout(integration(), { summary: body.workout_summary }, { source: 'wahoo_webhook', deps: { supabase, downloadAndParseFitFile: download } });
    expect(result.status).toBe('skipped');
    expect(download).not.toHaveBeenCalled();
  });
});
