/**
 * designForCalendar — the seam between the coach's calendar writes and the
 * session designer.
 *
 * `makeCalendarDesigner` returns a function the executor
 * (calendarChangeApply.js) calls for every entry it is about to create that
 * carries no interval structure. The function decides whether the entry is a
 * designable session, works out where it sits in its block, applies the
 * readiness gates only to the next two days, and returns the prescription
 * plus any fields the gate changed.
 *
 * Kept out of the executor so the executor stays a pure writer that can be
 * tested with an injected stub, and out of coach.js so it can be tested at
 * all.
 */

import { designSession, designFamily } from './sessionDesigner.js';

const DAY_MS = 86400000;
/** Readiness and fatigue gates only make sense this close to today. */
const GATE_HORIZON_DAYS = 1;
/** How far back to look for a same-family session when inferring the week in block. */
const BLOCK_LOOKBACK_WEEKS = 4;

/** Families the designer builds intervals for. */
const DESIGNABLE = new Set(['vo2max', 'threshold', 'sweet_spot', 'tempo', 'anaerobic', 'sprint', 'racing', 'openers']);

const SET_PATTERN = /(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\.\d+)?)\s*(min(?:ute)?s?|m\b|s\b|sec(?:ond)?s?)/i;
const REST_PATTERN = /(\d{1,3}(?:\.\d+)?)\s*(min(?:ute)?s?|m\b|s\b|sec(?:ond)?s?)\s*(?:easy\s+)?(?:rest|recovery|recover|off|between)/i;

function toMinutes(value, unit) {
  return /^s/i.test(unit) ? value / 60 : value;
}

/**
 * A set the coach spelled out in prose ("5x3min at VO2, 3min easy"), as a
 * designer seed. Mirrors parseIntervalsFromNotes in
 * src/lib/training/plannedWorkoutShape.ts; keep the two in step.
 */
export function seedFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return null;
  const set = SET_PATTERN.exec(notes);
  if (!set) return null;
  const repeats = parseInt(set[1], 10);
  const workMin = toMinutes(parseFloat(set[2]), set[3]);
  if (!(repeats >= 1 && repeats <= 40) || !(workMin > 0 && workMin <= 120)) return null;
  const rest = REST_PATTERN.exec(notes.slice(set.index + set[0].length));
  return { repeats, workMin, restMin: rest ? toMinutes(parseFloat(rest[1]), rest[2]) : null };
}

