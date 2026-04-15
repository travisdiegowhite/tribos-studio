// Vercel API Route: AI Training Coach
// Server-side endpoint for AI coaching conversations

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { WORKOUT_LIBRARY_FOR_AI, ALL_COACH_TOOLS } from './utils/workoutLibrary.js';
import { handleFitnessHistoryQuery } from './utils/fitnessHistoryTool.js';
import { handleTrainingDataQuery } from './utils/trainingDataTool.js';
import { generateTrainingPlan } from './utils/planGenerator.js';
import { setupCors } from './utils/cors.js';
import { generateFuelPlan } from './utils/fuelPlanGenerator.js';
import { fetchCalendarContext } from './utils/calendarHelper.js';
import { PERSONA_DATA } from './utils/personaData.js';
import { formatHealth, fetchProprietaryMetrics } from './utils/contextHelpers.js';

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

// Resolve relative date strings (today, tomorrow, this_monday, next_tuesday, YYYY-MM-DD) to YYYY-MM-DD
// timezone param ensures dates are resolved in the user's local timezone, not server UTC
function resolveScheduledDate(dateStr, timezone = 'UTC') {
  if (!dateStr) return formatDateInTimezone(new Date(), timezone);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  if (dateStr === 'today') return formatDateInTimezone(today, timezone);
  if (dateStr === 'tomorrow') {
    today.setDate(today.getDate() + 1);
    return formatDateInTimezone(today, timezone);
  }

  const match = dateStr.match(/^(this|next)_(\w+)$/);
  if (match) {
    const [, prefix, dayName] = match;
    const targetDay = dayNames.indexOf(dayName.toLowerCase());
    if (targetDay >= 0) {
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;
      if (prefix === 'this') {
        if (diff <= 0) diff += 7;
      } else {
        if (diff <= 0) diff += 7;
        diff += 7;
      }
      today.setDate(today.getDate() + diff);
      return formatDateInTimezone(today, timezone);
    }
  }

  return dateStr;
}

// Swap two workouts' dates atomically, using a null parking date to avoid unique constraint violation.
// The planned_workouts table has UNIQUE(plan_id, scheduled_date), so we can't have two rows
// with the same plan_id and date at the same time. We park one row at NULL first.
async function swapWorkoutDates(planId, sourceId, sourceDate, targetId, targetDate) {
  // Step 1: Park source workout at NULL date (breaks the constraint lock)
  await supabase.from('planned_workouts')
    .update({ scheduled_date: null })
    .eq('id', sourceId);

  // Step 2: Move target workout to source date (now free)
  await supabase.from('planned_workouts')
    .update({
      scheduled_date: sourceDate,
      day_of_week: new Date(sourceDate + 'T12:00:00').getDay()
    })
    .eq('id', targetId);

  // Step 3: Move source workout from NULL to target date (now free)
  await supabase.from('planned_workouts')
    .update({
      scheduled_date: targetDate,
      day_of_week: new Date(targetDate + 'T12:00:00').getDay()
    })
    .eq('id', sourceId);
}

