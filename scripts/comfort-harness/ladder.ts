/**
 * `--ladder` mode: run `planComfortRoute` (src/utils/comfortLadder.ts) for
 * every start point × distance × surface × level and check the §5
 * acceptance criteria on everything it returns.
 *
 * Where the plain harness measures one-shot routes ("how often does the
 * router break the promise?"), this measures what a rider would see: ok,
 * alternatives or refused, how many calls it took, and whether any returned
 * route breaks the rules (target: none, by construction).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Coordinate } from '../../src/types/geo';
import type { ComfortLevel } from '../../src/utils/comfortLevels';
import { classifyRouteSegments } from '../../src/utils/comfortValidator';
import { planComfortRoute, returnedRoutes, meetsAcceptance, LADDER_CONFIG, type ComfortPlan } from '../../src/utils/comfortLadder';
import { traceTaggedWays, isThrottled, BROUTER_BASE, PROFILE_OVERRIDES, type Engine, type Surface } from './engines';

const MI_M = 1609.344;
const KM_PER_MI = 1.609344;

export interface LadderRecord {
  point: string;
  category: string;
  distance_mi: number;
  surface: string;
  level: number;
  outcome: ComfortPlan['outcome'] | 'error';
  error: string | null;
  calls: number;
  trace_calls: number;
  latency_ms: number;
  /** ok route only. */
  within_pct: number | null;
  unknown_pct: number | null;
  actual_mi: number | null;
  heads_ups: number | null;
  alternatives: Array<{ kind: string; level: number; mi: number; within_pct: number; note: string | null }>;
  refusal: { nearby_start: boolean; nearby_offset_mi: number | null; shorter_mi: number | null } | null;
  /** Returned routes that break §3 at their stated level. Target 0. */
  violations: number;
  /** Calls that came back with no route (target island, watchdog). */
  failed_calls: number;
}

export interface LadderResults {
  meta: {
    mode: 'ladder';
    engine: string;
    brouter_base: string;
    run_at: string;
    duration_s: number;
    budget: number;
    allow_nearby_start: boolean;
    args: Record<string, unknown>;
    partial?: boolean;
  };
  plans: LadderRecord[];
}

