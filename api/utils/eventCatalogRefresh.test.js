import { describe, it, expect, vi } from 'vitest';
import { planUpdate, runRefresh, buildCheckPrompt, MOVE_GUARD_DAYS, REPORT_EVENT_TOOL } from './eventCatalogRefresh.js';

const today = '2026-10-12';
const nowIso = '2026-10-12T05:00:00.000Z';
const opts = { today, nowIso };

const event = {
  id: 'rock-cobbler-ca',
  name: 'Rock Cobbler',
  city: 'Bakersfield',
  state: 'CA',
  event_type: 'Race',
  event_date: '2027-02-06',
  date_status: 'est',
  date_label: null,
  previous_date: '2026-02-07',
  series: null,
  url: null,
  notes: 'Old note',
  season: 2027,
};

const sources = new Set(['https://www.rockcobbler.com/', 'https://bikereg.com/rock-cobbler']);
const report = (over = {}) => ({
  status: 'announced',
  event_date: '2027-02-13',
  date_label: null,
  distances_text: '50 / 95 mi',
  distances_mi: [95, 50],
  url: 'https://rockcobbler.com/register',
  note: '',
  ...over,
});

describe('planUpdate', () => {
  it('confirms a verified, announced in-season date and fills distances and url', () => {
    const { outcome, patch } = planUpdate(event, report(), sources, opts);
    expect(outcome).toBe('confirmed');
    expect(patch).toMatchObject({
      event_date: '2027-02-13',
      date_status: 'confirmed',
      date_label: null,
      url: 'https://rockcobbler.com/register',
      notes: null,
      distances_mi: [50, 95],
      max_distance_mi: 95,
      distances_text: '50 / 95 mi',
      source: 'refresh',
      updated_at: nowIso,
      last_checked_at: nowIso,
    });
    expect(patch.last_check).toMatchObject({ outcome: 'confirmed', verified: true, reported_date: '2027-02-13' });
  });

  it('keeps the existing url and distances when the report has none', () => {
    const { patch } = planUpdate({ ...event, url: 'https://rockcobbler.com/' }, report({ distances_mi: [] }), sources, opts);
    expect(patch.url).toBe('https://rockcobbler.com/');
    expect(patch).not.toHaveProperty('distances_mi');
  });

  it('only records the check when the cited page was not among the search results', () => {
    const { outcome, patch } = planUpdate(event, report({ url: 'https://made-up.example/race' }), sources, opts);
    expect(outcome).toBe('unverified');
    expect(Object.keys(patch).sort()).toEqual(['last_check', 'last_checked_at']);
  });

  it('only records the check for not announced, not found, or no report', () => {
    for (const status of ['not_announced', 'not_found']) {
      const { outcome, patch } = planUpdate(event, report({ status, event_date: null }), sources, opts);
      expect(outcome).toBe(status);
      expect(patch).not.toHaveProperty('event_date');
      expect(patch).not.toHaveProperty('source');
    }
    expect(planUpdate(event, null, sources, opts).outcome).toBe('no_report');
  });

  it('rejects a date from another season, a past date, or a malformed one', () => {
    for (const event_date of ['2026-02-07', '2028-02-12', '2027-13-40', 'Feb 13']) {
      expect(planUpdate(event, report({ event_date }), sources, opts).outcome).toBe('rejected_date');
    }
    expect(planUpdate(event, report({ event_date: '2027-01-02' }), sources, { ...opts, today: '2027-01-05' }).outcome).toBe(
      'rejected_date',
    );
  });

  it('keeps a far move as partial with a check-it note', () => {
    const far = report({ event_date: '2027-06-05' }); // ~4 months from the projection
    expect(Math.abs(Date.parse('2027-06-05') - Date.parse(event.event_date)) / 864e5).toBeGreaterThan(MOVE_GUARD_DAYS);
    const { outcome, patch } = planUpdate(event, far, sources, opts);
    expect(outcome).toBe('moved_far');
    expect(patch.date_status).toBe('partial');
    expect(patch.notes).toMatch(/far from the projected 2027-02-06/);
  });

  it('takes a third-party date as partial, but never over a confirmed row', () => {
    const third = report({ status: 'third_party_date', url: 'https://bikereg.com/rock-cobbler' });
    const { outcome, patch } = planUpdate(event, third, sources, opts);
    expect(outcome).toBe('partial');
    expect(patch.date_status).toBe('partial');
    expect(patch.notes).toMatch(/bikereg\.com/);

    const confirmed = planUpdate({ ...event, date_status: 'confirmed' }, third, sources, opts);
    expect(confirmed.outcome).toBe('unchanged');
    expect(confirmed.patch).not.toHaveProperty('date_status');
  });

  it('marks a verified cancellation as risk without moving the date', () => {
    const { outcome, patch } = planUpdate(
      event,
      report({ status: 'cancelled', event_date: null, note: 'Permit denied for 2027.' }),
      sources,
      opts,
    );
    expect(outcome).toBe('cancelled');
    expect(patch).toMatchObject({ date_status: 'risk', notes: 'Permit denied for 2027.' });
    expect(patch).not.toHaveProperty('event_date');
  });

  it('keeps a multi-day label', () => {
    const { patch } = planUpdate(event, report({ date_label: 'Feb 12–14' }), sources, opts);
    expect(patch.date_label).toBe('Feb 12–14');
  });
});

