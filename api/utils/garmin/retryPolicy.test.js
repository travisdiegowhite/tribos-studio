import { describe, it, expect } from 'vitest';
import {
  MAX_RETRIES,
  MAX_BACKOFF_MINUTES,
  computeBackoffMinutes,
  deadLetterEvent,
  redriveEvents,
} from './retryPolicy.js';

// Minimal supabase chain fake mirroring the pattern in
// api/utils/garmin2/pingQueue.test.js: records update payloads and resolves
// with a configurable error so the fallback path can be exercised.
function fakeSupabase({ firstUpdateError = null } = {}) {
  const calls = { updates: [] };
  let updateCount = 0;

  return {
    from(_table) {
      let payload = null;
      const filters = [];
      const b = {
        update(patch) { payload = patch; return b; },
        eq(col, val) { filters.push(['eq', col, val]); return b; },
        in(col, vals) { filters.push(['in', col, vals]); return b; },
        select(_cols) {
          // redriveEvents terminal: .select('id') after filters
          calls.updates.push({ payload, filters });
          return Promise.resolve({
            data: (filters.find(f => f[0] === 'in')?.[2] || []).map((id) => ({ id })),
            error: null,
          });
        },
        then(resolve, reject) {
          updateCount += 1;
          calls.updates.push({ payload, filters });
          const error = updateCount === 1 ? firstUpdateError : null;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      };
      return b;
    },
    _calls: calls,
  };
}

describe('computeBackoffMinutes', () => {
  it('stays within ±20% jitter of the exponential base', () => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const base = Math.pow(2, attempt - 1);
      for (let i = 0; i < 25; i++) {
        const minutes = computeBackoffMinutes(attempt);
        expect(minutes).toBeGreaterThanOrEqual(Math.min(base * 0.8, MAX_BACKOFF_MINUTES));
        expect(minutes).toBeLessThanOrEqual(Math.min(base * 1.2, MAX_BACKOFF_MINUTES));
      }
    }
  });

  it('caps at MAX_BACKOFF_MINUTES for absurd retry counts', () => {
    expect(computeBackoffMinutes(20)).toBe(MAX_BACKOFF_MINUTES);
  });

  it('keeps the total budget in the multi-hour range (outage-sized)', () => {
    // Worst case (all minimum jitter) must still exceed 6 hours so the queue
    // can ride out a sustained Garmin or Supabase outage.
    let totalMin = 0;
    for (let attempt = 1; attempt < MAX_RETRIES; attempt++) {
      totalMin += Math.min(Math.pow(2, attempt - 1) * 0.8, MAX_BACKOFF_MINUTES);
    }
    expect(totalMin).toBeGreaterThan(6 * 60);
  });
});

describe('deadLetterEvent', () => {
  const event = { id: 'evt-1' };

  it('parks the event with dead_lettered=true and keeps processed untouched', async () => {
    const sb = fakeSupabase();
    const result = await deadLetterEvent(sb, event, 'boom');

    expect(result.deadLettered).toBe(true);
    expect(sb._calls.updates).toHaveLength(1);
    const { payload, filters } = sb._calls.updates[0];
    expect(payload.dead_lettered).toBe(true);
    expect(payload.dead_letter_reason).toBe('boom');
    expect(payload.retry_count).toBe(MAX_RETRIES);
    expect(payload.processed).toBeUndefined();
    expect(filters).toContainEqual(['eq', 'id', 'evt-1']);
  });

  it('falls back to processed-with-error when the DLQ columns are missing', async () => {
    const sb = fakeSupabase({
      firstUpdateError: { message: 'column "dead_lettered" of relation "garmin_webhook_events" does not exist' },
    });
    const result = await deadLetterEvent(sb, event, 'boom');

    expect(result.deadLettered).toBe(false);
    expect(sb._calls.updates).toHaveLength(2);
    const fallback = sb._calls.updates[1].payload;
    expect(fallback.processed).toBe(true);
    expect(fallback.process_error).toContain('Max retries');
    expect(fallback.process_error).toContain('boom');
  });
});

describe('redriveEvents', () => {
  it('resets retry state only for rows still flagged dead_lettered', async () => {
    const sb = fakeSupabase();
    const result = await redriveEvents(sb, ['a', 'b']);

    expect(result.redriven).toBe(2);
    const { payload, filters } = sb._calls.updates[0];
    expect(payload.dead_lettered).toBe(false);
    expect(payload.retry_count).toBe(0);
    expect(payload.next_retry_at).toBeNull();
    expect(filters).toContainEqual(['in', 'id', ['a', 'b']]);
    expect(filters).toContainEqual(['eq', 'dead_lettered', true]);
  });
});
