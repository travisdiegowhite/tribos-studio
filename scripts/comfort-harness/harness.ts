/**
 * Comfort-routing harness — docs/COMFORT-ROUTING-SPEC.md §5 Phase 0B.
 *
 * For every start point × distance × surface, generate a loop with the
 * chosen engine (deterministic waypoints, no AI), read the way tags along
 * it, and validate it at every comfort level that maps to that request.
 * Writes a JSON results file and a markdown summary, and diffs against a
 * baseline when given one.
 *
 * Run through `npm run harness:comfort -- [options]` (run.mjs bundles this
 * file with esbuild first). See docs/comfort-harness.md.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Coordinate } from '../../src/types/geo';
import type { TaggedWay } from '../../src/utils/wayTags';
import { COMFORT_LEVELS, type ComfortLevel } from '../../src/utils/comfortLevels';
import { classifyRouteSegments, validateMatchedSegments } from '../../src/utils/comfortValidator';
import { comfortClassForTags } from '../../src/utils/comfortClass';
import { loopWaypoints, rescaleRoadFactor, DEFAULT_ROAD_FACTOR } from '../../src/utils/loopWaypoints';
import { matchRouteWays } from '../../src/utils/surfaceOverlay.js';
import { fnv1a32 } from '../../src/utils/stableHash';
import { createEngine, traceTaggedWays, isThrottled, BROUTER_BASE, PROFILE_OVERRIDES, type EngineName, type Surface } from './engines';
import { renderSummary, diffResults, type HarnessResults, type RunRecord, type GenerationRecord } from './report';
import { runLadder } from './ladder';

const MI_M = 1609.344;
const KM_PER_MI = 1.609344;

interface StartPoint {
  id: string;
  category: string;
  lnglat: [number, number];
}

interface Args {
  engine: EngineName;
  points: string[] | null;
  distances: number[];
  levels: ComfortLevel[];
  surfaces: Surface[];
  out: string;
  baseline: string | null;
  delayMs: number;
  limit: number;
  skipUrbanGravel: boolean;
  checkTrace: boolean;
  resume: string | null;
  ladder: boolean;
  allowNearbyStart: boolean;
}

function parseArgs(argv: string[], defaults: { distances: number[]; surfaces: Surface[] }): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
  const engine = (get('engine') ?? 'stadia') as EngineName;
  const date = new Date().toISOString().slice(0, 10);
  return {
    engine,
    points: list(get('points')),
    distances: list(get('distances'))?.map(Number) ?? defaults.distances,
    levels: (list(get('levels'))?.map(Number) ?? [...COMFORT_LEVELS]) as ComfortLevel[],
    surfaces: (list(get('surfaces')) ?? defaults.surfaces) as Surface[],
    out: get('out') ?? `scripts/comfort-harness/results/${engine}${argv.includes('--ladder') ? '-ladder' : ''}-${date}.json`,
    baseline: get('baseline') ?? null,
    delayMs: Number(get('delay-ms') ?? 400),
    limit: Number(get('limit') ?? Infinity),
    skipUrbanGravel: !argv.includes('--include-urban-gravel'),
    checkTrace: argv.includes('--check-trace'),
    resume: get('resume') ?? null,
    ladder: argv.includes('--ladder'),
    allowNearbyStart: !argv.includes('--no-nearby-start'),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic loop bearing per point and distance (multiples of 45°). */
function bearingFor(pointId: string, distanceMi: number): number {
  return (Number.parseInt(fnv1a32(`${pointId}|${distanceMi}`), 16) % 8) * 45;
}

/** Tag-key coverage along the ridden line, by highway class (Phase 0A, route-corridor flavour). */
function tagCoverage(coords: Coordinate[], ways: TaggedWay[]) {
  const matched = (matchRouteWays(coords, ways) ?? []) as Array<TaggedWay | null>;
  const byHighway: Record<string, { m: number; maxspeed: number; lanes: number; cycleway: number; shoulder: number; surface: number; traffic_class: number }> = {};
  for (let i = 0; i < matched.length; i++) {
    const w = matched[i];
    if (!w) continue;
    const a = coords[i];
    const b = coords[i + 1];
    const m = Math.hypot((b[0] - a[0]) * 85_000, (b[1] - a[1]) * 111_000);
    const t = w.tags;
    const row = (byHighway[t.highway ?? 'none'] ??= { m: 0, maxspeed: 0, lanes: 0, cycleway: 0, shoulder: 0, surface: 0, traffic_class: 0 });
    row.m += m;
    if (t.maxspeed) row.maxspeed += m;
    if (t.lanes) row.lanes += m;
    if (Object.keys(t).some((k) => k.startsWith('cycleway'))) row.cycleway += m;
    if (t.shoulder || t['shoulder:width'] || t['shoulder:right'] || t['shoulder:left']) row.shoulder += m;
    if (t.surface) row.surface += m;
    if (t.estimated_traffic_class) row.traffic_class += m;
  }
  return byHighway;
}

