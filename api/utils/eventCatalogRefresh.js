/**
 * Weekly refresh of event_catalog (Train → Find an event) — used by api/event-catalog-refresh.js.
 *
 * Most seeded dates are projections ('est': last year's date moved to the same
 * weekday). Organizers publish their next date between roughly December and
 * February, so each week this re-checks a batch of unconfirmed upcoming events:
 *   1. Pick the least recently checked unconfirmed events, soonest first.
 *   2. Ask Claude with web search whether the organizer has published the date,
 *      through a strict `report_event` tool.
 *   3. Apply the answer only when the page it cites is one the search actually
 *      returned (the same check race search uses), and only in the safe
 *      direction: est → partial → confirmed, or → risk on a cancellation.
 *
 * planUpdate is pure and holds every rule; the rest is I/O.
 */

import { SEARCH_MODEL, collectSourceUrls, hostOf } from './raceSearch.js';

/** Events checked per run unless EVENT_REFRESH_BATCH says otherwise. */
export const DEFAULT_BATCH = 24;
export const MAX_BATCH = 60;
/** Checks in flight at once. */
export const CONCURRENCY = 4;
/** Stop starting new checks after this long (the function's maxDuration is 300 s). */
export const TIME_BUDGET_MS = 230_000;
/** A published date this far from the projected one may be a different event: kept as 'partial', not 'confirmed'. */
export const MOVE_GUARD_DAYS = 60;
const MAX_TOKENS = 3000;
const MAX_WEB_SEARCHES = 3;
const MAX_WEB_FETCHES = 2;
const MAX_RESUMES = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const nullable = (type) => ({ anyOf: [{ type }, { type: 'null' }] });

export const REPORT_EVENT_TOOL = {
  name: 'report_event',
  description: 'Report what you found about this event. Call this exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'event_date', 'date_label', 'distances_text', 'distances_mi', 'url', 'note'],
    properties: {
      status: {
        type: 'string',
        enum: ['announced', 'third_party_date', 'not_announced', 'cancelled', 'not_found'],
        description:
          "'announced': the organizer's own site or its registration page states the date. " +
          "'third_party_date': only a race calendar or aggregator lists a date. " +
          "'not_announced': the event exists but no date is published yet. " +
          "'cancelled': the organizer says this edition will not run. " +
          "'not_found': you could not find the event.",
      },
      event_date: { ...nullable('string'), description: 'Main race day, YYYY-MM-DD, for announced or third_party_date; else null.' },
      date_label: {
        ...nullable('string'),
        description: 'Only for multi-day events, e.g. "Jun 3–6". Null for a single day.',
      },
      distances_text: { ...nullable('string'), description: 'Distances as the page lists them, e.g. "25 / 50 / 100 mi". Null if not stated.' },
      distances_mi: { type: 'array', items: { type: 'number' }, description: 'The same distances in miles (convert km). Empty if not stated.' },
      url: { ...nullable('string'), description: 'The page that states the date or the cancellation.' },
      note: { type: 'string', description: 'One short sentence a rider should know (e.g. registration opens Nov 14). Empty if nothing.' },
    },
  },
};

export function buildCheckPrompt(event, today) {
  const where = [event.city, event.state].filter(Boolean).join(', ');
  const facts = [
    `Event: ${event.name} (${event.event_type ?? 'gravel event'}) in ${where}.`,
    event.series ? `Series: ${event.series}.` : '',
    event.previous_date ? `Last known edition: ${event.previous_date}.` : '',
    event.url ? `Known site: ${event.url}` : '',
    `Our current ${event.season} date is a projection: ${event.event_date}${event.date_label ? ` (${event.date_label})` : ''}.`,
  ].filter(Boolean);
  return [
    `Today is ${today}. Check whether this US gravel event has published its ${event.season} date.`,
    ...facts,
    "Search for the event and open the organizer's site or registration page with web_fetch to read the date.",
    `Only a date for the ${event.season} edition counts; ignore past editions.`,
    "Report 'announced' only when the organizer's own site or its registration page states the date. A date only on a race calendar or aggregator is 'third_party_date'.",
    'Report only what the pages you read say, with the URL of the page that says it. Then call report_event once.',
  ].join('\n');
}

function daysBetween(a, b) {
  const t = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

const clip = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function distancesFrom(report) {
  const mi = (Array.isArray(report?.distances_mi) ? report.distances_mi : [])
    .filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 2000)
    .map((n) => Math.round(n * 10) / 10)
    .sort((a, b) => a - b);
  if (mi.length === 0) return null;
  return {
    distances_mi: [...new Set(mi)],
    max_distance_mi: mi[mi.length - 1],
    distances_text: clip(report.distances_text, 120) || null,
  };
}

/**
 * Decide what one check changes. Pure.
 *
 * Returns { outcome, patch }: patch always records the check (last_checked_at,
 * last_check); event fields change only for a verified, in-season date or a
 * verified cancellation, and a status never moves backwards.
 */