describe('buildCheckPrompt', () => {
  it('names the season, the projection and the known site', () => {
    const p = buildCheckPrompt({ ...event, url: 'https://rockcobbler.com/' }, today);
    expect(p).toMatch(/2027 date/);
    expect(p).toMatch(/projection: 2027-02-06/);
    expect(p).toMatch(/Known site: https:\/\/rockcobbler\.com\//);
    expect(p).toMatch(/Last known edition: 2026-02-07/);
    expect(p).toMatch(/this US gravel event has published/);
  });

  it('names running and trail races for their disciplines', () => {
    expect(buildCheckPrompt({ ...event, discipline: 'road_run', event_type: 'Marathon' }, today)).toMatch(
      /this US running race has published/,
    );
    const trail = buildCheckPrompt({ ...event, discipline: 'trail_run', event_type: null }, today);
    expect(trail).toMatch(/this US trail race has published/);
    expect(trail).toMatch(/\(trail race\)/);
  });
});

describe('event catalog seed script', () => {
  it('still reproduces migration 131 byte for byte', async () => {
    const { execFileSync } = await import('node:child_process');
    const { readFileSync } = await import('node:fs');
    const out = execFileSync('node', ['scripts/build-event-catalog-seed.mjs', 'database/seeds/gravel_events_2027.json'], {
      encoding: 'utf8',
    });
    expect(out).toBe(readFileSync('database/migrations/131_event_catalog_seed_gravel_2027.sql', 'utf8'));
  });

  it('reproduces migration 137 from the run seed', async () => {
    const { execFileSync } = await import('node:child_process');
    const { readFileSync } = await import('node:fs');
    const out = execFileSync(
      'node',
      [
        'scripts/build-event-catalog-seed.mjs',
        'database/seeds/run_events_2027.json',
        '--migration',
        '137',
        '--discipline',
        'road_run',
        '--with-discipline-index',
      ],
      { encoding: 'utf8' },
    );
    expect(out).toBe(readFileSync('database/migrations/137_event_catalog_seed_run_2027.sql', 'utf8'));
  });
});

// ─── runRefresh with fakes ──────────────────────────────────────────────────

function fakeSupabase(rows) {
  const updates = [];
  const query = {
    select: () => query,
    in: () => query,
    gte: () => query,
    order: () => query,
    limit: async () => ({ data: rows, error: null }),
    update: (patch) => ({ eq: async (_col, id) => (updates.push({ id, patch }), { error: null }) }),
  };
  return { from: () => query, updates };
}

function fakeClient(byName) {
  return {
    messages: {
      create: vi.fn(async ({ messages }) => {
        const name = Object.keys(byName).find((n) => messages[0].content.includes(n));
        const r = byName[name];
        if (r instanceof Error) throw r;
        return {
          stop_reason: 'tool_use',
          content: [
            { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://rockcobbler.com/' }] },
            { type: 'tool_use', name: REPORT_EVENT_TOOL.name, input: r },
          ],
        };
      }),
    },
  };
}

describe('runRefresh', () => {
  const second = { ...event, id: 'other-ks', name: 'Other Gravel', state: 'KS' };

  it('writes each planned patch and summarises the outcomes', async () => {
    const supabase = fakeSupabase([event, second]);
    const client = fakeClient({
      'Rock Cobbler': report({ url: 'https://rockcobbler.com/' }),
      'Other Gravel': report({ status: 'not_announced', event_date: null, url: null }),
    });
    const summary = await runRefresh({ supabase, client, today, limit: 10 });
    expect(summary).toMatchObject({ picked: 2, checked: 2, outcomes: { confirmed: 1, not_announced: 1 }, errors: [] });
    expect(summary.changes).toEqual([
      {
        id: 'rock-cobbler-ca',
        outcome: 'confirmed',
        from: { event_date: '2027-02-06', date_status: 'est' },
        to: { event_date: '2027-02-13', date_status: 'confirmed' },
      },
    ]);
    expect(supabase.updates.map((u) => u.id).sort()).toEqual(['other-ks', 'rock-cobbler-ca']);
  });

  it('writes nothing on a dry run and shows the patch', async () => {
    const supabase = fakeSupabase([event]);
    const client = fakeClient({ 'Rock Cobbler': report({ url: 'https://rockcobbler.com/' }) });
    const summary = await runRefresh({ supabase, client, today, dryRun: true });
    expect(supabase.updates).toEqual([]);
    expect(summary.changes[0].patch.date_status).toBe('confirmed');
  });

  it('leaves an event unchecked on a transient error, and stops the run on an auth error', async () => {
    const supabase = fakeSupabase([event]);
    const transient = Object.assign(new Error('overloaded'), { status: 529 });
    const summary = await runRefresh({ supabase, client: fakeClient({ 'Rock Cobbler': transient }), today });
    expect(summary.checked).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(supabase.updates).toEqual([]);

    const auth = Object.assign(new Error('bad key'), { status: 401 });
    await expect(runRefresh({ supabase, client: fakeClient({ 'Rock Cobbler': auth }), today })).rejects.toThrow('bad key');
  });

  it('stops starting checks once the time budget is spent', async () => {
    let t = 0;
    const supabase = fakeSupabase([event, second]);
    const client = fakeClient({ 'Rock Cobbler': report(), 'Other Gravel': report() });
    const summary = await runRefresh({ supabase, client, today, now: () => (t += 1_000_000) });
    expect(summary.stoppedEarly).toBe(true);
    expect(summary.checked).toBe(0);
  });
});
