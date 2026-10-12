/**
 * Race search for the season planner (Phase 6) — used by api/race-search.js.
 *
 * Two sources, cheapest first:
 *   1. race_directory: races other athletes already found and saved (shared).
 *   2. Claude with web search: candidates read from race sites, returned
 *      through a strict `report_races` tool and checked against the pages the
 *      search actually returned, so a made-up race or link is dropped.
 *
 * Nothing here writes a race_goals row. The athlete reviews every candidate
 * in the race form and saves it themselves; only then does upsertDirectory
 * copy their saved values into the directory.
 */

import { haversineDistance } from './polylineDecode.js';

export const SEARCH_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 4000;
const MAX_WEB_SEARCHES = 5;
/** Pages the model may open to read a date or distance off the official site. */
const MAX_WEB_FETCHES = 3;
/** A next edition further out than this is probably the wrong one: kept, but flagged. */
const FAR_EDITION_DAYS = 456;
/** Server-side tool loops can pause; resume at most this many times. */
const MAX_RESUMES = 3;
export const MAX_CANDIDATES = 6;
export const MAX_QUERY_CHARS = 120;
export const MAX_NEAR_CHARS = 80;
/** Directory search window: upcoming races, up to this many days out. */
const DIRECTORY_WINDOW_DAYS = 548;
/** Dedupe: the same race when names match and dates are this close… */
const DEDUPE_DAYS = 3;
/** …and, when both rows have coordinates, start this close. */
const DEDUPE_KM = 25;

/**
 * race_goals.race_type values. A copy of src/utils/raceTypes.js (api/ does not
 * import from src/); raceSearch.test.js fails if the two drift apart.
 */
export const RACE_TYPE_VALUES = [
  'road_race', 'criterium', 'time_trial', 'gran_fondo', 'century', 'gravel', 'cyclocross', 'mtb',
  'run_5k', 'run_10k', 'half_marathon', 'marathon', 'trail_run', 'ultra_run',
  'triathlon', 'duathlon', 'other',
];

