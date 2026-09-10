/**
 * Gear backfill — put past rides onto a bike.
 *
 * Three entry points share this engine: "all rides from a date" on the bike
 * page (assigned_by 'auto'), "this is my Strava bike" (assigned_by 'strava'),
 * and create_gear's purchase-date auto-link. Planning is pure so the rules
 * are testable without a database; apply and undo take the supabase client
 * as an argument and write in chunks.
 *
 * The one rule that matters: a bulk action never moves a ride the rider (or
 * the coach, on the rider's word) put somewhere on purpose. `manual`,
 * `check_in` and `coach` rows are protected. `auto` rows are the default
 * bike's guess and may be taken over; `strava` rows are taken over only when
 * the rider is claiming that Strava bike for a different gear item.
 */

import { sportTypeOfActivity } from './sportTypes.js';
import { classifyRideSurface } from './gearCatalog.js';
import { recalculateGearMileage } from './gearAssignment.js';

export const PROTECTED_ASSIGNERS = new Set(['manual', 'check_in', 'coach']);
export const PAGE_SIZE = 1000;
export const IN_CHUNK = 200;
export const WRITE_CHUNK = 500;

/**
 * May a bulk action replace this activity_gear row?
 * @param {{assigned_by?: string}|null|undefined} existing
 * @param {{includeAuto?: boolean, includeStrava?: boolean}} opts
 */
export function isTakeoverAllowed(existing, { includeAuto = true, includeStrava = false } = {}) {
  if (!existing) return true;
  const by = existing.assigned_by || 'auto';
  if (PROTECTED_ASSIGNERS.has(by)) return false;
  if (by === 'strava') return Boolean(includeStrava);
  return Boolean(includeAuto);
}

/**
 * Coarse ride-type bucket from the provider's type strings and the trainer flag.
 * @returns {'road'|'gravel'|'mtb'|'ebike'|'indoor'}
 */
export function typeBucketOf(ride) {
  const t = String(ride?.sport_type || ride?.type || '').toUpperCase();
  if (ride?.trainer || t === 'VIRTUALRIDE' || t === 'INDOOR_CYCLING' || t === 'VIRTUAL_RIDE') return 'indoor';
  if (t === 'GRAVELRIDE' || t === 'GRAVEL_CYCLING') return 'gravel';
  if (t === 'MOUNTAINBIKERIDE' || t === 'MOUNTAIN_BIKING' || t === 'MTB') return 'mtb';
  if (t === 'EBIKERIDE' || t === 'EMOUNTAINBIKERIDE' || t.startsWith('E_BIKE')) return 'ebike';
  return 'road';
}

/**
 * What a set of rides adds up to: count, metres, date span, surface and type mix.
 */
export function summarizeRides(rides, bikeCategory = null) {
  const out = {
    rides: 0,
    distanceM: 0,
    firstDate: null,
    lastDate: null,
    bySurface: { road: 0, offroad: 0, indoor: 0 },
    byType: { road: 0, gravel: 0, mtb: 0, ebike: 0, indoor: 0 },
  };
  for (const r of rides || []) {
    const d = Number(r.distance) || 0;
    out.rides += 1;
    out.distanceM += d;
    const day = r.start_date ? String(r.start_date).slice(0, 10) : null;
    if (day) {
      if (!out.firstDate || day < out.firstDate) out.firstDate = day;
      if (!out.lastDate || day > out.lastDate) out.lastDate = day;
    }
    const surface = classifyRideSurface({ surfaceOverride: null, activityType: r.type, trainer: r.trainer, bikeCategory });
    out.bySurface[surface] += d;
    out.byType[typeBucketOf(r)] += 1;
  }
  return out;
}

/**
 * A category hint from the type mix — shown as a chip, never written.
 * @param {{road:number, gravel:number, mtb:number, ebike:number, indoor:number}} byType
 * @returns {'road'|'gravel'|'mtb'|'trainer'|'commuter'}
 */
export function suggestCategory(byType) {
  const total = Object.values(byType || {}).reduce((s, n) => s + (Number(n) || 0), 0);
  if (!total) return 'road';
  const half = total / 2;
  if ((byType.gravel || 0) > half) return 'gravel';
  if ((byType.mtb || 0) > half) return 'mtb';
  if ((byType.indoor || 0) > half) return 'trainer';
  if ((byType.ebike || 0) > half) return 'commuter';
  return 'road';
}

/**
 * Decide which rides move to the target bike. Pure.
 *
 * @param {Array} rides candidate cycling rides (id, distance, type, sport_type, trainer, start_date)
 * @param {Map<string, {gear_item_id:string, assigned_by:string, surface_override?:string|null}>} existingByActivityId
 * @param {string} targetGearId
 * @param {{includeAuto?: boolean, includeStrava?: boolean, bikeCategory?: string|null}} opts
 */
export function planBackfill(rides, existingByActivityId, targetGearId, opts = {}) {
  const toLink = [];
  const linkRides = [];
  const skipped = { alreadyHere: 0, protected: 0, otherBike: 0 };
  const skippedByGear = {};
  const touchedGearIds = new Set();
  const bump = (gearId, key) => {
    if (!skippedByGear[gearId]) skippedByGear[gearId] = { protected: 0, otherBike: 0 };
    skippedByGear[gearId][key] += 1;
  };

  for (const ride of rides || []) {
    const prev = existingByActivityId?.get(ride.id) || null;
    if (prev && prev.gear_item_id === targetGearId) {
      skipped.alreadyHere += 1;
      continue;
    }
    if (!isTakeoverAllowed(prev, opts)) {
      if (PROTECTED_ASSIGNERS.has(prev.assigned_by)) {
        skipped.protected += 1;
        bump(prev.gear_item_id, 'protected');
      } else {
        skipped.otherBike += 1;
        bump(prev.gear_item_id, 'otherBike');
      }
      continue;
    }
    if (prev) touchedGearIds.add(prev.gear_item_id);
    toLink.push({ activityId: ride.id, distanceM: Number(ride.distance) || 0, prev });
    linkRides.push(ride);
  }

  return {
    toLink,
    skipped,
    skippedByGear,
    touchedGearIds,
    summary: summarizeRides(linkRides, opts.bikeCategory ?? null),
  };
}

