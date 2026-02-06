import { processHealthPushData, extractAndSaveHealthMetrics } from './healthDataProcessor.js';

// Helper to build a mock supabase that tracks upserts
function mockSupabase({ integration = { user_id: 'user-1' }, upsertError = null } = {}) {
  const upsertCalls = [];

  const supabase = {
    _upsertCalls: upsertCalls,
    from: vi.fn().mockImplementation((table) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: table === 'bike_computer_integrations' ? integration : null,
              error: null
            })
          })
        })
      }),
      upsert: vi.fn().mockImplementation((data, opts) => {
        upsertCalls.push({ table, data, opts });
        return { error: upsertError };
      })
    }))
  };

  return supabase;
}

describe('processHealthPushData', () => {
  it('processes daily summaries and returns summary', async () => {
    const supabase = mockSupabase();

    const summary = await processHealthPushData('dailies', [{
      userId: 'garmin-123',
      calendarDate: '2025-01-15',
      restingHeartRateInBeatsPerMinute: 55,
      averageStressLevel: 35,
      steps: 8000
    }], supabase);

    expect(supabase._upsertCalls).toHaveLength(1);
    const call = supabase._upsertCalls[0];
    expect(call.table).toBe('health_metrics');
    expect(call.data.metric_date).toBe('2025-01-15');
    expect(call.data.resting_hr).toBe(55);
    expect(call.data.source).toBe('garmin');

    // Verify return value
    expect(summary.processed).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]).toContain('daily 2025-01-15');
    expect(summary.results[0]).toContain('resting_hr=55');
  });

  it('processes sleep summaries and returns summary', async () => {
    const supabase = mockSupabase();

    const summary = await processHealthPushData('sleeps', [{
      userId: 'garmin-123',
      calendarDate: '2025-01-15',
      durationInSeconds: 28800, // 8 hours
      overallSleepScore: { value: 75 }
    }], supabase);

    expect(supabase._upsertCalls).toHaveLength(1);
    const call = supabase._upsertCalls[0];
    expect(call.data.sleep_hours).toBe(8);
    expect(call.data.sleep_quality).toBe(4); // 75/20 rounded = 4

    expect(summary.processed).toBe(1);
    expect(summary.results[0]).toContain('sleep 2025-01-15');
    expect(summary.results[0]).toContain('8h');
  });

  it('processes body composition data and returns summary', async () => {
    const supabase = mockSupabase();

    const summary = await processHealthPushData('bodyComps', [{
      userId: 'garmin-123',
      measurementTimeInSeconds: 1705312800,
      weightInGrams: 75000,
      bodyFatInPercent: 15.5
    }], supabase);

    expect(supabase._upsertCalls).toHaveLength(1);
    const call = supabase._upsertCalls[0];
    expect(call.data.weight_kg).toBe(75);
    expect(call.data.body_fat_percent).toBe(15.5);

    expect(summary.processed).toBe(1);
    expect(summary.results[0]).toContain('75kg');
    expect(summary.results[0]).toContain('15.5% bf');
  });

  it('processes HRV summaries and returns summary', async () => {
    const supabase = mockSupabase();

    const summary = await processHealthPushData('hrv', [{
      userId: 'garmin-123',
      calendarDate: '2025-01-15',
      lastNightAvg: 42
    }], supabase);

    expect(supabase._upsertCalls).toHaveLength(1);
    expect(supabase._upsertCalls[0].data.hrv_ms).toBe(42);

    expect(summary.processed).toBe(1);
    expect(summary.results[0]).toContain('42ms');
  });

  it('processes stress details with body battery', async () => {
    const supabase = mockSupabase();

    const summary = await processHealthPushData('stressDetails', [{
      userId: 'garmin-123',
      calendarDate: '2025-01-15',
      timeOffsetBodyBatteryValues: {
        '0': 80,
        '3600': 75,
        '7200': 60
      }
    }], supabase);

    expect(supabase._upsertCalls).toHaveLength(1);
    // Should pick the latest offset (7200)
    expect(supabase._upsertCalls[0].data.body_battery).toBe(60);

    expect(summary.processed).toBe(1);
    expect(summary.results[0]).toContain('battery=60');
  });

  it('skips records with no matching integration and reports it', async () => {
    const supabase = mockSupabase({ integration: null });

    const summary = await processHealthPushData('dailies', [{
      userId: 'unknown-user',
      calendarDate: '2025-01-15',
      restingHeartRateInBeatsPerMinute: 55
    }], supabase);

    expect(supabase._upsertCalls).toHaveLength(0);
    expect(summary.skipped).toBe(1);
    expect(summary.processed).toBe(0);
    expect(summary.results[0]).toContain('no integration');
  });

  it('handles multiple records in batch', async () => {
    const supabase = mockSupabase();

    const summary = await processHealthPushData('dailies', [
      { userId: 'garmin-123', calendarDate: '2025-01-14', restingHeartRateInBeatsPerMinute: 56 },
      { userId: 'garmin-123', calendarDate: '2025-01-15', restingHeartRateInBeatsPerMinute: 55 }
    ], supabase);

    expect(supabase._upsertCalls).toHaveLength(2);
    expect(summary.processed).toBe(2);
    expect(summary.results).toHaveLength(2);
  });
});

describe('extractAndSaveHealthMetrics', () => {
  it('extracts resting HR from sedentary activities', async () => {
    const supabase = mockSupabase();

    const result = await extractAndSaveHealthMetrics('user-1', {
      activityType: 'sedentary',
      averageHeartRateInBeatsPerMinute: 58,
      startTimeInSeconds: 1705312800
    }, supabase);

    expect(result).toBe(true);
    expect(supabase._upsertCalls).toHaveLength(1);
    expect(supabase._upsertCalls[0].data.resting_hr).toBe(58);
  });

  it('does not extract resting HR from non-sedentary activities', async () => {
    const supabase = mockSupabase();

    const result = await extractAndSaveHealthMetrics('user-1', {
      activityType: 'cycling',
      averageHeartRateInBeatsPerMinute: 145,
      startTimeInSeconds: 1705312800
    }, supabase);

    // No resting HR, no stress, no body battery = no data
    expect(result).toBe(false);
  });

  it('extracts stress level (maps 0-100 to 1-5)', async () => {
    const supabase = mockSupabase();

    await extractAndSaveHealthMetrics('user-1', {
      averageStressLevel: 60,
      startTimeInSeconds: 1705312800
    }, supabase);

    expect(supabase._upsertCalls[0].data.stress_level).toBe(3); // 60/20 = 3
  });

  it('extracts body battery', async () => {
    const supabase = mockSupabase();

    await extractAndSaveHealthMetrics('user-1', {
      bodyBatteryChargedValue: 85,
      startTimeInSeconds: 1705312800
    }, supabase);

    expect(supabase._upsertCalls[0].data.body_battery).toBe(85);
  });

  it('returns false when no health metrics available', async () => {
    const supabase = mockSupabase();

    const result = await extractAndSaveHealthMetrics('user-1', {
      activityType: 'cycling',
      startTimeInSeconds: 1705312800
    }, supabase);

    expect(result).toBe(false);
    expect(supabase._upsertCalls).toHaveLength(0);
  });
});
