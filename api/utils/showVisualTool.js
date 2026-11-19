/**
 * show_visual — lets the coach put a chart or map into its reply on the
 * /coach page (src/features/coach-chat/).
 *
 * A visual is a REFERENCE, never data: an activity id, a route id, a date
 * range, a km range. This module checks that every reference belongs to the
 * athlete (user_id scoping with the service-role client IS the security
 * boundary here), clamps ranges, and hands the model back a short summary of
 * what the athlete will actually see, so the prose matches the chart. The
 * browser loads the rows itself under RLS and draws them with the existing
 * chart and map components.
 *
 * Only offered when the client says it can render visuals
 * (`canShowVisuals: true` in the /api/coach request). The command bar and
 * Today panel don't, so the coach never points at a chart nobody can see.
 *
 * Keep VISUAL_KINDS in step with src/features/coach-chat/visuals/types.ts.
 */

import { segmentStats, streamDistancesKm } from './coachFocus.js';

export const VISUAL_KINDS = ['fitness_load', 'ride_streams', 'power_curve', 'route_preview'];
export const MAX_VISUALS_PER_REPLY = 3;
const MAX_RANGE_DAYS = 400;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const SHOW_VISUAL_TOOL = {
  name: 'show_visual',
  description:
    'Show the athlete a chart or map inside your reply. Use it when seeing the data makes the point faster than '
    + 'describing it: a fitness trend, a specific ride and the stretch of it you are discussing, a power curve, or a '
    + 'saved route. Do not use it for small talk or when one number answers the question. At most '
    + `${MAX_VISUALS_PER_REPLY} per reply. In your prose, refer to the chart ("the marked climb", "the dip in mid-October") `
    + 'rather than repeating every number on it.\n\n'
    + 'Kinds:\n'
    + '- fitness_load: TFI/AFI/Form Score and daily RSS between `from` and `to` (YYYY-MM-DD).\n'
    + '- ride_streams: one activity\'s map plus power/HR/speed over distance. `activity_id` is required (from the '
    + 'RECENT ACTIVITIES list or query_training_data list_activities). Optional `range_km` [start, end] marks a stretch '
    + 'on both the map and the chart.\n'
    + '- power_curve: best power by duration, for one `activity_id`, or across `from`..`to`. `show_zones` adds '
    + 'time-in-zone for a single activity.\n'
    + '- route_preview: a saved route by `route_id` (from the SAVED ROUTES list) or `route_name`. Optional `range_km` '
    + 'shows just that stretch.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: VISUAL_KINDS },
      activity_id: { type: 'string', description: 'Activity UUID (ride_streams, power_curve).' },
      route_id: { type: 'string', description: 'Saved route UUID (route_preview).' },
      route_name: { type: 'string', description: 'Saved route name, when you do not have its id (route_preview).' },
      from: { type: 'string', description: 'Start date YYYY-MM-DD (fitness_load, power_curve over a period).' },
      to: { type: 'string', description: 'End date YYYY-MM-DD, inclusive.' },
      range_km: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: '[start_km, end_km] along the ride or route.',
      },
      show_zones: { type: 'boolean' },
      caption: { type: 'string', description: 'One short line shown under the title.' },
    },
    required: ['kind'],
  },
};

