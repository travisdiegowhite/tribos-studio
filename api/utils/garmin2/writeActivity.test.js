import { describe, it, expect, vi } from 'vitest';
import { buildActivityPatch, mapDetailToActivityInfo, writeActivityFromDetail } from './writeActivity.js';

// ============================================================================
// Test helpers
// ============================================================================

function fakeSupabase({ existingActivity = null, insertedActivity = null, latestLoad = null, updateError = null } = {}) {
  const calls = { inserts: [], updates: [], selects: [] };

  function builder({ table }) {
    const state = { op: 'select', filters: [], patch: null, insertPayload: null };
    const b = {
      select(_cols) { state.op = state.op === 'select' ? 'select' : state.op; return b; },
      insert(payload) { state.op = 'insert'; state.insertPayload = payload; return b; },
      update(patch) { state.op = 'update'; state.patch = patch; return b; },
      eq(col, val) { state.filters.push([col, val]); return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() {
        if (state.op === 'select') {
          calls.selects.push({ table, filters: [...state.filters] });
          if (table === 'activities' && existingActivity) return Promise.resolve({ data: existingActivity, error: null });
          if (table === 'training_load_daily') return Promise.resolve({ data: latestLoad, error: null });
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (state.op === 'insert') {
          calls.inserts.push({ table, payload: state.insertPayload });
          return Promise.resolve({ data: insertedActivity || { id: 'new-activity-id', ...state.insertPayload }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve, reject) {
        if (state.op === 'update') {
          calls.updates.push({ table, patch: state.patch, filters: [...state.filters] });
          return Promise.resolve({ error: updateError }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return b;
  }

  return { from(table) { return builder({ table }); }, _calls: calls };
}

function makeDeps(overrides = {}) {
  const noopFn = vi.fn().mockResolvedValue();
  return {
    extractStreamsFromActivityDetails: vi.fn().mockReturnValue({
      polyline: 'encoded-polyline',
      activityStreams: { coords: [[1,2]], power: [200], heartRate: [140] },
      summary: { duration: 3600, activityName: 'Test', activityType: 'CYCLING' },
      powerMetrics: {
        normalizedPower: 220, avgPower: 200, maxPower: 600,
        powerCurveSummary: { '5s': 600, '60s': 350 }, workKj: 720,
        hasPowerData: true, powerSampleCount: 3600,
      },
      pointCount: 3600, simplifiedCount: 500, hasPowerData: true, error: null,
    }),
    buildActivityData: vi.fn().mockReturnValue({
      user_id: 'user-1', provider: 'garmin', provider_activity_id: '12345',
      type: 'Ride', name: 'Test', start_date: '2026-05-30T00:00:00Z',
      distance: 30000, moving_time: 3600,
    }),
    deriveCompleteness: vi.fn().mockReturnValue('full'),
    refreshCompleteness: vi.fn().mockResolvedValue('full'),
    checkForDuplicate: vi.fn().mockResolvedValue({ isDuplicate: false }),
    takeoverActivity: vi.fn().mockResolvedValue({ success: true }),
    mergeActivityData: vi.fn().mockResolvedValue({ success: true }),
    fetchAthleteProfile: vi.fn().mockResolvedValue({ ftp: 250 }),
    updateBackfillChunkIfApplicable: noopFn,
    updateSnapshotForActivity: noopFn,
    assignGearToActivity: noopFn,
    computeAndStoreMetrics: noopFn,
    completeActivationStep: noopFn,
    enqueueProactiveInsight: noopFn,
    enqueueCheckIn: vi.fn().mockResolvedValue(null),
    enqueueDeviationAnalysis: vi.fn().mockResolvedValue(),
    sendPushToUser: vi.fn().mockResolvedValue(),
    buildPostRideMessage: vi.fn().mockReturnValue({ title: 'Nice ride', body: 'TFI up' }),
    captureServerError: vi.fn(),
    ...overrides,
  };
}

function makeArgs(overrides = {}) {
  return {
    supabase: fakeSupabase(),
    integration: { id: 'int-1', user_id: 'user-1' },
    ping: { id: 'evt-1', activity_id: '12345', payload: { foo: 'bar' } },
    detail: { summaryId: '12345-detail', activityId: 12345, summary: {}, samples: [] },
    deps: makeDeps(),
    ...overrides,
  };
}

// ============================================================================
// buildActivityPatch — pure function, isolated
// ============================================================================

describe('buildActivityPatch', () => {
  it('writes both canonical and legacy metric columns (dual-write)', () => {
    const parsed = {
      polyline: 'p', activityStreams: { coords: [], power: [200] },
      summary: { duration: 3600 },
      powerMetrics: { normalizedPower: 250, avgPower: 230, maxPower: 600,
        powerCurveSummary: {}, workKj: 800, hasPowerData: true },
    };
    const { patch, hasPower } = buildActivityPatch(parsed, 250);
    expect(hasPower).toBe(true);
    expect(patch.normalized_power).toBe(250);
    expect(patch.effective_power).toBe(250);              // dual-write
    expect(patch.intensity_factor).toBe(1);
    expect(patch.ride_intensity).toBe(1);                 // dual-write
    expect(patch.tss).toBe(100);
    expect(patch.rss).toBe(100);                          // dual-write
    expect(patch.device_watts).toBe(true);
    expect(patch.average_watts).toBe(230);
    expect(patch.max_watts).toBe(600);
    expect(patch.kilojoules).toBe(800);
    expect(patch.map_summary_polyline).toBe('p');
    expect(patch.activity_streams).toBeDefined();
  });

  it('omits TSS when FTP is null but still writes streams/power', () => {
    const parsed = {
      polyline: 'p', activityStreams: { coords: [] }, summary: { duration: 3600 },
      powerMetrics: { normalizedPower: 250, avgPower: 230, hasPowerData: true },
    };
    const { patch } = buildActivityPatch(parsed, null);
    expect(patch.tss).toBeUndefined();
    expect(patch.rss).toBeUndefined();
    expect(patch.normalized_power).toBe(250);
    expect(patch.effective_power).toBe(250);
  });

  it('handles HR-only rides (no power metrics)', () => {
    const parsed = {
      polyline: 'p', activityStreams: { coords: [], heartRate: [140] },
      summary: { duration: 3600 }, powerMetrics: null,
    };
    const { patch, hasPower } = buildActivityPatch(parsed, 250);
    expect(hasPower).toBe(false);
    expect(patch.device_watts).toBeUndefined();
    expect(patch.normalized_power).toBeUndefined();
    expect(patch.activity_streams).toBeDefined();
  });
});

// ============================================================================
// mapDetailToActivityInfo — pure mapping
// ============================================================================

describe('mapDetailToActivityInfo', () => {
  it('copies fields from §7.3 summary into the activityInfo shape', () => {
    const detail = {
      summaryId: 'abc-detail', activityId: 99,
      summary: {
        activityType: 'CYCLING', activityName: 'Morning Ride',
        startTimeInSeconds: 1700000000, durationInSeconds: 3600,
        distanceInMeters: 30000, averageHeartRateInBeatsPerMinute: 140,
      },
    };
    const info = mapDetailToActivityInfo(detail, { activity_id: '99' });
    expect(info.summaryId).toBe('abc-detail');
    expect(info.activityType).toBe('CYCLING');
    expect(info.durationInSeconds).toBe(3600);
    expect(info.startTimeOffsetInSeconds).toBe(0);          // default
  });

  it('falls back when detail has no summary', () => {
    const info = mapDetailToActivityInfo({ summaryId: 'x' }, { activity_id: '99' });
    expect(info.activityType).toBeNull();
    expect(info.summaryId).toBe('x');
  });
});

// ============================================================================
// writeActivityFromDetail — orchestrator
// ============================================================================

describe('writeActivityFromDetail', () => {
  it('returns skipped/error when required args are missing', async () => {
    const r = await writeActivityFromDetail({});
    expect(r.action).toBe('skipped');
    expect(r.error).toBeInstanceOf(Error);
  });

  it('inserts a new activity end-to-end with full streams', async () => {
    const args = makeArgs();
    const r = await writeActivityFromDetail(args);

    expect(r.action).toBe('inserted');
    expect(r.activityId).toBe('new-activity-id');
    expect(r.completeness).toBe('full');
    expect(r.error).toBeNull();

    const insert = args.supabase._calls.inserts.find(c => c.table === 'activities');
    expect(insert).toBeDefined();
    expect(insert.payload.normalized_power).toBe(220);
    expect(insert.payload.effective_power).toBe(220);
    expect(insert.payload.data_completeness).toBe('full');
    expect(insert.payload.map_summary_polyline).toBe('encoded-polyline');
    expect(insert.payload.activity_streams).toBeDefined();
    expect(insert.payload.raw_data.ping).toEqual({ foo: 'bar' });

    // Side effects fired
    expect(args.deps.assignGearToActivity).toHaveBeenCalled();
    expect(args.deps.updateSnapshotForActivity).toHaveBeenCalled();
    expect(args.deps.computeAndStoreMetrics).toHaveBeenCalled();
    expect(args.deps.completeActivationStep).toHaveBeenCalledWith(
      args.supabase, 'user-1', 'first_sync'
    );
  });

  it('updates in place when the activity already exists for this Garmin id', async () => {
    const args = makeArgs({
      supabase: fakeSupabase({ existingActivity: { id: 'existing-id', user_id: 'user-1' } }),
    });
    const r = await writeActivityFromDetail(args);

    expect(r.action).toBe('updated');
    expect(r.activityId).toBe('existing-id');
    expect(args.deps.checkForDuplicate).not.toHaveBeenCalled();   // skip dedup
    expect(args.deps.assignGearToActivity).not.toHaveBeenCalled(); // skip side-effects
    expect(args.deps.refreshCompleteness).toHaveBeenCalled();
  });

  it('takes over a Strava duplicate and layers streams on top', async () => {
    const deps = makeDeps({
      checkForDuplicate: vi.fn().mockResolvedValue({
        isDuplicate: true,
        shouldTakeover: true,
        existingActivity: { id: 'strava-act', provider: 'strava' },
      }),
    });
    const args = makeArgs({ deps });
    const r = await writeActivityFromDetail(args);

    expect(r.action).toBe('taken_over');
    expect(r.activityId).toBe('strava-act');
    expect(deps.takeoverActivity).toHaveBeenCalled();
    // Patch was layered on top: an UPDATE to activities should have streams.
    const update = args.supabase._calls.updates.find(c => c.table === 'activities');
    expect(update?.patch?.activity_streams).toBeDefined();
  });

  it('merges into a non-takeover duplicate', async () => {
    const deps = makeDeps({
      checkForDuplicate: vi.fn().mockResolvedValue({
        isDuplicate: true,
        shouldTakeover: false,
        existingActivity: { id: 'other-act', provider: 'wahoo' },
      }),
    });
    const args = makeArgs({ deps });
    const r = await writeActivityFromDetail(args);

    expect(r.action).toBe('merged');
    expect(deps.mergeActivityData).toHaveBeenCalled();
    expect(deps.takeoverActivity).not.toHaveBeenCalled();
  });

  it('returns error result when parse fails', async () => {
    const deps = makeDeps({
      extractStreamsFromActivityDetails: vi.fn().mockReturnValue({ error: 'bad samples' }),
    });
    const args = makeArgs({ deps });
    const r = await writeActivityFromDetail(args);

    expect(r.action).toBe('skipped');
    expect(r.error.message).toMatch(/bad samples/);
    expect(deps.captureServerError).toHaveBeenCalledWith(expect.any(Error),
      expect.objectContaining({ tag: 'garmin.pull_write_error' }));
  });

  it('still inserts when athlete profile fetch fails (TSS just stays null)', async () => {
    const deps = makeDeps({
      fetchAthleteProfile: vi.fn().mockRejectedValue(new Error('profile API down')),
    });
    const args = makeArgs({ deps });
    const r = await writeActivityFromDetail(args);

    expect(r.action).toBe('inserted');
    const insert = args.supabase._calls.inserts.find(c => c.table === 'activities');
    expect(insert.payload.normalized_power).toBe(220);  // streams still written
    expect(insert.payload.tss).toBeUndefined();         // but TSS not derived
  });

  it('side-effect failures do not fail the write', async () => {
    const deps = makeDeps({
      assignGearToActivity: vi.fn().mockRejectedValue(new Error('gear API down')),
      updateSnapshotForActivity: vi.fn().mockRejectedValue(new Error('snap down')),
    });
    const args = makeArgs({ deps });
    const r = await writeActivityFromDetail(args);
    expect(r.action).toBe('inserted');
    expect(r.error).toBeNull();
  });
});
