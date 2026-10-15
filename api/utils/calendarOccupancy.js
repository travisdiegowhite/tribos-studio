/**
 * Where a generated session may go on the calendar (multisport phase 3).
 *
 * Generators — plan activation (`insertSessions`, browser) and the coach's
 * `generate_block` (`expandBlock`, server) — FILL the calendar, they never
 * bury what is there. Until phase 3 "what is there" meant "any entry", so a
 * hybrid athlete could never get a run onto a day that held a ride. The rule
 * is now per sport:
 *
 *   - a race or a rest day blocks the whole day;
 *   - an entry of the same sport blocks that sport;
 *   - otherwise the session takes the day's lowest free slot.
 *
 * A rest or note draft only lands on an empty day. A workout draft without a
 * sport is read as cycling (entrySport), which keeps the pre-phase-3
 * behaviour for every writer that has not learned about sport.
 *
 * Pure: shared by api/ and src/. Callers read the range once
 * (`date, slot, type, workout_id, workout_type, sport`) and place in memory.
 */

import { entrySport } from './entrySport.js';

/**
 * @param {Array<{date: string, slot?: number, type?: string, sport?: string|null,
 *                workout_id?: string|null, workout_type?: string|null}>} rows
 * @returns {Map<string, {slots: Set<number>, blocked: string|null, sports: Set<string>, count: number}>}
 */
export function buildDayIndex(rows) {
  const index = new Map();
  for (const row of rows ?? []) {
    if (!row?.date) continue;
    const day = dayOf(index, row.date);
    day.count += 1;
    if (Number.isInteger(row.slot)) day.slots.add(row.slot);
    if (row.type === 'race') day.blocked = 'race day';
    else if (row.type === 'rest' && !day.blocked) day.blocked = 'rest day';
    const sport = entrySport(row);
    if (sport) day.sports.add(sport);
  }
  return index;
}

function dayOf(index, dateKey) {
  let day = index.get(dateKey);
  if (!day) {
    day = { slots: new Set(), blocked: null, sports: new Set(), count: 0 };
    index.set(dateKey, day);
  }
  return day;
}

/**
 * Place one draft, claiming its slot in `index` so later drafts see it.
 *
 * @param {Map} index  from buildDayIndex (mutated)
 * @param {string} dateKey
 * @param {{type?: string, sport?: string|null, workout_id?: string|null, workout_type?: string|null}} draft
 * @returns {{slot: number} | {skip: string}}
 */
export function placeSession(index, dateKey, draft) {
  const day = dayOf(index, dateKey);
  const type = draft?.type ?? 'workout';

  if (type === 'rest' || type === 'note') {
    if (day.count > 0) return { skip: 'day already has an entry' };
  } else {
    if (day.blocked) return { skip: day.blocked };
    const sport = entrySport({ ...draft, type });
    if (sport && day.sports.has(sport)) return { skip: `day already has a ${sport} session` };
    if (type === 'race' && day.count > 0) return { skip: 'day already has an entry' };
  }

  let slot = 0;
  while (day.slots.has(slot)) slot += 1;
  day.slots.add(slot);
  day.count += 1;
  if (type === 'race') day.blocked = 'race day';
  if (type === 'rest') day.blocked = 'rest day';
  const sport = entrySport({ ...draft, type });
  if (sport) day.sports.add(sport);
  return { slot };
}

/** The columns a caller must read for buildDayIndex. */
export const OCCUPANCY_COLUMNS = 'date, slot, type, workout_id, workout_type, sport';
