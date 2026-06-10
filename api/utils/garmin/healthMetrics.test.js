import { describe, it, expect } from 'vitest';
import { evaluateBreaches, getSloFullWithin24h, THRESHOLDS } from './healthMetrics.js';

// Table-routing supabase fake: every chain method returns the builder and the
// awaited chain resolves with the rows configured for that table.
function fakeSupabase(rowsByTable) {
  function builder(table) {
    const b = {
      select() { return b; },
      in() { return b; },
      eq() { return b; },
      is() { return b; },
      not() { return b; },
      like() { return b; },
      gte() { return b; },
      lt() { return b; },
      lte() { return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() {
        const rows = rowsByTable[table] || [];
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      then(resolve, reject) {
        return Promise.resolve({ data: rowsByTable[table] || [], error: null }).then(resolve, reject);
      },
    };
    return b;
  }
  return { from: (table) => builder(table) };
}

describe('evaluateBreaches', () => {
  const healthy = {
    delivery: { available: true, activitiesSeen: 100, rate: 0.3 },
    dlq: { available: true, last24h: 0, open: 0 },
    unmatched: { available: true, count: 0 },
    queueLag: { available: true, oldestSeconds: 60 },
    tokens: { available: true, invalidTokenCount: 0, invalidTokenLast24h: 0 },
    slo: { available: true, activities: 50, rate: 1.0 },
  };

  it('returns no breaches when everything is healthy', () => {
    expect(evaluateBreaches(healthy)).toEqual([]);
  });

  it('flags every degraded SLI', () => {
    const breaches = evaluateBreaches({
      delivery: { available: true, activitiesSeen: 100, rate: 0.05 },
      dlq: { available: true, last24h: 3, open: 3 },
      unmatched: { available: true, count: 2 },
      queueLag: { available: true, oldestSeconds: 7200 },
      tokens: { available: true, invalidTokenCount: 1, invalidTokenLast24h: 1 },
      slo: { available: true, activities: 50, rate: 0.9 },
    });
    const slis = breaches.map((b) => b.sli).sort();
    expect(slis).toEqual([
      'dead_lettered_24h',
      'file_delivery_rate_7d',
      'invalid_token_last_24h',
      'queue_lag_seconds',
      'slo_full_within_24h',
      'unmatched_webhooks_24h',
    ]);
  });

  it('never breaches on unavailable metrics', () => {
    const allUnavailable = Object.fromEntries(
      Object.keys(healthy).map((k) => [k, { available: false, reason: 'relation does not exist' }])
    );
    expect(evaluateBreaches(allUnavailable)).toEqual([]);
  });

  it('respects minimum sample sizes for rate-based SLIs', () => {
    const breaches = evaluateBreaches({
      ...healthy,
      delivery: { available: true, activitiesSeen: THRESHOLDS.FILE_DELIVERY_MIN_SAMPLE - 1, rate: 0 },
      slo: { available: true, activities: THRESHOLDS.SLO_MIN_SAMPLE - 1, rate: 0 },
    });
    expect(breaches).toEqual([]);
  });
});

describe('getQueueLag', () => {
  it('reports zero lag when the eligible queue is empty', async () => {
    const { getQueueLag } = await import('./healthMetrics.js');
    const sb = fakeSupabase({ garmin_webhook_events: [] });
    const result = await getQueueLag(sb);
    expect(result).toEqual({ available: true, oldestSeconds: 0, oldestCreatedAt: null });
  });

  it('computes age from the oldest eligible event', async () => {
    const { getQueueLag } = await import('./healthMetrics.js');
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sb = fakeSupabase({ garmin_webhook_events: [{ created_at: tenMinAgo }] });
    const result = await getQueueLag(sb);
    expect(result.available).toBe(true);
    expect(result.oldestSeconds).toBeGreaterThanOrEqual(599);
    expect(result.oldestSeconds).toBeLessThan(615);
  });
});

describe('getSloFullWithin24h', () => {
  it('counts full imports as good and incomplete imports as bad', async () => {
    const sb = fakeSupabase({
      garmin_webhook_events: [
        { activity_id: 'a1', processed: true, process_error: null, activity_imported_id: 'act-1' },
        { activity_id: 'a2', processed: true, process_error: null, activity_imported_id: 'act-2' },
      ],
      activities: [
        { id: 'act-1', data_completeness: 'full' },
        { id: 'act-2', data_completeness: 'summary_only' },
      ],
    });

    const result = await getSloFullWithin24h(sb);
    expect(result.available).toBe(true);
    expect(result.good).toBe(1);
    expect(result.bad).toBe(1);
    expect(result.rate).toBe(0.5);
  });

  it('excludes filtered events from the denominator', async () => {
    const sb = fakeSupabase({
      garmin_webhook_events: [
        { activity_id: 'a1', processed: true, process_error: 'Filtered: activity too short', activity_imported_id: null },
        { activity_id: 'a2', processed: true, process_error: 'Health activity "MONITORING" - metrics saved', activity_imported_id: null },
        { activity_id: 'a3', processed: true, process_error: null, activity_imported_id: 'act-3' },
      ],
      activities: [{ id: 'act-3', data_completeness: 'full' }],
    });

    const result = await getSloFullWithin24h(sb);
    expect(result.excludedFiltered).toBe(2);
    expect(result.activities).toBe(1);
    expect(result.rate).toBe(1);
  });

  it('treats unprocessed / failed events with no import as bad', async () => {
    const sb = fakeSupabase({
      garmin_webhook_events: [
        { activity_id: 'a1', processed: false, process_error: 'fetch failed', activity_imported_id: null },
      ],
      activities: [],
    });

    const result = await getSloFullWithin24h(sb);
    expect(result.bad).toBe(1);
    expect(result.rate).toBe(0);
  });

  it('collapses multiple events for the same activity into one outcome', async () => {
    const sb = fakeSupabase({
      garmin_webhook_events: [
        { activity_id: 'a1', processed: true, process_error: null, activity_imported_id: 'act-1' },
        { activity_id: 'a1', processed: true, process_error: 'Already imported', activity_imported_id: 'act-1' },
        { activity_id: 'a1', processed: true, process_error: null, activity_imported_id: null },
      ],
      activities: [{ id: 'act-1', data_completeness: 'full' }],
    });

    const result = await getSloFullWithin24h(sb);
    expect(result.activities).toBe(1);
    expect(result.good).toBe(1);
  });

  it('counts cross-provider duplicate resolutions as good', async () => {
    const sb = fakeSupabase({
      garmin_webhook_events: [
        { activity_id: 'a1', processed: true, process_error: 'Garmin took over from strava', activity_imported_id: 'act-9' },
      ],
      activities: [{ id: 'act-9', data_completeness: 'summary_only' }],
    });

    const result = await getSloFullWithin24h(sb);
    expect(result.good).toBe(1);
    expect(result.bad).toBe(0);
  });
});
