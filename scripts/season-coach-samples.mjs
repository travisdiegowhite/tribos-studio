#!/usr/bin/env node
/**
 * Season coach samples (Phase 5 gate): ten season changes across On track /
 * Tight / Conflict, run through the same payload builder and prompt module the
 * app uses, printed with the coach's reply.
 *
 *   ANTHROPIC_API_KEY=… node scripts/season-coach-samples.mjs [--persona pragmatist] [--name Travis]
 *   node scripts/season-coach-samples.mjs --dry-run      # print the prompts, no API call
 *
 * Calls Claude with the same parameters as api/season-coach.js. Needs
 * Node ≥ 22.18 (runs the .ts engine with built-in type stripping).
 */
import Anthropic from '@anthropic-ai/sdk';
import { computeSeason } from '../src/lib/season/engine.ts';
import { DEFAULT_SEASON_WEEKS, defaultSeasonStart, toSeasonRaces } from '../src/lib/season/view.ts';
import { moveRace, removeRace, setFocus, setPriority } from '../src/lib/season/edits.ts';
import { buildCoachPayload, toSnapshot } from '../src/lib/season/coachPayload.ts';
import { buildSeasonCoachSystemPrompt, renderPayload, sanitizePayload } from '../api/utils/seasonCoachPrompt.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const dryRun = args.includes('--dry-run');
const TODAY = '2026-10-11';

// A 2027 season shaped like Travis's: the Roubaix/BWR block, the Summer Vibes
// run/bike combo on one day, and The Rad as the confirmed season goal.
const SEASON = [
  { id: 'omw', name: 'Old Man Winter', race_date: '2027-01-31', priority: 'B', race_type: 'gravel', distance_km: 64, goal_time_minutes: 120 },
  { id: 'rbx', name: 'Boulder Roubaix', race_date: '2027-04-25', priority: 'A', race_type: 'road_race', distance_km: 97, goal_time_minutes: 180 },
  { id: 'bwr', name: 'BWR San Diego', race_date: '2027-05-02', priority: 'A', race_type: 'gravel', distance_km: 113 },
  { id: 'vibes', name: 'Summer Vibes', race_date: '2027-06-19', priority: 'A', race_type: 'gravel', distance_km: 56, goal_time_minutes: 100 },
  { id: 'run', name: 'Vibes 10K', race_date: '2027-06-19', priority: 'B', race_type: 'run_10k', distance_km: 10, goal_time_minutes: 45 },
  { id: 'ned', name: 'Ned Gravel', race_date: '2027-07-11', priority: 'B', race_type: 'gravel', distance_km: 113 },
  { id: 'rad', name: 'The Rad', race_date: '2027-09-26', priority: 'A', race_type: 'gravel', distance_km: 111, elevation_gain_m: 1574, goal_time_minutes: 390, is_focus: true },
];

const plan = (rows) =>
  computeSeason({ startDate: defaultSeasonStart(TODAY), weeks: DEFAULT_SEASON_WEEKS, races: toSeasonRaces(rows), typicalWeeklyHours: 8 });

const same = (r) => r;
/** Each sample: the discussed version (null = first look), the current version, an optional question. */
const SAMPLES = [
  { title: 'First look at the season (all on track)', before: null, after: same },
  { title: 'Nothing changed; the athlete asks a question', before: same, after: same, question: 'What should I worry about most this year?' },
  { title: 'Ned 1 week earlier (still on track)', before: same, after: (r) => moveRace(r, 'ned', -1) },
  { title: 'Roubaix picked as the race the block builds toward', before: same, after: (r) => setFocus(r, 'rbx', plan(r)) },
  { title: 'Ned 2 weeks earlier: lands in recovery from Vibes (tight)', before: same, after: (r) => moveRace(r, 'ned', -2) },
  { title: 'The Rad 8 weeks earlier: Ned recovery runs into its taper (tight)', before: same, after: (r) => moveRace(r, 'rad', -8) },
  { title: 'Vibes 10K a week before Summer Vibes: in its taper (conflict)', before: same, after: (r) => moveRace(r, 'run', -1) },
  { title: 'Ned 10 weeks later, a week before The Rad (conflict)', before: same, after: (r) => moveRace(r, 'ned', 10), question: 'Can I make this work?' },
  { title: 'BWR removed', before: same, after: (r) => removeRace(r, 'bwr') },
  { title: 'Two at once: Vibes demoted to a target, The Rad 9 weeks earlier (conflict)', before: same, after: (r) => moveRace(setPriority(r, 'vibes', 'B'), 'rad', -9) },
];

const { system, personaName } = buildSeasonCoachSystemPrompt({ personaId: flag('persona', null), riderName: flag('name', null) });
const client = dryRun ? null : new Anthropic();
if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY, or pass --dry-run to print the prompts only.');
  process.exit(1);
}

console.log(`Persona: ${personaName ?? '(none)'}${dryRun ? ' — dry run' : ''}\n`);
if (dryRun) console.log(`=== SYSTEM ===\n${system}\n`);

for (const [i, s] of SAMPLES.entries()) {
  const base = SEASON;
  const beforeRows = s.before ? s.before(base) : null;
  const afterRows = s.after(base);
  const discussed = beforeRows ? toSnapshot(plan(beforeRows), beforeRows) : null;
  const payload = sanitizePayload(buildCoachPayload(plan(afterRows), discussed, TODAY, s.question ?? null));
  const userText = renderPayload(payload);

  console.log(`━━━ ${i + 1}. ${s.title} ━━━`);
  const verdicts = payload.races.map((r) => `${r.name}: ${r.verdict}`).join(' · ');
  console.log(verdicts);
  if (payload.changes.length) console.log(payload.changes.map((c) => `  • ${c}`).join('\n'));
  if (dryRun) {
    console.log(`\n${userText}\n`);
    continue;
  }
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: userText }],
  });
  const reply =
    response.stop_reason === 'refusal'
      ? '(refused)'
      : response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
  console.log(`\nCOACH: ${reply}\n`);
}
