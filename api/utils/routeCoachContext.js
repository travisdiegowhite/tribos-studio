// Server-side context assembly for /api/route-coach (Unit 4, PR-4A).
//
// The Route Builder generation prompt reads everything Units 1–3 wired
// into src/utils/enhancedContext.js. That collector is a class of static
// methods bound to the BROWSER Supabase singleton — it cannot run inside
// a Vercel function. This module replicates the four fetchers the route
// coach needs (persona, fitness state, today's prescription, familiar
// roads) against the server-side service-role client, plus the prompt
// rendering. It mirrors how api/coach.js assembles its own context
// server-side rather than importing src/ code.
//
// Pure spatial / classification helpers are inlined (small, no I/O) to
// keep this module free of src/ imports — src/utils/geo.js,
// distanceUnits.ts, and stadiaMapsRouter.js pull in import.meta.env and
// posthog-js, which break under the Node serverless runtime.

import { PERSONA_DATA } from './personaData.js';
import { getRouteWeather } from './routeWeatherContext.js';

// ── Inlined pure helpers (ports of src/utils/{distanceUnits,geo,formBands}) ──

const KM_PER_DEGREE_LAT = 111;

function M_TO_KM(m) {
  return m / 1000;
}

/** Great-circle distance in meters. Signature matches haversineMeters in
 *  src/utils/distanceUnits.ts: (lat1, lon1, lat2, lon2). */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeBboxAround(centerLngLat, radiusKm) {
  const [lng, lat] = centerLngLat;
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const safeCosLat = Math.max(Math.abs(cosLat), 0.01);
  const lngDelta = radiusKm / (KM_PER_DEGREE_LAT * safeCosLat);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

function recencyMultiplier(lastRiddenAt, recencyWeight, decayDays) {
  if (!recencyWeight || recencyWeight <= 0) return 1;
  if (!lastRiddenAt) return 1;
  const ageMs = Date.now() - new Date(lastRiddenAt).getTime();
  if (ageMs < 0) return 1 + recencyWeight / 100;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (!decayDays || decayDays <= 0 || ageDays >= decayDays) return 1;
  const freshness = 1 - ageDays / decayDays;
  return 1 + (recencyWeight / 100) * freshness;
}

function computeDirectionalBias(segments, startLngLat, recencyWeight = 0, decayDays = 180) {
  const [startLng, startLat] = startLngLat;
  const buckets = { east: 0, west: 0, north: 0, south: 0 };

  for (const seg of segments) {
    const sLat = Number(seg.start_lat);
    const sLng = Number(seg.start_lng);
    const eLat = Number(seg.end_lat);
    const eLng = Number(seg.end_lng);
    if (
      !Number.isFinite(sLat) ||
      !Number.isFinite(sLng) ||
      !Number.isFinite(eLat) ||
      !Number.isFinite(eLng)
    ) {
      continue;
    }

    const midLat = (sLat + eLat) / 2;
    const midLng = (sLng + eLng) / 2;
    const dLng = midLng - startLng;
    const dLat = midLat - startLat;

    const lengthKm = M_TO_KM(haversineMeters(sLat, sLng, eLat, eLng));
    const weighted = lengthKm * recencyMultiplier(seg.last_ridden_at, recencyWeight, decayDays);

    if (Math.abs(dLng) >= Math.abs(dLat)) {
      if (dLng >= 0) buckets.east += weighted;
      else buckets.west += weighted;
    } else {
      if (dLat >= 0) buckets.north += weighted;
      else buckets.south += weighted;
    }
  }

  const total = buckets.east + buckets.west + buckets.north + buckets.south;
  if (total === 0) return { east: 0, west: 0, north: 0, south: 0 };

  return {
    east: Number((buckets.east / total).toFixed(2)),
    west: Number((buckets.west / total).toFixed(2)),
    north: Number((buckets.north / total).toFixed(2)),
    south: Number((buckets.south / total).toFixed(2)),
  };
}

function classifyFormBandDisplay(fs) {
  if (fs == null || !Number.isFinite(Number(fs))) return null;
  const v = Number(fs);
  if (v > 20) return 'transition';
  if (v >= 10) return 'fresh';
  if (v >= -5) return 'grey zone';
  if (v >= -30) return 'optimal training load';
  return 'high risk / overreached';
}

function classifyFsConfidenceTier(c) {
  if (c == null || !Number.isFinite(Number(c))) return null;
  const v = Number(c);
  if (v >= 0.85) return 'high';
  if (v >= 0.6) return 'moderate';
  return 'low';
}

function daysBetween(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  const ms = Math.abs(db.getTime() - da.getTime());
  return Math.round(ms / 86400000);
}

/** Normalize a start location to canonical [lng, lat], or null. */
function toLngLat(startLocation) {
  let lngLat = startLocation;
  if (!Array.isArray(lngLat) && lngLat && typeof lngLat === 'object') {
    const lng = lngLat.lng ?? lngLat.longitude ?? lngLat.lon;
    const lat = lngLat.lat ?? lngLat.latitude;
    if (lng === undefined || lat === undefined) return null;
    lngLat = [lng, lat];
  }
  if (!Array.isArray(lngLat) || lngLat.length < 2) return null;
  const [lng, lat] = lngLat;
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null;
  return [Number(lng), Number(lat)];
}

// ── Context fetchers (service-role client passed in) ─────────────────────────

/**
 * Unit 2: the rider's coaching persona. Returns a PersonaId or null when
 * the rider is 'pending' (onboarding incomplete), missing a row, or on error.
 */
export async function getCoachPersona(supabase, userId) {
  try {
    const { data, error } = await supabase
      .from('user_coach_settings')
      .select('coaching_persona')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.coaching_persona === 'pending') return null;
    return data.coaching_persona ?? null;
  } catch {
    return null;
  }
}

