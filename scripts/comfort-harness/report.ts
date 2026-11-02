/**
 * Markdown summary and baseline diff for comfort-harness results.
 */

export interface GenerationRecord {
  point: string;
  category: string;
  distance_mi: number;
  surface: string;
  variant: string;
  levels: number[];
  bearing_deg: number;
  ok: boolean;
  error: string | null;
  actual_mi: number | null;
  attempts: number;
  tag_source: 'engine' | 'trace' | null;
  trace_calls: number;
  latency_ms: number;
  /** Throttled or network failure — retried by --resume, excluded from stats. */
  transient?: boolean;
  trace_check?: { agree_pct: number | null; trace_unmatched_pct: number | null; calls: number } | null;
  coverage: Record<string, { m: number; maxspeed: number; lanes: number; cycleway: number; shoulder: number; surface: number; traffic_class?: number }> | null;
}

export interface RunRecord {
  point: string;
  category: string;
  distance_mi: number;
  surface: string;
  level: number;
  variant: string;
  outcome: 'pass' | 'fail' | 'no_route' | 'error';
  failure_kinds: string[];
  within_pct: number | null;
  unknown_pct: number | null;
  flagged_mi: number | null;
  flagged_stretches: number | null;
  longest_stretch_mi: number | null;
  blocked_mi: number | null;
  blocked_stretches: number | null;
  heads_ups: number | null;
  worst_blocked: Array<{ at_mi: number; mi: number; cls: unknown; reasons: string[] }>;
}

