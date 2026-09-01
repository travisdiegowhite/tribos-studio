// Vercel API Route: AI Training Coach
// Server-side endpoint for AI coaching conversations

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { buildEvidenceSection } from './utils/evidenceCoachSection.js';
import { VOCABULARY_RULES, TRANSLATION_RULES, DATA_CORRECTION_NOTICE } from './utils/coachVoiceRules.js';
import { rateLimitByUser } from './utils/rateLimit.js';
import { enforceAiQuota } from './utils/aiQuota.js';
import { WORKOUT_LIBRARY_FOR_AI, ALL_COACH_TOOLS } from './utils/workoutLibrary.js';
import { CALENDAR_CHANGE_TOOL, validateOps, adjudicateOps, describeVerdict } from './utils/calendarChangeTool.js';
import { applyCalendarOps, persistProposal } from './utils/calendarChangeApply.js';
import { buildCalendarContext, formatCalendarBlock } from './utils/calendarCoachContext.js';
import { handleFitnessHistoryQuery } from './utils/fitnessHistoryTool.js';
import { handleTrainingDataQuery } from './utils/trainingDataTool.js';
import { generateTrainingPlan, getWorkoutMeta } from './utils/planGenerator.js';
import { buildArc, generateArcWorkouts, applyAvailabilityToArcWorkouts, buildArcExplanation, assembleHybridArcMessage } from './utils/arcBuilder.js';
import { buildRaceDemand } from './utils/raceDemand.js';
import { setupCors } from './utils/cors.js';
import { generateFuelPlan } from './utils/fuelPlanGenerator.js';
import { fetchCalendarContext } from './utils/calendarHelper.js';
import { PERSONA_DATA } from './utils/personaData.js';
import { formatHealth, fetchProprietaryMetrics } from './utils/contextHelpers.js';
import { buildTemporalAnchor, fetchTemporalAnchorData, buildSessionLabelMap, sanitizeSessionIds } from './utils/temporalAnchor.js';
import { fetchCoachEnrichmentData, buildCoachEnrichmentBlock } from './utils/coachContextEnrichment.js';
import { buildCoachingBibleBlock, buildRiderContext, ageFromDob, pickGoalRace } from './utils/coachingBible.js';
import { fetchRiderStateData, toRiderState } from './utils/toRiderState.js';
import { evaluateRules, selectInjectedRules, droppedRuleIds } from './utils/rulesEngine.js';

// Initialize Supabase for auth validation
const supabase = getSupabaseAdmin();

// Format a Date as YYYY-MM-DD in a specific timezone (server runs in UTC, so we must convert)
function formatDateInTimezone(date, timezone) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA gives YYYY-MM-DD
  } catch {
    // Invalid timezone — fall back to UTC
    return date.toISOString().split('T')[0];
  }
}

// Short "Mon Jul 21" label used to date prior-day conversation-history messages
function shortDayLabel(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('weekday')} ${get('month')} ${get('day')}`;
  } catch {
    return date.toISOString().split('T')[0];
  }
}

// Resolve relative date strings (today, tomorrow, this_monday, next_tuesday, YYYY-MM-DD) to YYYY-MM-DD
// timezone param ensures dates are resolved in the user's local timezone, not server UTC
// Day-of-week (0=Sun..6=Sat) in the given IANA timezone — the server runs in
// UTC, so getDay() alone is the wrong weekday for evening/early-morning hours.
function getDayOfWeekInTz(date, tz) {
  try {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[dayName] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}

export function resolveScheduledDate(dateStr, timezone = 'UTC', now = new Date()) {
  if (!dateStr) return formatDateInTimezone(now, timezone);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const today = new Date(now);
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  if (dateStr === 'today') return formatDateInTimezone(today, timezone);
  if (dateStr === 'tomorrow') {
    today.setDate(today.getDate() + 1);
    return formatDateInTimezone(today, timezone);
  }

  const match = dateStr.match(/^(this|next)_(\w+)$/);
  if (match) {
    const [, prefix, dayName] = match;
    // The CALENDAR_ANCHOR block teaches the model SHORT labels (this_sat,
    // next_sun), so accept both the full name and its 3-letter form —
    // a label that falls through here reaches Postgres as a non-date string.
    const normalized = dayName.toLowerCase();
    const targetDay = dayNames.findIndex(d => d === normalized || d.slice(0, 3) === normalized);
    if (targetDay >= 0) {
      // The athlete's local weekday, not the server's UTC weekday — for a
      // UTC-7 athlete on Friday evening, UTC is already Saturday and
      // "this_saturday" would otherwise resolve a full week out.
      const currentDay = getDayOfWeekInTz(today, timezone);
      let diff = targetDay - currentDay;
      // Normalize to a positive offset (next occurrence of targetDay)
      if (diff <= 0) diff += 7;
      if (prefix === 'next') {
        // "next_xxx" means the occurrence in the following Mon–Sun week,
        // i.e., after the current week's Sunday. Push forward by another
        // 7 days only if the normalized diff is still within this week.
        const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay;
        if (diff <= daysUntilSunday) diff += 7;
      }
      today.setDate(today.getDate() + diff);
      return formatDateInTimezone(today, timezone);
    }
  }

  return dateStr;
}

// A resolved date that still isn't ISO would reach Postgres as a raw string
// ("invalid input syntax for type date") — fail with something the model can
// act on in its tool_result instead.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function unrecognizedDateError(raw) {
  return `Unrecognized date "${raw}" — use YYYY-MM-DD, today, tomorrow, or a this_saturday / next_saturday style label`;
}

// Detect the athlete's primary intent from their raw message so we can force the
// matching tool when Claude answers in prose without calling a tool. Returns a
// tool name ('adjust_schedule' | 'create_training_plan' | 'recommend_workout')
// or null for general Q&A (which stays on tool_choice:auto). Order matters —
// the most specific intents are checked first.
export function detectCoachIntent(message) {
  if (!message || typeof message !== 'string') return null;
  const m = message.toLowerCase();

  // 1. Adjust an EXISTING plan: move/swap/replace/remove a workout or add rest.
  if (
    /\b(move|swap|reschedul\w*|shift|bump)\b/.test(m) ||
    /can'?t\s+(train|ride|run|do)/.test(m) ||
    /\b(rest day|day off|free up|take .* off)\b/.test(m) ||
    /\breplace\b.*\bwith\b/.test(m) ||
    /\bskip\b/.test(m)
  ) {
    return 'adjust_schedule';
  }

  // 2. Create a full multi-week plan / periodize toward an event.
  if (
    /\b(build|create|make|set up|generate|design|give me)\b.*\b(plan|program|block)\b/.test(m) ||
    /\b\d+[-\s]?week\b.*\bplan\b/.test(m) ||
    /\btraining (plan|program)\b/.test(m) ||
    /\bprepare me for\b/.test(m) ||
    /\bplan for my\b.*\b(race|event|fondo|century|marathon|criterium|gran fondo)\b/.test(m) ||
    /\bperiodiz\w*/.test(m) ||
    /\bload\b.*\bplan\b/.test(m) ||
    // Plural plan-activation: "add the workouts to my calendar" activates a whole
    // plan, not a single workout — keep it here, ahead of the singular add patterns below.
    /\badd\b.*\bworkouts\b.*\bcalendar\b/.test(m) ||
    // Weekly / schedule planning → a full plan preview (athlete's choice), e.g.
    // "plan my workouts for the rest of the week", "plan out the workout schedule",
    // "plan my week", "map out the rest of my week".
    /\bplan\b.*\b(my|the|our)?\s*(workouts?|week|schedule|training)\b/.test(m) ||
    /\bplan out\b/.test(m) ||
    /\bmap out\b.*\b(week|workouts?|schedule|training|plan)\b/.test(m) ||
    /\bplan\b.*\brest of (the|my) (week|month|season)\b/.test(m)
  ) {
    return 'create_training_plan';
  }

  // 3. Recommend a single / few workouts to add to the calendar.
  if (
    /what should i\s+(ride|run|do|train)/.test(m) ||
    /\brecommend\b/.test(m) ||
    /\bsuggest\b.*\b(workout|ride|run|session)\b/.test(m) ||
    /\badd\s+(a |an |some )?(workout|ride|run|session)/.test(m) ||
    /\bschedule\b.*\b(workout|training|ride|run)\b/.test(m) ||
    /\bgive me a\b.*\b(ride|workout|session|run)\b/.test(m) ||
    // Add-to-calendar follow-ups that reference a just-recommended workout ("add that
    // to the calendar", "schedule it for tomorrow"). Singular back-references only —
    // the plural "add the workouts" case is handled as a plan activation above.
    /\b(add|schedule|put|save|drop|stick|slot)\s+(that|this|it)\b/.test(m) ||
    /\b(add|put|schedule|save|drop|stick|slot)\b.*\b(it|that|this)\b.*\bcalendar\b/.test(m) ||
    /\b(add|put|schedule)\b.*\bto\b.*\bcalendar\b/.test(m)
  ) {
    return 'recommend_workout';
  }

  return null;
}

// Detect intent from the COACH'S OWN response prose. The model frequently narrates an
// action it never performs ("Let me get that Sweet Spot on the calendar", "let's build the
// final block right now") without calling the matching tool. The user's message often gives
// no regex-detectable signal, but the coach's promise does — so we read the response too and
// force the tool when a promise was made but no tool fired. Returns a tool name or null.
//
// Conservative by design: every pattern is anchored on a first-person PROMISE verb
// (let me / let's / I'll / I'm going to / here's / I've) so descriptive text like
// "your plan looks good" never trips it. Precedence: adjust → create → recommend, so a
// plan promise outranks a lone calendar-add when both appear in the same reply.
export function detectIntentFromResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return null;
  const m = responseText.toLowerCase();

  const PROMISE = /\b(let me|let'?s|i'?ll|i am going to|i'?m going to|i will|here'?s|i'?ve)\b/;
  if (!PROMISE.test(m)) return null;

  // 1. Adjusting an existing schedule.
  if (
    /\b(let me|let'?s|i'?ll|i'?m going to|i will)\b.*\b(move|swap|reschedul\w*|shift|bump|replace)\b/.test(m)
  ) {
    return 'adjust_schedule';
  }

  // 2. Building / mapping out a plan or block (full plan preview).
  if (
    /\b(let'?s|i'?ll|let me|i'?m going to|i will|here'?s|i'?ve)\b.*\b(build|map out|set up|put together|create|design)\b.*\b(plan|block|week|schedule|training|program)\b/.test(m) ||
    /\b(build|map out|set up|put together)\b.*\b(final block|the rest of (your|the) (week|season|month)|training block)\b/.test(m)
  ) {
    return 'create_training_plan';
  }

  // 3. Getting a single workout onto the calendar.
  if (
    /\b(let me|i'?ll|let'?s|i'?m going to|i will|i'?ve)\b.*\b(get|put|add|drop|schedule|slot|pencil)\b.*\bcalendar\b/.test(m) ||
    /\b(get|put|drop|add|slot|pencil)\b.*\bon (the|your) calendar\b/.test(m) ||
    /\bschedule\b.*\bfor (today|tomorrow|this|next)\b/.test(m)
  ) {
    return 'recommend_workout';
  }

  return null;
}


// Swap two workouts' dates atomically. planned_workouts has
// UNIQUE(plan_id, scheduled_date) AND scheduled_date NOT NULL, so the swap
// first "parks" the source row at a sentinel date far outside any real plan.
// (The original implementation parked at NULL, which the NOT NULL constraint
// rejects — that made every same-plan swap fail.) Calendar reads are
// date-ranged, so a parked row can't surface mid-swap; every step still checks
// its error and rolls back on partial failure so a workout is never left
// stranded on the sentinel (invisible to all date-ranged reads, i.e. it would
// silently disappear from the calendar).
// Returns { success, error }. Exported for unit tests.
const PARK_DATES = ['1900-01-01', '1900-01-02', '1900-01-03'];

// planned_workouts.workout_type is a constrained enum; map free-form types onto it.
// Mirrors VALID_WORKOUT_TYPES in src/utils/coachWorkoutScheduler.js.
const VALID_WORKOUT_TYPES = [
  'endurance', 'tempo', 'threshold', 'intervals', 'recovery',
  'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'rest',
];

/**
 * Handle a `calendar_change` tool call.
 *
 * The whole point of this function is that THE MODEL DOES NOT DECIDE ANYTHING
 * consequential here. It supplies operations; the server resolves the handles
 * against rows it fetched itself, validates the list, adjudicates whether it
 * applies or needs the athlete, and reports back what actually happened.
 *
 * The tool result is written for the model to READ: it has to tell the athlete
 * either "I've added those" or "I've put that up for you to approve", and the
 * only way it can say the true one is if this result says which.
 *
 * @param {string} userId  Verified from the auth token, never from the body.
 * @param {object} input   Raw tool input.
 * @param {object|null} calendarContext  From buildCalendarContext — the handle
 *   map is built from THIS athlete's rows, so a handle for someone else's entry
 *   simply does not resolve.
 */
export async function handleCalendarChange(userId, input, calendarContext, conversationId = null) {
  // Belt and braces. There is no gate any more, but the context can still be
  // missing or degraded (a failed calendar read), and a tool call can arrive
  // from replayed conversation history, so refuse here rather than trusting
  // registration alone.
  if (!calendarContext) {
    return {
      success: false,
      error: 'The calendar is not available for this athlete. Do not claim any change was made.',
    };
  }
  if (!calendarContext.ok) {
    return {
      success: false,
      error: 'The calendar could not be read this turn, so no change was made. Tell the athlete to try again.',
    };
  }

  const { operations, summary } = input || {};

  const { valid, errors, resolved } = validateOps(
    operations,
    calendarContext.byHandle,
    calendarContext.ambiguous
  );
  if (!valid) {
    // Specific enough for the model to correct itself on the retry round.
    return {
      success: false,
      applied: 0,
      errors,
      error: `No changes were made. Fix these and call the tool again: ${errors.join(' ')}`,
    };
  }

  const verdict = adjudicateOps(resolved);
  const createCount = resolved.filter((op) => op.op === 'create').length;

  if (!verdict.apply) {
    const proposal = await persistProposal(userId, resolved, verdict, summary);
    if (!proposal.success) {
      return {
        success: false,
        applied: 0,
        error: `Could not save the proposal (${proposal.error}). Nothing changed; do not tell the athlete otherwise.`,
      };
    }
    return {
      success: true,
      applied: 0,
      proposed: resolved.length,
      proposal_id: proposal.proposalId,
      outcome: 'awaiting_approval',
      guidance: describeVerdict(verdict, createCount),
    };
  }

  const applyResult = await applyCalendarOps(userId, resolved, { source: 'coach' });
  const deduped = applyResult.results.filter((r) => r.deduped).length;
  return {
    deduped,
    success: applyResult.success,
    applied: applyResult.applied,
    failed: applyResult.failed,
    outcome: applyResult.failed === 0 ? 'applied' : 'partially_applied',
    results: applyResult.results,
    guidance: applyResult.failed === 0
      ? describeVerdict(verdict, createCount)
      : `${applyResult.applied} of ${applyResult.results.length} changes went through. Tell the athlete exactly which did not, and why — do not report the whole change as done.`,
  };
}

// Base coaching knowledge (date context added dynamically)
const COACHING_KNOWLEDGE = `You are an expert endurance sports coach with deep knowledge of:
- Training periodization and load management for BOTH cycling and running
- Power-based training (cycling) and pace-based training (running)
- Tribos metrics — Ride Stress Score (RSS), Training Fitness Index (TFI), Acute Fatigue Index (AFI), Form Score (FS) — across cycling and running (run stress is also RSS, derived from pace/HR)
- Cycling and running physiology and performance optimization
- Recovery and fatigue management across multiple sports
- Workout prescription for different training phases
- Route planning, terrain strategy, and race preparation
- Sports nutrition, on-bike fueling, and run fueling strategies