/**
 * Unit 1: real fitness state from training_load_daily (most recent 7 days).
 * Returns an all-null shape when there are no rows — the renderer drops
 * null lines so new users degrade gracefully.
 */
export async function getFitnessState(supabase, userId) {
  const empty = {
    weeklyLoadRSS: null,
    tfi: null,
    afi: null,
    formScore: null,
    formBand: null,
    fsConfidence: null,
    fsConfidenceTier: null,
    lastHardDayDaysAgo: null,
    rssSource: null,
    latestDate: null,
  };
  try {
    const { data, error } = await supabase
      .from('training_load_daily')
      .select('date, rss, tfi, afi, form_score, fs_confidence, rss_source')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(7);

    if (error || !data || data.length === 0) return empty;

    const todayRow = data[0];
    const rss7d = data.reduce((sum, r) => sum + Number(r.rss ?? 0), 0);
    const lastHardDay = data.find((r) => Number(r.rss ?? 0) > 80);
    const today = new Date().toISOString().slice(0, 10);
    const formScore = todayRow.form_score != null ? Number(todayRow.form_score) : null;
    const fsConfidence = todayRow.fs_confidence != null ? Number(todayRow.fs_confidence) : null;

    return {
      weeklyLoadRSS: rss7d > 0 ? rss7d : null,
      tfi: todayRow.tfi != null ? Number(todayRow.tfi) : null,
      afi: todayRow.afi != null ? Number(todayRow.afi) : null,
      formScore,
      formBand: classifyFormBandDisplay(formScore),
      fsConfidence,
      fsConfidenceTier: classifyFsConfidenceTier(fsConfidence),
      lastHardDayDaysAgo: lastHardDay ? daysBetween(lastHardDay.date, today) : null,
      rssSource: todayRow.rss_source ?? null,
      latestDate: todayRow.date ?? null,
    };
  } catch {
    return empty;
  }
}

/**
 * Unit 1: today's prescribed workout from planned_workouts.
 *
 * Server-side variant: returns only the fields stored directly on the
 * planned_workouts row (no in-code workout-library hydration — that
 * library is an 84KB TS data module that does not belong in a serverless
 * bundle). The route coach needs to know whether a workout is scheduled
 * and its intensity, not the full interval tree. Returns null when no
 * incomplete workout is scheduled for today.
 *
 * targetRSS is read canonical-first with legacy fallback per CLAUDE.md.
 */
