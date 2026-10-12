/**
 * Train → Find an event: the curated event catalog (event_catalog, migrations 130/131).
 *
 * The catalog is small (hundreds of rows), so the tab loads every upcoming
 * event once and filters in the browser. Dates are plain calendar days: they
 * are compared as strings and formatted in UTC, never parsed as local time.
 *
 * Most dates are projections. statusText must go next to every date shown,
 * and an 'est' date is never presented as official (docs/event-catalog.md).
 */

import { supabase } from '../supabase';
import { formatSeasonDate } from '../season/engine';
import type { RacePrefill } from '../season/raceSearch';

export type DateStatus = 'confirmed' | 'partial' | 'est' | 'risk';

export interface CatalogEvent {
  id: string;
  name: string;
  city: string | null;
  state: string;
  region: string;
  event_date: string;
  date_status: DateStatus;
  date_label: string | null;
  previous_date: string | null;
  event_type: string;
  distances_text: string | null;
  distances_mi: number[];
  max_distance_mi: number | null;
  series: string | null;
  url: string | null;
  notes: string | null;
  last_checked_at: string | null;
}

const COLUMNS =
  'id, name, city, state, region, event_date, date_status, date_label, previous_date, event_type, ' +
  'distances_text, distances_mi, max_distance_mi, series, url, notes, last_checked_at';

export async function fetchUpcomingEvents(today: string): Promise<{ events: CatalogEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('event_catalog')
    .select(COLUMNS)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('name', { ascending: true })
    .limit(2000);
  if (error) return { events: [], error: error.message };
  // numeric[] arrives as numbers or strings depending on the driver; normalise.
  const events = ((data ?? []) as unknown as CatalogEvent[]).map((e) => ({
    ...e,
    distances_mi: (e.distances_mi ?? []).map(Number).filter(Number.isFinite),
    max_distance_mi: e.max_distance_mi === null ? null : Number(e.max_distance_mi),
  }));
  return { events, error: null };
}

// ─── Filters ────────────────────────────────────────────────────────────────

export const REGIONS = ['West', 'Mountain', 'Texas & Plains', 'Midwest', 'Southeast', 'Mid-Atlantic', 'New England'] as const;
export const EVENT_TYPES = ['Race', 'Stage race', 'Fondo / rally', 'Ride', 'Bikepacking'] as const;

/** Longest-distance buckets, in miles. */
export type DistanceBucket = 'any' | 'short' | 'mid' | 'long' | 'ultra';
export const DISTANCE_BUCKETS: Record<Exclude<DistanceBucket, 'any'>, { min: number; max: number }> = {
  short: { min: 0, max: 50 },
  mid: { min: 50, max: 100 },
  long: { min: 100, max: 200 },
  ultra: { min: 200, max: Infinity },
};

export interface EventFilters {
  query: string;
  region: string | null;
  state: string | null;
  month: string | null; // 'YYYY-MM'
  type: string | null;
  distance: DistanceBucket;
  confirmedOnly: boolean;
}

export const EMPTY_FILTERS: EventFilters = {
  query: '',
  region: null,
  state: null,
  month: null,
  type: null,
  distance: 'any',
  confirmedOnly: false,
};

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Does any offered distance fall in the bucket? (A 25/50/100 mi event suits short and long riders alike.) */
function inBucket(e: CatalogEvent, bucket: DistanceBucket): boolean {
  if (bucket === 'any') return true;
  const { min, max } = DISTANCE_BUCKETS[bucket];
  return e.distances_mi.some((d) => d >= min && d < max);
}

