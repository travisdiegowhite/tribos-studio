#!/usr/bin/env node
/**
 * OSM tag coverage audit — docs/COMFORT-ROUTING-SPEC.md §5 Phase 0A.
 *
 * For a bounding box (default: the Front Range test area covering every
 * harness start point), report by `highway` class the share of road miles
 * that carry `maxspeed`, `lanes`, `cycleway*`, `shoulder*` and `surface`.
 * This decides which of the §6 data sources matter.
 *
 * One Overpass query does the work server-side: for each class and tag it
 * sums way lengths with `make stat … sum(length())`, so no geometry is
 * downloaded. Writes docs/audit/osm-coverage-<date>.md.
 *
 *   npm run audit:osm-coverage
 *   npm run audit:osm-coverage -- --bbox 39.3,-105.6,40.75,-104.4 --endpoint https://overpass-api.de/api/interpreter
 *   npm run audit:osm-coverage -- --dry-run      # print the query only
 *
 * The comfort harness reports the same columns for ridden miles (its
 * "Tag coverage on ridden miles" table); this is the network-wide view.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const HIGHWAYS = [
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'service',
  'track',
  'cycleway',
  'path',
];

/** [label, Overpass filter] — the filter is appended to `way[highway=…]`. */
const TAGS = [
  ['all', ''],
  ['maxspeed', '[maxspeed]'],
  ['lanes', '[lanes]'],
  ['cycleway*', '[~"^cycleway"~"."]'],
  ['shoulder*', '[~"^shoulder"~"."]'],
  ['surface', '[surface]'],
  ['unpaved', '[surface~"^(gravel|fine_gravel|compacted|dirt|earth|ground|unpaved|grass|sand|pebblestone|mud)$"]'],
];

// South, west, north, east — every start point in
// scripts/comfort-harness/start-points.json plus a 75 mi loop's reach.
const DEFAULT_BBOX = [39.2, -105.65, 40.85, -104.3];
const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const MI_M = 1609.344;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function buildQuery(bbox) {
  const [s, w, n, e] = bbox;
  const parts = [`[out:json][timeout:600][maxsize:1073741824][bbox:${s},${w},${n},${e}];`];
  for (const hw of HIGHWAYS) {
    for (const [label, filter] of TAGS) {
      parts.push(`way[highway=${hw}]${filter};make stat highway="${hw}",tag="${label}",m=sum(length());out;`);
    }
  }
  return parts.join('\n');
}

export function parseStats(json) {
  const table = {};
  for (const el of json?.elements ?? []) {
    if (el.type !== 'stat' || !el.tags) continue;
    const { highway, tag, m } = el.tags;
    (table[highway] ??= {})[tag] = Number(m) || 0;
  }
  return table;
}

export function renderMarkdown(table, bbox, endpoint, date) {
  const pct = (x, d) => (d > 0 ? `${Math.round((x / d) * 100)}%` : '–');
  const total = HIGHWAYS.reduce((sum, hw) => sum + (table[hw]?.all ?? 0), 0);
  const lines = [
    `# OSM tag coverage — Front Range (${date})`,
    '',
    `Phase 0A of docs/COMFORT-ROUTING-SPEC.md. Bounding box ${bbox.join(', ')} (S, W, N, E); Overpass ${endpoint}.`,
    'Share of each road class\'s miles carrying the tag. `cycleway*` and `shoulder*` count any key with that prefix (`cycleway:right`, `shoulder:left`, …).',
    '',
    '| highway | Miles | Share | maxspeed | lanes | cycleway* | shoulder* | surface | unpaved |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const hw of HIGHWAYS) {
    const r = table[hw] ?? {};
    const all = r.all ?? 0;
    lines.push(
      `| ${hw} | ${Math.round(all / MI_M).toLocaleString('en-US')} | ${pct(all, total)} | ${pct(r.maxspeed ?? 0, all)} | ${pct(r.lanes ?? 0, all)} | ${pct(r['cycleway*'] ?? 0, all)} | ${pct(r['shoulder*'] ?? 0, all)} | ${pct(r.surface ?? 0, all)} | ${pct(r.unpaved ?? 0, all)} |`,
    );
  }
  lines.push(
    '',
    '## Reading it',
    '',
    '- **maxspeed on `unclassified`/`tertiary`/`secondary`** is the number that matters most: a paved road of those classes with no maxspeed is `unknown` to the classifier (flagged, not blocked — decision 2026-11-02). Low coverage here means §6 speed data (CDOT OTIS, county GIS) earns its keep.',
    '- **shoulder*** decides whether classes 3/4 (room to ride) can be told from 5 (no space) on fast roads. CDOT cross-section data covers state highways only.',
    '- **unpaved** share of `unclassified` is roughly how much of the county network the "gravel is light traffic" rule covers.',
    '',
  );
  return lines.join('\n');
}

async function main() {
  const bbox = (arg('bbox')?.split(',').map(Number)) ?? DEFAULT_BBOX;
  const endpoint = arg('endpoint') ?? DEFAULT_ENDPOINT;
  const query = buildQuery(bbox);
  if (process.argv.includes('--dry-run')) {
    console.log(query);
    return;
  }
  console.log(`Querying ${endpoint} for ${HIGHWAYS.length * TAGS.length} sums… (can take several minutes)`);
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Overpass ${resp.status}: ${text.slice(0, 300)}`);
  const table = parseStats(JSON.parse(text));
  if (Object.keys(table).length === 0) throw new Error('Overpass returned no stats; check the endpoint supports make/length().');
  const date = new Date().toISOString().slice(0, 10);
  const out = resolve(arg('out') ?? `docs/audit/osm-coverage-${date}.md`);
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, renderMarkdown(table, bbox, endpoint, date));
  console.log(`wrote ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
