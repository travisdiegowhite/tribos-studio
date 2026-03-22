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

// Initialize Supabase for auth validation
const supabase = getSupabaseAdmin();

// Persona voice data — shared with coach-check-in-request.js
const PERSONA_DATA = {
  hammer: {
    name: 'The Hammer',
    philosophy: 'Discomfort is the price of adaptation. You committed to this — now honor that commitment.',
    voice: 'Direct, brief, no filler. Short declarative sentences. No hedging. Uses imperatives.',
  },
  scientist: {
    name: 'The Scientist',
    philosophy: 'Every training session is a data point. Understand the stimulus, trust the adaptation, measure the outcome.',
    voice: 'Calm, precise, explanatory. Uses physiological terminology naturally but always explains it.',
  },
  encourager: {
    name: 'The Encourager',
    philosophy: 'Consistency is the only thing that creates lasting fitness. Every ride counts.',
    voice: "Warm, present-tense focused, process-oriented. Notices the effort behind the number.",
  },
  pragmatist: {
    name: 'The Pragmatist',
    philosophy: "A good plan that gets executed beats a perfect plan that doesn't. Work with the life you have.",
    voice: 'Grounded, conversational, no-nonsense but not harsh. Meets the rider where they are.',
  },
  competitor: {
    name: 'The Competitor',
    philosophy: "You train to race. Every session either prepares you to win or it doesn't.",
    voice: 'Focused, forward-looking, frames everything in terms of race outcomes.',
  },
};

// Resolve relative date strings (today, tomorrow, this_monday, next_tuesday, YYYY-MM-DD) to YYYY-MM-DD
function resolveScheduledDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  if (dateStr === 'today') return today.toISOString().split('T')[0];
  if (dateStr === 'tomorrow') {
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
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
      return today.toISOString().split('T')[0];
    }
  }

  return dateStr;
}

