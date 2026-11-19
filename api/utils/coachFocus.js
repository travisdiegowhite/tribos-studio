/**
 * The part of a chart the athlete selected on the /coach page, turned into
 * numbers the coach can talk about.
 *
 * The browser sends `focus: { kind, activity_id | route_id, range_km | date }`.
 * Nothing in it is trusted: every id is re-read here with the user_id filter
 * (the service-role client bypasses RLS, so that filter IS the boundary), and
 * the stats are computed from the stored streams, never taken from the client.
 *
 * Distances follow the repo convention: `_km` names, streams' coords are
 * [lng, lat] (activity_streams JSONB, see src/utils/streamChartData.ts).
 */

import { haversineDistance } from './polylineDecode.js';

const round1 = (n) => Math.round(n * 10) / 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// FIT sentinels, mirroring src/utils/streamChartData.ts.
const MAX_VALID_POWER = 2500;
const MAX_VALID_HR = 250;
const MAX_VALID_SPEED_MPS = 40;

const valid = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < max;

/** Cumulative km along activity_streams.coords ([lng, lat]); [] without coords. */
export function streamDistancesKm(streams) {
  const coords = Array.isArray(streams?.coords) ? streams.coords : [];
  if (coords.length < 2) return [];
  const distances_km = [0];
  for (let i = 1; i < coords.length; i += 1) {
    const [lng1, lat1] = coords[i - 1] || [];
    const [lng2, lat2] = coords[i] || [];
    const step_km = [lng1, lat1, lng2, lat2].every(Number.isFinite) ? haversineDistance(lat1, lng1, lat2, lng2) : 0;
    distances_km.push(distances_km[i - 1] + step_km);
  }
  return distances_km;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Stats for one stretch of a ride. Streams are often downsampled, so this is
 * deliberately plain: averages and peaks of the samples, climbing from the
 * elevation trace, and a duration from distance ÷ speed. No Equivalent Power
 * — that needs a 1 Hz power trace these samples don't guarantee.
 *
 * @returns {null | { distance_km:number, duration_min:number|null, avg_power_w:number|null,
 *   max_power_w:number|null, avg_hr_bpm:number|null, max_hr_bpm:number|null, avg_speed_kmh:number|null,
 *   elevation_gain_m:number|null, avg_grade_pct:number|null, text:string }}
 */
export function segmentStats(streams, range_km) {
  const distances_km = streamDistancesKm(streams);
  if (!distances_km.length || !Array.isArray(range_km)) return null;
  const [start_km, end_km] = range_km;
  const idx = [];
  for (let i = 0; i < distances_km.length; i += 1) {
    if (distances_km[i] >= start_km && distances_km[i] <= end_km) idx.push(i);
  }
  if (idx.length < 2) return null;

  const pick = (key, max) => idx.map((i) => streams?.[key]?.[i]).filter((v) => valid(v, max));
  const power = pick('power', MAX_VALID_POWER);
  const hr = pick('heartRate', MAX_VALID_HR).filter((v) => v > 0);
  const elev = idx.map((i) => streams?.elevation?.[i]).filter((v) => typeof v === 'number' && Number.isFinite(v));

  const distance_km = distances_km[idx[idx.length - 1]] - distances_km[idx[0]];

  // Duration: each step's distance at that sample's speed.
  let seconds = 0;
  let timed_km = 0;
  for (let j = 1; j < idx.length; j += 1) {
    const v = streams?.speed?.[idx[j]];
    if (valid(v, MAX_VALID_SPEED_MPS) && v > 0.5) {
      const step_km = distances_km[idx[j]] - distances_km[idx[j - 1]];
      seconds += (step_km * 1000) / v;
      timed_km += step_km;
    }
  }
  // Only trust it when speed covered most of the stretch.
  const duration_min = timed_km > distance_km * 0.8 && seconds > 0 ? seconds / 60 : null;

  let gain_m = 0;
  for (let j = 1; j < elev.length; j += 1) {
    const d = elev[j] - elev[j - 1];
    if (d > 0) gain_m += d;
  }
  const net_m = elev.length >= 2 ? elev[elev.length - 1] - elev[0] : null;

  const out = {
    distance_km: round1(distance_km),
    duration_min: duration_min != null ? round1(duration_min) : null,
    avg_power_w: power.length ? Math.round(mean(power)) : null,
    max_power_w: power.length ? Math.round(Math.max(...power)) : null,
    avg_hr_bpm: hr.length ? Math.round(mean(hr)) : null,
    max_hr_bpm: hr.length ? Math.round(Math.max(...hr)) : null,
    avg_speed_kmh: duration_min ? round1(distance_km / (duration_min / 60)) : null,
    elevation_gain_m: elev.length >= 2 ? Math.round(gain_m) : null,
    avg_grade_pct: net_m != null && distance_km > 0.05 ? round1((net_m / (distance_km * 1000)) * 100) : null,
  };
  out.text = [
    `${out.distance_km} km`,
    out.duration_min != null ? `~${out.duration_min} min` : null,
    out.avg_power_w != null ? `avg ${out.avg_power_w} W (peak ${out.max_power_w} W)` : null,
    out.avg_hr_bpm != null ? `avg HR ${out.avg_hr_bpm} bpm (max ${out.max_hr_bpm})` : null,
    out.avg_speed_kmh != null ? `${out.avg_speed_kmh} km/h` : null,
    out.elevation_gain_m != null ? `+${out.elevation_gain_m} m` : null,
    out.avg_grade_pct != null ? `avg grade ${out.avg_grade_pct}%` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return out;
}

/**
 * Turn a client focus into a context paragraph for the model, or null when it
 * doesn't check out (wrong owner, bad range, no data). Never throws.
 */
export async function buildFocusContext(supabase, userId, focus) {
  if (!focus || typeof focus !== 'object' || !userId) return null;
  try {
    if (focus.kind === 'ride_segment' && typeof focus.activity_id === 'string' && Array.isArray(focus.range_km)) {
      const [a, b] = focus.range_km.map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
      const { data: act } = await supabase
        .from('activities')
        .select('id, name, start_date, activity_streams')
        .eq('id', focus.activity_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!act) return null;
      const stats = segmentStats(act.activity_streams, [a, b]);
      if (!stats) return null;
      return `THE ATHLETE SELECTED a stretch of "${act.name || 'a ride'}" (${String(act.start_date || '').slice(0, 10)}, `
        + `activity id ${act.id}): ${round1(a)}–${round1(b)} km. Measured from the recorded streams: ${stats.text}. `
        + 'Their message is about this stretch. Use these numbers; if you show a visual, use ride_streams with this '
        + 'activity_id and range_km.';
    }

    if (focus.kind === 'fitness_day' && typeof focus.date === 'string' && ISO_DATE.test(focus.date)) {
      const { data: row } = await supabase
        .from('training_load_daily')
        .select('date, rss, tfi, afi, form_score')
        .eq('user_id', userId)
        .eq('date', focus.date)
        .maybeSingle();
      if (!row) return null;
      return `THE ATHLETE SELECTED ${row.date} on their fitness chart: RSS ${Math.round(row.rss ?? 0)}, `
        + `TFI ${Math.round(row.tfi ?? 0)}, AFI ${Math.round(row.afi ?? 0)}, Form Score ${Math.round(row.form_score ?? 0)}. `
        + 'Their message is about that day.';
    }
  } catch (err) {
    console.error('coach focus context failed:', err?.message || err);
  }
  return null;
}