export function filterEvents(events: CatalogEvent[], f: EventFilters): CatalogEvent[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  return events.filter((e) => {
    if (f.region && e.region !== f.region) return false;
    if (f.state && e.state !== f.state) return false;
    if (f.month && e.event_date.slice(0, 7) !== f.month) return false;
    if (f.type && e.event_type !== f.type) return false;
    if (f.confirmedOnly && e.date_status !== 'confirmed') return false;
    if (!inBucket(e, f.distance)) return false;
    if (words.length > 0) {
      const hay = fold([e.name, e.city, e.state, e.series].filter(Boolean).join(' '));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Group already-sorted events by month: [['2027-03', [...]], ...]. */
export function groupByMonth(events: CatalogEvent[]): [string, CatalogEvent[]][] {
  const groups = new Map<string, CatalogEvent[]>();
  for (const e of events) {
    const m = e.event_date.slice(0, 7);
    const list = groups.get(m);
    if (list) list.push(e);
    else groups.set(m, [e]);
  }
  return [...groups.entries()];
}

/** "March 2027" from 'YYYY-MM', without local-time parsing. */
export function formatMonth(month: string, locale = 'en-US'): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

// ─── Display ────────────────────────────────────────────────────────────────

/**
 * The date as shown: the label for vague or multi-day dates, otherwise "Sat, Feb 6, 2027".
 * On an estimate a multi-day label is last edition's ("Jan 31–Feb 1" for a Jan 30
 * projection), so only its vague labels ("March, day TBA") are used.
 */
export function dateText(e: CatalogEvent): string {
  const label = e.date_label?.trim();
  if (label && /TBA|TBC/i.test(label)) return label;
  if (label && e.date_status !== 'est') return `${label}, ${e.event_date.slice(0, 4)}`;
  return formatSeasonDate(e.event_date);
}

/** The caveat that goes next to every date. Never presents an estimate as official. */
export function statusText(e: CatalogEvent): string {
  switch (e.date_status) {
    case 'confirmed':
      return 'Confirmed';
    case 'partial':
      return 'Date TBC';
    case 'risk':
      return 'At risk';
    case 'est':
    default:
      return e.previous_date ? `Est. from ${e.previous_date.slice(0, 4)}` : 'Estimated';
  }
}

export function distancesText(e: CatalogEvent, isImperial: boolean): string | null {
  if (e.distances_mi.length === 0) return e.distances_text && !/^tba$/i.test(e.distances_text) ? e.distances_text : null;
  if (isImperial) return e.distances_text ?? `${e.distances_mi.map((d) => Math.round(d)).join(' / ')} mi`;
  return `${e.distances_mi.map((d) => Math.round(d * 1.609344)).join(' / ')} km`;
}

/** Months that have events, in order, for the month filter. */
export function monthsOf(events: CatalogEvent[]): string[] {
  return [...new Set(events.map((e) => e.event_date.slice(0, 7)))].sort();
}

export function statesOf(events: CatalogEvent[]): string[] {
  return [...new Set(events.map((e) => e.state))].sort();
}

// ─── Add to season ──────────────────────────────────────────────────────────

/**
 * Open RaceGoalModal for an event: a new race (no id), prefilled. The chosen
 * distance (miles) becomes distance_km; the date caveat goes into the notes so
 * the rider sees an estimate is an estimate after saving too.
 */
export function eventToPrefill(e: CatalogEvent, distanceMi: number | null): RacePrefill {
  const caveat =
    e.date_status === 'confirmed'
      ? ''
      : e.date_status === 'risk'
        ? 'This event may not run: check with the organizer before planning around it.'
        : e.date_status === 'partial'
          ? 'Date not confirmed by the organizer yet: check it before race week.'
          : `Date estimated from the ${e.previous_date?.slice(0, 4) ?? 'previous'} edition: check it once it's announced.`;
  const notes = [
    e.url ? `Event site: ${e.url}` : '',
    caveat,
    e.distances_mi.length > 1 && e.distances_text ? `Distances offered: ${e.distances_text}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    name: e.name,
    race_date: e.event_date,
    race_type: 'gravel',
    distance_km: distanceMi === null ? null : Math.round(distanceMi * 1.609344 * 10) / 10,
    elevation_gain_m: null,
    location: [e.city, e.state].filter(Boolean).join(', '),
    priority: 'B',
    notes,
  };
}