interface Ctx {
  engine: Engine;
  points: Array<{ id: string; category: string; lnglat: [number, number] }>;
  args: {
    distances: number[];
    levels: ComfortLevel[];
    surfaces: Surface[];
    out: string;
    baseline: string | null;
    delayMs: number;
    limit: number;
    skipUrbanGravel: boolean;
    resume: string | null;
    allowNearbyStart: boolean;
  };
  bearingFor(pointId: string, distanceMi: number): number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r1 = (x: number) => Math.round(x * 10) / 10;

export async function runLadder(ctx: Ctx): Promise<void> {
  const { engine, points, args } = ctx;
  const plans: LadderRecord[] = [];
  const startedAt = Date.now();
  const key = (p: Pick<LadderRecord, 'point' | 'distance_mi' | 'surface' | 'level'>) => `${p.point}|${p.distance_mi}|${p.surface}|${p.level}`;
  const settled = new Map<string, LadderRecord>();
  if (args.resume && existsSync(resolve(args.resume))) {
    const prev = JSON.parse(readFileSync(resolve(args.resume), 'utf8')) as LadderResults;
    for (const p of prev.plans ?? []) if (p.outcome !== 'error') settled.set(key(p), p);
    console.warn(`  resuming: ${settled.size} settled plans from ${args.resume}`);
  }

  const write = (partial: boolean): LadderResults => {
    const res: LadderResults = {
      meta: {
        mode: 'ladder',
        engine: engine.name,
        brouter_base: BROUTER_BASE,
        run_at: new Date().toISOString(),
        duration_s: Math.round((Date.now() - startedAt) / 1000),
        budget: LADDER_CONFIG.budget,
        allow_nearby_start: args.allowNearbyStart,
        args: { distances: args.distances, levels: args.levels, surfaces: args.surfaces, skipUrbanGravel: args.skipUrbanGravel, profileOverrides: PROFILE_OVERRIDES },
        partial,
      },
      plans,
    };
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), JSON.stringify(res, null, 1) + '\n');
    return res;
  };

  let done = 0;
  outer: for (const point of points) {
    for (const surface of args.surfaces) {
      if (surface === 'gravel' && point.category === 'urban' && args.skipUrbanGravel) continue;
      for (const distanceMi of args.distances) {
        for (const level of args.levels) {
          if (done >= args.limit) break outer;
          done++;
          const base = { point: point.id, category: point.category, distance_mi: distanceMi, surface, level };
          const prev = settled.get(key(base));
          if (prev) {
            plans.push(prev);
            continue;
          }
          const t0 = Date.now();
          let traceCalls = 0;
          let failedCalls = 0;
          const rec: LadderRecord = {
            ...base,
            outcome: 'error',
            error: null,
            calls: 0,
            trace_calls: 0,
            latency_ms: 0,
            within_pct: null,
            unknown_pct: null,
            actual_mi: null,
            heads_ups: null,
            alternatives: [],
            refusal: null,
            violations: 0,
            failed_calls: 0,
          };
          try {
            const plan = await planComfortRoute(
              {
                start: point.lnglat as Coordinate,
                targetDistance_km: distanceMi * KM_PER_MI,
                level,
                surface,
                bearingDeg: ctx.bearingFor(point.id, distanceMi),
              },
              {
                allowNearbyStart: args.allowNearbyStart,
                isFatal: isThrottled,
                route: async (call) => {
                  try {
                    const r = await engine.route(call.waypoints, call.surface, call.level);
                    let ways = r.taggedWays;
                    if (!ways) {
                      const t = await traceTaggedWays(r.coordinates);
                      ways = t.ways;
                      traceCalls += t.calls;
                    }
                    return { coordinates: r.coordinates, distance_m: r.distance_m, segmentClasses: classifyRouteSegments(r.coordinates, ways) };
                  } catch (err) {
                    if (!isThrottled(err)) failedCalls++;
                    throw err;
                  } finally {
                    await sleep(args.delayMs);
                  }
                },
              },
            );
            rec.outcome = plan.outcome;
            rec.calls = plan.calls;
            const returned = returnedRoutes(plan);
            rec.violations = returned.filter((c) => !meetsAcceptance(c) || c.validation.level !== c.level).length;
            if (plan.route) {
              rec.within_pct = plan.route.validation.withinPct;
              rec.unknown_pct = plan.route.validation.unknownPct;
              rec.actual_mi = r1(plan.route.distance_m / MI_M);
              rec.heads_ups = plan.route.validation.headsUps.length;
            }
            rec.alternatives = plan.alternatives.map((a) => ({
              kind: a.kind,
              level: a.level,
              mi: r1(a.distance_m / MI_M),
              within_pct: a.validation.withinPct,
              note: a.note,
            }));
            if (plan.refusal) {
              rec.refusal = {
                nearby_start: !!plan.refusal.nearbyStart,
                nearby_offset_mi: plan.refusal.nearbyStart ? r1((plan.refusal.nearbyStart.startOffset_m ?? 0) / MI_M) : null,
                shorter_mi: plan.refusal.shorter ? r1(plan.refusal.shorter.distance_m / MI_M) : null,
              };
            }
          } catch (err) {
            rec.error = (err as Error).message;
            // Nothing routed at all: a real "no route" if the engine said so, else transient.
            const transient = isThrottled(err) || /fetch failed|timeout|aborted|ECONN|socket|504|502/i.test(rec.error);
            rec.outcome = transient ? 'error' : 'refused';
            if (!transient) rec.refusal = { nearby_start: false, nearby_offset_mi: null, shorter_mi: null };
          }
          rec.trace_calls = traceCalls;
          rec.failed_calls = failedCalls;
          rec.latency_ms = Date.now() - t0;
          plans.push(rec);
          const what =
            rec.outcome === 'ok'
              ? `ok ${rec.actual_mi} mi, ${rec.within_pct}% within`
              : rec.outcome === 'alternatives'
                ? `alternatives: ${rec.alternatives.map((a) => (a.kind === 'comfort_up' ? `C${a.level}` : a.kind)).join(', ')}`
                : rec.outcome === 'refused'
                  ? `refused${rec.refusal?.nearby_start ? ' (nearby start)' : ''}${rec.refusal?.shorter_mi ? ` (shorter ${rec.refusal.shorter_mi} mi)` : ''}`
                  : `ERROR ${rec.error}`;
          console.log(`${String(done).padStart(4)} ${point.id} ${distanceMi}mi ${surface} C${level}: ${what} · ${rec.calls} calls${rec.violations ? ` · ${rec.violations} VIOLATIONS` : ''} · ${Math.round(rec.latency_ms / 1000)} s`);
          if (plans.length % 10 === 0) write(true);
        }
      }
    }
  }

  const res = write(false);
  let md = renderLadderSummary(res);
  if (args.baseline && existsSync(resolve(args.baseline))) {
    const base = JSON.parse(readFileSync(resolve(args.baseline), 'utf8'));
    if (base?.meta?.mode === 'ladder') md += '\n' + diffLadder(base as LadderResults, res);
  }
  const mdPath = resolve(args.out).replace(/\.json$/, '.md');
  writeFileSync(mdPath, md);
  console.log(`\nwrote ${args.out}\nwrote ${mdPath.replace(resolve('.') + '/', '')}`);
}