/**
 * The rider's rides in a window, paged, filtered to one sport (cycling by
 * default; create_gear passes 'running' for shoes). `until` may be a date
 * (inclusive, whole day) or an ISO timestamp.
 */
export async function fetchCandidateRides(supabase, userId, { from, until, stravaGearId, sport = 'cycling' } = {}) {
  const rows = [];
  let offset = 0;
  const untilTs = until && String(until).length === 10 ? `${until}T23:59:59.999Z` : until;
  for (;;) {
    let q = supabase
      .from('activities')
      .select('id, distance, type, sport_type, trainer, start_date')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .order('start_date', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (from) q = q.gte('start_date', from);
    if (untilTs) q = q.lte('start_date', untilTs);
    if (stravaGearId) q = q.eq('gear_id', stravaGearId);
    const { data, error } = await q;
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows.filter((r) => sportTypeOfActivity(r) === sport);
}

/**
 * Existing activity_gear rows for these activities, as a Map by activity id.
 */
export async function fetchExistingLinks(supabase, activityIds) {
  const map = new Map();
  const ids = Array.from(new Set(activityIds || []));
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from('activity_gear')
      .select('activity_id, gear_item_id, assigned_by, surface_override')
      .in('activity_id', chunk);
    if (error) throw error;
    for (const row of data || []) map.set(row.activity_id, row);
  }
  return map;
}

/**
 * Write the plan. Returns what was there before so the caller can undo.
 */
export async function applyBackfill(supabase, { userId, gearId, plan, assignedBy = 'auto' }) {
  const rows = plan.toLink.map((l) => ({
    activity_id: l.activityId,
    gear_item_id: gearId,
    user_id: userId,
    assigned_by: assignedBy,
    surface_override: l.prev?.surface_override ?? null,
  }));
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const { error } = await supabase
      .from('activity_gear')
      .upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict: 'activity_id' });
    if (error) throw error;
  }

  const recalc = new Set([gearId, ...plan.touchedGearIds]);
  for (const id of recalc) await recalculateGearMileage(supabase, id);

  return {
    linked: rows.length,
    linkedIds: rows.map((r) => r.activity_id),
    distanceM: plan.toLink.reduce((s, l) => s + l.distanceM, 0),
    previous: plan.toLink
      .filter((l) => l.prev)
      .map((l) => ({
        activity_id: l.activityId,
        gear_item_id: l.prev.gear_item_id,
        assigned_by: l.prev.assigned_by,
        surface_override: l.prev.surface_override ?? null,
      })),
    touchedGearIds: Array.from(recalc),
  };
}

/**
 * Put things back: restore the rows that existed before, delete the ones the
 * backfill created. Only rows currently on `gearId` are touched, so an undo
 * that arrives after the rider moved a ride by hand leaves that ride alone.
 * Every id is checked against the rider before any write.
 */
export async function undoBackfill(supabase, { userId, gearId, linkedIds = [], previous = [] }) {
  const ids = Array.from(new Set(linkedIds));
  if (ids.length === 0) return { restored: 0, unlinked: 0, touchedGearIds: [gearId] };

  // Only this rider's activities and bikes.
  const owned = new Set();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .in('id', ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    for (const r of data || []) owned.add(r.id);
  }
  const prevGearIds = Array.from(new Set(previous.map((p) => p.gear_item_id).filter(Boolean)));
  const ownedGear = new Set();
  if (prevGearIds.length) {
    const { data, error } = await supabase
      .from('gear_items')
      .select('id')
      .eq('user_id', userId)
      .in('id', prevGearIds);
    if (error) throw error;
    for (const g of data || []) ownedGear.add(g.id);
  }

  // Which of the linked rides are still on this bike?
  const current = await fetchExistingLinks(supabase, ids.filter((id) => owned.has(id)));
  const stillHere = ids.filter((id) => current.get(id)?.gear_item_id === gearId);
  const restoreRows = previous
    .filter((p) => stillHere.includes(p.activity_id) && ownedGear.has(p.gear_item_id))
    .map((p) => ({
      activity_id: p.activity_id,
      gear_item_id: p.gear_item_id,
      user_id: userId,
      assigned_by: p.assigned_by || 'auto',
      surface_override: p.surface_override ?? null,
    }));
  const restoredIds = new Set(restoreRows.map((r) => r.activity_id));
  const deleteIds = stillHere.filter((id) => !restoredIds.has(id));

  for (let i = 0; i < restoreRows.length; i += WRITE_CHUNK) {
    const { error } = await supabase
      .from('activity_gear')
      .upsert(restoreRows.slice(i, i + WRITE_CHUNK), { onConflict: 'activity_id' });
    if (error) throw error;
  }
  for (let i = 0; i < deleteIds.length; i += IN_CHUNK) {
    const { error } = await supabase
      .from('activity_gear')
      .delete()
      .eq('user_id', userId)
      .eq('gear_item_id', gearId)
      .in('activity_id', deleteIds.slice(i, i + IN_CHUNK));
    if (error) throw error;
  }

  const recalc = new Set([gearId, ...restoreRows.map((r) => r.gear_item_id)]);
  for (const id of recalc) await recalculateGearMileage(supabase, id);

  return { restored: restoreRows.length, unlinked: deleteIds.length, touchedGearIds: Array.from(recalc) };
}
