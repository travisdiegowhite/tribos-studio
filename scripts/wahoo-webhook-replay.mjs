#!/usr/bin/env node
// Send a Wahoo-shaped `workout_summary` webhook to a tribos deploy, so the
// whole import pipeline can be exercised without a Wahoo device.
// See docs/wahoo-integration.md → "Testing without a device".
//
// The payload copies the shape documented at cloud-api.wahooligan.com
// ("Webhooks"): decimals as strings, the workout nested in workout_summary,
// a numeric workout_type_id, and the FIT link at workout_summary.file.url.
//
// Usage:
//   WAHOO_WEBHOOK_TOKEN=… node scripts/wahoo-webhook-replay.mjs \
//     --base https://<preview-deploy>.vercel.app \
//     --wahoo-user-id 60462 \
//     [--file-url https://…/ride.fit]   any https FIT on a preview; Wahoo hosts only in production
//     [--starts 2026-11-14T15:00:00Z]   match a ride you already have to test dedup
//     [--distance-m 42195] [--minutes 92] [--type-id 0] [--workout-id 990001]
//     [--dry-run]                       print the payload, send nothing
//
// --wahoo-user-id must be the provider_user_id of a connected tribos account
// (bike_computer_integrations, provider = 'wahoo'), or the webhook answers
// "User not linked". Re-running with the same --workout-id exercises the
// idempotent update path.

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const base = args.base || process.env.TRIBOS_BASE_URL;
const wahooUserId = args['wahoo-user-id'];
const token = args.token || process.env.WAHOO_WEBHOOK_TOKEN;

if (!args['dry-run'] && (!base || !wahooUserId || !token)) {
  console.error('Required: --base <url> --wahoo-user-id <id> and WAHOO_WEBHOOK_TOKEN (or --token).');
  process.exit(1);
}

const minutes = Number(args.minutes || 92);
const distance = Number(args['distance-m'] || 42195.3);
const starts = new Date(args.starts || Date.now() - (minutes + 10) * 60 * 1000).toISOString();
const workoutId = Number(args['workout-id'] || 990000 + Math.floor(Math.random() * 9999));
const activeSeconds = minutes * 60;
const fixed = (n, d = 2) => Number(n).toFixed(d);

const payload = {
  event_type: 'workout_summary',
  webhook_token: token || '<WAHOO_WEBHOOK_TOKEN>',
  user: { id: Number(wahooUserId) || wahooUserId },
  workout_summary: {
    id: workoutId + 1,
    name: 'Replay summary',
    ascent_accum: fixed(412, 1),
    cadence_avg: fixed(86.4),
    calories_accum: fixed(850, 1),
    distance_accum: fixed(distance),
    duration_active_accum: fixed(activeSeconds, 1),
    duration_paused_accum: '120.0',
    duration_total_accum: fixed(activeSeconds + 120, 1),
    heart_rate_avg: fixed(142.7),
    power_bike_np_last: '228.0',
    power_bike_tss_last: '86.5',
    power_avg: fixed(205.3),
    speed_avg: fixed(distance / activeSeconds),
    work_accum: fixed(205.3 * activeSeconds, 1),
    time_zone: args['time-zone'] || 'America/Denver',
    manual: false,
    edited: false,
    file: { url: args['file-url'] || null },
    fitness_app_id: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workout: {
      id: workoutId,
      starts,
      minutes,
      name: args.name || 'Wahoo replay ride',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      plan_id: null,
      workout_token: `replay-${workoutId}`,
      workout_type_id: Number(args['type-id'] ?? 0),
    },
  },
};

if (args['dry-run']) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const url = `${base.replace(/\/$/, '')}/api/wahoo-webhook`;
console.log(`POST ${url}  (workout ${workoutId}, type ${payload.workout_summary.workout.workout_type_id}, starts ${starts})`);
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const text = await response.text();
console.log(`→ ${response.status} ${text}`);
console.log('\nCheck the result:');
console.log(`  select id, name, type, distance, normalized_power, rss, fit_storage_path, imported_from from activities where provider = 'wahoo' and provider_activity_id = '${workoutId}';`);
console.log(`  select status, result, process_error, activity_id from wahoo_webhook_events where workout_id = '${workoutId}' order by created_at desc;`);
process.exit(response.ok ? 0 : 1);