export async function main(argv: string[]): Promise<void> {
  const pointsFile = JSON.parse(readFileSync(resolve('scripts/comfort-harness/start-points.json'), 'utf8')) as {
    points: StartPoint[];
    matrix: { distances_mi: number[]; surfaces: Surface[] };
  };
  const args = parseArgs(argv, { distances: pointsFile.matrix.distances_mi, surfaces: pointsFile.matrix.surfaces });
  const engine = await createEngine(args.engine);
  const points = pointsFile.points.filter((p) => !args.points || args.points.includes(p.id));
  if (args.ladder) {
    await runLadder({ engine, points, args, bearingFor });
    return;
  }

  const generations: GenerationRecord[] = [];
  const runs: RunRecord[] = [];
  const startedAt = Date.now();
  let brouterCalls = 0;
  let done = 0;

  // --resume: reuse every generation a previous run settled (a route, or a
  // real no-route); redo the ones that errored (throttling, timeouts).
  const genKey = (g: Pick<GenerationRecord, 'point' | 'distance_mi' | 'surface' | 'variant'>) =>
    `${g.point}|${g.distance_mi}|${g.surface}|${g.variant}`;
  const settled = new Map<string, { gen: GenerationRecord; runs: RunRecord[] }>();
  if (args.resume && existsSync(resolve(args.resume))) {
    const prev = JSON.parse(readFileSync(resolve(args.resume), 'utf8')) as HarnessResults;
    for (const g of prev.generations) {
      if (g.transient) continue;
      const k = genKey(g);
      settled.set(k, { gen: g, runs: prev.runs.filter((r) => `${r.point}|${r.distance_mi}|${r.surface}|${r.variant}` === k) });
    }
    console.warn(`  resuming: ${settled.size} settled generations from ${args.resume}`);
  }

  const checkpoint = (partial: boolean) => {
    const results: HarnessResults = {
      meta: {
        engine: args.engine,
        brouter_base: BROUTER_BASE,
        run_at: new Date().toISOString(),
        duration_s: Math.round((Date.now() - startedAt) / 1000),
        brouter_calls: brouterCalls,
        args: { points: args.points, distances: args.distances, levels: args.levels, surfaces: args.surfaces, skipUrbanGravel: args.skipUrbanGravel, profileOverrides: PROFILE_OVERRIDES },
        classifier_probe: comfortClassForTags({ highway: 'secondary', maxspeed: '45 mph' })?.cls ?? null,
        partial,
      },
      generations,
      runs,
    };
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), JSON.stringify(results, null, 1) + '\n');
    return results;
  };

  outer: for (const point of points) {
    for (const surface of args.surfaces) {
      if (surface === 'gravel' && point.category === 'urban' && args.skipUrbanGravel) continue;
      for (const distanceMi of args.distances) {
        // Levels that share one engine request share one generation.
        const byVariant = new Map<string, ComfortLevel[]>();
        for (const level of args.levels) {
          const v = engine.variant(surface, level).id;
          byVariant.set(v, [...(byVariant.get(v) ?? []), level]);
        }
        for (const [variantId, levels] of byVariant) {
          if (done >= args.limit) break outer;
          done++;
          const reuse = settled.get(`${point.id}|${distanceMi}|${surface}|${variantId}`);
          if (reuse) {
            generations.push(reuse.gen);
            runs.push(...reuse.runs);
            continue;
          }
          const variant = engine.variant(surface, levels[0]);
          const targetKm = distanceMi * KM_PER_MI;
          const bearingDeg = bearingFor(point.id, distanceMi);
          const tag = `${point.id} ${distanceMi}mi ${surface} [${variant.describe}]`;
          const t0 = Date.now();
          const gen: GenerationRecord = {
            point: point.id,
            category: point.category,
            distance_mi: distanceMi,
            surface,
            variant: variantId,
            levels,
            bearing_deg: bearingDeg,
            ok: false,
            error: null,
            actual_mi: null,
            attempts: 0,
            tag_source: null,
            trace_calls: 0,
            latency_ms: 0,
            coverage: null,
            trace_check: null,
            transient: false,
          };
          try {
            // Up to 3 attempts, rescaling the loop toward the target distance.
            let roadFactor = DEFAULT_ROAD_FACTOR;
            let best: Awaited<ReturnType<typeof engine.route>> | null = null;
            let lastErr: Error | null = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              gen.attempts++;
              const wps = loopWaypoints(point.lnglat as Coordinate, targetKm, { bearingDeg, roadFactor });
              try {
                const r = await engine.route(wps, surface, levels[0]);
                if (engine.name !== 'stadia') brouterCalls++;
                const km = r.distance_m / 1000;
                if (!best || Math.abs(km - targetKm) < Math.abs(best.distance_m / 1000 - targetKm)) best = r;
                if (Math.abs(km - targetKm) / targetKm <= 0.1) break;
                roadFactor = rescaleRoadFactor(roadFactor, targetKm, km);
              } catch (err) {
                if (isThrottled(err)) throw err;
                lastErr = err as Error;
                // Nudge the shape and retry; an unroutable waypoint is common.
                roadFactor *= 1.15;
              }
              await sleep(args.delayMs);
            }
            if (!best) throw lastErr ?? new Error('no route');

            let ways = best.taggedWays;
            gen.tag_source = ways ? 'engine' : 'trace';
            if (!ways) {
              const traced = await traceTaggedWays(best.coordinates);
              ways = traced.ways;
              gen.trace_calls = traced.calls;
              brouterCalls += traced.calls;
            }
            gen.ok = true;
            gen.actual_mi = Math.round((best.distance_m / MI_M) * 10) / 10;
            gen.coverage = tagCoverage(best.coordinates, ways);

            const classes = classifyRouteSegments(best.coordinates, ways) ?? best.coordinates.slice(1).map(() => null);

            // Trace fidelity: classify the same line again from a re-ride
            // and compare with the engine's own tags.
            if (args.checkTrace && gen.tag_source === 'engine') {
              const traced = await traceTaggedWays(best.coordinates);
              brouterCalls += traced.calls;
              const tClasses = classifyRouteSegments(best.coordinates, traced.ways) ?? classes.map(() => null);
              let both = 0;
              let agree = 0;
              let traceMissing = 0;
              let total = 0;
              for (let i = 0; i < classes.length; i++) {
                const a = best.coordinates[i];
                const b = best.coordinates[i + 1];
                const m = Math.hypot((b[0] - a[0]) * 85_000, (b[1] - a[1]) * 111_000);
                total += m;
                if (!tClasses[i]) {
                  traceMissing += m;
                  continue;
                }
                if (!classes[i]) continue;
                both += m;
                if (tClasses[i]!.cls === classes[i]!.cls) agree += m;
              }
              gen.trace_check = {
                agree_pct: both ? Math.round((agree / both) * 1000) / 10 : null,
                trace_unmatched_pct: total ? Math.round((traceMissing / total) * 1000) / 10 : null,
                calls: traced.calls,
              };
            }
            for (const level of levels) {
              const v = validateMatchedSegments(best.coordinates, classes, level);
              runs.push({
                point: point.id,
                category: point.category,
                distance_mi: distanceMi,
                surface,
                level,
                variant: variantId,
                outcome: v.passes ? 'pass' : 'fail',
                failure_kinds: [...new Set(v.failures.map((f) => f.kind))],
                within_pct: v.withinPct,
                unknown_pct: v.unknownPct,
                flagged_mi: Math.round((v.flagged_m / MI_M) * 100) / 100,
                flagged_stretches: v.flaggedStretches.length,
                longest_stretch_mi: Math.round((v.longestFlagged_m / MI_M) * 100) / 100,
                blocked_mi: Math.round((v.blocked_m / MI_M) * 100) / 100,
                blocked_stretches: v.blockedStretches.length,
                heads_ups: v.headsUps.length,
                worst_blocked: v.blockedStretches
                  .slice()
                  .sort((a, b) => b.length_m - a.length_m)
                  .slice(0, 2)
                  .map((s) => ({ at_mi: Math.round((s.start_m / MI_M) * 10) / 10, mi: Math.round((s.length_m / MI_M) * 100) / 100, cls: s.maxCls, reasons: s.reasons })),
              });
            }
          } catch (err) {
            gen.error = (err as Error).message;
            // Throttling or a network failure says nothing about the route:
            // record it as an error to retry, not a no-route.
            gen.transient = isThrottled(err) || /fetch failed|timeout|aborted|ECONN|socket/i.test(gen.error);
            for (const level of levels) {
              runs.push({
                point: point.id,
                category: point.category,
                distance_mi: distanceMi,
                surface,
                level,
                variant: variantId,
                outcome: gen.transient ? 'error' : 'no_route',
                failure_kinds: [],
                within_pct: null,
                unknown_pct: null,
                flagged_mi: null,
                flagged_stretches: null,
                longest_stretch_mi: null,
                blocked_mi: null,
                blocked_stretches: null,
                heads_ups: null,
                worst_blocked: [],
              });
            }
          }
          gen.latency_ms = Date.now() - t0;
          generations.push(gen);
          console.log(`${String(done).padStart(4)} ${tag}: ${gen.ok ? `${gen.actual_mi} mi, levels ${levels.join('/')}` : `${gen.transient ? 'ERROR' : 'no route'} (${gen.error})`} ${gen.latency_ms} ms`);
          if (generations.length % 10 === 0) checkpoint(true);
          await sleep(args.delayMs);
        }
      }
    }
  }

  const results = checkpoint(false);
  let md = renderSummary(results);
  if (args.baseline && existsSync(resolve(args.baseline))) {
    const base = JSON.parse(readFileSync(resolve(args.baseline), 'utf8')) as HarnessResults;
    md += '\n' + diffResults(base, results);
  }
  const mdPath = resolve(args.out).replace(/\.json$/, '.md');
  writeFileSync(mdPath, md);
  console.log(`\nwrote ${args.out}\nwrote ${mdPath.replace(resolve('.') + '/', '')}`);
}