const round1 = (n) => Math.round(n * 10) / 10;

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/** Validate a from/to pair; returns { from, to } or an error string. */
export function normalizeDateRange(from, to, todayStr) {
  if (!ISO_DATE.test(from || '') || !ISO_DATE.test(to || '')) return 'from and to must be YYYY-MM-DD dates.';
  let lo = from <= to ? from : to;
  let hi = from <= to ? to : from;
  if (todayStr && hi > todayStr) hi = todayStr;
  if (lo > hi) return 'That range is entirely in the future; there is no data to show yet.';
  if (daysBetween(lo, hi) > MAX_RANGE_DAYS) {
    const d = new Date(`${hi}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - MAX_RANGE_DAYS);
    lo = d.toISOString().slice(0, 10);
  }
  return { from: lo, to: hi };
}

/** Validate range_km against a known total length. Returns [a, b], null (no range) or an error string. */
export function normalizeRangeKm(range, total_km) {
  if (range == null) return null;
  if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return 'range_km must be [start_km, end_km].';
  }
  let [a, b] = range[0] <= range[1] ? range : [range[1], range[0]];
  a = Math.max(0, a);
  if (total_km != null && total_km > 0) {
    if (a >= total_km) return `range_km starts past the end (${round1(total_km)} km long).`;
    b = Math.min(b, total_km);
  }
  if (b - a < 0.1) return 'range_km must span at least 0.1 km.';
  return [round1(a), round1(b)];
}

function caption(input) {
  return typeof input.caption === 'string' && input.caption.trim() ? input.caption.trim().slice(0, 160) : undefined;
}

const fail = (error) => ({ success: false, shown: false, error });

/**
 * Validate one show_visual call. `state.visuals` collects accepted specs for
 * the response; the return value is the tool_result for the model.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service-role singleton
 * @param {string} userId verified user id
 * @param {object} input tool input
 * @param {{ visuals: object[], todayStr?: string }} state
 */
export async function handleShowVisual(supabase, userId, input, state) {
  if (!input || !VISUAL_KINDS.includes(input.kind)) {
    return fail(`kind must be one of: ${VISUAL_KINDS.join(', ')}.`);
  }
  if (state.visuals.length >= MAX_VISUALS_PER_REPLY) {
    return fail(`Already showing ${MAX_VISUALS_PER_REPLY} visuals in this reply; that is the limit.`);
  }

  try {
    let spec;
    let summary;

    if (input.kind === 'fitness_load') {
      const range = normalizeDateRange(input.from, input.to, state.todayStr);
      if (typeof range === 'string') return fail(range);
      const { data, error } = await supabase
        .from('training_load_daily')
        .select('date, tfi, afi, form_score')
        .eq('user_id', userId)
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: true });
      if (error) throw error;
      if (!data?.length) return fail('No training load rows in that range.');
      const first = data[0];
      const last = data[data.length - 1];
      const forms = data.map((r) => r.form_score).filter((v) => v != null);
      spec = { kind: 'fitness_load', from: range.from, to: range.to, caption: caption(input) };
      summary = `Fitness ${range.from} → ${range.to} (${data.length} days): TFI ${Math.round(first.tfi ?? 0)} → `
        + `${Math.round(last.tfi ?? 0)}, AFI ${Math.round(first.afi ?? 0)} → ${Math.round(last.afi ?? 0)}`
        + (forms.length ? `, Form Score ranged ${Math.round(Math.min(...forms))} to ${Math.round(Math.max(...forms))}.` : '.');
    }

    if (input.kind === 'ride_streams' || (input.kind === 'power_curve' && input.activity_id)) {
      if (!input.activity_id) return fail('activity_id is required.');
      const { data: act, error } = await supabase
        .from('activities')
        .select('id, name, start_date, distance, power_curve_summary, activity_streams')
        .eq('id', input.activity_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!act) return fail('No activity with that id belongs to this athlete. Look it up with query_training_data.');
      const label = `${act.name || 'Activity'} on ${String(act.start_date || '').slice(0, 10)}`;

      if (input.kind === 'ride_streams') {
        const streams = act.activity_streams;
        const distances_km = streamDistancesKm(streams);
        if (!distances_km.length) {
          // Indoor rides have power/HR but no GPS: chart them over time, no map, no km range.
          const hasSeries = ['power', 'heartRate', 'speed'].some((k) => Array.isArray(streams?.[k]) && streams[k].length > 1);
          if (!hasSeries) return fail(`${label} has no recorded streams to chart.`);
          spec = { kind: 'ride_streams', activity_id: act.id, range_km: null, caption: caption(input) };
          summary = `Showing ${label} over time (no GPS, so no map and no km range).`;
        } else {
          const total_km = distances_km[distances_km.length - 1] || (act.distance ? act.distance / 1000 : null);
          const range = normalizeRangeKm(input.range_km, total_km);
          if (typeof range === 'string') return fail(range);
          spec = { kind: 'ride_streams', activity_id: act.id, range_km: range, caption: caption(input) };
          const stats = range ? segmentStats(streams, range) : null;
          summary = `Showing ${label}, ${round1(total_km)} km`
            + (range ? `, marked ${range[0]}–${range[1]} km${stats ? `: ${stats.text}` : ''}.` : '.');
        }
      } else {
        const pcs = act.power_curve_summary;
        if (!pcs || typeof pcs !== 'object' || !Object.keys(pcs).length) {
          return fail(`${label} has no power curve (no power data).`);
        }
        spec = { kind: 'power_curve', activity_id: act.id, show_zones: !!input.show_zones, caption: caption(input) };
        summary = `Power curve for ${label}: ${describeCurve(pcs)}.`;
      }
    }

    if (input.kind === 'power_curve' && !input.activity_id) {
      const range = normalizeDateRange(input.from, input.to, state.todayStr);
      if (typeof range === 'string') return fail(`For a period power curve, ${range}`);
      const { data, error } = await supabase
        .from('activities')
        .select('power_curve_summary')
        .eq('user_id', userId)
        .gte('start_date', `${range.from}T00:00:00Z`)
        .lte('start_date', `${range.to}T23:59:59Z`)
        .not('power_curve_summary', 'is', null);
      if (error) throw error;
      if (!data?.length) return fail('No rides with power in that range.');
      const best = {};
      for (const r of data) {
        for (const [k, w] of Object.entries(r.power_curve_summary || {})) {
          if (typeof w === 'number' && w > (best[k] ?? 0)) best[k] = w;
        }
      }
      spec = { kind: 'power_curve', from: range.from, to: range.to, caption: caption(input) };
      summary = `Best power ${range.from} → ${range.to} across ${data.length} rides: ${describeCurve(best)}.`;
    }

    if (input.kind === 'route_preview') {
      let query = supabase.from('routes').select('id, name, distance_km').eq('user_id', userId);
      if (input.route_id) query = query.eq('id', input.route_id);
      else if (input.route_name) query = query.ilike('name', `%${String(input.route_name).slice(0, 80)}%`);
      else return fail('route_id or route_name is required.');
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(1);
      if (error) throw error;
      const route = data?.[0];
      if (!route) return fail('No saved route matches. Use an id from the SAVED ROUTES list.');
      const range = normalizeRangeKm(input.range_km, route.distance_km != null ? Number(route.distance_km) : null);
      if (typeof range === 'string') return fail(range);
      spec = { kind: 'route_preview', route_id: route.id, range_km: range, caption: caption(input) };
      summary = `Showing saved route "${route.name}"`
        + (route.distance_km != null ? `, ${round1(Number(route.distance_km))} km` : '')
        + (range ? `, zoomed to ${range[0]}–${range[1]} km.` : '.');
    }

    // Drop undefined keys so the stored spec stays tidy.
    const clean = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined));
    state.visuals.push(clean);
    return { success: true, shown: true, summary };
  } catch (err) {
    console.error('show_visual failed:', err?.message || err);
    return fail('Could not load the data for that visual.');
  }
}

const CURVE_KEYS = [['5s', '5 s'], ['60s', '1 min'], ['300s', '5 min'], ['1200s', '20 min'], ['3600s', '60 min']];

function describeCurve(pcs) {
  const parts = CURVE_KEYS.filter(([k]) => pcs[k] > 0).map(([k, label]) => `${label} ${Math.round(pcs[k])} W`);
  return parts.length ? parts.join(', ') : 'no standard durations recorded';
}

/**
 * Short lists for the system prompt so the coach has real ids to point at
 * without spending a tool round looking them up.
 */
export async function buildVisualReferenceBlock(supabase, userId) {
  const [acts, routes] = await Promise.all([
    supabase
      .from('activities')
      .select('id, name, start_date, distance, type')
      .eq('user_id', userId)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null)
      .order('start_date', { ascending: false })
      .limit(10),
    supabase
      .from('routes')
      .select('id, name, distance_km')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(8),
  ]);
  const actLines = (acts.data || []).map(
    (a) => `- ${String(a.start_date || '').slice(0, 10)} · ${a.name || a.type || 'Activity'} · `
      + `${round1((a.distance || 0) / 1000)} km · id ${a.id}`,
  );
  const routeLines = (routes.data || []).map(
    (r) => `- ${r.name || 'Untitled'}${r.distance_km != null ? ` · ${round1(Number(r.distance_km))} km` : ''} · id ${r.id}`,
  );
  return `\n\n## VISUALS
This conversation is on the Coach page, which can show charts and maps. Use the show_visual tool when a picture helps (see its description). Never invent ids; use these or query_training_data.

RECENT ACTIVITIES (newest first):
${actLines.join('\n') || '- none'}

SAVED ROUTES (recently edited first):
${routeLines.join('\n') || '- none'}`;
}