export async function getTodaysPrescription(supabase, userId) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase
      .from('planned_workouts')
      .select(
        'id, scheduled_date, workout_type, name, target_rss, target_tss, ' +
          'target_duration, duration_minutes, completed, notes'
      )
      .eq('user_id', userId)
      .eq('scheduled_date', today)
      .eq('completed', false)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const durationMin =
      data.duration_minutes ??
      (data.target_duration != null ? Math.round(Number(data.target_duration) / 60) : null);

    return {
      name: data.name ?? data.workout_type ?? "Today's workout",
      category: data.workout_type ?? null,
      durationMin,
      targetRSS: data.target_rss ?? data.target_tss ?? null,
      coachNotes: data.notes ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Unit 3: aggregate familiar-roads descriptor for the candidate routing
 * area. Returns null for new users with no familiar segments nearby (the
 * prompt block is silent) and on any error.
 */
export async function getFamiliarRoads(supabase, userId, startLocation, targetDistanceKm) {
  try {
    if (!userId || !startLocation || !targetDistanceKm) return null;
    const lngLat = toLngLat(startLocation);
    if (!lngLat) return null;

    const { data: prefsData } = await supabase
      .from('user_road_preferences')
      .select(
        'familiarity_strength, explore_mode, min_rides_for_familiar, ' +
          'recency_weight, familiarity_decay_days'
      )
      .eq('user_id', userId)
      .maybeSingle();

    const prefs = prefsData ?? {
      familiarity_strength: 50,
      explore_mode: false,
      min_rides_for_familiar: 2,
      recency_weight: 30,
      familiarity_decay_days: 180,
    };

    const bbox = computeBboxAround(lngLat, targetDistanceKm * 0.6);

    const { data: segments, error } = await supabase.rpc('get_user_segments_in_bbox', {
      p_user_id: userId,
      p_min_lat: bbox.minLat,
      p_max_lat: bbox.maxLat,
      p_min_lng: bbox.minLng,
      p_max_lng: bbox.maxLng,
      p_min_ride_count: prefs.min_rides_for_familiar,
    });

    if (error || !segments || segments.length === 0) return null;

    const decayDays = prefs.familiarity_decay_days;
    const fresh =
      !decayDays || decayDays <= 0
        ? segments
        : segments.filter((s) => {
            if (!s.last_ridden_at) return true;
            const ageDays =
              (Date.now() - new Date(s.last_ridden_at).getTime()) / (24 * 60 * 60 * 1000);
            return ageDays <= decayDays;
          });

    if (fresh.length === 0) return null;

    let totalFamiliarKm = 0;
    for (const seg of fresh) {
      totalFamiliarKm += M_TO_KM(
        haversineMeters(
          Number(seg.start_lat),
          Number(seg.start_lng),
          Number(seg.end_lat),
          Number(seg.end_lng)
        )
      );
    }

    const topRideCount = fresh[0]?.ride_count ?? 0;
    const directionalBias = computeDirectionalBias(
      fresh,
      lngLat,
      prefs.recency_weight,
      prefs.familiarity_decay_days
    );

    return {
      familiarSegmentCount: fresh.length,
      totalFamiliarKm: Number(totalFamiliarKm.toFixed(1)),
      topRideCount,
      directionalBias,
      familiarityStrength: prefs.familiarity_strength,
      exploreMode: prefs.explore_mode,
      minRidesForFamiliar: prefs.min_rides_for_familiar,
      familiarityDecayDays: prefs.familiarity_decay_days,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all four context blocks in parallel. Each fetcher catches its own
 * errors and returns null / empty, so this never throws.
 */
export async function collectRouteCoachContext(supabase, userId, routeSnapshot) {
  const startLocation = routeSnapshot?.startLocation;
  const targetDistanceKm = Number(routeSnapshot?.stats?.distance_km) || 30;
  const coordinates = routeSnapshot?.geometry?.coordinates;

  const [persona, fitnessState, prescription, familiarRoads, weather] = await Promise.all([
    getCoachPersona(supabase, userId),
    getFitnessState(supabase, userId),
    getTodaysPrescription(supabase, userId),
    getFamiliarRoads(supabase, userId, startLocation, targetDistanceKm),
    getRouteWeather(startLocation, coordinates),
  ]);

  return { persona, fitnessState, prescription, familiarRoads, weather };
}

// ── Prompt rendering ─────────────────────────────────────────────────────────

/** Render the FAMILIAR ROADS block. Port of renderFamiliarRoads in
 *  src/utils/promptBuilders.js. Empty string when descriptor is null. */
function renderFamiliarRoads(familiarRoads) {
  if (!familiarRoads) return '';

  const {
    familiarSegmentCount,
    totalFamiliarKm,
    topRideCount,
    directionalBias,
    familiarityStrength,
    exploreMode,
    minRidesForFamiliar,
    familiarityDecayDays,
  } = familiarRoads;

  const lines = [];
  lines.push(
    `- This rider has ${familiarSegmentCount} familiar road segments in the candidate routing area ` +
      `(segments ridden ${minRidesForFamiliar}+ times within the last ${familiarityDecayDays} days)`
  );
  lines.push(`- Total familiar mileage in candidate area: ~${totalFamiliarKm} km`);
  lines.push(`- Most-ridden segment in this area: ${topRideCount} times`);

  const biasParts = Object.entries(directionalBias)
    .filter(([, share]) => share > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([dir, share]) => `${dir} ${Math.round(share * 100)}%`)
    .join(', ');
  if (biasParts) {
    lines.push(`- Direction of familiarity from start: ${biasParts}`);
  }

  let guidance;
  if (exploreMode) {
    guidance =
      '\nGUIDANCE: The rider has explore_mode enabled. Where the request is flexible on ' +
      'direction, bias toward UNFAMILIAR areas. The prescription still takes precedence.';
  } else if (familiarityStrength >= 70) {
    guidance =
      `\nGUIDANCE: The rider strongly prefers familiar roads (familiarity_strength=${familiarityStrength}). ` +
      'Where the request is flexible on direction, bias strongly toward the highest-share directions.';
  } else if (familiarityStrength >= 30) {
    guidance =
      `\nGUIDANCE: The rider has a moderate preference for familiar roads ` +
      `(familiarity_strength=${familiarityStrength}). Lean toward the higher-share directions, but ` +
      'treat familiarity as one consideration among several.';
  } else {
    guidance =
      `\nGUIDANCE: The rider has a low preference for familiarity ` +
      `(familiarity_strength=${familiarityStrength}). Use this signal lightly.`;
  }
  lines.push(guidance);
  lines.push(
    '\nDo not invent road names. Refer to areas by direction (east, north-east, etc.) or by ' +
      "distance from start. The rider's road data does not include street names."
  );

  return lines.join('\n');
}

/** Render the FITNESS STATE block. Empty string when all fields are null. */
function renderFitnessStateBlock(fitnessState) {
  if (!fitnessState) return '';
  const lines = [];

  if (fitnessState.weeklyLoadRSS != null) {
    lines.push(`- Weekly load (RSS, 7-day): ${Number(fitnessState.weeklyLoadRSS).toFixed(0)}`);
  }
  if (fitnessState.tfi != null) {
    lines.push(`- Training Fitness Index (TFI, long-term): ${Number(fitnessState.tfi).toFixed(0)}`);
  }
  if (fitnessState.afi != null) {
    lines.push(`- Acute Fatigue Index (AFI, short-term): ${Number(fitnessState.afi).toFixed(0)}`);
  }
  if (fitnessState.formScore != null && fitnessState.formBand) {
    const tier = fitnessState.fsConfidenceTier;
    const fs = Number(fitnessState.formScore).toFixed(0);
    const band = fitnessState.formBand;
    if (tier === 'high' || tier == null) {
      lines.push(`- Form score (FS): ${fs} (band: ${band})`);
    } else if (tier === 'moderate') {
      lines.push(`- Form score (FS): ~${fs} (band: approximately ${band}, moderate confidence)`);
    } else {
      lines.push(
        `- Form score (FS): ~${fs} (band: approximately ${band}, LOW confidence — ` +
          'limited recent ride data, weight this signal lightly)'
      );
    }
  }
  if (fitnessState.lastHardDayDaysAgo != null) {
    lines.push(`- Last hard day: ${fitnessState.lastHardDayDaysAgo} day(s) ago`);
  }

  return lines.join('\n');
}

/** Render the PRESCRIBED WORKOUT block. Empty string when prescription is null. */
function renderPrescriptionBlock(prescription) {
  if (!prescription) return '';
  const lines = [];
  lines.push(`- Name: ${prescription.name}`);
  if (prescription.category) lines.push(`- Category: ${prescription.category}`);
  if (prescription.durationMin != null) {
    lines.push(`- Duration: ${prescription.durationMin} minutes`);
  }
  if (prescription.targetRSS != null) {
    lines.push(`- Target stress (RSS): ${prescription.targetRSS}`);
  }
  if (prescription.coachNotes) {
    lines.push(`- Coach notes: ${String(prescription.coachNotes).replace(/\s+/g, ' ').trim()}`);
  }
  return lines.join('\n');
}

/** Render the WIND & WEATHER block. Empty string when weather is null. */
function renderWeatherBlock(weather) {
  if (!weather) return '';
  const lines = [];

  const tempBits = [`${weather.temperatureC}°C`];
  if (weather.feelsLikeC != null && weather.feelsLikeC !== weather.temperatureC) {
    tempBits.push(`feels like ${weather.feelsLikeC}°C`);
  }
  lines.push(`- Current conditions at the start: ${tempBits.join(', ')}`);
  if (weather.description) {
    lines.push(`- Sky: ${weather.description}`);
  }

  if (weather.windSpeedKmh != null) {
    const dir = weather.windDirection ? ` from the ${weather.windDirection}` : '';
    const gust =
      weather.windGustKmh != null && weather.windGustKmh > weather.windSpeedKmh
        ? `, gusting ${weather.windGustKmh} km/h`
        : '';
    lines.push(`- Wind: ${weather.windSpeedKmh} km/h${dir}${gust}`);
  }

  if (weather.wind) {
    const w = weather.wind;
    lines.push(
      `- Wind along THIS route: ${w.headwind}% headwind, ${w.tailwind}% tailwind, ` +
        `${w.crosswind}% crosswind (${w.overall})`
    );
  }

  // Hazard flag — the coach must surface dangerous conditions regardless of voice.
  const conditions = weather.conditions || '';
  if (
    conditions.includes('thunder') ||
    conditions.includes('storm') ||
    conditions.includes('snow') ||
    (conditions.includes('freezing') && conditions.includes('rain'))
  ) {
    lines.push('- HAZARD: conditions may be unsafe to ride — call this out plainly.');
  }

  return lines.join('\n');
}

/**
 * Assemble the route-coach system prompt. Sectioned-string shape, mirrors
 * api/coach.js. Route-builder-specific sections plus the Units 1–3 context.
 */
export function buildRouteCoachSystemPrompt({
  persona,
  prescription,
  fitnessState,
  familiarRoads,
  weather,
  routeSnapshot,
  userLocalDate,
}) {
  const sections = [];

  const dateString = userLocalDate?.dateString || new Date().toDateString();
  sections.push(`=== TEMPORAL ANCHOR ===
Today is ${dateString}.
The rider is looking at a cycling route they generated and wants to refine it.`);

  if (persona && PERSONA_DATA[persona]) {
    const p = PERSONA_DATA[persona];
    const rules = (p.styleRules || []).map((r) => `- ${r}`).join('\n');
    sections.push(`=== COACHING PERSONA: ${p.name.toUpperCase()} ===
You are ${p.name}. Adopt this voice in every response — it overrides any generic tone.
Philosophy: ${p.philosophy}
Voice: ${p.voice}
STYLE RULES (non-negotiable):
${rules}

The voice applies to your conversational replies. It does NOT change the structured
apply_route_edit tool parameters — those are mechanical instructions to the routing
engine, not user-facing copy.`);
  }

  const stats = routeSnapshot?.stats || {};
  const durationMin = stats.duration_s != null ? Math.round(Number(stats.duration_s) / 60) : null;
  sections.push(`=== CURRENT ROUTE ===
The rider has generated a route with these characteristics:
- Distance: ${stats.distance_km != null ? Number(stats.distance_km).toFixed(1) : '?'} km
- Elevation gain: ${stats.elevation_gain_m != null ? stats.elevation_gain_m : '?'} m
- Estimated duration: ${durationMin != null ? durationMin : '?'} min
- Profile: ${routeSnapshot?.routeProfile || 'road'}
- Start location: ${JSON.stringify(routeSnapshot?.startLocation ?? null)}
- Number of geometry points: ${routeSnapshot?.geometry?.coordinates?.length ?? 0}`);

  const prescriptionBlock = renderPrescriptionBlock(prescription);
  if (prescriptionBlock) {
    sections.push(`=== PRESCRIBED WORKOUT ===
${prescriptionBlock}

Any route refinement should remain compatible with this prescription unless the
rider explicitly chooses to override it.`);
  }

  const fitnessBlock = renderFitnessStateBlock(fitnessState);
  if (fitnessBlock) {
    sections.push(`=== FITNESS STATE ===
${fitnessBlock}`);
  }

  const familiarBlock = renderFamiliarRoads(familiarRoads);
  if (familiarBlock) {
    sections.push(`=== FAMILIAR ROADS ===
${familiarBlock}`);
  }

  const weatherBlock = renderWeatherBlock(weather);
  if (weatherBlock) {
    sections.push(`=== WIND & WEATHER ===
${weatherBlock}

When the wind is strong (~20+ km/h) and the rider is flexible on direction,
proactively suggest riding the windward leg first so they earn a tailwind on
the way home — use shift_direction or reverse to enact it. Frame it as a
suggestion, never force it, and never override the prescription. Surface any
HAZARD line plainly regardless of your coach voice.`);
  }

  sections.push(`=== CRITICAL REQUIREMENTS ===
- You can ONLY modify the route by calling the apply_route_edit tool. Do not
  describe geometry changes in prose without calling the tool — the route does
  not change unless the tool is called.
- When the rider asks for a change, describe the proposed change in prose first,
  then call the tool to enact it.
- Do not invent road names. The familiar-roads data has no street names.
- Familiarity bias does not override the prescription.
- Safety language is mandatory regardless of coach voice.
- Use canonical Tribos metric names: RSS, TFI, AFI, FS, RI. Do not use the
  deprecated names TSS, CTL, ATL, TSB, NP, or IF.
- If you don't understand the request, ask one clarifying question rather than
  guessing. Do not fall back to a generic "I don't understand" reply.`);

  sections.push(`=== INSTRUCTIONS ===
You are helping the rider refine the route they're looking at. They describe what
they want changed in natural language. Your job is to:
1. Understand what they're asking for (ask one clarifying question only if truly
   ambiguous).
2. Reason about whether the change is compatible with the prescription, their
   fitness state, and the familiar-roads context.
3. Describe the proposed change in your persona voice.
4. Call the apply_route_edit tool with the structured parameters.

If the rider rejects a change ("no, not that"), acknowledge it and ask what they'd
prefer instead — do not retry the same edit. If the rider asks something unrelated
to route editing, answer conversationally but do not call the tool.`);

  return sections.join('\n\n');
}

export default {
  getCoachPersona,
  getFitnessState,
  getTodaysPrescription,
  getFamiliarRoads,
  collectRouteCoachContext,
  buildRouteCoachSystemPrompt,
};
