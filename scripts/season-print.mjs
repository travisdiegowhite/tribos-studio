#!/usr/bin/env node
/**
 * Print a season plan from the pure engine (src/lib/season/engine.ts).
 *
 *   node scripts/season-print.mjs races.json [--start 2026-10-05] [--hours 8] [--weeks 52]
 *
 * races.json is an array of race_goals-shaped rows:
 *   { id, name, date | race_date, priority, race_type?, distance_km?,
 *     elevation_gain_m?, goal_time_minutes?, sport?, focus? | is_focus? }
 * Each race's taper/recovery profile is built with raceProfile.ts.
 * With no file it prints the build plan's fixture season.
 *
 * Needs Node ≥ 22.18 (runs the .ts engine with built-in type stripping).
 */
import { readFileSync } from 'node:fs';
import { computeSeason, formatSeasonDate, mondayOf, weekIndexOf } from '../src/lib/season/engine.ts';
import { profileForRace } from '../src/lib/season/raceProfile.ts';

const FIXTURE = [
  { id: 'crit', name: 'Spring Crit', date: '2027-03-21', priority: 'C' },
  { id: 'gravel-b', name: 'Gravel Opener', date: '2027-04-17', priority: 'B' },
  { id: 'june-a', name: 'June Gravel', date: '2027-06-19', priority: 'A' },
  { id: 'state-rr', name: 'State RR', date: '2027-07-24', priority: 'B' },
  { id: 'fall-a', name: 'Fall Gravel', date: '2027-09-11', priority: 'A' },
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

const races = (file ? JSON.parse(readFileSync(file, 'utf8')) : FIXTURE).map((r) => {
  const { sport, profile, expectedHours } = profileForRace(r);
  return {
    id: String(r.id ?? r.name),
    name: r.name,
    date: r.date ?? r.race_date,
    priority: r.priority,
    sport,
    profile,
    expectedHours,
    focus: r.focus ?? r.is_focus ?? false,
  };
});
const hoursById = new Map(races.map((r) => [r.id, r.expectedHours]));
const startDate = flag('start', '2026-10-05');
const plan = computeSeason({
  startDate,
  races,
  typicalWeeklyHours: Number(flag('hours', '8')),
  weeks: Number(flag('weeks', '52')),
});

const LABEL = { recover: 'Recover', base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper' };
const VERDICT = { on_track: 'On track', tight: 'Tight', conflict: 'CONFLICT' };
const todayLocal = new Date().toLocaleDateString('en-CA');
const todayWeek = weekIndexOf(mondayOf(plan.startDate), todayLocal);

console.log(`Season from ${formatSeasonDate(plan.startDate)} · ${plan.weeks} weeks · typical ${plan.typicalWeeklyHours} h/week\n`);
console.log('Wk  Monday        Phase    Hours  Races');
for (const w of plan.schedule) {
  const here = plan.races.filter((r) => r.week === w.index).map((r) => `[${r.priority}] ${r.name}`);
  const today = w.index === todayWeek ? ' ← today' : '';
  console.log(
    `${String(w.index).padStart(2)}  ${w.startDate}  ${LABEL[w.phase].padEnd(7)}  ${w.targetHours.toFixed(1).padStart(5)}  ${here.join(', ')}${today}`,
  );
}

console.log('\nVerdicts');
for (const r of plan.races) {
  const build = r.buildWeeks === null ? '' : ` · build ${r.buildWeeks} wk`;
  const p = r.profile;
  const profile = `${r.sport} · ~${hoursById.get(r.id)} h · ${p.band}: taper ${p.taperWeeks}, recover ${p.recoverWeeks}`;
  console.log(`[${r.priority}] ${r.name} — ${formatSeasonDate(r.date)}${build}`);
  console.log(`    ${profile}`);
  console.log(`    ${VERDICT[r.verdict]}: ${r.reason}`);
}