// Handle schedule adjustment tool calls — modifies existing active plan workouts
async function handleScheduleAdjustment(userId, input) {
  const { adjustments, summary } = input;
  const results = [];

  // Get the active plan
  const { data: activePlan, error: planError } = await supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError || !activePlan) {
    return { success: false, error: 'No active training plan found. The athlete needs to create or activate a plan first.' };
  }

  for (const adj of adjustments) {
    try {
      const sourceDate = resolveScheduledDate(adj.source_date);

      switch (adj.action) {
        case 'move': {
          const targetDate = resolveScheduledDate(adj.target_date);
          const { data: moved, error } = await supabase
            .from('planned_workouts')
            .update({
              scheduled_date: targetDate,
              day_of_week: new Date(targetDate + 'T12:00:00').getDay()
            })
            .eq('plan_id', activePlan.id)
            .eq('scheduled_date', sourceDate)
            .eq('completed', false)
            .select('id, name');
          results.push({
            action: 'move', from: sourceDate, to: targetDate,
            success: !error, workouts_affected: moved?.length || 0,
            error: error?.message
          });
          break;
        }
        case 'swap': {
          const targetDate = resolveScheduledDate(adj.target_date);
          // Fetch workouts on both dates
          const { data: workouts } = await supabase
            .from('planned_workouts')
            .select('id, scheduled_date, day_of_week')
            .eq('plan_id', activePlan.id)
            .in('scheduled_date', [sourceDate, targetDate])
            .eq('completed', false);

          const sourceWorkouts = workouts?.filter(w => w.scheduled_date === sourceDate) || [];
          const targetWorkouts = workouts?.filter(w => w.scheduled_date === targetDate) || [];

          if (sourceWorkouts.length > 0 || targetWorkouts.length > 0) {
            // Move source workouts to target date
            for (const w of sourceWorkouts) {
              await supabase.from('planned_workouts')
                .update({ scheduled_date: targetDate, day_of_week: new Date(targetDate + 'T12:00:00').getDay() })
                .eq('id', w.id);
            }
            // Move target workouts to source date
            for (const w of targetWorkouts) {
              await supabase.from('planned_workouts')
                .update({ scheduled_date: sourceDate, day_of_week: new Date(sourceDate + 'T12:00:00').getDay() })
                .eq('id', w.id);
            }
            results.push({ action: 'swap', dates: [sourceDate, targetDate], success: true });
          } else {
            results.push({ action: 'swap', success: false, error: 'No workouts found on either date' });
          }
          break;
        }
        case 'replace': {
          const updateData = { workout_id: adj.new_workout_id };
          if (adj.new_workout_id) {
            updateData.name = adj.new_workout_id;
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
          const { data: updated, error } = await supabase
            .from('planned_workouts')
            .update({
              workout_type: 'rest',
              workout_id: null,
              name: 'Rest Day',
              target_tss: 0,
              target_duration: 0,
              duration_minutes: 0
            })
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
- TSS/CTL/ATL/TSB metrics for cycling, rTSS for running
- Cycling and running physiology and performance optimization
- Recovery and fatigue management across multiple sports
- Workout prescription for different training phases
- Route planning, terrain strategy, and race preparation
- Sports nutrition, on-bike fueling, and run fueling strategies

**MULTI-SPORT AWARENESS:**
You support both cycling and running athletes. Determine the athlete's primary sport from their profile context (primary_sport field) and recent activity types. Key differences:

FOR CYCLISTS:
- Use power-based metrics (FTP, watts, W/kg, normalized power)
- TSS from power data; zones based on FTP
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

When discussing metrics:
- CTL (Chronic Training Load): 42-day fitness level (works for both sports via TSS/rTSS)
- ATL (Acute Training Load): 7-day fatigue level
- TSB (Training Stress Balance): Form status (CTL - ATL)
- Positive TSB = rested/fresh, Negative TSB = fatigued
- TSB ranges: <-30 (overreaching), -10 to -30 (productive), -10 to +5 (optimal race form), >+25 (detraining)

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
5. The athlete will see a plan preview with phases, total workouts, and weekly TSS
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

IMPORTANT: Always use the query_fitness_history tool for historical questions. Never guess about past performance - the tool has actual data.

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

**IMPORTANT**: This tool queries individual activities, NOT fitness metrics (CTL/ATL/TSB). Use query_fitness_history for fitness trend questions and query_training_data for activity-level questions.

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
- Information already in their training context (FTP, CTL, race goals in the system)
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
        error: 'AI coaching service not configured'
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
        .select('coaching_persona, user_preferred_name')
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
    ];

    const [coachSettingsResult, coachMemoryResult, recentCheckInsResult, calendarContextResult, checkInResult] = await Promise.all(parallelFetches);

    const coachSettings = coachSettingsResult.data;
    const activeCheckIn = checkInResult?.data || null;
    const coachMemories = coachMemoryResult.data || [];
    const recentCheckIns = recentCheckInsResult.data || [];
    const calendarContext = calendarContextResult;

    // Build system message with date context FIRST
    // Use user's local date if provided, otherwise fall back to server date
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
      // Fallback to server date (UTC)
      const today = new Date();
      dateStr = `${dayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
      dayOfWeek = today.getDay();
      todayDate = today.getDate();
      todayMonth = today.getMonth();
      todayYear = today.getFullYear();
    }

    // Calculate this week's date range using user's local date
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayDate = todayDate + mondayOffset;
    const sundayDate = mondayDate + 6;
    // Simplified week range display
    const weekRangeStr = `Week of ${monthNames[todayMonth]} ${mondayDate > 0 ? mondayDate : todayDate}, ${todayYear}`;

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

${trainingContext}`;
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

    if (serverSideTools.length > 0 && verifiedUserId) {
      const toolResults = [];

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
            result = await handleScheduleAdjustment(verifiedUserId, tool.input);
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

      // Update tool uses from the continued response
      toolUses = response.content.filter(block => block.type === 'tool_use');
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

    let clientError = 'AI coaching request failed';
    let statusCode = 500;

    if (error.status === 429) {
      clientError = 'Too many requests. Please try again in a minute.';
      statusCode = 429;
    } else if (error.status === 401 || error.status === 403) {
      clientError = 'AI service authentication error';
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