**MULTI-SPORT AWARENESS:**
You support both cycling and running athletes. Determine the athlete's primary sport from their profile context (primary_sport field) and recent activity types. Key differences:

FOR CYCLISTS:
- Use power-based metrics (FTP, watts, W/kg, normalized power)
- RSS from power data; zones based on FTP
- Workouts: recovery_spin, foundation_miles, three_by_ten_sst, etc.
- Key events: centuries, gran fondos, criteriums, road races

FOR RUNNERS:
- Use pace-based metrics (min/km, threshold pace, VDOT)
- Run stress (RSS) estimated from pace, HR, and duration; zones based on threshold pace
- Workouts: run_recovery_jog, run_easy_aerobic, run_threshold_intervals, etc.
- Key events: 5K, 10K, half marathon, marathon, ultra, trail races
- Running-specific advice: cadence (170-180 spm), form cues, injury prevention
- Mileage management: increase weekly volume by no more than ~10%/week

IMPORTANT: Match your workout recommendations to the athlete's sport. Never recommend cycling workouts to a runner or running workouts to a cyclist unless they ask about cross-training.

Your Personality:
(Your persona voice is set dynamically per athlete — see the COACHING PERSONA section in the system prompt below.)
- Clear and concise (avoid jargon unless explaining it)
- Focus on sustainable long-term improvement over quick fixes

Guidelines for Your Responses:
1. Always be specific - reference actual data from the athlete's training
2. Keep responses to 2-3 paragraphs maximum (be concise!)
3. Provide actionable next steps, not just explanations
4. Explain the "why" behind recommendations
5. Consider both the metrics and the context (life stress, weather, upcoming events)
6. Balance ambition with recovery and injury prevention
7. **CRITICAL**: Whenever you suggest specific workouts, YOU MUST put them on the calendar with the calendar_change tool — one operation per session

When discussing metrics (spec §2, §6 — plain English first, Tribos abbreviation second):
- TFI (Training Fitness Index): adaptive EWMA of daily Ride Stress Score; athlete's current fitness level
- AFI (Acute Fatigue Index): short EWA of daily RSS; how tired the athlete is right now
- FS (Form Score): yesterday's TFI minus yesterday's AFI — readiness going into today
- Positive FS = rested/fresh, Negative FS = carrying fatigue
- FS ranges: < -30 (overreached), -30 to -5 (productive training load), -5 to +10 (coasting — neither fresh nor fatigued), +10 to +20 (fresh),  > +20 (losing fitness — transition)

**CALENDAR & RACE GOALS ACCESS:**
You have DIRECT ACCESS to the athlete's calendar and race goals. This data is provided in the "ATHLETE'S CURRENT TRAINING CONTEXT" section below. When the athlete asks about their races, events, or calendar:
- You CAN see their race names, dates, distances, elevation, race types, and goals
- You CAN calculate exactly how many days/weeks until each race
- You CAN provide race-specific training plans based on their actual event details
- DO NOT tell the athlete you "can't see" their calendar - you have full access to their race goals
- Reference their specific races by name when giving advice (e.g., "For Old Man Winter on March 15th...")
- Use the race date to calculate preparation timelines and periodization phases

${WORKOUT_LIBRARY_FOR_AI}

**HOW TO CHANGE THE CALENDAR:**