export function planUpdate(event, report, sourceUrls, { today, nowIso }) {
  const hosts = new Set([...(sourceUrls ?? [])].map(hostOf).filter(Boolean));
  const host = hostOf(report?.url);
  const verified = Boolean(host && hosts.has(host));
  const date = String(report?.event_date ?? '');
  const record = (outcome, fields = {}) => ({
    outcome,
    patch: {
      ...fields,
      ...(Object.keys(fields).length > 0 ? { source: 'refresh', updated_at: nowIso } : {}),
      last_checked_at: nowIso,
      last_check: {
        outcome,
        status: report?.status ?? null,
        reported_date: DATE_RE.test(date) ? date : null,
        url: typeof report?.url === 'string' ? report.url.slice(0, 500) : null,
        verified,
        note: clip(report?.note, 300) || null,
      },
    },
  });

  if (!report) return record('no_report');
  const status = report.status;
  if (status === 'not_announced' || status === 'not_found') return record(status);
  if (!verified) return record('unverified');

  if (status === 'cancelled') {
    return record('cancelled', {
      date_status: 'risk',
      notes: clip(report.note, 300) || 'The organizer says this edition is cancelled.',
    });
  }

  if (status !== 'announced' && status !== 'third_party_date') return record('no_report');
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date)) || Number(date.slice(0, 4)) !== Number(event.season) || date < today) {
    return record('rejected_date');
  }

  const movedFar = Math.abs(daysBetween(event.event_date, date)) > MOVE_GUARD_DAYS;
  const official = status === 'announced' && !movedFar;
  // Never downgrade: a third-party date doesn't touch a confirmed row.
  if (!official && event.date_status === 'confirmed') return record('unchanged');

  const fields = {
    event_date: date,
    date_status: official ? 'confirmed' : 'partial',
    date_label: clip(report.date_label, 60) || null,
    url: event.url ?? report.url.slice(0, 500),
    notes: movedFar
      ? `${host} lists ${date}, far from the projected ${event.event_date}: check it's the same event.`
      : clip(report.note, 300) || (official ? null : `${event.season} date from ${host}, not yet on the organizer's site.`),
    ...(distancesFrom(report) ?? {}),
  };
  return record(movedFar ? 'moved_far' : official ? 'confirmed' : 'partial', fields);
}

/**
 * Ask Claude to look one event up. Returns { report, sourceUrls }; report is
 * null when the model never filed one. Throws the SDK's typed errors.
 */
export async function checkEvent(client, event, today) {
  const messages = [{ role: 'user', content: buildCheckPrompt(event, today) }];
  const allContent = [];
  let nudged = false;

  for (let turn = 0; turn <= MAX_RESUMES + 1; turn++) {
    const response = await client.messages.create({
      model: SEARCH_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'low' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_WEB_SEARCHES },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_WEB_FETCHES },
        REPORT_EVENT_TOOL,
      ],
      messages,
    });
    allContent.push(...(response.content ?? []));
    if (response.stop_reason === 'refusal') break;

    const report = (response.content ?? []).find((b) => b.type === 'tool_use' && b.name === REPORT_EVENT_TOOL.name);
    if (report) return { report: report.input ?? null, sourceUrls: collectSourceUrls(allContent, REPORT_EVENT_TOOL.name) };
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    if (!nudged && response.stop_reason === 'end_turn') {
      nudged = true;
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: 'Now call report_event with what you found.' });
      continue;
    }
    break;
  }
  return { report: null, sourceUrls: collectSourceUrls(allContent, REPORT_EVENT_TOOL.name) };
}

const PICK_COLUMNS =
  'id, name, city, state, event_type, event_date, date_status, date_label, previous_date, series, url, notes, season';

/** Unconfirmed upcoming events, never-checked first, then least recently checked; soonest first within each. */
export async function pickEvents(supabase, { today, limit }) {
  const { data, error } = await supabase
    .from('event_catalog')
    .select(PICK_COLUMNS)
    .in('date_status', ['est', 'partial', 'risk'])
    .gte('event_date', today)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .order('event_date', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`event_catalog read failed: ${error.message}`);
  return data ?? [];
}

/** Errors that mean the whole run should stop (bad key, no credit), not just this event. */
function isFatal(err) {
  return err?.status === 401 || err?.status === 403;
}

/**
 * One refresh run. Returns a summary; with dryRun nothing is written and the
 * summary lists each planned patch.
 */
export async function runRefresh({ supabase, client, today, limit = DEFAULT_BATCH, dryRun = false, now = () => Date.now() }) {
  const started = now();
  const events = await pickEvents(supabase, { today, limit });
  const summary = { picked: events.length, checked: 0, outcomes: {}, changes: [], errors: [], stoppedEarly: false };
  let fatal = null;
  let next = 0;

  const worker = async () => {
    while (next < events.length && !fatal) {
      if (now() - started > TIME_BUDGET_MS) {
        summary.stoppedEarly = true;
        return;
      }
      const event = events[next++];
      try {
        const { report, sourceUrls } = await checkEvent(client, event, today);
        const { outcome, patch } = planUpdate(event, report, sourceUrls, { today, nowIso: new Date(now()).toISOString() });
        summary.checked += 1;
        summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
        if (patch.event_date || patch.date_status) {
          summary.changes.push({
            id: event.id,
            outcome,
            from: { event_date: event.event_date, date_status: event.date_status },
            to: { event_date: patch.event_date ?? event.event_date, date_status: patch.date_status ?? event.date_status },
            ...(dryRun ? { patch } : {}),
          });
        }
        if (!dryRun) {
          const { error } = await supabase.from('event_catalog').update(patch).eq('id', event.id);
          if (error) summary.errors.push({ id: event.id, error: error.message });
        }
      } catch (err) {
        if (isFatal(err)) {
          fatal = err;
          return;
        }
        // Rate limits and outages: leave the event unchecked so it comes first next week.
        summary.errors.push({ id: event.id, error: String(err?.message ?? err).slice(0, 200) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, events.length) }, worker));
  if (fatal) throw fatal;
  return summary;
}
