import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// One sport classifier: api/utils/sportTypes.js (re-used by src/utils/sportType.ts).
//
// Hand-rolled lists of Strava names ('Run', 'VirtualRun', 'TrailRun') checked
// against `activities.type` are how Garmin, COROS and treadmill runs ended up
// scored as rides by the load code. This test fails on any new one, so a new
// "is this a run?" decision goes through sportTypeOfActivity /
// isRunningActivityRow / getActivitySport instead.

// vitest runs from the repo root.
const ROOTS = ['api', 'src'].map((d) => join(process.cwd(), d));

// Files allowed to name Strava types directly, and why.
const ALLOWED = new Map([
  ['api/utils/sportTypes.js', 'the classifier itself'],
  // Import allowlists — they decide which webhook payloads get STORED, which is
  // a different question from how a stored row is bucketed.
  ['api/strava-webhook.js', 'Strava import allowlist'],
  ['api/strava-activities.js', 'Strava import allowlist + Strava-only counts and speed profile'],
  ['api/internal/backfill-strava-gap.js', 'Strava import allowlist'],
  ['api/wahoo-auth.js', 'default name for an imported Wahoo workout'],
  ['api/wahoo-webhook.js', 'default name for an imported Wahoo workout'],
  // Filters that run in SQL against `type`, mirroring another system.
  ['api/garmin-activities.js', 'PostgREST .in(type) filter for the power backfill'],
  ['api/utils/garmin/completeness.js', 'JS mirror of the garmin_completeness_audit SQL view (migration 093)'],
  ['api/evidence-weekly.js', 'matches the evidence-engine calibration export SQL'],
  ['api/utils/workoutLibrary.js', 'coach tool description text'],
]);

const PATTERN =
  /RUNNING_TYPES|CYCLING_TYPES|'Run',\s*'(?:VirtualRun|TrailRun)'|'Ride',\s*'VirtualRide'|\b(?:type|sport_type)\s*===?\s*'(?:Run|Ride|VirtualRun|VirtualRide)'/;

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.(?:[jt]sx?)$/.test(name) && !/\.(?:test|spec)\./.test(name)) {
      yield path;
    }
  }
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

describe('sport classifier contract', () => {
  it('no hand-rolled sport lists outside the allowlist', () => {
    const hits = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const rel = relative(process.cwd(), file).split('\\').join('/');
        if (ALLOWED.has(rel)) continue;
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (!isComment(line) && PATTERN.test(line)) hits.push(`  ${rel}:${i + 1}  ${line.trim()}`);
        });
      }
    }
    expect(
      hits,
      `Classify sport with api/utils/sportTypes.js (or src/utils/sportType.ts), not a list of Strava names:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the allowlist honest', () => {
    // An allowlisted file that no longer matches should leave the list.
    const stale = [...ALLOWED.keys()].filter((rel) => {
      const text = readFileSync(join(process.cwd(), rel), 'utf8');
      return !text.split('\n').some((line) => !isComment(line) && PATTERN.test(line));
    });
    expect(stale).toEqual([]);
  });
});