function table(headers: string[], rows: Array<Array<string | number>>): string {
  const align = headers.map((_, i) => (i === 0 ? '---' : '---:'));
  return [`| ${headers.join(' | ')} |`, `|${align.join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function renderLadderSummary(res: LadderResults): string {
  const settled = res.plans.filter((p) => p.outcome !== 'error');
  const errors = res.plans.length - settled.length;
  const violations = settled.reduce((a, p) => a + p.violations, 0);
  const out: string[] = [];
  out.push(`# Comfort ladder — ${res.meta.engine}`);
  out.push('');
  out.push(
    `Run ${res.meta.run_at.slice(0, 16).replace('T', ' ')} UTC · BRouter ${res.meta.brouter_base} · ${settled.length} plans (${errors} errored, excluded) · budget ${res.meta.budget} calls · nearby-start search ${res.meta.allow_nearby_start ? 'on' : 'off'} · ${Math.round(res.meta.duration_s / 60)} min`,
  );
  out.push('');
  out.push('Each plan is `planComfortRoute` for one start × distance × surface × level: ok (the route passes), alternatives (up to 3, each passing at its own level) or refused. Acceptance (spec §5): every returned route passes at the level it is shown for.');
  out.push('');
  out.push('## Headline');
  out.push('');
  out.push(`- **Returned routes breaking the rules: ${violations}.** Target 0.`);
  const o = (k: string) => settled.filter((p) => p.outcome === k).length;
  out.push(`- ok ${pct(o('ok'), settled.length)} · alternatives ${pct(o('alternatives'), settled.length)} · refused ${pct(o('refused'), settled.length)}.`);
  out.push(`- Rider gets something to ride at their level (ok, or a same-level alternative): ${pct(settled.filter((p) => p.outcome === 'ok' || p.alternatives.some((a) => a.level === p.level)).length, settled.length)}.`);
  out.push(`- Median calls per plan: ${median(settled.map((p) => p.calls))} (max ${Math.max(0, ...settled.map((p) => p.calls))}); median latency ${Math.round((median(settled.map((p) => p.latency_ms)) ?? 0) / 1000)} s.`);
  out.push('');
  out.push('## By comfort level');
  out.push('');
  const levels = [...new Set(settled.map((p) => p.level))].sort();
  out.push(
    table(
      ['Level', 'Plans', 'ok', 'Alternatives', 'Refused', 'Same-level ride', 'Median within % (ok)', 'Median calls'],
      levels.map((l) => {
        const ps = settled.filter((p) => p.level === l);
        const c = (k: string) => ps.filter((p) => p.outcome === k).length;
        return [
          `Comfort ${l}`,
          ps.length,
          pct(c('ok'), ps.length),
          pct(c('alternatives'), ps.length),
          pct(c('refused'), ps.length),
          pct(ps.filter((p) => p.outcome === 'ok' || p.alternatives.some((a) => a.level === p.level)).length, ps.length),
          median(ps.filter((p) => p.within_pct != null).map((p) => p.within_pct!)) ?? '–',
          median(ps.map((p) => p.calls)) ?? '–',
        ];
      }),
    ),
  );
  out.push('');
  out.push('## By area (all levels)');
  out.push('');
  const cats = [...new Set(settled.map((p) => p.category))];
  out.push(
    table(
      ['Area', 'Plans', 'ok', 'Alternatives', 'Refused'],
      cats.map((cat) => {
        const ps = settled.filter((p) => p.category === cat);
        const c = (k: string) => ps.filter((p) => p.outcome === k).length;
        return [cat, ps.length, pct(c('ok'), ps.length), pct(c('alternatives'), ps.length), pct(c('refused'), ps.length)];
      }),
    ),
  );
  out.push('');
  out.push('## Alternatives offered');
  out.push('');
  const alts = settled.flatMap((p) => p.alternatives);
  const kinds = [...new Set(alts.map((a) => a.kind))];
  out.push(table(['Kind', 'Offered', 'Median within %'], kinds.map((k) => [k, alts.filter((a) => a.kind === k).length, median(alts.filter((a) => a.kind === k).map((a) => a.within_pct)) ?? '–'])));
  out.push('');
  const refused = settled.filter((p) => p.outcome === 'refused');
  out.push('## Refusals');
  out.push('');
  out.push(
    `${refused.length} refused: ${refused.filter((p) => p.refusal?.nearby_start).length} with a nearby start, ${refused.filter((p) => p.refusal?.shorter_mi).length} with a shorter loop, ${refused.filter((p) => !p.refusal?.nearby_start && !p.refusal?.shorter_mi).length} with neither.`,
  );
  out.push('');
  if (refused.length) {
    out.push(
      table(
        ['Plan', 'Nearby start', 'Shorter loop', 'Calls'],
        refused.slice(0, 40).map((p) => [`${p.point} ${p.distance_mi} mi ${p.surface} C${p.level}`, p.refusal?.nearby_start ? `${p.refusal.nearby_offset_mi} mi away` : '–', p.refusal?.shorter_mi ? `${p.refusal.shorter_mi} mi` : '–', p.calls]),
      ),
    );
    out.push('');
  }
  const viol = settled.filter((p) => p.violations);
  if (viol.length) {
    out.push('## Violations');
    out.push('');
    out.push(table(['Plan', 'Outcome', 'Violations'], viol.map((p) => [`${p.point} ${p.distance_mi} mi ${p.surface} C${p.level}`, p.outcome, p.violations])));
    out.push('');
  }
  return out.join('\n');
}

export function diffLadder(base: LadderResults, next: LadderResults): string {
  const k = (p: LadderRecord) => `${p.point}|${p.distance_mi}|${p.surface}|${p.level}`;
  const b = new Map(base.plans.filter((p) => p.outcome !== 'error').map((p) => [k(p), p]));
  const rows: Array<Array<string | number>> = [];
  for (const p of next.plans) {
    const q = b.get(k(p));
    if (!q || p.outcome === 'error' || q.outcome === p.outcome) continue;
    rows.push([`${p.point} · ${p.distance_mi} · ${p.surface} · ${p.level}`, `${q.outcome} → ${p.outcome}`]);
  }
  return [`## Diff vs baseline (${base.meta.run_at.slice(0, 10)})`, '', `${rows.length} plans changed outcome.`, '', rows.length ? table(['Plan', 'Change'], rows) : ''].join('\n');
}