export interface HarnessResults {
  meta: {
    engine: string;
    brouter_base: string;
    run_at: string;
    duration_s: number;
    brouter_calls: number;
    args: Record<string, unknown>;
    classifier_probe: unknown;
    partial?: boolean;
  };
  generations: GenerationRecord[];
  runs: RunRecord[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const fmt = (x: number | null, digits = 1) => (x == null ? '–' : x.toFixed(digits));

function table(headers: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map((_, i) => (i === 0 ? '---' : '---:')).join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

function levelRows(runs: RunRecord[]) {
  const rows: Array<Array<string | number>> = [];
  for (const [level, rs] of [...groupBy(runs, (r) => String(r.level))].sort()) {
    const routed = rs.filter((r) => r.outcome === 'pass' || r.outcome === 'fail');
    rows.push([
      `Comfort ${level}`,
      rs.length,
      pct(routed.filter((r) => r.outcome === 'pass').length, routed.length),
      pct(routed.filter((r) => (r.blocked_mi ?? 0) > 0).length, routed.length),
      fmt(median(routed.map((r) => r.within_pct!))),
      fmt(median(routed.map((r) => r.unknown_pct!))),
      fmt(median(routed.map((r) => r.flagged_mi!)), 2),
      fmt(median(routed.map((r) => r.blocked_mi!)), 2),
      rs.filter((r) => r.outcome === 'no_route').length,
    ]);
  }
  return rows;
}

export function renderSummary(res: HarnessResults): string {
  const { meta } = res;
  // Errored generations (throttling, network) say nothing about routing.
  const errored = res.generations.filter((g) => g.transient).length;
  const generations = res.generations.filter((g) => !g.transient);
  const runs = res.runs.filter((r) => r.outcome !== 'error');
  const routed = runs.filter((r) => r.outcome !== 'no_route');
  const leaks = routed.filter((r) => (r.blocked_mi ?? 0) > 0);
  const out: string[] = [];
  out.push(`# Comfort harness — ${meta.engine}`);
  out.push('');
  out.push(
    `Run ${meta.run_at.slice(0, 16).replace('T', ' ')} UTC · BRouter ${meta.brouter_base} · ${generations.length} generations, ` +
      `${runs.length} level checks · ${meta.brouter_calls} BRouter calls · ${Math.round(meta.duration_s / 60)} min`,
  );
  out.push('');
  out.push(
    'Each generation is one deterministic loop (no AI); every comfort level that maps to the same engine request ' +
      'is validated against that one route. "Pass" means it meets §3 at that level. A route that does not pass would ' +
      'go to the ladder (alternatives or refuse), which this engine does not have yet — so the fail rate is how often ' +
      'today\'s routing breaks the promise.',
  );
  out.push('');
  out.push('## Headline');
  out.push('');
  out.push(`- **Blocked-class leaks: ${leaks.length} of ${routed.length} level checks (${pct(leaks.length, routed.length)}).** Target after the ladder: 0.`);
  out.push(`- Pass rate: ${pct(routed.filter((r) => r.outcome === 'pass').length, routed.length)}.`);
  out.push(`- No route: ${generations.filter((g) => !g.ok).length} of ${generations.length} generations.`);
  if (errored) out.push(`- **${errored} generations errored (throttling/network) and are excluded.** Re-run with \`--resume\` to fill them in.`);
  if (meta.partial) out.push('- **Partial run** (checkpoint).');
  const distErr = generations.filter((g) => g.ok).map((g) => Math.abs(g.actual_mi! - g.distance_mi) / g.distance_mi * 100);
  out.push(`- Median distance error vs target: ${fmt(median(distErr))}%.`);
  out.push('');
  out.push('## By comfort level');
  out.push('');
  out.push(
    table(
      ['Level', 'Checks', 'Pass', 'Has blocked', 'Median within %', 'Median unknown %', 'Median flagged mi', 'Median blocked mi', 'No route'],
      levelRows(runs),
    ),
  );
  out.push('');
  out.push('## Pass rate by area and level');
  out.push('');
  const cats = [...groupBy(runs, (r) => r.category)];
  const levels = [...new Set(runs.map((r) => r.level))].sort();
  out.push(
    table(
      ['Area', ...levels.map((l) => `C${l}`)],
      cats.map(([cat, rs]) => [
        cat,
        ...levels.map((l) => {
          const x = rs.filter((r) => r.level === l && (r.outcome === 'pass' || r.outcome === 'fail'));
          return pct(x.filter((r) => r.outcome === 'pass').length, x.length);
        }),
      ]),
    ),
  );
  out.push('');
  out.push('## Pass rate by distance and surface (all levels)');
  out.push('');
  const ds = [...groupBy(routed, (r) => `${r.distance_mi} mi ${r.surface}`)].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
  out.push(
    table(
      ['Request', 'Checks', 'Pass', 'Has blocked', 'Median unknown %'],
      ds.map(([k, rs]) => [k, rs.length, pct(rs.filter((r) => r.outcome === 'pass').length, rs.length), pct(rs.filter((r) => (r.blocked_mi ?? 0) > 0).length, rs.length), fmt(median(rs.map((r) => r.unknown_pct!)))]),
    ),
  );
  out.push('');
  out.push('## Why checks fail');
  out.push('');
  const kinds = new Map<string, number>();
  for (const r of routed) for (const k of r.failure_kinds) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  out.push(table(['Failure', 'Checks'], [...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n])));
  out.push('');
  out.push('## Worst blocked stretches (Comfort 2, the default)');
  out.push('');
  const worst = routed
    .filter((r) => r.level === 2)
    .flatMap((r) => r.worst_blocked.map((b) => ({ r, b })))
    .sort((a, b) => b.b.mi - a.b.mi)
    .slice(0, 12);
  out.push(
    worst.length
      ? table(
          ['Route', 'At mi', 'Length mi', 'Class', 'Reasons'],
          worst.map(({ r, b }) => [`${r.point} ${r.distance_mi} mi ${r.surface}`, b.at_mi, b.mi, String(b.cls), b.reasons.join(', ')]),
        )
      : '_None._',
  );
  out.push('');
  out.push('## Tag coverage on ridden miles (Phase 0A, route-corridor view)');
  out.push('');
  out.push('Share of ridden miles, by highway class, whose way carries each tag. Taken from the ways matched onto every generated route, so busy and quiet roads count as often as the router uses them.');
  out.push('');
  const cov = new Map<string, { m: number; maxspeed: number; lanes: number; cycleway: number; shoulder: number; surface: number; traffic_class: number }>();
  for (const g of generations) {
    for (const [hw, c] of Object.entries(g.coverage ?? {})) {
      const row = cov.get(hw) ?? { m: 0, maxspeed: 0, lanes: 0, cycleway: 0, shoulder: 0, surface: 0, traffic_class: 0 };
      for (const k of Object.keys(row) as Array<keyof typeof row>) row[k] += c[k] ?? 0;
      cov.set(hw, row);
    }
  }
  const totalM = [...cov.values()].reduce((s, c) => s + c.m, 0);
  out.push(
    table(
      ['highway', 'Miles', 'Share', 'maxspeed', 'lanes', 'cycleway*', 'shoulder*', 'surface', 'BRouter traffic class'],
      [...cov]
        .sort((a, b) => b[1].m - a[1].m)
        .filter(([, c]) => c.m / totalM >= 0.002)
        .map(([hw, c]) => [hw, Math.round(c.m / 1609.344), pct(c.m, totalM), pct(c.maxspeed, c.m), pct(c.lanes, c.m), pct(c.cycleway, c.m), pct(c.shoulder, c.m), pct(c.surface, c.m), pct(c.traffic_class, c.m)]),
    ),
  );
  out.push('');
  const checked = generations.filter((g) => g.trace_check);
  if (checked.length) {
    out.push('## Trace fidelity');
    out.push('');
    out.push(
      `${checked.length} routes that carry the engine's own tags were classified a second time from a BRouter re-ride (the method used for Stadia routes). ` +
        `Median agreement on comfort class: ${fmt(median(checked.map((g) => g.trace_check!.agree_pct ?? 0)))}% of matched miles; ` +
        `median share the re-ride could not confirm (→ unknown): ${fmt(median(checked.map((g) => g.trace_check!.trace_unmatched_pct ?? 0)))}%.`,
    );
    out.push('');
  }
  const failedGens = generations.filter((g) => !g.ok);
  if (failedGens.length) {
    out.push('## No route');
    out.push('');
    out.push(table(['Request', 'Error'], failedGens.map((g) => [`${g.point} ${g.distance_mi} mi ${g.surface} ${g.variant}`, (g.error ?? '').replace(/\|/g, '/').slice(0, 100)])));
    out.push('');
  }
  return out.join('\n');
}

const keyOf = (r: RunRecord) => `${r.point}|${r.distance_mi}|${r.surface}|${r.level}`;

export function diffResults(base: HarnessResults, next: HarnessResults): string {
  const b = new Map(base.runs.map((r) => [keyOf(r), r]));
  let fixed = 0;
  let broke = 0;
  let leaksBefore = 0;
  let leaksAfter = 0;
  const withinDelta: number[] = [];
  const changes: string[] = [];
  for (const r of next.runs) {
    const old = b.get(keyOf(r));
    if (!old) continue;
    if ((old.blocked_mi ?? 0) > 0) leaksBefore++;
    if ((r.blocked_mi ?? 0) > 0) leaksAfter++;
    if (old.outcome !== 'pass' && r.outcome === 'pass') fixed++;
    if (old.outcome === 'pass' && r.outcome !== 'pass') {
      broke++;
      if (changes.length < 15) changes.push(`| ${keyOf(r).replace(/\|/g, ' · ')} | ${old.outcome} → ${r.outcome} | ${r.failure_kinds.join(', ')} |`);
    }
    if (old.within_pct != null && r.within_pct != null) withinDelta.push(r.within_pct - old.within_pct);
  }
  const mean = withinDelta.length ? withinDelta.reduce((s, x) => s + x, 0) / withinDelta.length : 0;
  return [
    `## Diff vs baseline (${base.meta.engine}, ${base.meta.run_at.slice(0, 10)})`,
    '',
    `- Blocked-class leaks: ${leaksBefore} → ${leaksAfter}`,
    `- Now passing: ${fixed} · Now failing: ${broke}`,
    `- Mean change in within-comfort %: ${mean >= 0 ? '+' : ''}${mean.toFixed(1)} points over ${withinDelta.length} matched checks`,
    '',
    ...(changes.length ? ['| Check | Change | Why |', '|---|---|---|', ...changes, ''] : []),
  ].join('\n');
}