\`calendar_change\` is the ONLY tool that writes to the athlete's calendar. Adding a
workout, adding a race, moving, swapping, editing, completing, skipping or removing
anything is an operation on that one tool. There is no separate "recommend a workout"
tool and no separate "build a plan" tool. They were removed, not merely discouraged:
they wrote to a table the calendar no longer reads, so they reported success and
changed nothing the athlete could see.

**Trigger phrases that REQUIRE calling calendar_change:**
- "what should I ride" / "what should I run" / "plan my week" / "add workouts" / "schedule training"
- "move my workout", "swap Monday and Wednesday", "I can't train on Thursday"
- "replace intervals with a recovery spin", "I need a rest day on Friday"
- "create a training plan", "build me a plan", "prepare me for [race]", "I need a 12-week plan"
- "add my races", "plan my cross season"
- Any request to add, change, move, swap, complete or remove anything on the calendar

**Addressing an existing entry:** by its \`sess_\` handle from the CALENDAR block above —
never by date or day name. Entries you are creating do not have a handle yet.

**A single session** is one \`create\` operation. Use \`workout_id\` values from the library
above (recovery_spin, three_by_ten_sst, …) so the session carries real structure.

**A multi-week block** is \`generate_block\`, NOT dozens of \`create\` operations. It takes a
weekly pattern, a date range and a load progression, and the server expands it — skipping
days that are already occupied, race days included. One operation per session across a
12-week block overruns the reply budget and the tool call gets cut off mid-write, so
nothing is written at all.

**A race** is type \`"race"\`. A name and a date is enough to create one. When an athlete
plans a season, put every race on the calendar first, then build the training around them.

**There is no plan window.** The calendar belongs to the athlete, not to a plan, so a date
in December is as writable as tomorrow. Never tell an athlete you cannot schedule
something because it falls outside a plan.

**NEVER PROMISE AN ACTION WITHOUT PERFORMING IT:**
If your reply says or implies you are doing something — "let me get that on the calendar",
"I'll add that workout", "I'll move that to Saturday" — you MUST emit the \`calendar_change\`
call in that SAME response. Narrating it in prose and skipping the call leaves the athlete
with an empty promise and nothing on their calendar.

**NEVER STATE AN OUTCOME BEFORE YOU HAVE THE TOOL RESULT.** The result tells you whether
the change APPLIED or is AWAITING THE ATHLETE'S APPROVAL, and your reply must say the true
one. If it says awaiting approval, say you have put it up for them to accept — not that you
have made the change. If it reports \`success: false\` or \`applied: 0\`, the change did NOT
happen: say plainly what failed, using the result's own message.

**HISTORICAL FITNESS ANALYSIS:**

You have access to the athlete's fitness history through the query_fitness_history tool.
Use this tool whenever the athlete asks about:
- Past performance ("How was my fitness last year?")
- Comparisons ("Am I fitter now than before?")
- Peak periods ("When was I at my best?")
- Trends ("Am I building or losing fitness?")
- Seasonal patterns ("What time of year am I usually strongest?")

**Trigger phrases for history tool:**
- "compare to last year"
- "this time last year"
- "when was I"
- "peak fitness"
- "trending"
- "building fitness"
- "losing fitness"
- "year over year"
- "historically"

IMPORTANT: Use the query_fitness_history tool ONLY for historical comparisons (past weeks/months/years). For the athlete's CURRENT fitness (today's TFI, AFI, FS), always use the values from the Training Context above — they are computed in real-time and are more accurate than weekly snapshots. Never override the live context values with snapshot data.

**ADVANCED RIDE ANALYTICS (available per activity):**

When discussing individual rides, you can reference these advanced metrics stored in each activity's ride_analytics field:
- **Pacing analysis**: strategy (even/negative/positive split), power fade %, quarter-by-quarter power
- **Match burning**: surges above FTP/CP — count, total work above threshold, peak match watts
- **Fatigue resistance**: index (1.0 = no fade), power decile breakdown, cardiac drift
- **HR zone distribution**: time in each HR zone (% breakdown)
- **Cadence analysis**: avg/peak cadence, distribution buckets, coasting %, cadence-power correlation
- **Variability Index**: EP/avgPower ratio (>1.05 = variable, <1.02 = steady)
- **Efficiency Factor**: EP/avgHR ratio (higher = more aerobically fit)
- **Execution score**: how well the ride matched the planned workout (0-100)

For longitudinal insights, fitness_snapshots now include:
- **Training monotony & strain**: overtraining risk indicators (Banister model)
- **Dynamic FTP estimation**: auto-estimated from recent best efforts, with confidence level
- **Best efforts at key durations**: MMP tracking at 5s, 60s, 5min, 10min, 20min, 60min
- **Avg efficiency factor & variability index trends** per week

Use these when the athlete asks about ride quality, pacing, overtraining risk, or performance progression.

**AD HOC TRAINING DATA QUERIES (AMA ABOUT YOUR DATA):**

You have access to the query_training_data tool to answer specific questions about the athlete's individual activities.
Think of this as an "Ask Me Anything" about their training data.

Use this tool when the athlete asks about:
- Activity counts ("How many rides did I do last month?")
- Commute tracking ("How many bike commutes this year?", "How many daycare dropoffs by bike?")
- Distance/duration totals ("Total miles ridden in 2025?")
- Activity type breakdowns ("What % of my riding is gravel vs road?")
- Geographic/location questions ("How many times did I ride across the Golden Gate Bridge?")
- Filtered queries ("How many rides over 50 miles in the last 6 months?")
- Activity lookups ("What was my longest ride this year?", "Show me my last 5 gravel rides")

**Trigger phrases for training data tool:**
- "how many rides/runs"
- "how many commutes"
- "total miles/kilometers"
- "% road/gravel/singletrack"
- "how many times did I ride/cross/visit"
- "longest/shortest ride"
- "this year/last year/last month" (when about activity counts or stats, not fitness trends)

**For geographic queries**: Provide the place name in near_location.place_name.
The server geocodes it via Mapbox. Use descriptive names like "Golden Gate Bridge, San Francisco" or "Central Park, New York".

**For terrain/surface breakdowns**: Group by activity type. Strava categorizes rides as:
- Ride = road cycling
- GravelRide = gravel/mixed surface
- MountainBikeRide = singletrack/MTB
- VirtualRide = indoor trainer (Zwift, etc.)
- EBikeRide = electric assist
Note: This is per-activity classification. A mixed-surface ride tagged as "Ride" won't show its gravel segments separately.

**Tip**: For percentage questions, use sum_distance_km grouped by type, then calculate percentages from the results.

**IMPORTANT**: This tool queries individual activities, NOT fitness metrics (TFI/AFI/FS). Use query_fitness_history for fitness trend questions and query_training_data for activity-level questions.

**FUELING GUIDANCE:**

You should proactively mention fueling considerations when recommending workouts that are:
- 60+ minutes in duration
- High intensity (tempo, threshold, VO2max)
- Race day or race simulation efforts

**Fueling Guidelines by Intensity:**
| Intensity | Carbs/Hour |
|-----------|------------|
| Recovery/Easy | 0-30g (optional for <90 min) |
| Endurance | 30-40g |
| Tempo/Sweet Spot | 45-60g |
| Threshold | 60-80g |
| Race pace/VO2 | 80-120g (requires gut training) |

**Hydration by Temperature:**
- Cool (<65°F): 16-20 oz/hr
- Moderate (65-80°F): 20-24 oz/hr
- Hot (80-90°F): 24-32 oz/hr + electrolytes
- Very hot (>90°F): 32-40 oz/hr + electrolytes + pre-hydration

**When to mention fueling:**
1. When recommending long rides (2+ hours): Include pre-ride and on-bike fueling guidance
2. When discussing race preparation: Emphasize nutrition timing and gut training
3. When athlete reports bonking or energy issues: Explore fueling patterns
4. When prescribing high-volume weeks: Remind about increased nutrition needs
5. When weather is hot: Emphasize hydration and electrolytes

**Key fueling messages to include:**
- "For this 3-hour ride, plan on 150-180g of carbs during the ride (about 5-6 gels or equivalent)"
- "Start eating at the 45-minute mark and continue every 20-30 minutes"
- "Hot weather means you'll need 24-32 oz of fluid per hour with electrolytes"
- "Race-day nutrition: eat a carb-heavy meal 3-4 hours before, then fuel consistently"
- "If you're bonking late in rides, try eating earlier and more often"

**DISCLAIMER**: Always remind athletes that these are general guidelines. For personalized nutrition advice, they should consult a sports dietitian.

**REMEMBERING ATHLETE PREFERENCES (COACH MEMORY):**

You have a save_coach_memory tool that lets you persist important facts about the athlete.
Use it proactively when the athlete shares information you should remember for future conversations.

**When to save a memory:**
- Schedule constraints: "I can only ride before work" → save as schedule/long
- Preferences: "I hate indoor training" → save as preference/long
- Life context: "I have a new baby" → save as context/long
- Injuries: "My left knee has been bothering me" → save as injury/long
- Goals: "I want to finish a century by September" → save as goal/long
- Temporary situations: "I'm traveling this week" → save as context/short
- Patterns you observe: Athlete consistently skips recovery rides → save as pattern/medium

**When NOT to save a memory:**
- Trivial conversation ("thanks", "got it")
- Information already in their training context (FTP, TFI, race goals in the system)
- Duplicate of an existing memory (check the COACH MEMORY section in your context)
- Single-session details that won't matter next week

**Important:** Save memories silently — don't announce "I'll remember that" unless the athlete specifically asks you to remember something. Just save it naturally as part of the conversation.`;



