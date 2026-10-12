import { describe, it, expect } from 'vitest';
import {
  EMPTY_FILTERS,
  dateText,
  distancesText,
  eventToPrefill,
  filterEvents,
  formatMonth,
  groupByMonth,
  statusText,
  type CatalogEvent,
} from './eventCatalog';

const ev = (over: Partial<CatalogEvent> = {}): CatalogEvent => ({
  id: 'rock-cobbler-ca',
  name: 'Rock Cobbler',
  city: 'Bakersfield',
  state: 'CA',
  region: 'West',
  event_date: '2027-02-06',
  date_status: 'confirmed',
  date_label: null,
  previous_date: null,
  event_type: 'Race',
  distances_text: '50 / 95 mi',
  distances_mi: [50, 95],
  max_distance_mi: 95,
  series: null,
  url: 'https://rockcobbler.com/',
  notes: null,
  last_checked_at: null,
  ...over,
});

const events = [
  ev(),
  ev({ id: 'sea-otter', name: 'Sea Otter Classic Gravel', city: 'Monterey', event_date: '2027-04-16', series: 'Life Time Grand Prix', distances_mi: [15, 30, 60, 90] }),
  ev({ id: 'cirrem', name: 'CIRREM', city: 'Cumming', state: 'IA', region: 'Texas & Plains', event_date: '2027-02-27', date_status: 'est', previous_date: '2026-02-28', distances_mi: [62.1], distances_text: '100K' }),
  ev({ id: 'huracan', name: 'HuRaCaN 300', city: 'Ocala', state: 'FL', region: 'Southeast', event_type: 'Bikepacking', distances_mi: [330, 400] }),
];

describe('filterEvents', () => {
  const f = (over: Partial<typeof EMPTY_FILTERS>) => filterEvents(events, { ...EMPTY_FILTERS, ...over }).map((e) => e.id);

  it('returns everything with no filters', () => {
    expect(f({})).toHaveLength(4);
  });

  it('matches every word across name, town, state and series, ignoring case and accents', () => {
    expect(f({ query: 'grand prix' })).toEqual(['sea-otter']);
    expect(f({ query: 'monterey OTTER' })).toEqual(['sea-otter']);
    expect(f({ query: 'Cumming ia' })).toEqual(['cirrem']);
    expect(f({ query: 'nope' })).toEqual([]);
  });

  it('filters by region, state, month, type and confirmed dates', () => {
    expect(f({ region: 'West' })).toEqual(['rock-cobbler-ca', 'sea-otter']);
    expect(f({ state: 'FL' })).toEqual(['huracan']);
    expect(f({ month: '2027-02' })).toEqual(['rock-cobbler-ca', 'cirrem', 'huracan']);
    expect(f({ type: 'Bikepacking' })).toEqual(['huracan']);
    expect(f({ confirmedOnly: true })).not.toContain('cirrem');
  });

  it('keeps an event when any of its distances is in the bucket', () => {
    expect(f({ distance: 'short' })).toEqual(['sea-otter']);
    expect(f({ distance: 'mid' })).toEqual(['rock-cobbler-ca', 'sea-otter', 'cirrem']);
    expect(f({ distance: 'ultra' })).toEqual(['huracan']);
  });
});

describe('display', () => {
  it('formats plain dates in UTC, so the weekday never shifts', () => {
    expect(dateText(ev())).toBe('Sat, Feb 6, 2027');
  });

  it('uses vague labels, and multi-day labels only when the date is not an estimate', () => {
    expect(dateText(ev({ date_label: 'Mar 18–20' }))).toBe('Mar 18–20, 2027');
    expect(dateText(ev({ date_status: 'est', date_label: 'Jan 31–Feb 1', event_date: '2027-01-30' }))).toBe('Sat, Jan 30, 2027');
    expect(dateText(ev({ date_status: 'est', date_label: 'March, day TBA' }))).toBe('March, day TBA');
  });

  it('never presents an estimate as official', () => {
    expect(statusText(ev())).toBe('Confirmed');
    expect(statusText(ev({ date_status: 'est', previous_date: '2026-02-28' }))).toBe('Est. from 2026');
    expect(statusText(ev({ date_status: 'est' }))).toBe('Estimated');
    expect(statusText(ev({ date_status: 'partial' }))).toBe('Date TBC');
    expect(statusText(ev({ date_status: 'risk' }))).toBe('At risk');
  });

  it('shows distances in the rider’s units', () => {
    expect(distancesText(ev(), true)).toBe('50 / 95 mi');
    expect(distancesText(ev(), false)).toBe('80 / 153 km');
    expect(distancesText(ev({ distances_mi: [], distances_text: 'TBA' }), true)).toBeNull();
    expect(distancesText(ev({ distances_mi: [], distances_text: 'Multiple' }), false)).toBe('Multiple');
  });

  it('groups by month and names the month without local-time parsing', () => {
    const sorted = [...events].sort((a, b) => a.event_date.localeCompare(b.event_date));
    expect(groupByMonth(sorted).map(([m, list]) => [m, list.length])).toEqual([
      ['2027-02', 3],
      ['2027-04', 1],
    ]);
    expect(formatMonth('2027-01')).toBe('January 2027');
  });
});

describe('eventToPrefill', () => {
  it('prefills a new gravel race with the chosen distance in km', () => {
    const p = eventToPrefill(ev(), 50);
    expect(p).toMatchObject({
      name: 'Rock Cobbler',
      race_date: '2027-02-06',
      race_type: 'gravel',
      distance_km: 80.5,
      location: 'Bakersfield, CA',
      priority: 'B',
    });
    expect(p.notes).toContain('Event site: https://rockcobbler.com/');
    expect(p.notes).toContain('Distances offered: 50 / 95 mi');
    expect(p).not.toHaveProperty('id');
  });

  it('carries the date caveat into the notes', () => {
    expect(eventToPrefill(ev({ date_status: 'est', previous_date: '2026-02-28' }), null).notes).toMatch(
      /estimated from the 2026 edition/,
    );
    expect(eventToPrefill(ev({ date_status: 'risk' }), null).notes).toMatch(/may not run/);
    expect(eventToPrefill(ev({ date_status: 'partial' }), null).notes).toMatch(/not confirmed/);
    expect(eventToPrefill(ev(), null).distance_km).toBeNull();
  });
});
