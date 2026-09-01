/**
 * Banned-vocabulary guard (thesis audit X2).
 *
 * Peaksware vocabulary (TSS, CTL, ATL, TSB, NP, IF, and their spelled-out
 * forms) must never appear in user-facing text. This test scans every
 * non-comment line of src/ and api/ — string literals AND JSX text — for the
 * banned tokens. Internal identifiers and DB column names are naturally
 * excluded: the scan is case-sensitive with word boundaries, so
 * `plannedTSS`, `CTL_TAU`, and `.select('rss, tss')` never match; comments
 * (line, block, JSDoc, and JSX comment spans) are stripped before matching.
 *
 * The allowlist is exact-count per file: a file that legitimately names a
 * banned token (the coach voice rules that state the ban; the one deliberate
 * competitor-framing line on /learn/metrics; frozen Garmin log strings) is
 * pinned to its current count, so any NEW occurrence still fails — and a
 * stale entry (count no longer reached) also fails, forcing pruning.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SCAN_DIRS = ['src', 'api'];
const EXTENSIONS = /\.(js|jsx|ts|tsx)$/;
const EXCLUDE_PATH = [
  /node_modules/,
  /\/OLD\//,
  /src\/test\//,
  /\.test\.|\.spec\./,
  /__tests__/,
  // Internal/admin-only surfaces, exempt by audit decision:
  /src\/components\/admin\//,
  /src\/pages\/InternalMetricsAudit\.tsx$/,
];

// Tier 1: always banned, low false-positive risk.
const TIER1 =
  /\b(TSS|CTL|ATL|TSB|rTSS)\b|Normalized Power|Intensity Factor|Training Stress Balance/;
// Tier 2: banned but collision-prone ("IF" as emphasis, "NP" initials) —
// uppercase word-boundary only; write prompt emphasis as "If"/"Never".
const TIER2 = /\bNP\b|\bIF\b/;

/**
 * Exact-count allowlist: { file (repo-relative, posix) → token → count }.
 */
const ALLOW: Record<string, Record<string, number>> = {
  // The voice contract must name the tokens it bans.
  'api/utils/coachVoiceRules.js': { TSS: 1, CTL: 1, ATL: 1, TSB: 1, NP: 1, IF: 1, rTSS: 1 },
  // Same reason: the coaching-bible behavior floor's "what you never say" list
  // spells out the jargon it forbids the coach from using.
  'api/utils/coachingBible.js': { TSS: 1, CTL: 1, ATL: 1, TSB: 1 },
  // Route-coach prompt's own ban statement ("never use the deprecated names…").
  'api/utils/routeCoachContext.js': { TSS: 1, CTL: 1, ATL: 1, TSB: 1, NP: 1, IF: 1 },
  // The one deliberate competitor-framing line (owner decision, audit Q1).
  'src/components/metrics/MetricsCalculator.tsx': { TSS: 1 },
  // Frozen Garmin stack (CLAUDE.md): console-log strings only, never
  // user-facing. Left untouched rather than editing frozen files.
  'api/garmin-activities.js': { NP: 1 },
  'api/garmin-webhook-process.js': { NP: 2 },
  'api/utils/fitParser.js': { NP: 1 },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (EXCLUDE_PATH.some((re) => re.test(full.replace(/\\/g, '/')))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTENSIONS.test(entry)) out.push(full);
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  token: string;
  excerpt: string;
}

function tokensIn(content: string): string[] {
  const found: string[] = [];
  for (const re of [TIER1, TIER2]) {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(content)) !== null) found.push(m[0]);
  }
  return found;
}

// Strip comments line-by-line with a tiny block-comment state machine:
// leading slashes, JSDoc stars, block-comment and JSX comment spans, and
// trailing line comments (":"-guarded so URLs in strings survive).
function scannableLines(text: string): Array<{ line: number; content: string }> {
  const out: Array<{ line: number; content: string }> = [];
  let inBlock = false;
  text.split('\n').forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlock = false;
    }
    const t = line.trimStart();
    if (t.startsWith('//') || t.startsWith('*')) return;
    // Remove complete /* … */ spans (incl. JSX {/* … */}) on the line.
    line = line.replace(/\/\*[\s\S]*?\*\//g, ' ');
    // An unclosed /* opens a block comment.
    const open = line.indexOf('/*');
    if (open !== -1) {
      line = line.slice(0, open);
      inBlock = true;
    }
    // Trailing line comment; (?<!:) keeps "https://…" inside strings intact.
    line = line.replace(/(?<!:)\/\/.*$/, '');
    if (line.trim()) out.push({ line: i + 1, content: line });
  });
  return out;
}

function scanFile(path: string): Hit[] {
  const text = readFileSync(path, 'utf8');
  const rel = relative(ROOT, path).replace(/\\/g, '/');
  const hits: Hit[] = [];
  for (const { line, content } of scannableLines(text)) {
    for (const token of tokensIn(content)) {
      hits.push({ file: rel, line, token, excerpt: content.trim().slice(0, 110) });
    }
  }
  return hits;
}

describe('banned Peaksware vocabulary never reaches user-facing text', () => {
  it('src/ and api/ non-comment lines are clean (exact-count allowlist)', () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
    const hits = files.flatMap(scanFile);

    const counts = new Map<string, number>();
    for (const h of hits) {
      const key = `${h.file}|${h.token}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const violations: Hit[] = [];
    const spentAllow = new Map<string, number>();
    for (const h of hits) {
      const allowed = ALLOW[h.file]?.[h.token] ?? 0;
      const key = `${h.file}|${h.token}`;
      const spent = spentAllow.get(key) ?? 0;
      if (spent < allowed) {
        spentAllow.set(key, spent + 1);
      } else {
        violations.push(h);
      }
    }

    // Allowlist rot check: stale entries must be pruned, not left to mask
    // future regressions.
    const stale: string[] = [];
    for (const [file, tokens] of Object.entries(ALLOW)) {
      for (const [token, n] of Object.entries(tokens)) {
        const actual = counts.get(`${file}|${token}`) ?? 0;
        if (actual < n) stale.push(`${file}: ${token} allowlisted ×${n} but found ×${actual}`);
      }
    }

    const report = violations
      .map((v) => `  ${v.file}:${v.line} [${v.token}] ${v.excerpt}`)
      .join('\n');
    expect(violations, `Banned vocabulary in user-facing text:\n${report}`).toEqual([]);
    expect(stale, `Stale allowlist entries (prune them):\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});