// Handle schedule adjustment tool calls — modifies existing active plan workouts
async function handleScheduleAdjustment(userId, input, targetPlanId = null, timezone = 'UTC') {
  const { adjustments, summary } = input;
  const results = [];

  // Get the target plan — use specific plan_id if provided, otherwise fall back to most recent active plan
  let planQuery = supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId);

  if (targetPlanId) {
    planQuery = planQuery.eq('id', targetPlanId);
  } else {
    planQuery = planQuery
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
  }

  const { data: activePlan, error: planError } = await planQuery.maybeSingle();

  if (planError || !activePlan) {
    return { success: false, error: 'No active training plan found. The athlete needs to create or activate a plan first.' };
  }

  for (const adj of adjustments) {
    try {
      const sourceDate = resolveScheduledDate(adj.source_date, timezone);

      switch (adj.action) {
        case 'move': {
          const targetDate = resolveScheduledDate(adj.target_date, timezone);

          // Fetch source workout and check if target date is occupied
          const { data: involved } = await supabase
            .from('planned_workouts')
            .select('id, scheduled_date, name, workout_id, workout_type, original_scheduled_date, original_workout_id')
            .eq('plan_id', activePlan.id)
            .in('scheduled_date', [sourceDate, targetDate])
            .eq('completed', false);

          const sourceWorkout = involved?.find(w => w.scheduled_date === sourceDate);
          const targetWorkout = involved?.find(w => w.scheduled_date === targetDate);

          if (!sourceWorkout) {
            results.push({ action: 'move', from: sourceDate, to: targetDate, success: false, error: `No incomplete workout found on ${sourceDate}` });
            break;
          }

          // Track original date if not already tracked
          if (!sourceWorkout.original_scheduled_date) {
            await supabase.from('planned_workouts')
              .update({ original_scheduled_date: sourceDate })
              .eq('id', sourceWorkout.id);
          }

          if (targetWorkout) {
            // Target date is occupied — auto-swap instead of failing
            if (!targetWorkout.original_scheduled_date) {
              await supabase.from('planned_workouts')
                .update({ original_scheduled_date: targetDate })
                .eq('id', targetWorkout.id);
            }
            await swapWorkoutDates(activePlan.id, sourceWorkout.id, sourceDate, targetWorkout.id, targetDate);
            results.push({
              action: 'move', from: sourceDate, to: targetDate,
              success: true, auto_swapped: true,
              detail: `Swapped: "${sourceWorkout.name}" moved to ${targetDate}, "${targetWorkout.name}" moved to ${sourceDate}`
            });
          } else {
            // Target date is free — simple move
            const { error } = await supabase
              .from('planned_workouts')
              .update({
                scheduled_date: targetDate,
                day_of_week: new Date(targetDate + 'T12:00:00').getDay()
              })
              .eq('id', sourceWorkout.id);
            results.push({
              action: 'move', from: sourceDate, to: targetDate,
              success: !error, error: error?.message
            });
          }
          break;
        }
        case 'swap': {
          const targetDate = resolveScheduledDate(adj.target_date, timezone);
          // Fetch workouts on both dates
          const { data: workouts } = await supabase
            .from('planned_workouts')
            .select('id, scheduled_date, day_of_week, name, original_scheduled_date')
            .eq('plan_id', activePlan.id)
            .in('scheduled_date', [sourceDate, targetDate])
            .eq('completed', false);

          const sourceWorkout = workouts?.find(w => w.scheduled_date === sourceDate);
          const targetWorkout = workouts?.find(w => w.scheduled_date === targetDate);

          if (!sourceWorkout && !targetWorkout) {
            results.push({ action: 'swap', success: false, error: 'No workouts found on either date' });
            break;
          }

          // Track original dates if not already tracked
          if (sourceWorkout && !sourceWorkout.original_scheduled_date) {
            await supabase.from('planned_workouts')
              .update({ original_scheduled_date: sourceDate })
              .eq('id', sourceWorkout.id);
          }
          if (targetWorkout && !targetWorkout.original_scheduled_date) {
            await supabase.from('planned_workouts')
              .update({ original_scheduled_date: targetDate })
              .eq('id', targetWorkout.id);
          }

          if (sourceWorkout && targetWorkout) {
            // Both dates have workouts — use atomic swap
            await swapWorkoutDates(activePlan.id, sourceWorkout.id, sourceDate, targetWorkout.id, targetDate);
          } else if (sourceWorkout) {
            // Only source has a workout — simple move
            await supabase.from('planned_workouts')
              .update({ scheduled_date: targetDate, day_of_week: new Date(targetDate + 'T12:00:00').getDay() })
              .eq('id', sourceWorkout.id);
          } else {
            // Only target has a workout — simple move
            await supabase.from('planned_workouts')
              .update({ scheduled_date: sourceDate, day_of_week: new Date(sourceDate + 'T12:00:00').getDay() })
              .eq('id', targetWorkout.id);
          }
          results.push({ action: 'swap', dates: [sourceDate, targetDate], success: true });
          break;
        }
        case 'replace': {
          // Fetch current workout to save original workout_id
          const { data: current } = await supabase
            .from('planned_workouts')
            .select('id, workout_id, original_workout_id')
            .eq('plan_id', activePlan.id)
            .eq('scheduled_date', sourceDate)
            .eq('completed', false)
            .maybeSingle();

          const updateData = { workout_id: adj.new_workout_id };
          if (adj.new_workout_id) {
            updateData.name = adj.new_workout_id;
          }
          // Track original workout_id if not already tracked
          if (current && !current.original_workout_id) {
            updateData.original_workout_id = current.workout_id;
          }
          const { data: replaced, error } = await supabase
            .from('planned_workouts')
            .update(updateData)
            .eq('plan_id', activePlan.id)
            .eq('scheduled_date', sourceDate)
            .eq('completed', false)
            .select('id');
          results.push({
            action: 'replace', date: sourceDate, new_workout: adj.new_workout_id,
            success: !error, workouts_affected: replaced?.length || 0,
            error: error?.message
          });
          break;
        }
        case 'remove':
        case 'add_rest': {
          // Fetch current workout to save original values
          const { data: currentWorkout } = await supabase
            .from('planned_workouts')
            .select('id, workout_id, original_workout_id')
            .eq('plan_id', activePlan.id)
            .eq('scheduled_date', sourceDate)
            .eq('completed', false)
            .maybeSingle();

          const restUpdate = {
            workout_type: 'rest',
            workout_id: null,
            name: 'Rest Day',
            target_tss: 0,
            target_duration: 0,
            duration_minutes: 0
          };
          // Track original workout_id if not already tracked
          if (currentWorkout && !currentWorkout.original_workout_id && currentWorkout.workout_id) {
            restUpdate.original_workout_id = currentWorkout.workout_id;
          }
          const { data: updated, error } = await supabase
            .from('planned_workouts')
            .update(restUpdate)
            .eq('plan_id', activePlan.id)
            .eq('scheduled_date', sourceDate)
            .eq('completed', false)
            .select('id');
          results.push({
            action: adj.action, date: sourceDate,
            success: !error, workouts_affected: updated?.length || 0,
            error: error?.message
          });
          break;
        }
        default:
          results.push({ action: adj.action, success: false, error: `Unknown action: ${adj.action}` });
      }
    } catch (err) {
      results.push({ action: adj.action, source_date: adj.source_date, success: false, error: err.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  return {
    success: successCount > 0,
    summary,
    total_adjustments: adjustments.length,
    successful: successCount,
    adjustments: results
  };
}

// Base coaching knowledge (date context added dynamically)
const COACHING_KNOWLEDGE = `You are an expert endurance sports coach with deep knowledge of:
- Training periodization and load management for BOTH cycling and running
- Power-based training (cycling) and pace-based training (running)
- Tribos metrics — Ride Stress Score (RSS), Training Fitness Index (TFI), Acute Fatigue Index (AFI), Form Score (FS) — and their rTSS equivalents for running
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
- rTSS estimated from pace, HR, and duration; zones based on threshold pace
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
7. **CRITICAL**: Whenever you suggest specific workouts, YOU MUST use the recommend_workout tool for EACH workout

When discussing metrics (spec §2, §6 — plain English first, Tribos abbreviation second):
- TFI (Training Fitness Index): adaptive EWMA of daily Ride Stress Score; athlete's current fitness level
- AFI (Acute Fatigue Index): short EWA of daily RSS; how tired the athlete is right now
- FS (Form Score): yesterday's TFI minus yesterday's AFI — readiness going into today
- Positive FS = rested/fresh, Negative FS = carrying fatigue
- FS ranges: < -30 (overreached), -30 to -5 (productive training load), -5 to +10 (grey zone), +10 to +20 (fresh),  > +20 (losing fitness — transition)

**CALENDAR & RACE GOALS ACCESS:**
You have DIRECT ACCESS to the athlete's calendar and race goals. This data is provided in the "ATHLETE'S CURRENT TRAINING CONTEXT" section below. When the athlete asks about their races, events, or calendar:
- You CAN see their race names, dates, distances, elevation, race types, and goals
- You CAN calculate exactly how many days/weeks until each race
- You CAN provide race-specific training plans based on their actual event details
- DO NOT tell the athlete you "can't see" their calendar - you have full access to their race goals
- Reference their specific races by name when giving advice (e.g., "For Old Man Winter on March 15th...")
- Use the race date to calculate preparation timelines and periodization phases

${WORKOUT_LIBRARY_FOR_AI}

**HOW TO RECOMMEND WORKOUTS:**

When you recommend specific workouts, you MUST use the recommend_workout tool. Never just describe workouts in text.

**Trigger phrases that require tool use:**
- "what should I ride" / "what should I run"
- "plan my week"
- "add workouts"
- "schedule training"
- "recommend a workout" / "recommend a run"
- Any question asking for specific workout suggestions

**Correct approach (ALWAYS DO THIS):**
1. Give brief explanation (1-2 sentences about reasoning)
2. Use recommend_workout tool for EACH specific workout
3. The athlete sees clickable cards to add to calendar

**Key points:**
- ALWAYS call the tool when recommending specific workouts
- Use actual workout_ids from the library (recovery_spin, three_by_ten_sst, etc.)
- One tool call = one workout
- Multiple workouts = multiple tool calls
- scheduled_date format: "today", "tomorrow", "this_monday", "next_tuesday", or "YYYY-MM-DD"

Remember: The tool is how athletes add workouts to their calendar. Without it, they can't act on your advice!

**CREATING FULL TRAINING PLANS:**

When an athlete asks for a complete training plan (not just a single workout), you MUST use the create_training_plan tool. DO NOT just describe a plan in text - you MUST call the tool.

**CRITICAL: If the athlete asks for a training plan, you MUST call create_training_plan. Never describe a plan without calling the tool.**

**Trigger phrases that REQUIRE calling create_training_plan:**
- "create a training plan"
- "build me a plan"
- "make a plan for my race"
- "set up my training for [event]"
- "I need a [X] week plan"
- "plan my training"
- "prepare me for [race/event]"
- "load the plan to my calendar"
- "add the workouts to my calendar"
- Any request for multiple weeks of structured training

**How to use create_training_plan:**
1. Analyze the athlete's goals, target events, and available time
2. Choose appropriate methodology based on their needs:
   - polarized: Best for time-crunched athletes, research-backed 80/20 approach
   - sweet_spot: Efficient fitness gains, good for intermediate riders
   - threshold: FTP-focused for time trial or sustained power goals
   - pyramidal: Balanced approach with emphasis on tempo/endurance
   - endurance: Pure aerobic base building, good for beginners or off-season
3. Set duration based on time until target event (ideally 8-16 weeks)
4. Call the create_training_plan tool with appropriate parameters
5. The athlete will see a plan preview with phases, total workouts, and weekly Ride Stress Score (RSS)
6. They can activate it with one click to load ALL workouts to their calendar

**Important:**
- Use create_training_plan for multi-week structured plans (4+ weeks)
- Use recommend_workout for single workouts or short-term suggestions
- If athlete has a race in their calendar, use target_event_date to periodize the plan
- Always set start_date to 'next_monday' unless they specify otherwise
- NEVER just describe a training plan - ALWAYS call the tool so the athlete can activate it

**ADJUSTING THE EXISTING SCHEDULE:**

When an athlete wants to modify their CURRENT active training plan (not create a new one), you MUST use the adjust_schedule tool. This tool makes real changes to their calendar immediately.

**Trigger phrases that REQUIRE calling adjust_schedule:**
- "move my workout", "swap workouts", "change my schedule"
- "I can't train on [day]", "move [day]'s workout to [day]"
- "replace [workout] with [workout]"
- "I need a rest day on [day]"
- "adjust my plan", "modify my schedule"
- "shift this week's workouts"
- Any request to change, move, swap, or remove workouts from the current plan

**Available adjustment actions:**
- move: Change a workout's date (e.g., move Thursday's workout to Friday)
- swap: Exchange two workouts' dates (e.g., swap Monday and Wednesday)
- replace: Change the workout itself (e.g., replace intervals with recovery spin)
- remove: Delete a workout from the plan
- add_rest: Convert a workout day to a rest day

**How to use adjust_schedule:**
1. Identify which workouts need to change based on the athlete's request
2. Call adjust_schedule with an array of adjustments
3. The changes are applied IMMEDIATELY to their active plan
4. Confirm what was changed in your response text

**Important:**
- Use adjust_schedule for modifying existing plans — NOT create_training_plan
- Multiple adjustments can be made in a single tool call
- Only incomplete (not yet done) workouts can be modified
- NEVER just describe schedule changes in text — ALWAYS call the tool so changes actually happen

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
- **Variability Index**: NP/avgPower ratio (>1.05 = variable, <1.02 = steady)
- **Efficiency Factor**: NP/avgHR ratio (higher = more aerobically fit)
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
      maxTokens = 1024,
      quickMode = false,
      userAvailability = null,
      checkInId = null,
      planId = null,
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

    // Rate limiting (10 requests per 5 minutes per IP)
    const rateLimitResult = await rateLimitMiddleware(
      req,
      res,
      'AI_COACH',
      10,
      5
    );

    if (rateLimitResult !== null) {
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
      // Fetch user timezone
      supabase
        .from('user_profiles')
        .select('timezone')
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
      supabase
        .from('health_metrics')
        .select('resting_hr, hrv_ms, sleep_hours, sleep_quality, energy_level, recorded_date')
        .eq('user_id', verifiedUserId)
        .order('recorded_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ];

    const [coachSettingsResult, coachMemoryResult, recentCheckInsResult, calendarContextResult, checkInResult, deviationsResult, userProfileResult, allActivePlansResult, healthMetricsResult] = await Promise.all(parallelFetches);

    const coachSettings = coachSettingsResult.data;
    const activeCheckIn = checkInResult?.data || null;
    const coachMemories = coachMemoryResult.data || [];
    const recentCheckIns = recentCheckInsResult.data || [];
    const calendarContext = calendarContextResult;
    const unresolvedDeviations = deviationsResult?.data || [];
    const userDbTimezone = userProfileResult?.data?.timezone || null;
    const allActivePlans = allActivePlansResult?.data || [];
    const healthMetrics = healthMetricsResult?.data || null;

    // Fetch proprietary metrics (EFI/TWL/TCAS) — non-blocking
    const proprietaryMetrics = await fetchProprietaryMetrics(supabase, verifiedUserId);

    // Resolve the user's timezone: prefer browser-supplied, then DB, then UTC
    const resolvedTimezone = userLocalDate?.timezone || userDbTimezone || 'UTC';

    // Build system message with date context FIRST
    // Use user's local date if provided, otherwise compute from their timezone
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let dateStr;
    let dayOfWeek;
    let todayDate;
    let todayMonth;
    let todayYear;

    if (userLocalDate && userLocalDate.dateString) {
      // Use the user's local date from the browser
      dateStr = userLocalDate.dateString;
      dayOfWeek = userLocalDate.dayOfWeek;
      todayDate = userLocalDate.date;
      todayMonth = userLocalDate.month;
      todayYear = userLocalDate.year;
    } else {
      // Fallback: compute date in the user's timezone (from DB or UTC)
      const today = new Date();
      try {
        dateStr = today.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          timeZone: resolvedTimezone,
        });
        dayOfWeek = parseInt(today.toLocaleDateString('en-US', { weekday: 'narrow', timeZone: resolvedTimezone }), 10);
        // Use a more reliable approach for dayOfWeek
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long', timeZone: resolvedTimezone });
        dayOfWeek = dayNames.indexOf(dayName);
        todayDate = parseInt(today.toLocaleDateString('en-US', { day: 'numeric', timeZone: resolvedTimezone }), 10);
        todayMonth = today.toLocaleDateString('en-US', { month: 'long', timeZone: resolvedTimezone });
        todayYear = parseInt(today.toLocaleDateString('en-US', { year: 'numeric', timeZone: resolvedTimezone }), 10);
      } catch (tzError) {
        // Invalid timezone, fall back to UTC
        dateStr = `${dayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
        dayOfWeek = today.getDay();
        todayDate = today.getDate();
        todayMonth = today.getMonth();
        todayYear = today.getFullYear();
      }
    }

    // Calculate this week's date range using user's local date
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayDate = todayDate + mondayOffset;
    const sundayDate = mondayDate + 6;
    // Simplified week range display
    const monthStr = typeof todayMonth === 'string' ? todayMonth : monthNames[todayMonth];
    const weekRangeStr = `Week of ${monthStr} ${mondayDate > 0 ? mondayDate : todayDate}, ${todayYear}`;

    // Determine persona
    const personaId = coachSettings?.coaching_persona && coachSettings.coaching_persona !== 'pending'
      ? coachSettings.coaching_persona
      : null;
    const persona = personaId ? PERSONA_DATA[personaId] : null;
    const riderName = coachSettings?.user_preferred_name || null;

    // Build the full system prompt with date as the foundation
    let systemPrompt = `=== CURRENT DATE & TIME CONTEXT ===
TODAY IS: ${dateStr}
${weekRangeStr}
Athlete's timezone: ${resolvedTimezone}

CRITICAL: The conversation history below may contain outdated references to past dates (weeks or months ago).
You MUST use the current date above as your reference point. When the athlete asks about "this week", "tomorrow", "Monday", etc., calculate from TODAY'S DATE shown above.

=== YOUR ROLE ===
${COACHING_KNOWLEDGE}`;

    // Inject persona voice (same voice used in coaching check-ins)
    if (persona) {
      systemPrompt += `\n\n=== COACHING PERSONA: ${persona.name.toUpperCase()} ===
You are ${persona.name}. Adopt this voice consistently in all responses.
Philosophy: ${persona.philosophy}
Voice: ${persona.voice}
${riderName ? `The athlete's preferred name is: ${riderName}` : ''}

IMPORTANT: You also generate coaching check-ins that appear on the athlete's training dashboard.
Those check-ins use this same voice and persona. When the athlete references something from a check-in,
you should respond as the same coach who wrote it — maintain continuity.`;
    }

    // Inject experience level context (modifies communication style)
    const experienceLevel = coachSettings?.coaching_experience_level || 'experienced';
    if (experienceLevel === 'just_starting' || experienceLevel === 'developing') {
      systemPrompt += `\n\n=== COACHING COMMUNICATION LEVEL: ${experienceLevel === 'just_starting' ? 'BEGINNER' : 'DEVELOPING'} ===
This athlete is ${experienceLevel === 'just_starting' ? 'new to structured training (< 1 year)' : 'developing as a structured cyclist (1-3 years)'}. Adapt your communication:

1. EXPLAIN JARGON ON FIRST USE (spec §6): When you mention RSS, TFI, AFI, FS, EP, RI, FTP, or any training acronym, use plain English first, then the Tribos abbreviation. Example: "Your ride stress (RSS) — how hard today's effort was — was 82." Only expand each term once per conversation. NEVER use the old TrainingPeaks abbreviations (TSS, CTL, ATL, TSB, NP, IF) in user-facing text.

2. CELEBRATE MILESTONES: Call out achievements explicitly — biggest ride ever, first week hitting all planned workouts, first structured interval session completed, consistency streaks. These matter more at this stage.

3. LEAD WITH WHY: Frame the purpose before the prescription. Instead of "Do a 45-minute Zone 2 ride today," say "Your body needs time to absorb this week's harder efforts — a 45-minute easy ride today accelerates that recovery."

4. TRANSLATE METRICS: Never open with raw numbers. Instead of "Your AFI is 52 and FS is -19," say "You've put in a big week — your body's carrying some fatigue right now, which is normal and expected."

5. FRAME PROGRESS FROM START: When showing adherence or fitness metrics, contextualise against where the athlete started, not just the target. Example: "Your fitness score was 28 four weeks ago — 38 now is real progress even if the target is 50."`;
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

CRITICAL: The CTL, ATL, and TSB values in this context are computed IN REAL-TIME from the athlete's full activity history. They are the most accurate and up-to-date fitness metrics available. If the query_fitness_history tool returns different CTL/ATL/TSB values, ALWAYS trust the values in this context block for CURRENT fitness. The fitness history tool uses weekly snapshots that may be stale. Only use the fitness history tool for HISTORICAL comparisons (e.g., "this time last year"), not for current fitness assessment.

WORKOUT STATUS GUIDE: Planned workouts are labeled [DONE], [MISSED], [TODAY], [UPCOMING], or [SKIPPED].
- [UPCOMING] workouts are scheduled for FUTURE days and are NOT overdue — do not count them as missed or as signs of poor compliance.
- [MISSED] workouts are from PAST days that were not completed — these indicate actual missed training.
- [TODAY] workouts are due today and still can be done.
- Use "Weekly Compliance" (based only on past-due workouts) to judge adherence, NOT "Overall Plan Compliance" (which is cumulative across the entire plan duration and naturally starts low).
- Many athletes have specific training day patterns (e.g., heavy Thu-Sun). Mid-week low volume is normal — check the full week schedule before judging.

${trainingContext}`;
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
    if (userAvailability?.weeklyAvailability) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const availLines = userAvailability.weeklyAvailability.map((d) => {
        let line = `  ${days[d.dayOfWeek]}: ${d.status.toUpperCase()}`;
        if (d.maxDurationMinutes) line += ` (max ${d.maxDurationMinutes} min)`;
        return line;
      });

      const blockedDays = userAvailability.weeklyAvailability
        .filter((d) => d.status === 'blocked')
        .map((d) => days[d.dayOfWeek]);

      const preferredDays = userAvailability.weeklyAvailability
        .filter((d) => d.status === 'preferred')
        .map((d) => days[d.dayOfWeek]);

      systemPrompt += `\n\n=== ATHLETE'S TRAINING SCHEDULE / AVAILABILITY ===
The athlete has configured which days they can and cannot train:

${availLines.join('\n')}
${blockedDays.length > 0 ? `\nBLOCKED DAYS (cannot train): ${blockedDays.join(', ')}` : ''}
${preferredDays.length > 0 ? `\nPREFERRED DAYS (prioritize key workouts here): ${preferredDays.join(', ')}` : ''}
${userAvailability.preferences?.maxWorkoutsPerWeek ? `\nMax workouts per week: ${userAvailability.preferences.maxWorkoutsPerWeek}` : ''}
${userAvailability.preferences?.preferWeekendLongRides ? `\nPrefers long rides on weekends: Yes` : ''}

IMPORTANT: When creating training plans or recommending workouts:
- NEVER schedule workouts on blocked days
- Place key workouts (intervals, long rides) on preferred days when possible
- Respect the athlete's weekly workout limits
- The create_training_plan tool will automatically adjust the schedule, but you should acknowledge the athlete's availability in your response`;
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

When discussing deviations, you may suggest specific adjustment options (modify next quality session, swap workout dates, insert a rest day, or drop a session) based on the options available above.`;
    }

    systemPrompt += `\n\n=== INSTRUCTIONS ===
Use the current date context and athlete data above to provide personalized, time-appropriate coaching advice.
When races are listed above, use their exact names, dates, and details in your response - you have full visibility into their calendar.

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
- Still use tools (recommend_workout, create_training_plan) when appropriate
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

    // Build conversation messages - prepend date reminder to user's message
    const userMessageWithDate = `[Today is ${dateStr}]\n\n${message}`;

    const messages = [
      ...recentHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: userMessageWithDate
      }
    ];

    // Call Claude API
    const model = 'claude-sonnet-4-5-20250929';

    let response = await claude.messages.create({
      model: model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
      tools: ALL_COACH_TOOLS
    });

    // Check if we need to handle tool calls
    let toolUses = response.content.filter(block => block.type === 'tool_use');
    const fitnessHistoryUses = toolUses.filter(tool => tool.name === 'query_fitness_history');
    const trainingDataUses = toolUses.filter(tool => tool.name === 'query_training_data');
    const planCreationUses = toolUses.filter(tool => tool.name === 'create_training_plan');
    const fuelPlanUses = toolUses.filter(tool => tool.name === 'generate_fuel_plan');
    const memoryUses = toolUses.filter(tool => tool.name === 'save_coach_memory');
    const scheduleAdjustUses = toolUses.filter(tool => tool.name === 'adjust_schedule');

    // Detailed logging for debugging
    console.log(`🤖 Coach response: ${toolUses.length} tool uses`);
    console.log(`   - Tool names used: ${toolUses.map(t => t.name).join(', ') || 'none'}`);
    console.log(`   - Fitness history queries: ${fitnessHistoryUses.length}`);
    console.log(`   - Training data queries: ${trainingDataUses.length}`);
    console.log(`   - Plan creations: ${planCreationUses.length}`);
    console.log(`   - Memory saves: ${memoryUses.length}`);
    console.log(`   - Schedule adjustments: ${scheduleAdjustUses.length}`);
    if (planCreationUses.length > 0) {
      console.log(`   - Plan creation input:`, JSON.stringify(planCreationUses[0].input, null, 2));
    }

    // Handle server-side tool calls that require a continuation turn
    // (fitness history and training data queries need server-side processing)
    // Memory saves are also processed here so Claude gets confirmation before responding.
    const serverSideTools = [...fitnessHistoryUses, ...trainingDataUses, ...memoryUses, ...scheduleAdjustUses];

    // Preserve client-side tool calls (recommend_workout, create_training_plan, generate_fuel_plan)
    // from the first response — these would be lost when toolUses is overwritten by the continuation.
    const clientSideToolNames = new Set(['recommend_workout', 'create_training_plan', 'generate_fuel_plan']);
    const firstResponseClientTools = toolUses.filter(tool => clientSideToolNames.has(tool.name));

    if (serverSideTools.length > 0 && verifiedUserId) {
      const toolResults = [];

      // Send acknowledgment tool_results for client-side tools from the first response
      // so the Claude API doesn't reject the continuation (all tool_use blocks need results).
      for (const tool of firstResponseClientTools) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: JSON.stringify({ success: true, note: 'Client-side tool — will be processed after response.' })
        });
      }

      for (const tool of serverSideTools) {
        try {
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
          } else if (tool.name === 'adjust_schedule') {
            console.log(`📅 Schedule adjustment requested:`, JSON.stringify(tool.input, null, 2));
            result = await handleScheduleAdjustment(verifiedUserId, tool.input, planId, resolvedTimezone);
            console.log(`📅 Schedule adjustment result:`, JSON.stringify(result));
          }
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
      const continueMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ];

      response = await claude.messages.create({
        model: model,
        max_tokens: Math.min(maxTokens, 4096),
        temperature: 0.7,
        system: systemPrompt,
        messages: continueMessages,
        tools: ALL_COACH_TOOLS
      });

      // Merge client-side tools from the first response with any new tools from continuation.
      // Without this, recommend_workout/create_training_plan calls from the first response are lost.
      const continuationToolUses = response.content.filter(block => block.type === 'tool_use');
      toolUses = [...firstResponseClientTools, ...continuationToolUses];
    }

    // Extract text response
    const textContent = response.content.find(block => block.type === 'text');
    let responseText = textContent?.text || '';

    // If Claude only called create_training_plan without text, provide a default message
    if (!responseText && toolUses.some(t => t.name === 'create_training_plan')) {
      responseText = "I've created a training plan for you. Review the details below and click 'Activate Plan' to add all workouts to your calendar.";
    }

    // Extract workout recommendations from tool uses
    const workoutRecommendations = toolUses
      .filter(tool => tool.name === 'recommend_workout')
      .map(tool => ({
        id: tool.id,
        ...tool.input
      }));

    // Handle training plan creation tool (generates plan preview)
    let trainingPlanPreview = null;
    const planCreationTool = toolUses.find(tool => tool.name === 'create_training_plan');

    if (planCreationTool) {
      console.log(`🤖 Generating training plan:`, planCreationTool.input);
      try {
        // Pass user availability so plan generator can avoid blocked days
        const planInput = {
          ...planCreationTool.input,
          userAvailability: userAvailability || null,
        };
        trainingPlanPreview = generateTrainingPlan(planInput);
        console.log(`✅ Plan generated: ${trainingPlanPreview.summary.total_workouts} workouts over ${trainingPlanPreview.duration_weeks} weeks`);
        if (trainingPlanPreview.redistributedCount > 0) {
          console.log(`📅 ${trainingPlanPreview.redistributedCount} workouts redistributed to fit schedule`);
        }
      } catch (error) {
        console.error('Plan generation error:', error);
        trainingPlanPreview = {
          error: true,
          message: 'Failed to generate training plan. Please try again.'
        };
      }
    }

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

      // If there are workout recommendations, suggest adding to calendar
      if (workoutRecommendations.length > 0) {
        workoutRecommendations.forEach((rec, idx) => {
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
          primary: workoutRecommendations.length === 0,
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

    return res.status(200).json({
      success: true,
      message: responseText,
      workoutRecommendations: workoutRecommendations.length > 0 ? workoutRecommendations : null,
      trainingPlanPreview: trainingPlanPreview,
      fuelPlan: fuelPlan,
      scheduleAdjusted: scheduleAdjustUses.length > 0,
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