function daysFrom(todayStr, dateStr) {
  const a = Date.parse(`${todayStr}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Where a single new session sits in its block: the number of consecutive
 * prior weeks (up to four) that already hold a session of the same family.
 * A generate_block knows its week index and does not need this.
 */
export function weekInBlockFor(family, dateStr, entries) {
  if (!family || !Array.isArray(entries) || entries.length === 0) return 0;
  const date = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date)) return 0;
  let weeks = 0;
  for (let w = 1; w <= BLOCK_LOOKBACK_WEEKS; w++) {
    const from = date - w * 7 * DAY_MS;
    const to = from + 6 * DAY_MS;
    const hit = entries.some((e) => {
      if (!e || e.type === 'race' || e.status === 'skipped') return false;
      const t = Date.parse(`${e.date}T00:00:00Z`);
      return t >= from && t <= to && designFamily(e.workout_type) === family;
    });
    if (!hit) break;
    weeks += 1;
  }
  return weeks;
}

/** One line the coach can say about a design. */
export function summarizeDesign(result) {
  if (!result?.ok || !result.prescription) return null;
  const parts = result.prescription.intervals.map((set) => {
    const len = set.duration_min < 1 ? `${Math.round(set.duration_min * 60)}s` : `${set.duration_min}min`;
    const count = set.sets > 1 ? `${set.sets}×${set.repeats}` : `${set.repeats}`;
    const target = set.target_watts_min != null
      ? `${set.target_watts_min}–${set.target_watts_max} W`
      : `${set.target_pct_ftp_min}–${set.target_pct_ftp_max}% FTP`;
    return `${count}×${len} at ${target}`;
  });
  const cal = result.prescription.calibration;
  const basis = cal?.source === 'bests' ? ', from recent bests rather than the stale FTP'
    : cal?.source === 'none' ? ', by feel (no power on file)'
      : '';
  return `${result.format.label}: ${parts.join(' + ')}, about ${result.predictedLoad} RSS${basis}.`;
}

/**
 * @param {object} ctx
 * @param {object} ctx.athlete   from toAthleteDesign
 * @param {string} ctx.todayStr  athlete-local YYYY-MM-DD
 * @param {Array}  [ctx.entries] the calendar window (for week-in-block inference)
 * @returns {(draft: object, meta?: {weekIndex?: number}) => ({prescription, patch, summary}|null)}
 */
export function makeCalendarDesigner({ athlete, todayStr, entries = [] }) {
  if (!athlete || !todayStr) return null;

  return function designDraft(draft, meta = {}) {
    if (!draft || (draft.type && draft.type !== 'workout')) return null;
    const family = designFamily(draft.workout_type);
    if (!family || !DESIGNABLE.has(family)) return null;

    const days = daysFrom(todayStr, draft.date);
    const nearTerm = days != null && days >= 0 && days <= GATE_HORIZON_DAYS;
    // Gates read today's readiness; a session ten days out gets designed
    // ungated and the arc refill / coach re-gate it when the day comes.
    const athleteForDay = nearTerm
      ? athlete
      : { ...athlete, readinessCall: null, formScore: null, afiGrowth4d: null };

    const weekInBlock = Number.isInteger(meta.weekIndex)
      ? meta.weekIndex
      : weekInBlockFor(family, draft.date, entries);

    const result = designSession({
      session: {
        type: draft.workout_type,
        durationMin: draft.target_duration_min ?? undefined,
        targetLoad: draft.target_load ?? undefined,
        weekInBlock,
        title: draft.title,
      },
      athlete: athleteForDay,
      seed: seedFromNotes(draft.notes),
    });

    if (!result.ok) {
      // A gate turned a hard day into an easy one: the row must say so, and
      // the coach must be able to see it did.
      if (result.reason === 'steady' && result.sessionType !== draft.workout_type && nearTerm) {
        return {
          prescription: null,
          patch: {
            workout_type: result.sessionType,
            target_load: result.targetLoad,
            target_duration_min: result.durationMin,
            notes: [draft.notes, `Eased by readiness: ${result.rationale.join(' ')}`].filter(Boolean).join(' '),
          },
          summary: `eased to endurance — ${result.rationale[0]}`,
        };
      }
      return null;
    }

    const patch = {};
    if (result.durationMin !== (draft.target_duration_min ?? result.durationMin)) patch.target_duration_min = result.durationMin;
    if (result.gate && result.targetLoad != null && result.targetLoad !== draft.target_load) patch.target_load = result.targetLoad;
    return { prescription: result.prescription, patch, summary: summarizeDesign(result) };
  };
}

/** The power block the coach reads, so it can explain the designer's calibration. */
export function formatPowerProfileBlock(athlete) {
  if (!athlete) return null;
  const lines = ['=== POWER PROFILE (DB-VERIFIED, 90 DAYS) ==='];
  if (athlete.ftp) {
    const age = athlete.ftpAgeDays == null ? 'of unknown age' : `set ${athlete.ftpAgeDays} days ago`;
    const window = athlete.ridesPerWeek4wk == null ? '' : ` (stale past ${athlete.ridesPerWeek4wk >= 4 ? 30 : athlete.ridesPerWeek4wk >= 2 ? 45 : 90} days at ${athlete.ridesPerWeek4wk} rides/week)`;
    lines.push(`FTP ${athlete.ftp} W, ${age}${window}.`);
  } else {
    lines.push('No FTP on the profile.');
  }
  if (athlete.bests) {
    const b = athlete.bests;
    const parts = [];
    if (b.p60) parts.push(`1 min ${b.p60} W`);
    if (b.p300) parts.push(`5 min ${b.p300} W`);
    if (b.p1200) parts.push(`20 min ${b.p1200} W`);
    if (parts.length) lines.push(`Best efforts: ${parts.join(', ')}.`);
  } else {
    lines.push('No power data in the last 90 days.');
  }
  if (athlete.cp && athlete.wPrime) lines.push(`Critical power ${athlete.cp} W, W′ ${Math.round(athlete.wPrime / 1000)} kJ.`);
  if (athlete.estimatedFtp) lines.push(`Snapshot-estimated FTP ${athlete.estimatedFtp} W (${athlete.estimatedFtpConfidence || 'unrated'} confidence).`);
  lines.push(
    'The server DESIGNS the intervals for any tempo, sweet spot, threshold, VO2, anaerobic or race session you create',
    'from these numbers (formats by week in block, targets from the 5-minute best when the FTP is stale, a W′ cap,',
    'dose sized to your target_load). Give `intervals` yourself only when you have a specific set in mind; the',
    'tool result reports what was designed so you can explain it in your own words.',
  );
  return lines.join('\n');
}