export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate API key exists
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('MISSING ANTHROPIC_API_KEY');
      return res.status(500).json({
        success: false,
        error: 'Coaching service not configured'
      });
    }

    // Initialize Claude client
    const claude = new Anthropic({
      apiKey: apiKey,
    });

    // Validate request body
    const {
      message,
      conversationHistory = [],
      trainingContext = null,
      userLocalDate = null,
      userId = null,
      maxTokens = 2048,
      quickMode = false,
      userAvailability = null,
      checkInId = null,
      planId = null,
      raceGoalId = null,
    } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid message is required'
      });
    }

    // Validate message length
    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        error: `Message too long: ${message.length} characters (max 5,000)`
      });
    }

    // SECURITY: Require authenticated user identity
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const token = authHeader.substring(7);
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.error('Coach API auth validation failed:', authError?.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token'
      });
    }

    // Use the verified user ID from the token, not the untrusted request body
    const verifiedUserId = authUser.id;

    // Rate limiting (10 requests per 5 minutes per user — auth ran above,
    // so key on the verified identity, not the IP)
    const rateLimitResult = await rateLimitByUser(
      req,
      res,
      'AI_COACH',
      verifiedUserId,
      10,
      5
    );

    if (rateLimitResult !== null) {
      return;
    }

    // Daily AI quota (per-user cap + global ceiling)
    const quotaExceeded = await enforceAiQuota(req, res, verifiedUserId);
    if (quotaExceeded !== null) {
      return;
    }

    // Fetch persona, coach memory, recent check-ins, calendar, and (optionally) the specific check-in for threading
    // These give the command bar coach the same "identity" as the check-in coach
    const parallelFetches = [
      supabase
        .from('user_coach_settings')
        .select('coaching_persona, user_preferred_name, coaching_experience_level')
        .eq('user_id', verifiedUserId)
        .maybeSingle(),
      supabase
        .from('coach_memory')
        .select('category, content')
        .eq('user_id', verifiedUserId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('coach_check_ins')
        .select('persona_id, narrative, recommendation, next_session_purpose, created_at')
        .eq('user_id', verifiedUserId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(3),
      fetchCalendarContext(verifiedUserId).catch((err) => {
        console.error('Calendar context fetch failed (non-blocking):', err.message);
        return null;
      }),
      // If this is a check-in thread, fetch the full check-in for rich context
      checkInId
        ? supabase
            .from('coach_check_ins')
            .select('id, persona_id, narrative, deviation_callout, recommendation, next_session_purpose, context_snapshot, created_at')
            .eq('id', checkInId)
            .eq('user_id', verifiedUserId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Fetch recent unresolved plan deviations for deviation-aware coaching
      supabase
        .from('plan_deviations')
        .select('id, deviation_date, planned_tss, actual_tss, tss_delta, deviation_type, severity_score, options_json')
        .eq('user_id', verifiedUserId)
        .is('resolved_at', null)
        .order('deviation_date', { ascending: false })
        .limit(5),
      // Fetch user timezone + FTP/weight for the server training snapshot.
      // date_of_birth feeds the coaching-bible rider context, which mentions
      // age only past 40 (masters rules key off it from Phase 2 on).
      supabase
        .from('user_profiles')
        .select('timezone, recovery_mode, ftp, weight_kg, date_of_birth')
        .eq('id', verifiedUserId)
        .maybeSingle(),
      // Fetch all active training plans for multi-plan context
      supabase
        .from('training_plans')
        .select('id, name, sport_type, priority, status, start_date, end_date, created_at')
        .eq('user_id', verifiedUserId)
        .eq('status', 'active')
        .order('priority', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      // Fetch latest health metrics for coaching context
      // metric_date, NOT recorded_date. health_metrics has never had a
      // recorded_date column, so this select errored on every request and the
      // HEALTH STATUS block silently never rendered. formatHealth reads no
      // date field, so only the query changes.
      supabase
        .from('health_metrics')
        .select('resting_hr, hrv_ms, sleep_hours, sleep_quality, energy_level, metric_date')
        .eq('user_id', verifiedUserId)
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Fetch weekly availability (blocked/preferred days) so plans honour it
      // server-side regardless of which client called the coach.
      supabase
        .from('user_day_availability')
        .select('day_of_week, is_blocked, is_preferred')
        .eq('user_id', verifiedUserId),
      // Fetch training preferences (weekend long rides, max workouts/week, …)
      supabase
        .from('user_training_preferences')
        .select('prefer_weekend_long_rides, prefer_weekend_long_runs, max_workouts_per_week')
        .eq('user_id', verifiedUserId)
        .maybeSingle(),
      // Server training snapshot (recent activities, latest fitness row, this
      // week's planned workouts) — grounds surfaces that send a thin
      // trainingContext string. Self-catches to null, non-blocking.
      fetchCoachEnrichmentData(supabase, verifiedUserId),
      // Performance Evidence Engine verdicts (last 9 weeks, newest first).
      // Fail-soft: table may be empty or absent for new athletes.
      supabase
        .from('fitness_evidence_weekly')
        .select('week, verdict, verdict_raw, score, confidence, signals, model_divergence, narrative_facts')
        .eq('user_id', verifiedUserId)
        .order('week', { ascending: false })
        .limit(9),
      // 28-day activity window for the coaching-bible rider context: typical
      // weekly hours and the most recent ride. Deliberately NOT folded into
      // fetchCoachEnrichmentData, whose 15-day / 30-row window is tuned for
      // the snapshot block and would start truncating if widened. Two columns
      // plus the last ride's labels — a small payload.
      supabase
        .from('activities')
        .select('name, start_date, moving_time, distance, average_watts')
        .eq('user_id', verifiedUserId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .gte('start_date', new Date(Date.now() - 28 * 86400000).toISOString())
        .order('start_date', { ascending: false })
        .limit(200),
    ];

    const [coachSettingsResult, coachMemoryResult, recentCheckInsResult, calendarContextResult, checkInResult, deviationsResult, userProfileResult, allActivePlansResult, healthMetricsResult, dayAvailabilityResult, trainingPrefsResult, enrichmentData, evidenceResult, recentRidesResult] = await Promise.all(parallelFetches);

    const coachSettings = coachSettingsResult.data;
    const activeCheckIn = checkInResult?.data || null;
    const coachMemories = coachMemoryResult.data || [];
    const recentCheckIns = recentCheckInsResult.data || [];
    const calendarContext = calendarContextResult;
    const unresolvedDeviations = deviationsResult?.data || [];
    const userDbTimezone = userProfileResult?.data?.timezone || null;
    const userRecoveryMode = userProfileResult?.data?.recovery_mode || 'standard';
    const allActivePlans = allActivePlansResult?.data || [];
    const healthMetrics = healthMetricsResult?.data || null;

    // Resolve training availability: prefer a client-supplied payload, else build it
    // from the DB so the arc/static plan and the coaching prose honour blocked days +
    // preferences no matter which surface called the coach.
    let resolvedAvailability = userAvailability;
    if (!resolvedAvailability) {
      const dayRows = dayAvailabilityResult?.data || [];
      const prefs = trainingPrefsResult?.data || null;
      if (dayRows.length > 0 || prefs) {
        const weeklyAvailability = [];
        for (let d = 0; d < 7; d++) {
          const row = dayRows.find((r) => r.day_of_week === d);
          weeklyAvailability.push({
            dayOfWeek: d,
            status: row
              ? (row.is_blocked ? 'blocked' : row.is_preferred ? 'preferred' : 'available')
              : 'available',
          });
        }
        resolvedAvailability = {
          weeklyAvailability,
          preferences: prefs
            ? {
                preferWeekendLongRides: prefs.prefer_weekend_long_rides,
                preferWeekendLongRuns: prefs.prefer_weekend_long_runs,
                maxWorkoutsPerWeek: prefs.max_workouts_per_week,
              }
            : {},
        };
      }
    }

    // Fetch proprietary metrics (EFI/TWL/TCAS) — non-blocking
    const proprietaryMetrics = await fetchProprietaryMetrics(supabase, verifiedUserId);

    // Coaching-bible rules engine inputs. Self-catching: a coach that loses
    // its rules is yesterday's coach, a coach that throws is an outage.
    const riderStateData = await fetchRiderStateData(supabase, verifiedUserId).catch((err) => {
      console.error('Rider state fetch failed (non-blocking):', err.message);
      return null;
    });

    // Resolve the user's timezone: prefer browser-supplied, then DB, then UTC
    const resolvedTimezone = userLocalDate?.timezone || userDbTimezone || 'UTC';

    // Fetch temporal anchor data (next 14 days of sessions + upcoming race goals)
    // Non-blocking on failure — coach degrades gracefully without the anchor block
    let anchorData = { plannedWorkouts: [], raceGoals: [] };
    try {
      anchorData = await fetchTemporalAnchorData(verifiedUserId, supabase, resolvedTimezone);
    } catch (anchorErr) {
      console.error('Temporal anchor fetch failed (non-blocking):', anchorErr.message);
    }
    // The race open in the Race tab, if any. Only ever matched against the
    // user's own race_goals rows, so a bogus id silently no-ops.
    const selectedRaceGoalId = typeof raceGoalId === 'string' && raceGoalId ? raceGoalId : null;
    const temporalAnchorBlock = buildTemporalAnchor(
      resolvedTimezone,
      anchorData.plannedWorkouts,
      anchorData.raceGoals,
      new Date(),
      { selectedRaceGoalId }
    );

    // ── The calendar the coach reads and writes ─────────────────────────────
    //
    // UNGATED as of 2026-08-29. This used to sit behind
    // user_profiles.calendar_v2_enabled, true for exactly one account, because
    // writing calendar_entries for an athlete whose calendar still read
    // planned_workouts would have succeeded silently and shown them nothing.
    //
    // /train now reads calendar_entries for EVERY athlete, which inverted the
    // gate: it became the LEGACY writers that wrote where nobody looks. A gated
    // coach would report scheduling a workout and show the athlete an unchanged
    // calendar — the exact failure this rebuild exists to remove, preserved
    // inside the flag meant to fix it.
    //
    // Note the name: `calendarContext` is already taken further down by the
    // Google Calendar block, which is an unrelated thing.
    let trainingCalendarContext;
    try {
      trainingCalendarContext = await buildCalendarContext(verifiedUserId, resolvedTimezone);
    } catch (calErr) {
      // Degrade to an explicit 'unavailable' context — never to null, and never
      // to an empty calendar, which is indistinguishable from a failed read and
      // which the model will confidently plan into. formatCalendarBlock renders
      // !ok as a block telling it that it cannot see the calendar and must not
      // call the tool, and handleCalendarChange refuses on !ok. There is no
      // legacy writer left to fall back to, so the honest failure is the only
      // safe one.
      console.error('Calendar context failed (degraded, non-blocking):', calErr.message);
      const failed = { ok: false, entries: [], error: calErr.message };
      trainingCalendarContext = {
        block: formatCalendarBlock(failed),
        byHandle: new Map(),
        ambiguous: new Set(),
        ok: false,
        entries: [],
      };
    }

    // OUTPUT BUDGET. Every coach surface hard-codes maxTokens in its request
    // body (1024 for the command bar and Today panel, 2048 for the race tab),
    // so a server-side *default* never applies — the client value always wins.
    // Those numbers were set when the calendar tools took a whole plan in one
    // compact call. calendar_change is per-operation: nine races with notes and
    // reasons is ~1,200 tokens on its own, which means a season-planning turn
    // truncated MID TOOL CALL. A truncated tool_use arrives with input `{}`,
    // so the server saw "No operations supplied", the retry truncated the same
    // way, the 3-round cap fired, and the athlete got an empty reply with three
    // copies of their races and no training. Hence a floor, not a default.
    const effectiveMaxTokens = Math.max(maxTokens, 8192);

    // Tools are per-request now, not a module constant.
    //
    // The three legacy calendar writers are REMOVED for everyone, not merely
    // discouraged. Leaving them available was not a small mistake: on
    // 2026-08-25 the athlete asked the coach to plan a cyclocross season, and
    // it built another "Plan: The Rad" in planned_workouts — 32 sessions, zero
    // races — retiring the real plan on the way past. Their calendar reads
    // calendar_entries, so the write succeeded and showed them nothing. That is
    // the exact failure this rebuild exists to remove, reproduced by the change
    // meant to fix it.
    //
    // Prompt instructions were never going to hold this line. The forced-tool
    // pass below calls the model with tool_choice:{type:'tool', name} — it
    // COMPELS a named tool, and no amount of system-prompt precedence outranks
    // that. The only durable fix is that the wrong tool is not on the menu.
    const LEGACY_CALENDAR_WRITERS = new Set([
      'recommend_workout', 'create_training_plan', 'adjust_schedule',
    ]);
    const coachTools = [
      ...ALL_COACH_TOOLS.filter((t) => !LEGACY_CALENDAR_WRITERS.has(t.name)),
      CALENDAR_CHANGE_TOOL,
    ];

    // Determine persona
    const personaId = coachSettings?.coaching_persona && coachSettings.coaching_persona !== 'pending'
      ? coachSettings.coaching_persona
      : null;
    const persona = personaId ? PERSONA_DATA[personaId] : null;
    const riderName = coachSettings?.user_preferred_name || null;

    // Build the full system prompt — temporal anchor is the foundation
    let systemPrompt = `=== TEMPORAL ANCHOR (pre-resolved dates — do not compute new ones) ===
${temporalAnchorBlock}
\n${trainingCalendarContext.block}\n

CRITICAL: Conversation-history messages that occurred on a PREVIOUS day are prefixed
with their date, e.g. "[Mon Jul 21]". Inside a prefixed message, words like "today",
"tomorrow", or "this ride" refer to THAT date — not the current day. Unprefixed
history messages are from today. Never treat a prior-day message's "today" as the
current day; always resolve days via the labels above.

${DATA_CORRECTION_NOTICE}

${VOCABULARY_RULES}

${TRANSLATION_RULES}

=== YOUR ROLE ===
${COACHING_KNOWLEDGE}`;

    // Performance Evidence Engine: latest weekly verdict + receipts, with the
    // cadence throttle and divergence floor computed deterministically in
    // buildEvidenceSection (see api/utils/evidenceCoachSection.js). Empty
    // string when there are no verdict rows — section simply absent.
    const evidenceSection = buildEvidenceSection(evidenceResult?.data || []);
    if (evidenceSection) {
      systemPrompt += `\n\n${evidenceSection}`;
    }

    // Inject experience level context (modifies communication style)
    const experienceLevel = coachSettings?.coaching_experience_level || 'experienced';
    if (experienceLevel === 'just_starting' || experienceLevel === 'developing') {
      systemPrompt += `\n\n=== COACHING COMMUNICATION LEVEL: ${experienceLevel === 'just_starting' ? 'BEGINNER' : 'DEVELOPING'} ===
This athlete is ${experienceLevel === 'just_starting' ? 'new to structured training (< 1 year)' : 'developing as a structured cyclist (1-3 years)'}. Adapt your communication (the Tribos voice rules above still apply in full):

1. EXPLAIN JARGON ON FIRST USE (spec §6): When you mention RSS, TFI, AFI, FS, EP, RI, FTP, or any training acronym, use plain English first, then the Tribos abbreviation. Example: "Your ride stress (RSS) — how hard today's effort was — was 82." Only expand each term once per conversation.

2. CELEBRATE MILESTONES: Call out achievements explicitly — biggest ride ever, first week hitting all planned workouts, first structured interval session completed, consistency streaks. These matter more at this stage.

3. LEAD WITH WHY: Frame the purpose before the prescription. Instead of "Do a 45-minute Zone 2 ride today," say "Your body needs time to absorb this week's harder efforts — a 45-minute easy ride today accelerates that recovery."

4. FRAME PROGRESS FROM START: When showing adherence or fitness metrics, contextualise against where the athlete started, not just the target. Example: "Your fitness score was 28 four weeks ago — 38 now is real progress even if the target is 50."`;
    }

    // Inject coach memory (persistent behavioral insights)
    if (coachMemories.length > 0) {
      const memoryLines = coachMemories.map((m) => `- [${m.category}] ${m.content}`).join('\n');
      systemPrompt += `\n\n=== COACH MEMORY (PERSISTENT INSIGHTS ABOUT THIS ATHLETE) ===
These are facts you've learned about this athlete over time. Reference them naturally:
${memoryLines}`;
    }

    // Inject recent check-in summaries (cross-context awareness)
    if (recentCheckIns.length > 0) {
      const checkInLines = recentCheckIns.map((ci) => {
        const date = ci.created_at?.split('T')[0] || 'Unknown';
        const rec = ci.recommendation ? ` | Recommended: ${ci.recommendation.action}` : '';
        return `[${date}] ${ci.narrative}${rec}`;
      }).join('\n\n');
      systemPrompt += `\n\n=== RECENT COACHING CHECK-INS (FROM TRAINING DASHBOARD) ===
These are recent coaching check-ins you generated on the athlete's training dashboard.
You wrote these — they reflect your prior analysis. Stay consistent with this advice unless new data warrants a change.
${checkInLines}`;
    }

    if (trainingContext) {
      systemPrompt += `\n\n=== ATHLETE'S CURRENT TRAINING CONTEXT (INCLUDING RACE CALENDAR) ===
IMPORTANT: You have DIRECT ACCESS to all information below. This includes their race goals, event dates, distances, and performance targets. Reference this data directly in your responses.

CRITICAL: The TFI (training fitness), AFI (acute fatigue), and FS (form score) values in this context are computed IN REAL-TIME from the athlete's full activity history. They are the most accurate and up-to-date fitness metrics available. If the query_fitness_history tool returns different TFI/AFI/FS values, ALWAYS trust the values in this context block for CURRENT fitness. The fitness history tool uses weekly snapshots that may be stale. Only use the fitness history tool for HISTORICAL comparisons (e.g., "this time last year"), not for current fitness assessment.

WORKOUT STATUS GUIDE: Planned workouts are labeled [DONE], [MISSED], [TODAY], [UPCOMING], or [SKIPPED].
- [UPCOMING] workouts are scheduled for FUTURE days and are NOT overdue — do not count them as missed or as signs of poor compliance.
- [MISSED] workouts are from PAST days that were not completed — these indicate actual missed training.
- [TODAY] workouts are due today and still can be done.
- Use "Weekly Compliance" (based only on past-due workouts) to judge adherence, NOT "Overall Plan Compliance" (which is cumulative across the entire plan duration and naturally starts low).
- Many athletes have specific training day patterns (e.g., heavy Thu-Sun). Mid-week low volume is normal — check the full week schedule before judging.

${trainingContext}`;
    }

    // Server-fetched training snapshot — always injected so thin surfaces
    // (Today spine, glance, command bar) are as grounded as the dashboard.
    // The block's precedence note keeps the client's on-screen TFI/AFI/FS
    // authoritative for current fitness.
    const enrichmentBlock = buildCoachEnrichmentBlock(enrichmentData, {
      profile: userProfileResult?.data || null,
      raceGoals: anchorData.raceGoals,
      timezone: resolvedTimezone,
      selectedRaceGoalId,
    });
    if (enrichmentBlock) {
      systemPrompt += `\n\n${enrichmentBlock}`;
    }

    // Inject health metrics if available
    const healthText = formatHealth(healthMetrics);
    if (healthText && healthText !== 'No health data available.') {
      systemPrompt += `\n\n=== HEALTH STATUS ===
${healthText}`;
    }

    // Inject proprietary performance metrics if available
    if (proprietaryMetrics) {
      systemPrompt += `\n\n=== PERFORMANCE METRICS ===
${proprietaryMetrics}`;
    }

    // Scope race discussion to the race the athlete is viewing in the Race tab
    const selectedRaceGoal = selectedRaceGoalId
      ? (anchorData.raceGoals || []).find((g) => g.id === selectedRaceGoalId)
      : null;
    if (selectedRaceGoal) {
      systemPrompt += `\n\n=== ACTIVE RACE FOCUS ===
The athlete is currently viewing/discussing the race "${selectedRaceGoal.name}" on ${selectedRaceGoal.race_date} (marked [CURRENTLY SELECTED] above).
Answer race questions — date, countdown, course, demands, pacing, taper — about THIS race.
Other races on the calendar are background context only; mention them ONLY if the athlete names them or asks to compare.
CRITICAL: never mix races — do not pair one race's date with another race's countdown, course profile, or preparation phase. The SELECTED_RACE line in the TEMPORAL ANCHOR is the authoritative countdown for this race.`;
    }

    // Add multi-plan context when the athlete has multiple active training plans
    if (allActivePlans.length > 1) {
      const planLines = allActivePlans.map((p, i) => {
        const priority = p.priority ? ` (priority: ${p.priority})` : '';
        const dates = p.start_date && p.end_date ? ` | ${p.start_date} to ${p.end_date}` : '';
        const selected = planId && p.id === planId ? ' [CURRENTLY SELECTED]' : '';
        return `  ${i + 1}. "${p.name}" — ${p.sport_type || 'cycling'}${priority}${dates}${selected} (id: ${p.id})`;
      }).join('\n');

      systemPrompt += `\n\n=== ACTIVE TRAINING PLANS (MULTIPLE) ===
This athlete has ${allActivePlans.length} active training plans:
${planLines}

${planId ? `The athlete is currently viewing/discussing plan id "${planId}". Focus schedule adjustments and workout queries on this plan unless they specify otherwise.` : 'No specific plan is selected. When discussing workouts or schedule changes, ask which plan the athlete is referring to if it is ambiguous.'}
IMPORTANT: When adjusting schedules, ensure you are modifying the correct plan. If the athlete mentions a specific sport or plan name, match it to the correct plan above.`;
    } else if (allActivePlans.length === 1 && !planId) {
      // Single active plan — note it for context but no ambiguity
      const p = allActivePlans[0];
      systemPrompt += `\n\n=== ACTIVE TRAINING PLAN ===
Active plan: "${p.name}" — ${p.sport_type || 'cycling'} (id: ${p.id})`;
    }

    // Add schedule availability context if provided
    if (resolvedAvailability?.weeklyAvailability) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const availLines = resolvedAvailability.weeklyAvailability.map((d) => {
        let line = `  ${days[d.dayOfWeek]}: ${d.status.toUpperCase()}`;
        if (d.maxDurationMinutes) line += ` (max ${d.maxDurationMinutes} min)`;
        return line;
      });

      const blockedDays = resolvedAvailability.weeklyAvailability
        .filter((d) => d.status === 'blocked')
        .map((d) => days[d.dayOfWeek]);

      const preferredDays = resolvedAvailability.weeklyAvailability
        .filter((d) => d.status === 'preferred')
        .map((d) => days[d.dayOfWeek]);

      systemPrompt += `\n\n=== ATHLETE'S TRAINING SCHEDULE / AVAILABILITY ===
The athlete has configured which days they can and cannot train:

${availLines.join('\n')}
${blockedDays.length > 0 ? `\nBLOCKED DAYS (cannot train): ${blockedDays.join(', ')}` : ''}
${preferredDays.length > 0 ? `\nPREFERRED DAYS (prioritize key workouts here): ${preferredDays.join(', ')}` : ''}
${resolvedAvailability.preferences?.maxWorkoutsPerWeek ? `\nMax workouts per week: ${resolvedAvailability.preferences.maxWorkoutsPerWeek}` : ''}
${resolvedAvailability.preferences?.preferWeekendLongRides ? `\nPrefers long rides on weekends: Yes` : ''}

IMPORTANT: When creating training plans or recommending workouts:
- NEVER schedule workouts on blocked days
- Place key workouts (intervals, long rides) on preferred days when possible
- Respect the athlete's weekly workout limits
- generate_block skips days that are already occupied, but it does NOT know about blocked days — set its weekly pattern to avoid them yourself, and acknowledge the athlete's availability in your response`;
    }

    // Add real-time calendar context if Google Calendar is connected
    if (calendarContext) {
      systemPrompt += `\n\n=== ATHLETE'S REAL-TIME CALENDAR (FROM GOOGLE CALENDAR) ===
You have LIVE access to the athlete's personal calendar. Below are their actual events, work hours, and available riding windows for the next few days.

${calendarContext}
IMPORTANT: Use this real-time calendar data when recommending workouts or discussing scheduling:
- Suggest specific time windows that are actually free (e.g., "You have a 2-hour window before work at 6am")
- Acknowledge their busy schedule when relevant
- When recommending a workout, match its duration to an available window
- If they ask "when can I ride?", reference their actual free time above
- Do NOT suggest workout times that conflict with their calendar events or work hours`;
    }

    // Inject the specific check-in being discussed (for check-in thread conversations)
    if (activeCheckIn) {
      const rec = activeCheckIn.recommendation;
      const recText = rec ? `\nRecommendation: ${rec.action || ''} — ${rec.detail || ''}\nReasoning: ${rec.reasoning || ''}` : '';
      systemPrompt += `\n\n=== ACTIVE CHECK-IN BEING DISCUSSED ===
The athlete is asking about a specific coaching check-in you generated on ${activeCheckIn.created_at?.split('T')[0] || 'recently'}.
This is YOUR analysis — you wrote it. Answer questions about it as the same coach, with full confidence.

Your Narrative:
${activeCheckIn.narrative || '(none)'}
${activeCheckIn.deviation_callout ? `\nDeviation Callout: ${activeCheckIn.deviation_callout}` : ''}
${recText}
${activeCheckIn.next_session_purpose ? `\nNext Session Purpose: ${activeCheckIn.next_session_purpose}` : ''}

IMPORTANT:
- The athlete may ask "why did you say X?" or "what do you mean by Y?" — answer directly from this check-in.
- If they ask for alternatives or disagree with the recommendation, engage thoughtfully.
- You have the full context that was used to generate this check-in — use it.`;
    }

    // Inject recent unresolved plan deviations
    if (unresolvedDeviations.length > 0) {
      systemPrompt += `\n\n=== RECENT PLAN DEVIATIONS (unresolved) ===
The athlete has recent deviations from their training plan that haven't been resolved yet. Reference these when the athlete asks about their training load, deviations, or what adjustments to make.

${unresolvedDeviations.map(d => `- ${d.deviation_date}: ${d.deviation_type} | Planned RSS: ${d.planned_tss} → Actual RSS: ${d.actual_tss} (delta: ${d.tss_delta > 0 ? '+' : ''}${d.tss_delta}) | Severity: ${d.severity_score}/10${d.options_json ? ` | Available adjustments: ${Object.keys(d.options_json).filter(k => k !== 'planned').join(', ')}` : ''}`).join('\n')}

When discussing deviations, you may suggest specific adjustment options (modify next quality session, swap workout dates, insert a rest day, or drop a session) based on the options available above.
To ACT on a deviation the athlete asks you to fix (e.g. "adjust my week after I missed Tuesday"), call calendar_change with the moves, edits or removals that carry out the option — do not just describe the change in text.`;
    }

    // Persona voice is injected last so it is the freshest instruction and overrides generic tendencies
    if (persona) {
      const rules = persona.styleRules?.map(r => `- ${r}`).join('\n') || '';
      systemPrompt += `\n\n=== COACHING PERSONA: ${persona.name.toUpperCase()} ===
You are ${persona.name}. Adopt this voice in every response — it overrides any generic tone from earlier in this prompt.
Philosophy: ${persona.philosophy}
Voice: ${persona.voice}
${riderName ? `The athlete's preferred name is: ${riderName}` : ''}

STYLE RULES (non-negotiable):
${rules}

IMPORTANT: You also generate coaching check-ins on the athlete's training dashboard using this same voice.
When the athlete references a check-in, respond as the same coach — maintain continuity.`;
    }

    // ── Coaching Bible (docs/coaching-bible/) ──────────────────────────────
    //
    // Phase 1: behavior floor + rider context. `{{fired_rules}}` is empty until
    // the Phase 2 rules engine lands, and the block says so in words rather
    // than going missing — a silent gap is an invitation to invent a rule.
    //
    // Placed AFTER the persona block (so the floor's drift warnings are read
    // against the voice just established) and BEFORE the calendar-last block,
    // which keeps its position as the final word for the reason stated there.
    //
    // Additive by design: this adds a decision layer on top of the existing
    // context blocks, it does not replace any of them. Everything here is
    // built from rows already fetched above — no extra round trips beyond the
    // 28-day activity window added to the batch.
    try {
      const bibleRides = recentRidesResult?.data || [];
      const lastRide = bibleRides[0] || null;
      const totalRideSeconds = bibleRides.reduce((sum, a) => sum + (a.moving_time || 0), 0);
      const weeklyHours4wkMean = bibleRides.length > 0
        ? totalRideSeconds / 3600 / 4
        : null;
      const daysSinceLastRide = lastRide?.start_date
        ? Math.floor((Date.now() - Date.parse(lastRide.start_date)) / 86400000)
        : null;

      const todayStr = formatDateInTimezone(new Date(), resolvedTimezone);
      const evidenceSignals = evidenceResult?.data?.[0]?.signals || null;

      const riderContext = buildRiderContext({
        riderName,
        age: ageFromDob(userProfileResult?.data?.date_of_birth || null),
        goalRace: pickGoalRace(anchorData.raceGoals),
        todayStr,
        weeklyHours4wkMean,
        daysSinceLastRide,
        load: enrichmentData?.latestLoad || null,
        evidenceSignals,
        lastActivity: lastRide,
      });

      // ── The rules engine decides; the model voices ─────────────────────
      //
      // evaluateRules is pure: same RiderState, same rules, every time. A
      // rule whose inputs are missing is skipped, never approximated — the
      // skip reasons are logged so an absent rule can be explained without
      // guessing at it.
      let injectedRules = [];
      const riderState = toRiderState(riderStateData, {
        raceGoals: anchorData.raceGoals,
        evidenceSignals,
        todayStr,
      });
      const { fired, skipped } = evaluateRules(riderState);
      injectedRules = selectInjectedRules(fired);

      const dropped = droppedRuleIds(fired);
      if (fired.length > 0) {
        console.log('[coaching-bible] fired:', fired.map((r) => r.id).join(', '),
          dropped.length > 0 ? `| dropped for budget: ${dropped.join(', ')}` : '');
      }
      const brokenRules = skipped.filter((sk) => sk.reason === 'trigger_error');
      if (brokenRules.length > 0) {
        console.error('[coaching-bible] unevaluable rules:', JSON.stringify(brokenRules));
      }

      systemPrompt += `\n\n${buildCoachingBibleBlock({
        riderContext,
        firedRules: injectedRules,
        // No intake question captures fear of failure today, so CB-9's clause
        // is always absent. A skipped input, not an approximated one.
        fearOfFailure: riderState.fearOfFailureFlag === true,
      })}`;
    } catch (bibleErr) {
      // The floor is an improvement, never a dependency. A coach without it is
      // the coach we shipped yesterday; a coach that 500s is an outage.
      console.error('Coaching bible block failed (non-blocking):', bibleErr.message);
    }

    // Last word on the calendar, because it is the rule the coach has broken
    // most often and recency wins in a prompt this long. The detail lives in
    // COACHING_KNOWLEDGE above; this is the part that must survive.
    systemPrompt += `\n\n=== CALENDAR TOOL — READ THIS LAST ===
\`calendar_change\` is the ONLY tool that writes to the athlete's calendar. Adding,
moving, swapping, editing, completing, skipping or removing anything is an operation
on it. Multi-week blocks use its \`generate_block\` operation, not one create per
session. Races are type "race" and need only a name and a date.

Do not state an outcome before you have the tool result. It tells you whether the
change APPLIED or is AWAITING THE ATHLETE'S APPROVAL, and your reply must say the
true one. If it says awaiting approval, say you have put it up for them to accept —
not that you have made the change. If it reports \`success: false\` or \`applied: 0\`,
nothing was written: say what failed, using the result's own message.`;

    systemPrompt += `\n\n=== INSTRUCTIONS ===
Use the current date context and athlete data above to provide personalized, time-appropriate coaching advice.
When races are listed above, use their exact names, dates, and details in your response — you have full visibility into their calendar.

=== ANSWER-FIRST RULE ===
Answer the athlete's literal question in the first sentence. If it is a yes/no question, open with Yes or No. Add reasoning, context, or caveats only AFTER the direct answer is given. Never lead with analysis when the athlete asked for a recommendation.

=== RESPONSE LENGTH ===
Default: 2–4 sentences. Use bullet lists only when the athlete explicitly asks to compare options or list multiple items. Numbered protocol lists are acceptable for multi-step instructions, but only when the athlete asked for them. If the persona style rules specify a shorter limit, follow those.

=== SCHEDULE CONTEXT ===
The athlete's upcoming planned sessions are already loaded in the SESSIONS block of the TEMPORAL ANCHOR above. You have their full schedule for the next 14 days: every day appears in CALENDAR_ANCHOR, and days marked "(nothing planned)" are free. Do not ask the athlete what their schedule is — look it up there. When advising around a key day (a race or big ride), reason about EVERY day between now and it, including the free ones — e.g. moving intervals to tomorrow matters differently if the day before the race is free vs loaded. "(nothing planned)" means no scheduled-and-not-yet-completed session on that day; a day can carry the marker because its session was already done — completion status for this week is in the SERVER TRAINING SNAPSHOT.

=== TOOL RESULTS ===
When you use a server-side tool (calendar_change, query_fitness_history, query_training_data, save_coach_memory), the result is returned to you internally. Do not narrate the JSON output or describe what the tool returned. Confirm the outcome in one plain sentence (e.g., "Moved Tuesday's Sweet Spot to Wednesday.") and move on. Never say "Looks like X is marked complete" or "It appears the tool shows Y" — just state the outcome directly.
CRITICAL: if a tool result reports success:false or workouts_affected:0, the change did NOT happen — NEVER claim it did. Tell the athlete plainly what failed using the result's error message (e.g., "I couldn't find a planned workout on Saturday to change") and offer the next step.

=== CRITICAL: TODAY'S WORKOUT CONSISTENCY ===
The "TODAY'S WORKOUT RECOMMENDATION" section above shows what the athlete sees on their dashboard right now. You MUST be consistent with it:
- If the dashboard shows a specific workout (e.g., "Foundation Miles"), your initial advice MUST reference that same workout by name. Do NOT mention a different workout name.
- If the dashboard workout comes from the athlete's Training Plan (Source: Training Plan), affirm the planned workout. Do NOT tell the athlete to skip it unless they specifically ask about skipping or report feeling unwell.
- If you believe a different workout would be better, first acknowledge the planned workout, then explain why you'd suggest an adjustment.
- NEVER contradict the dashboard by recommending the athlete skip a workout that the dashboard is actively showing them. This creates confusion and undermines trust in the platform.`;

    // Add quickMode instructions for concise responses (Command Bar mode)
    if (quickMode) {
      systemPrompt += `\n\n=== QUICK MODE (COMMAND BAR) ===
The athlete is using the quick command bar. Provide CONCISE responses:
- Keep responses to 2-4 sentences maximum
- Focus on the most actionable advice
- Be direct and specific
- Brevity NEVER excuses skipping a tool call: if your reply says or implies you are adding a workout, scheduling, building/mapping out a plan or block, or adjusting the calendar, you MUST emit the calendar_change call in that same response. Never promise an action in prose without performing it.
- Prioritize immediate, practical guidance over detailed explanations`;
    }

    // Filter out any messages with empty content (Claude API requires non-empty content)
    const validHistory = conversationHistory
      .filter(msg => msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0);

    // Build conversation summary for older messages beyond the 10-message window
    const RECENT_WINDOW = 10;
    let conversationSummary = null;

    if (validHistory.length > RECENT_WINDOW) {
      const olderMessages = validHistory.slice(0, -RECENT_WINDOW);
      // Extract the user's questions/topics from older messages to give the coach context
      const olderUserTopics = olderMessages
        .filter(msg => msg.role === 'user')
        .map(msg => {
          // Truncate long messages to just the first sentence/question
          const text = msg.content.trim();
          const firstSentence = text.split(/[.!?\n]/)[0].trim();
          return firstSentence.length > 100 ? firstSentence.substring(0, 100) + '...' : firstSentence;
        });

      if (olderUserTopics.length > 0) {
        conversationSummary = `Earlier in this conversation, the athlete discussed: ${olderUserTopics.join('; ')}`;
      }
    }

    const recentHistory = validHistory.slice(-RECENT_WINDOW);

    // If we have a summary of older messages, add it to the system prompt
    if (conversationSummary) {
      systemPrompt += `\n\n=== EARLIER CONVERSATION CONTEXT ===
${conversationSummary}
(The full recent messages follow below. Use this summary for continuity with earlier discussion topics.)`;
    }

    // Build conversation messages - prepend a brief date reminder using the anchor's NOW line
    const todayDateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: resolvedTimezone,
    });
    const userMessageWithDate = `[Today is ${todayDateStr}]\n\n${message}`;

    // Date prior-day history messages so the model can't mistake an earlier
    // day's "today's ride" for the current day. Same-day messages stay
    // unprefixed; items without a (valid) timestamp are passed through
    // unchanged for callers that still send bare {role, content}.
    const todayLocalStr = formatDateInTimezone(new Date(), resolvedTimezone);
    const messages = [
      ...recentHistory.map(msg => {
        let content = msg.content;
        if (msg.timestamp) {
          const ts = new Date(msg.timestamp);
          if (!Number.isNaN(ts.getTime()) && formatDateInTimezone(ts, resolvedTimezone) !== todayLocalStr) {
            content = `[${shortDayLabel(ts, resolvedTimezone)}] ${content}`;
          }
        }
        return { role: msg.role, content };
      }),
      {
        role: 'user',
        content: userMessageWithDate
      }
    ];

    // Call Claude API
    const model = 'claude-sonnet-4-6';

    let response = await claude.messages.create({
      model: model,
      max_tokens: Math.min(effectiveMaxTokens, 16384),
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
      tools: coachTools
    });

    // Check if we need to handle tool calls
    let toolUses = response.content.filter(block => block.type === 'tool_use');

    // Reliability fix: if the athlete clearly wants a workout, plan, or schedule
    // change but Claude answered in prose (no matching tool call), re-run the
    // request forcing that exact tool so the UI always gets actionable cards.
    // This second pass only fires on the previously-broken path — when Claude
    // already called the right tool, nothing extra happens. Forcing a *named*
    // tool (vs {type:'any'}) avoids recommend_workout/create_training_plan being
    // confused with each other or with a query tool.
    //
    // Intent comes from the user's message OR — critically — from the coach's own
    // response prose. The model often promises an action ("let me get that on the
    // calendar", "let's build the final block right now") without calling the tool;
    // reading the response catches those even when the user's phrasing matched no
    // input regex. Input intent wins when present.
    const firstPassText = response.content.find(block => block.type === 'text')?.text || '';
    let coachIntent = detectCoachIntent(message) || detectIntentFromResponse(firstPassText);
    // On the rebuilt calendar EVERY write intent resolves to the one tool that
    // can actually write. This must cover all three legacy writers, not two:
    // "plan my cross season" matches detectCoachIntent's create_training_plan
    // branch, so an earlier version of this remap that handled only
    // recommend_workout and adjust_schedule left the season-planning case —
    // the exact case that motivated the tool — forcing the old writer.
    if (LEGACY_CALENDAR_WRITERS.has(coachIntent)) {
      coachIntent = 'calendar_change';
    }
    // Never force a tool that is not on this request's menu. tool_choice with an
    // unlisted name is an API error, and silently swallowing it (below) would
    // degrade to prose with no tool call at all.
    if (coachIntent && !coachTools.some((t) => t.name === coachIntent)) {
      console.warn(`Intent "${coachIntent}" is not an available tool this request; not forcing.`);
      coachIntent = null;
    }
    const producedIntentTool = !!coachIntent && toolUses.some(t => t.name === coachIntent);
    let forcedToolPass = false;
    if (coachIntent && !producedIntentTool) {
      forcedToolPass = true;
      try {
        const forcedResponse = await claude.messages.create({
          model: model,
          max_tokens: Math.min(effectiveMaxTokens, 16384),
          temperature: 0.7,
          system: systemPrompt,
          messages: messages,
          tools: coachTools,
          tool_choice: { type: 'tool', name: coachIntent },
        });
        const forcedToolUses = forcedResponse.content.filter(block => block.type === 'tool_use');
        if (forcedToolUses.length > 0) {
          // Keep the first pass's answer-first prose if the forced pass has none,
          // so the athlete still gets a sentence of reasoning above the cards.
          const forcedText = forcedResponse.content.find(block => block.type === 'text');
          const firstText = response.content.find(block => block.type === 'text');
          const mergedContent = [...forcedResponse.content];
          if (!forcedText && firstText) mergedContent.unshift(firstText);
          response = { ...forcedResponse, content: mergedContent };
          toolUses = forcedToolUses;
        }
      } catch (forceErr) {
        // Non-blocking: fall back to the first (prose-only) response.
        console.error('Forced tool pass failed (non-blocking):', forceErr.message);
      }
    }

    const fitnessHistoryUses = toolUses.filter(tool => tool.name === 'query_fitness_history');
    const trainingDataUses = toolUses.filter(tool => tool.name === 'query_training_data');
    const planCreationUses = toolUses.filter(tool => tool.name === 'create_training_plan');
    const fuelPlanUses = toolUses.filter(tool => tool.name === 'generate_fuel_plan');
    const memoryUses = toolUses.filter(tool => tool.name === 'save_coach_memory');
    const scheduleAdjustUses = toolUses.filter(tool => tool.name === 'adjust_schedule');
    // Actual handler results (row-count-gated success), collected as each
    // adjust_schedule tool executes — the payload must reflect what really
    // changed, not merely that the tool was called.
    const scheduleAdjustResults = [];
    // Same idea for calendar_change: the outcome has to reach the athlete even
    // when the model spends its last tokens on a tool call and emits no prose.
    const calendarChangeResults = [];
    const recommendWorkoutUses = toolUses.filter(tool => tool.name === 'recommend_workout');

    // Detailed logging for debugging
    console.log(`🤖 Coach response: ${toolUses.length} tool uses`);
    console.log(`   - Detected intent: ${coachIntent || 'none'} | forced tool pass: ${forcedToolPass}`);
    console.log(`   - Tool names used: ${toolUses.map(t => t.name).join(', ') || 'none'}`);
    console.log(`   - Fitness history queries: ${fitnessHistoryUses.length}`);
    console.log(`   - Training data queries: ${trainingDataUses.length}`);
    console.log(`   - Plan creations: ${planCreationUses.length}`);
    console.log(`   - Memory saves: ${memoryUses.length}`);
    console.log(`   - Schedule adjustments: ${scheduleAdjustUses.length}`);
    console.log(`   - Workout recommendations: ${recommendWorkoutUses.length}`);
    if (planCreationUses.length > 0) {
      console.log(`   - Plan creation input:`, JSON.stringify(planCreationUses[0].input, null, 2));
    }

    // Handle server-side tool calls (fitness/training queries, memory saves,
    // schedule adjustments) with a bounded continuation loop. One round =
    // execute the pending server-side tools, hand Claude the tool_results, and
    // let it respond. The model often follows a failed or partial result with
    // ANOTHER tool call (e.g. retrying a swap with corrected dates) — the old
    // single-shot continuation silently dropped those, so the coach would
    // confirm changes that never executed.
    const serverSideToolNames = new Set([
      'query_fitness_history', 'query_training_data', 'save_coach_memory', 'adjust_schedule',
      // Executes server-side so the model reads back whether its change
      // APPLIED or is awaiting approval — it must not guess, because its reply
      // to the athlete has to say which.
      'calendar_change',
    ]);

    // Client-side tool calls (recommend_workout, create_training_plan,
    // generate_fuel_plan) are processed AFTER this loop, so collect them from
    // every round — recommend_workout in particular is persisted server-side
    // below (no extra Claude turn) and must survive the loop.
    const clientSideToolNames = new Set(['recommend_workout', 'create_training_plan', 'generate_fuel_plan']);
    const collectedClientTools = toolUses.filter(tool => clientSideToolNames.has(tool.name));

    const executeServerTool = async (tool) => {
      let result;
      if (tool.name === 'query_fitness_history') {
        console.log(`🤖 Fitness history tool requested. userId: ${verifiedUserId}`);
        result = await handleFitnessHistoryQuery(verifiedUserId, tool.input);
      } else if (tool.name === 'query_training_data') {
        console.log(`📋 Training data query requested. userId: ${verifiedUserId}`);
        result = await handleTrainingDataQuery(verifiedUserId, tool.input);
      } else if (tool.name === 'save_coach_memory') {
        console.log(`🧠 Saving coach memory: [${tool.input.category}] ${tool.input.content}`);
        // Calculate expiry for short/medium memories
        let expiresAt = null;
        if (tool.input.memory_type === 'short') {
          expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (tool.input.memory_type === 'medium') {
          expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }
        const { error: memError } = await supabase
          .from('coach_memory')
          .insert({
            user_id: verifiedUserId,
            memory_type: tool.input.memory_type,
            category: tool.input.category,
            content: tool.input.content,
            source_type: 'conversation',
            expires_at: expiresAt,
          });
        if (memError) {
          console.error('Failed to save coach memory:', memError);
          result = { success: false, error: 'Failed to save memory' };
        } else {
          result = { success: true, saved: tool.input.content };
        }
      } else if (tool.name === 'calendar_change') {
        console.log(`🗓️  calendar_change requested:`, JSON.stringify(tool.input, null, 2));
        // A tool_use block truncated by max_tokens arrives with input `{}`. It
        // is NOT a request to do nothing — it is half a request whose other
        // half was cut off. Treating it as a normal validation failure burned
        // two of the three tool rounds on 2026-08-27 and left the athlete with
        // an empty reply. Name it for what it is so the model shortens rather
        // than retrying the same oversized call.
        const truncated = !tool.input || Object.keys(tool.input).length === 0;
        if (truncated) {
          console.warn('🗓️  calendar_change arrived EMPTY — response truncated at max_tokens.');
          result = {
            success: false,
            applied: 0,
            error: 'Your previous reply was cut off before this tool call finished, so nothing was written. '
              + 'Send FEWER operations this time: use generate_block for training instead of one create per '
              + 'session, keep `reason` to a short clause, and drop `notes` unless it matters. '
              + 'Do not repeat operations that already succeeded earlier in this turn.',
          };
        } else {
          result = await handleCalendarChange(verifiedUserId, tool.input, trainingCalendarContext);
        }
        console.log(`🗓️  calendar_change result:`, JSON.stringify(result));
        calendarChangeResults.push(result);
      }
      return result;
    };

    const MAX_TOOL_ROUNDS = 3;
    let convoMessages = messages;
    let pendingServerTools = toolUses.filter(tool => serverSideToolNames.has(tool.name));
    let toolRound = 0;

    while (pendingServerTools.length > 0 && verifiedUserId && toolRound < MAX_TOOL_ROUNDS) {
      toolRound++;
      const toolResults = [];

      // Every tool_use block in the assistant turn needs a tool_result, so
      // client-side tools in this round get an acknowledgment (they're
      // actually processed after the loop).
      for (const tool of response.content.filter(block => block.type === 'tool_use' && clientSideToolNames.has(block.name))) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: JSON.stringify({ success: true, note: 'Client-side tool — will be processed after response.' })
        });
      }

      for (const tool of pendingServerTools) {
        try {
          const result = await executeServerTool(tool);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify(result)
          });
        } catch (error) {
          console.error(`${tool.name} tool error:`, error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify({
              success: false,
              error: `Failed to process ${tool.name}`
            })
          });
        }
      }

      // Continue conversation with tool results
      convoMessages = [
        ...convoMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ];

      response = await claude.messages.create({
        model: model,
        max_tokens: Math.min(effectiveMaxTokens, 16384),
        temperature: 0.7,
        system: systemPrompt,
        messages: convoMessages,
        tools: coachTools
      });

      const roundToolUses = response.content.filter(block => block.type === 'tool_use');
      collectedClientTools.push(...roundToolUses.filter(tool => clientSideToolNames.has(tool.name)));
      pendingServerTools = roundToolUses.filter(tool => serverSideToolNames.has(tool.name));
    }

    if (pendingServerTools.length > 0 && toolRound >= MAX_TOOL_ROUNDS) {
      // Round cap hit with tool calls still pending — they were NOT executed.
      console.warn(`⚠️ Tool-round cap (${MAX_TOOL_ROUNDS}) reached with unexecuted server-side tool calls: ${pendingServerTools.map(t => t.name).join(', ')}`);
    }

    // Client-side tools from every round drive the post-loop processing;
    // unexecuted server-side leftovers are kept only so the empty-response
    // guard below knows a tool call happened.
    toolUses = [...collectedClientTools, ...pendingServerTools];

    // The recommend_workout persist loop that stood here is gone with the tool
    // that reached it. calendar_change writes the session itself, inside the
    // tool round, so there is nothing left to persist after the fact.
    const addedWorkouts = [];

    // Extract text response
    const textContent = response.content.find(block => block.type === 'text');
    let responseText = textContent?.text || '';

    // (create_training_plan default message is set AFTER the plan block below, once we
    // know whether it auto-activated — see "Default message for the plan".)

    // If Claude added workout(s) without text, provide a default confirmation so the
    // chat bubble is never blank. The workout is already on the calendar by this point.
    const successfullyAdded = addedWorkouts.filter(w => w.added);
    if (!responseText && successfullyAdded.length > 0) {
      const first = successfullyAdded[0];
      responseText = successfullyAdded.length === 1
        ? `Added ${first.name} to your calendar for ${first.scheduledDate}.`
        : `Added ${successfullyAdded.length} workouts to your calendar.`;
    } else if (!responseText && addedWorkouts.length > 0) {
      // Persist failed — fall back to a pending card the athlete can tap.
      responseText = "Here's a workout for you — tap Add to put it on your calendar.";
    }

    // A schedule adjustment ran but the model produced no prose (e.g. it spent
    // its final turn on a tool call) — synthesize the outcome so the athlete
    // never gets a blank bubble that hides a success or, worse, a failure.
    if (!responseText && scheduleAdjustResults.length > 0) {
      const allOk = scheduleAdjustResults.every(r => r.success);
      if (allOk) {
        const lastSummary = scheduleAdjustResults[scheduleAdjustResults.length - 1].summary;
        responseText = lastSummary ? `Done — ${lastSummary}` : 'Done — your schedule has been updated.';
      } else {
        const firstError = scheduleAdjustResults
          .flatMap(r => r.adjustments || [])
          .find(a => a.error)?.error;
        responseText = `I wasn't able to complete that schedule change${firstError ? ` (${firstError})` : ''}. Want me to try again?`;
      }
    }

    // calendar_change ran but the model produced no prose. On 2026-08-27 this
    // sent the athlete a COMPLETELY EMPTY reply (messageLength: 0) after
    // writing nine races — so from their side the coach had silently done
    // nothing, twice, while duplicating their season. Never let the outcome of
    // a write go unreported.
    if (!responseText && calendarChangeResults.length > 0) {
      const applied = calendarChangeResults.reduce((n, r) => n + (r.applied || 0), 0);
      const created = calendarChangeResults.reduce(
        (n, r) => n + (r.results || []).reduce((m, x) => m + (x.created || 0), 0), 0);
      const deduped = calendarChangeResults.reduce((n, r) => n + (r.deduped || 0), 0);
      const proposed = calendarChangeResults.reduce((n, r) => n + (r.proposed || 0), 0);
      const failed = calendarChangeResults.filter((r) => r.success === false);

      const parts = [];
      if (applied > 0 || created > 0) {
        const total = applied + created;
        parts.push(`Updated your calendar — ${total} ${total === 1 ? 'entry' : 'entries'}.`);
      }
      if (deduped > 0) parts.push(`${deduped} were already there, so I left them alone.`);
      if (proposed > 0) parts.push(`${proposed} ${proposed === 1 ? 'change is' : 'changes are'} waiting for you to approve.`);
      if (failed.length > 0 && parts.length === 0) {
        parts.push(`I couldn't finish that — ${failed[0].error || 'the change did not go through'}.`);
      } else if (failed.length > 0) {
        parts.push("Some of it didn't go through — ask me to check and I'll finish it.");
      }
      responseText = parts.join(' ') || 'Nothing needed changing on your calendar.';
    }

    // Guard: no text and no tools at all — nothing downstream will fill this in.
    // (The create_training_plan default message is applied later, so the
    // catch-all empty-bubble guard lives just before the response is sent.)
    if (!responseText && toolUses.length === 0) {
      responseText = "Sorry, I didn't catch that — could you rephrase?";
    }

    // Workout recommendations returned to the client are the ones we already persisted
    // server-side (added: true). The client renders these as "✓ Added" confirmations
    // rather than an "Add" button, since the write already happened.
    const workoutRecommendations = addedWorkouts;

    // The create_training_plan / arc-activation block that stood here is gone
    // with the tool that reached it. Both are still exported in the response
    // shape below as null, because the client destructures them.
    const trainingPlanPreview = null;
    const autoActivatedPlan = null;

    // Handle fuel plan generation tool
    let fuelPlan = null;
    const fuelPlanTool = toolUses.find(tool => tool.name === 'generate_fuel_plan');

    if (fuelPlanTool) {
      console.log(`🍌 Generating fuel plan:`, fuelPlanTool.input);
      try {
        fuelPlan = generateFuelPlan(fuelPlanTool.input);
        console.log(`✅ Fuel plan generated for ${fuelPlan.duration} ride`);
      } catch (error) {
        console.error('Fuel plan generation error:', error);
        fuelPlan = {
          error: true,
          message: 'Failed to generate fuel plan. Please try again.'
        };
      }
    }

    // Generate suggested actions for quickMode
    let suggestedActions = null;
    if (quickMode) {
      suggestedActions = [];

      // Workouts are persisted server-side now (added: true), so don't offer an "Add"
      // action for them — only surface any that somehow weren't added.
      const pendingRecs = workoutRecommendations.filter((rec) => !rec.added);
      if (pendingRecs.length > 0) {
        pendingRecs.forEach((rec, idx) => {
          suggestedActions.push({
            id: `add-workout-${idx}`,
            label: `Add ${rec.workout_id} to ${rec.scheduled_date}`,
            actionType: 'add_to_calendar',
            primary: idx === 0,
            payload: rec
          });
        });
      }

      // If there's a training plan, suggest activating it
      if (trainingPlanPreview && !trainingPlanPreview.error) {
        suggestedActions.push({
          id: 'activate-plan',
          label: 'Activate Training Plan',
          actionType: 'create_plan',
          primary: pendingRecs.length === 0,
          payload: trainingPlanPreview
        });
      }

      // Add contextual follow-up actions
      if (suggestedActions.length === 0) {
        // No specific actions, add generic follow-ups
        suggestedActions.push({
          id: 'view-details',
          label: 'Tell me more',
          actionType: 'view_details',
          primary: false
        });
      }
    }

    // Log the response we're about to send
    console.log(`📤 Sending response:`, {
      success: true,
      hasMessage: !!responseText,
      messageLength: responseText?.length || 0,
      hasWorkoutRecommendations: workoutRecommendations.length > 0,
      hasTrainingPlanPreview: !!trainingPlanPreview,
      planPreviewWorkouts: trainingPlanPreview?.summary?.total_workouts || 0,
      hasFuelPlan: !!fuelPlan,
      quickMode: quickMode,
      suggestedActionsCount: suggestedActions?.length || 0
    });

    // Catch-all: never return an empty bubble. An empty message reads as a
    // dead coach and gets persisted to the chat history as one (this is what
    // happened when a failed swap left the model with no final prose).
    if (!responseText) {
      responseText = "Sorry — I didn't finish that response. Mind asking again?";
    }

    // Internal sess_ handles must never reach the athlete — replace any the
    // model echoed with the session's description (covers every reply branch:
    // normal, forced-tool, fallback, arc explanation).
    responseText = sanitizeSessionIds(responseText, buildSessionLabelMap(anchorData.plannedWorkouts));

    return res.status(200).json({
      success: true,
      message: responseText,
      workoutRecommendations: workoutRecommendations.length > 0 ? workoutRecommendations : null,
      trainingPlanPreview: trainingPlanPreview,
      autoActivatedPlan: autoActivatedPlan,
      fuelPlan: fuelPlan,
      // True only when at least one adjustment actually changed rows — the
      // frontend uses this to trigger a calendar refetch, which is pointless
      // (and misleading) when nothing changed.
      scheduleAdjusted: scheduleAdjustResults.some(r => r?.success),
      scheduleAdjustments: scheduleAdjustResults.length > 0
        ? scheduleAdjustResults.flatMap(r => r?.adjustments || [])
        : null,
      suggestedActions: suggestedActions,
      usage: response.usage
    });

  } catch (error) {
    console.error('Claude API Error:', error);

    let clientError = 'Coaching request failed';
    let statusCode = 500;

    if (error.status === 429) {
      clientError = 'Too many requests. Please try again in a minute.';
      statusCode = 429;
    } else if (error.status === 401 || error.status === 403) {
      clientError = 'Service authentication error';
      statusCode = 500;
    } else if (error.status === 400) {
      clientError = 'Invalid request. Please try a different question.';
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      error: clientError
    });
  }
}
