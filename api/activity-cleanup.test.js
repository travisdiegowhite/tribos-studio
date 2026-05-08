import { describe, it, expect, vi } from 'vitest';

// supabaseAdmin imports an env-only client at module load. Stub it with a
// no-op factory before importing activity-cleanup so the module evaluates
// cleanly under vitest. We're only testing the pure selectBestActivity
// function — not the HTTP handler — so the client itself is irrelevant.
vi.mock('./utils/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({}),
}));

const { selectBestActivity } = await import('./activity-cleanup.js');

const baseRow = {
  id: null,
  provider: null,
  is_hidden: false,
  map_summary_polyline: null,
  activity_streams: null,
  average_watts: null,
  created_at: '2026-05-08T10:00:00Z',
};
const make = (overrides) => ({ ...baseRow, ...overrides });

describe('selectBestActivity', () => {
  it('picks Garmin over Strava when both are full-data', () => {
    const garmin = make({
      id: 'g',
      provider: 'garmin',
      map_summary_polyline: 'abc',
      activity_streams: { coords: [] },
      average_watts: 220,
    });
    const strava = make({
      id: 's',
      provider: 'strava',
      map_summary_polyline: 'def',
      average_watts: 215,
    });
    expect(selectBestActivity([strava, garmin])).toBe('g');
    expect(selectBestActivity([garmin, strava])).toBe('g');
  });

  it('uses data fallback: lower-priority row wins when higher-priority is a stub', () => {
    const garminStub = make({
      id: 'g',
      provider: 'garmin',
      // No polyline, no streams, no power — Garmin sent a summary but the FIT
      // never landed.
    });
    const stravaFull = make({
      id: 's',
      provider: 'strava',
      map_summary_polyline: 'abc',
      activity_streams: { coords: [] },
      average_watts: 215,
    });
    expect(selectBestActivity([garminStub, stravaFull])).toBe('s');
  });

  it('does NOT trigger data fallback when higher-priority has any rich signal', () => {
    const garminPartial = make({
      id: 'g',
      provider: 'garmin',
      // Just power, no polyline/streams. Still wins — only a complete stub
      // (richDataCount === 0) loses to a richer lower-priority row.
      average_watts: 200,
    });
    const stravaFull = make({
      id: 's',
      provider: 'strava',
      map_summary_polyline: 'abc',
      activity_streams: { coords: [] },
      average_watts: 215,
    });
    expect(selectBestActivity([garminPartial, stravaFull])).toBe('g');
  });

  it('skips hidden rows entirely — visible Garmin wins, hidden Strava ignored', () => {
    const hiddenStrava = make({
      id: 's',
      provider: 'strava',
      is_hidden: true,
      map_summary_polyline: 'abc',
      average_watts: 215,
    });
    const garmin = make({
      id: 'g',
      provider: 'garmin',
      map_summary_polyline: 'def',
      average_watts: 220,
    });
    expect(selectBestActivity([hiddenStrava, garmin])).toBe('g');
  });

  it('returns null when every candidate is hidden', () => {
    const a = make({ id: 'a', provider: 'garmin', is_hidden: true });
    const b = make({ id: 'b', provider: 'strava', is_hidden: true });
    expect(selectBestActivity([a, b])).toBeNull();
  });

  it('returns the only id when one row is visible and the rest are hidden', () => {
    const visible = make({ id: 'v', provider: 'strava' });
    const hidden = make({ id: 'h', provider: 'garmin', is_hidden: true });
    // Hidden Garmin is excluded, so visible Strava wins by default.
    expect(selectBestActivity([visible, hidden])).toBe('v');
  });

  it('same-provider tiebreaker: more rich-data signals wins', () => {
    const stravaThin = make({
      id: 'thin',
      provider: 'strava',
      average_watts: 200,
    });
    const stravaThick = make({
      id: 'thick',
      provider: 'strava',
      map_summary_polyline: 'abc',
      activity_streams: { coords: [] },
      average_watts: 200,
    });
    expect(selectBestActivity([stravaThin, stravaThick])).toBe('thick');
  });

  it('same-provider, same data: more recent created_at wins', () => {
    const older = make({
      id: 'old',
      provider: 'strava',
      map_summary_polyline: 'abc',
      created_at: '2026-01-01T00:00:00Z',
    });
    const newer = make({
      id: 'new',
      provider: 'strava',
      map_summary_polyline: 'abc',
      created_at: '2026-05-01T00:00:00Z',
    });
    expect(selectBestActivity([older, newer])).toBe('new');
  });

  it('handles unknown providers (priority 0) without crashing', () => {
    const known = make({ id: 'k', provider: 'garmin' });
    const unknown = make({ id: 'u', provider: 'made_up' });
    expect(selectBestActivity([known, unknown])).toBe('k');
  });
});