/** Lowercase name without accents, years, editions or punctuation: the search and dedupe key. */
export function nameKey(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)\b/g, ' ')
    .replace(/\bannual\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const t = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

// ─── Directory ──────────────────────────────────────────────────────────────

const DIRECTORY_COLUMNS =
  'id, name, name_key, race_date, race_type, distance_km, elevation_gain_m, location, url, source, confirmed_count';

/** Words too common in race names to narrow a search. */
const FILLER_WORDS = new Set(['the', 'race', 'ride', 'run', 'gravel', 'classic', 'road', 'de', 'la', 'le', 'of', 'and']);

/**
 * Upcoming directory races matching the query's words. The database narrows on
 * the first two distinctive words (so "Unbound Gravel 200" still finds
 * "Unbound Gravel"); the rest only rank the matches.
 */
export async function searchDirectory(supabase, { query, today }) {
  const key = nameKey(query);
  if (key.length < 3) return [];
  const words = key.split(' ');
  // Numbers (distances, editions) only rank: "Unbound 200" must still find "Unbound Gravel".
  const distinctive = words.filter((w) => !FILLER_WORDS.has(w) && w.length > 1 && !/^\d+$/.test(w));
  const narrow = (distinctive.length > 0 ? distinctive : words).slice(0, 2);

  let q = supabase.from('race_directory').select(DIRECTORY_COLUMNS);
  for (const w of narrow) q = q.ilike('name_key', `%${w}%`);
  const { data, error } = await q
    .gte('race_date', today)
    .lte('race_date', addDays(today, DIRECTORY_WINDOW_DAYS))
    .order('confirmed_count', { ascending: false })
    .order('race_date', { ascending: true })
    .limit(25);
  if (error) throw new Error(`Directory search failed: ${error.message}`);

  const score = (row) => words.filter((w) => ` ${row.name_key ?? nameKey(row.name)} `.includes(` ${w} `)).length;
  return (data ?? [])
    .map((row, i) => ({ row, i, s: score(row) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 10)
    .map(({ row }) => row);
}

/**
 * Add an athlete's saved race to the directory, or count another confirmation
 * of one already there. The athlete's saved date wins over the stored one.
 */
export async function upsertDirectory(supabase, race, { source = 'athlete', url = null } = {}) {
  const key = nameKey(race.name);
  const date = String(race.race_date ?? '').slice(0, 10);
  if (!key || !DATE_RE.test(date)) return { action: 'skipped' };

  const { data: near, error } = await supabase
    .from('race_directory')
    .select('id, race_date, lat, lng, confirmed_count, url')
    .eq('name_key', key)
    .gte('race_date', addDays(date, -DEDUPE_DAYS))
    .lte('race_date', addDays(date, DEDUPE_DAYS));
  if (error) throw new Error(`Directory lookup failed: ${error.message}`);

  const match = (near ?? []).find((r) => {
    const haveCoords = [r.lat, r.lng, race.lat, race.lng].every((v) => v !== null && v !== undefined);
    return !haveCoords || haversineDistance(Number(r.lat), Number(r.lng), Number(race.lat), Number(race.lng)) <= DEDUPE_KM;
  });

  if (match) {
    const { error: updateError } = await supabase
      .from('race_directory')
      .update({
        race_date: date,
        confirmed_count: (match.confirmed_count ?? 1) + 1,
        last_confirmed_at: new Date().toISOString(),
        url: match.url ?? url,
      })
      .eq('id', match.id);
    if (updateError) throw new Error(`Directory update failed: ${updateError.message}`);
    return { action: 'confirmed', id: match.id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('race_directory')
    .insert({
      name: String(race.name).trim().slice(0, 200),
      name_key: key,
      race_date: date,
      race_type: RACE_TYPE_VALUES.includes(race.race_type) ? race.race_type : null,
      distance_km: race.distance_km ?? null,
      elevation_gain_m: race.elevation_gain_m ?? null,
      location: race.location ? String(race.location).slice(0, 200) : null,
      lat: race.lat ?? null,
      lng: race.lng ?? null,
      url,
      source,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(`Directory insert failed: ${insertError.message}`);
  return { action: 'added', id: inserted?.id ?? null };
}

// ─── Web search ─────────────────────────────────────────────────────────────

const nullable = (type) => ({ anyOf: [{ type }, { type: 'null' }] });

export const REPORT_RACES_TOOL = {
  name: 'report_races',
  description:
    'Report the races you found. Call this exactly once, at the end, even if you found nothing (pass an empty list). ' +
    'One entry per distance option when an event offers several.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['races'],
    properties: {
      races: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'race_date', 'date_status', 'location', 'race_type', 'distance_km', 'elevation_gain_m', 'url', 'note'],
          properties: {
            name: { type: 'string', description: 'Event name, plus the distance option when there are several.' },
            race_date: { type: 'string', format: 'date', description: 'The next edition on or after today, YYYY-MM-DD.' },
            date_status: {
              type: 'string',
              enum: ['announced', 'estimated_from_last_year'],
              description: "'announced' only when a page states the next edition's date.",
            },
            location: { type: 'string', description: 'City and state/region (and country outside the US).' },
            race_type: { type: 'string', enum: RACE_TYPE_VALUES },
            distance_km: nullable('number'),
            elevation_gain_m: nullable('number'),
            url: { type: 'string', description: 'The page that states these details (the official site when possible).' },
            note: { type: 'string', description: 'Anything the athlete should check, in one short sentence. Empty if nothing.' },
          },
        },
      },
    },
  },
};

export function buildSearchPrompt({ query, near, today }) {
  const where = near ? ` near ${near}` : '';
  return [
    `Today is ${today}. Find the endurance race an athlete is looking for: "${query}"${where}.`,
    'Search race calendars and official event sites. Find the next edition on or after today, not a past one.',
    "Open the official event page with web_fetch to read the date, distances and climbing; prefer it over registration aggregators.",
    "If the next edition's date isn't announced yet, give last year's date moved to the same weekend this year and mark it 'estimated_from_last_year'.",
    'Give distances in kilometres and climbing in metres; null when a page does not say.',
    'Only report what the pages you read actually say, with the URL of the page that says it. Do not guess a race into existence.',
    'If several different events match, report the likeliest few. Then call report_races once.',
  ].join('\n');
}

const URL_IN_TEXT = /https?:\/\/[^\s"'<>()\]\[]+/g;

/**
 * Every URL the search turned up, from any block except the report itself:
 * `url` fields, and URLs inside text. With dynamic filtering the results often
 * arrive as code-execution output (stdout text), not as url fields.
 */
export function collectSourceUrls(content, reportTool = REPORT_RACES_TOOL.name) {
  const urls = new Set();
  const walk = (node) => {
    if (typeof node === 'string') {
      for (const m of node.match(URL_IN_TEXT) ?? []) urls.add(m.replace(/[.,;:]+$/, ''));
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [k, v] of Object.entries(node)) {
      if (k === 'url' && typeof v === 'string') urls.add(v);
      else walk(v);
    }
  };
  for (const block of content ?? []) {
    if (block?.type === 'tool_use' && block.name === reportTool) continue;
    walk(block);
  }
  return urls;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null);
const clip = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Keep only candidates a page backs up: a known race type, a real upcoming
 * date, and a link on a site the search actually returned.
 */
export function validateCandidates(races, sourceUrls, today, dropped = {}) {
  const hosts = new Set([...sourceUrls].map(hostOf).filter(Boolean));
  const seen = new Set();
  const out = [];
  const drop = (reason) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };
  for (const r of Array.isArray(races) ? races : []) {
    const host = hostOf(r?.url);
    const date = String(r?.race_date ?? '');
    if (!host || !hosts.has(host)) {
      drop('host');
      continue;
    }
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date)) || date < today) {
      drop('date');
      continue;
    }
    if (!RACE_TYPE_VALUES.includes(r?.race_type)) {
      drop('type');
      continue;
    }
    const name = clip(r.name, 200);
    if (!name) {
      drop('name');
      continue;
    }
    const far = daysBetween(today, date) > FAR_EDITION_DAYS;
    const dupe = `${nameKey(name)}|${date}|${num(r.distance_km)}`;
    if (seen.has(dupe)) continue;
    seen.add(dupe);
    out.push({
      name,
      race_date: date,
      date_status: r.date_status === 'announced' ? 'announced' : 'estimated_from_last_year',
      location: clip(r.location, 200),
      race_type: r.race_type,
      distance_km: num(r.distance_km),
      elevation_gain_m: num(r.elevation_gain_m),
      url: r.url,
      site: host,
      note: [far ? 'This date is more than a year away: check it is the next edition.' : '', clip(r.note, 300)]
        .filter(Boolean)
        .join(' '),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/**
 * Ask Claude to search the web for a race. Returns { candidates, message },
 * where message explains an empty result. Throws the SDK's typed errors.
 */
export async function webSearchRaces(client, { query, near = null, today }) {
  const messages = [{ role: 'user', content: buildSearchPrompt({ query, near, today }) }];
  const allContent = [];
  let nudged = false;

  for (let turn = 0; turn <= MAX_RESUMES + 1; turn++) {
    const response = await client.messages.create({
      model: SEARCH_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_WEB_SEARCHES },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_WEB_FETCHES },
        REPORT_RACES_TOOL,
      ],
      messages,
    });
    allContent.push(...(response.content ?? []));

    if (response.stop_reason === 'refusal') {
      return { candidates: [], message: "The search couldn't run for that query. Try the race's name." };
    }
    const report = (response.content ?? []).find((b) => b.type === 'tool_use' && b.name === REPORT_RACES_TOOL.name);
    if (report) {
      const reported = Array.isArray(report.input?.races) ? report.input.races.length : 0;
      const dropped = {};
      const candidates = validateCandidates(report.input?.races, collectSourceUrls(allContent), today, dropped);
      // One line per search, so "wrong or missing race" reports can be traced. No athlete data.
      console.log('[race-search] web', JSON.stringify({ query, reported, kept: candidates.length, dropped }));
      return {
        candidates,
        message: candidates.length === 0 ? "Couldn't find that race on the web. Check the name, or enter it yourself." : null,
      };
    }
    if (response.stop_reason === 'pause_turn') {
      // Resume the server-side loop: send the paused turn back as-is.
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    if (!nudged && response.stop_reason === 'end_turn') {
      // Answered in prose instead of reporting: ask once for the report.
      nudged = true;
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: 'Now call report_races with what you found (an empty list if nothing).' });
      continue;
    }
    break;
  }
  return { candidates: [], message: "The search didn't finish. Try again, or enter the race yourself." };
}
