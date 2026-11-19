// CI guard for Claude model IDs: catches a retired, retiring, unknown or
// scattered model ID before it ships. Needs no credentials or network, like
// schemaContract.test.js. See the header of claudeModels.js for why.
//
// Deliberately time-dependent: the retirement check compares against today,
// so CI turns red on its own RETIREMENT_WARNING_DAYS before a model a feature
// uses is retired, even if no code changed. That is the point. To clear it,
// move the role in MODELS to the replacement model.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  MODELS,
  MODEL_LIFECYCLE,
  MODEL_ID_PATTERN,
  RETIREMENT_WARNING_DAYS,
  daysUntilRetirement,
} from './claudeModels.js';

// vitest runs from the repo root (as schemaContract.test.js assumes).
const ROOT = process.cwd();
const SCAN_DIRS = ['api', 'src', 'scripts', 'cloudflare-workers'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.vercel', 'coverage']);
const CODE_FILE = /\.(c|m)?(j|t)sx?$/;

// The registry is where IDs belong; these two tests feed it fixtures.
const REGISTRY = 'api/utils/claudeModels.js';
const SELF = new Set(['api/utils/claudeModels.test.js', 'api/utils/claudeClient.test.js']);
const CLIENT_FACTORY = 'api/utils/claudeClient.js';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE_FILE.test(name)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.filter((d) => existsSync(join(ROOT, d)))
  .flatMap((d) => walk(join(ROOT, d)))
  .map((full) => ({
    path: relative(ROOT, full).split(sep).join('/'),
    text: readFileSync(full, 'utf8'),
  }))
  .filter((f) => !SELF.has(f.path));

const isTest = (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);

/** Every model-shaped string in the scanned code, with where it appears. */
const occurrences = files.flatMap(({ path, text }) =>
  text.split('\n').flatMap((line, i) =>
    [...line.matchAll(MODEL_ID_PATTERN)].map((m) => ({ id: m[0], where: `${path}:${i + 1}`, path })),
  ),
);

const today = new Date();

describe('Claude model IDs', () => {
  it('finds the registry and some code to scan', () => {
    expect(files.some((f) => f.path === REGISTRY)).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  it('names only model IDs listed in MODEL_LIFECYCLE', () => {
    // An unknown ID is a typo, an invented date suffix (proactive insights
    // shipped one that 404'd on every call), or a new model that was never
    // registered. Add new models to MODEL_LIFECYCLE first.
    const unknown = occurrences.filter((o) => !(o.id in MODEL_LIFECYCLE)).map((o) => `${o.where} ${o.id}`);
    expect(unknown).toEqual([]);
  });

  it('names no retired model anywhere, tests included', () => {
    const retired = occurrences
      .filter((o) => o.path !== REGISTRY)
      .filter((o) => (daysUntilRetirement(o.id, today) ?? Infinity) <= 0)
      .map((o) => `${o.where} ${o.id} (retired ${MODEL_LIFECYCLE[o.id].retires})`);
    expect(retired).toEqual([]);
  });

  it('writes model IDs only in claudeModels.js (tests may use them as fixtures)', () => {
    // Import MODELS.<ROLE> instead, so the next migration is a one-file diff
    // and the retirement check below sees every model in use.
    const scattered = occurrences
      .filter((o) => o.path !== REGISTRY && !isTest(o.path))
      .map((o) => `${o.where} ${o.id}`);
    expect(scattered).toEqual([]);
  });

  it(`uses no model that retires within ${RETIREMENT_WARNING_DAYS} days`, () => {
    // Red here means: Anthropic has announced a retirement, the date was
    // recorded in MODEL_LIFECYCLE, and a feature is still on that model.
    // Move the listed roles in MODELS to the replacement model and read its
    // migration notes (request parameters can change between models).
    const retiring = Object.entries(MODELS)
      .map(([role, id]) => ({ role, id, days: daysUntilRetirement(id, today) }))
      .filter(({ days }) => days !== null && days <= RETIREMENT_WARNING_DAYS)
      .map(({ role, id, days }) =>
        days <= 0
          ? `MODELS.${role} = ${id}: RETIRED on ${MODEL_LIFECYCLE[id].retires}, requests are failing`
          : `MODELS.${role} = ${id}: retires ${MODEL_LIFECYCLE[id].retires}, in ${days} days`,
      );
    expect(retiring).toEqual([]);
  });

  it('gives every role a registered model', () => {
    const unregistered = Object.entries(MODELS)
      .filter(([, id]) => !(id in MODEL_LIFECYCLE))
      .map(([role, id]) => `MODELS.${role} = ${id}`);
    expect(unregistered).toEqual([]);
  });

  it('has no unused roles', () => {
    const code = files.filter((f) => f.path !== REGISTRY).map((f) => f.text).join('\n');
    const unused = Object.keys(MODELS).filter((role) => !code.includes(`MODELS.${role}`));
    expect(unused).toEqual([]);
  });

  it('records retirement dates as YYYY-MM-DD', () => {
    const bad = Object.entries(MODEL_LIFECYCLE)
      .filter(([, { retires }]) => retires !== null && !/^\d{4}-\d{2}-\d{2}$/.test(retires))
      .map(([id, { retires }]) => `${id}: ${retires}`);
    expect(bad).toEqual([]);
  });

  it('constructs Anthropic clients only through createClaudeClient in api/', () => {
    // Direct construction skips the 404/400/refusal reporting in claudeClient.js.
    const direct = files
      .filter((f) => f.path.startsWith('api/') && f.path !== CLIENT_FACTORY && !isTest(f.path))
      .filter((f) => /new\s+Anthropic\s*\(/.test(f.text))
      .map((f) => f.path);
    expect(direct).toEqual([]);
  });
});

describe('MODEL_ID_PATTERN', () => {
  const ids = (s) => [...s.matchAll(MODEL_ID_PATTERN)].map((m) => m[0]);

  it('matches current, dated and Claude 2/3 IDs', () => {
    expect(ids("model: 'claude-sonnet-5-5'")).toEqual(['claude-sonnet-5-5']);
    expect(ids('"claude-haiku-4-5-20251001"')).toEqual(['claude-haiku-4-5-20251001']);
    expect(ids('claude-3-5-sonnet-20241022 and claude-2.1.')).toEqual(['claude-3-5-sonnet-20241022', 'claude-2.1']);
    expect(ids('`claude-opus-5`')).toEqual(['claude-opus-5']);
  });

  it('ignores non-model names that start with claude-', () => {
    expect(ids("'/api/claude-routes' claude-code claudeRouteService")).toEqual([]);
  });
});

describe('daysUntilRetirement', () => {
  it('counts down to the date, goes negative after it, and is null without one', () => {
    expect(daysUntilRetirement('claude-sonnet-4-5-20250929', new Date('2026-11-20T00:00:00Z'))).toBe(10);
    expect(daysUntilRetirement('claude-sonnet-4-20250514', new Date('2026-11-19T00:00:00Z'))).toBeLessThan(0);
    expect(daysUntilRetirement('claude-sonnet-5-5')).toBeNull();
    expect(daysUntilRetirement('claude-not-a-model')).toBeNull();
  });
});
