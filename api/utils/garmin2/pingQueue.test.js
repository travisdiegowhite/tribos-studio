import { describe, it, expect } from 'vitest';
import {
  storePing,
  claimPings,
  markProcessed,
  markFailed,
  ACTIVITY_PING,
  MAX_RETRIES,
} from './pingQueue.js';

// Minimal in-memory Supabase chain fake. Each .from() call returns a builder
// that records the operation it was used for and resolves once awaited. We
// pre-load it with whatever rows / errors a test wants the eventual await to
// return, and we expose `lastInsert` / `lastUpdate` / `lastSelectFilters` so
// tests can assert on what the module asked Supabase to do.
function fakeSupabase({ rows = [], insertError = null, updateError = null, insertId = 'new-row-id' } = {}) {
  const calls = { lastInsert: null, lastUpdate: null, lastSelectFilters: [] };

  function builder(operation) {
    const filters = [];
    const b = {
      // SELECT path
      select(_cols) { return b; },
      eq(col, val) { filters.push(['eq', col, val]); return b; },
      or(expr) { filters.push(['or', expr]); return b; },
      order(_col, _opts) { return b; },
      limit(_n) { return b; },
      // INSERT path
      insert(payload) {
        calls.lastInsert = payload;
        return b;
      },
      // UPDATE path
      update(patch) {
        calls.lastUpdate = patch;
        return b;
      },
      // Terminal calls
      single() {
        if (operation === 'insert') {
          if (insertError) return Promise.resolve({ data: null, error: insertError });
          return Promise.resolve({ data: { id: insertId }, error: null });
        }
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      // Chain-await: claimPings awaits the chain itself (no .single() / .maybeSingle()).
      then(resolve, reject) {
        calls.lastSelectFilters.push(filters);
        if (operation === 'update') {
          return Promise.resolve({ data: null, error: updateError }).then(resolve, reject);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return b;
  }

  return {
    from(_table) {
      // Operation type is determined by which method is called next.
      let op = 'select';
      const root = {
        select(cols) { op = 'select'; return builder(op).select(cols); },
        insert(payload) { op = 'insert'; return builder(op).insert(payload); },
        update(patch) { op = 'update'; return builder(op).update(patch); },
      };
      return root;
    },
    _calls: calls,
  };
}

describe('storePing', () => {
  it('writes the canonical row shape and returns the new id', async () => {
    const sb = fakeSupabase({ insertId: 'event-42' });
    const ping = {
      userId: 'gu-1',
      summaryId: '12345-detail',
      uploadStartTimeInSeconds: 1700000000,
      uploadEndTimeInSeconds: 1700003000,
      callbackURL: 'https://apis.garmin.com/wellness-api/rest/activities?token=X',
    };
    const r = await storePing(sb, ping);
    expect(r.error).toBeNull();
    expect(r.id).toBe('event-42');
    expect(sb._calls.lastInsert).toMatchObject({
      event_type: ACTIVITY_PING,
      garmin_user_id: 'gu-1',
      activity_id: '12345',                     // -detail suffix stripped
      file_url: ping.callbackURL,
      file_type: 'JSON',
      processed: false,
    });
    expect(sb._calls.lastInsert.upload_timestamp).toBe(
      new Date(1700000000 * 1000).toISOString()
    );
    expect(sb._calls.lastInsert.payload).toBe(ping);
  });

  it('uses a custom event_type for health pings', async () => {
    const sb = fakeSupabase();
    const ping = {
      userId: 'gu-1',
      summaryId: 'h-7',
      uploadStartTimeInSeconds: 1700000000,
      uploadEndTimeInSeconds: 1700003000,
      callbackURL: 'https://x.example/health',
    };
    await storePing(sb, ping, { eventType: 'HEALTH_DAILIES_PING' });
    expect(sb._calls.lastInsert.event_type).toBe('HEALTH_DAILIES_PING');
  });

  it.each([
    ['null ping', null],
    ['non-object ping', 'oops'],
  ])('rejects invalid input: %s', async (_label, bad) => {
    const sb = fakeSupabase();
    const r = await storePing(sb, bad);
    expect(r.id).toBeNull();
    expect(r.error).toBeInstanceOf(Error);
  });

  it('rejects pings missing required fields', async () => {
    const sb = fakeSupabase();
    const r = await storePing(sb, { userId: 'x' });
    expect(r.id).toBeNull();
    expect(r.error.message).toMatch(/summaryId|callbackURL/);
  });

  it('rejects pings without a numeric upload window', async () => {
    const sb = fakeSupabase();
    const r = await storePing(sb, {
      userId: 'gu-1',
      summaryId: 'x',
      callbackURL: 'https://x/',
      uploadStartTimeInSeconds: 'oops',
      uploadEndTimeInSeconds: 1700000000,
    });
    expect(r.error.message).toMatch(/upload window/);
  });

  it('bubbles up insert errors', async () => {
    const sb = fakeSupabase({ insertError: new Error('boom') });
    const r = await storePing(sb, {
      userId: 'gu-1',
      summaryId: 'x',
      callbackURL: 'https://x/',
      uploadStartTimeInSeconds: 1700000000,
      uploadEndTimeInSeconds: 1700003000,
    });
    expect(r.id).toBeNull();
    expect(r.error.message).toBe('boom');
  });
});

describe('claimPings', () => {
  it('returns rows from the table', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const sb = fakeSupabase({ rows });
    const r = await claimPings(sb, { limit: 10 });
    expect(r).toEqual(rows);
  });

  it('returns an empty array when no rows', async () => {
    const sb = fakeSupabase({ rows: [] });
    const r = await claimPings(sb);
    expect(r).toEqual([]);
  });
});

describe('markProcessed', () => {
  it('writes processed=true with success metadata', async () => {
    const sb = fakeSupabase();
    const r = await markProcessed(sb, 'event-1', { activityImportedId: 'a-1', note: 'ok' });
    expect(r.error).toBeNull();
    expect(sb._calls.lastUpdate).toMatchObject({
      processed: true,
      activity_imported_id: 'a-1',
      process_error: 'ok',
    });
    expect(sb._calls.lastUpdate.processed_at).toBeTruthy();
  });
});

describe('markFailed', () => {
  it('bumps retry_count and sets next_retry_at on a recoverable failure', async () => {
    const sb = fakeSupabase();
    const r = await markFailed(sb, { id: 'e-1', retry_count: 0 }, new Error('5xx'));
    expect(r.terminal).toBe(false);
    expect(sb._calls.lastUpdate).toMatchObject({
      retry_count: 1,
      process_error: '5xx',
    });
    expect(new Date(sb._calls.lastUpdate.next_retry_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('treats null retry_count as zero', async () => {
    const sb = fakeSupabase();
    const r = await markFailed(sb, { id: 'e-1', retry_count: null }, 'wat');
    expect(r.terminal).toBe(false);
    expect(sb._calls.lastUpdate.retry_count).toBe(1);
  });

  it('parks the row after MAX_RETRIES failures', async () => {
    const sb = fakeSupabase();
    const r = await markFailed(sb, { id: 'e-1', retry_count: MAX_RETRIES }, 'still broken');
    expect(r.terminal).toBe(true);
    expect(sb._calls.lastUpdate).toMatchObject({
      processed: true,
      retry_count: MAX_RETRIES + 1,
    });
    expect(sb._calls.lastUpdate.process_error).toMatch(/parked after/);
  });

  it('escalates the backoff with each retry (5 → 15 → 45 min, etc.)', async () => {
    const sb1 = fakeSupabase();
    await markFailed(sb1, { id: 'e', retry_count: 0 }, 'x');
    const after1 = new Date(sb1._calls.lastUpdate.next_retry_at).getTime() - Date.now();

    const sb2 = fakeSupabase();
    await markFailed(sb2, { id: 'e', retry_count: 1 }, 'x');
    const after2 = new Date(sb2._calls.lastUpdate.next_retry_at).getTime() - Date.now();

    expect(after2).toBeGreaterThan(after1);
  });

  it('truncates very long error messages to ~1KB', async () => {
    const sb = fakeSupabase();
    const huge = 'x'.repeat(5000);
    await markFailed(sb, { id: 'e-1', retry_count: 0 }, new Error(huge));
    expect(sb._calls.lastUpdate.process_error.length).toBeLessThanOrEqual(1000);
  });
});
