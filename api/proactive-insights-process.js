// Vercel Cron: Proactive Insights Processor
// Runs every minute to generate AI coaching insights for newly synced activities.
// Picks up pending rows from proactive_insights table and calls Claude API.

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { completeActivationStep } from './utils/activation.js';
import { assembleCheckInContext } from './utils/checkInContext.js';
import { PERSONA_DATA } from './utils/personaData.js';

const supabase = getSupabaseAdmin();

const BATCH_SIZE = 5;

export default async function handler(req, res) {
  // Only allow GET (cron) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron authorization (timing-safe)
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch pending insights
    const { data: pendingInsights, error: fetchError } = await supabase
      .from('proactive_insights')
      .select('id, user_id, activity_id, insight_type')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('Failed to fetch pending insights:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch pending insights' });
    }

    if (!pendingInsights || pendingInsights.length === 0) {
      return res.status(200).json({ processed: 0, message: 'No pending insights' });
    }

    console.log(`📋 Processing ${pendingInsights.length} pending insight(s)`);

    const results = [];

    for (const insight of pendingInsights) {
      try {
        // Mark as processing
        await supabase
          .from('proactive_insights')
          .update({ status: 'processing' })
          .eq('id', insight.id);

        // Generate the insight
        const insightText = await generateInsight(insight.user_id, insight.activity_id);

        if (insightText) {
          // Save completed insight
          await supabase
            .from('proactive_insights')
            .update({
              insight_text: insightText,
              status: 'completed'
            })
            .eq('id', insight.id);

          // Mark first_insight activation step
          await completeActivationStep(supabase, insight.user_id, 'first_insight');

          results.push({ id: insight.id, status: 'completed' });
          console.log(`✅ Insight generated for activity ${insight.activity_id}`);
        } else {
          await supabase
            .from('proactive_insights')
            .update({ status: 'failed', error_message: 'Empty insight generated' })
            .eq('id', insight.id);

          results.push({ id: insight.id, status: 'failed', error: 'Empty insight' });
        }
      } catch (error) {
        console.error(`❌ Failed to generate insight ${insight.id}:`, error.message);

        await supabase
          .from('proactive_insights')
          .update({
            status: 'failed',
            error_message: error.message?.substring(0, 500)
          })
          .eq('id', insight.id);

        results.push({ id: insight.id, status: 'failed', error: error.message });
      }
    }

    return res.status(200).json({
      processed: results.length,
      results
    });
  } catch (error) {
    console.error('Proactive insights processor error:', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
}

/**
 * Generate a coaching insight for a specific activity.
 *
 * Uses assembleCheckInContext for full athlete context (CTL/ATL/TSB, health,
 * proprietary metrics, coach persona, etc.) plus activity-specific formatting.
 */
async function generateInsight(userId, activityId) {
  // Fetch the trigger activity for detailed stats
  const { data: activity } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single();

  if (!activity) {
    throw new Error(`Activity ${activityId} not found`);
  }

  // Fetch recent activities for trend context (independent of checkInContext)
  const { data: recentActivities } = await supabase
    .from('activities')
    .select('name, start_date, distance_meters, distance, duration_seconds, moving_time, elevation_gain_meters, total_elevation_gain, average_power_watts, average_watts, average_heart_rate, average_hr, type')
    .eq('user_id', userId)
    .is('duplicate_of', null)
    .order('start_date', { ascending: false })
    .limit(10);

  // Assemble full athlete context (CTL/ATL/TSB, health, metrics, persona, etc.)
  const context = await assembleCheckInContext(supabase, userId, activityId);

  // Build activity-specific formatting
  const activityStats = formatActivityStats(activity);
  const trendContext = formatTrendContext(recentActivities || [], activity);

  // Resolve persona for system prompt voice
  const personaId = context.persona_id || 'pragmatist';
  const persona = PERSONA_DATA[personaId] || PERSONA_DATA.pragmatist;

  // Build athlete context section from assembled data
  let athleteContext = '';
  if (context.athlete?.ftp) athleteContext += `FTP: ${context.athlete.ftp}W`;
  if (context.athlete?.wkg) athleteContext += ` | W/kg: ${context.athlete.wkg}`;
  if (context.athlete?.experience_level) athleteContext += ` | Level: ${context.athlete.experience_level}`;

  let fitnessContext = '';
  if (context.ctl != null) fitnessContext += `CTL: ${context.ctl}`;
  if (context.atl != null) fitnessContext += ` | ATL: ${context.atl}`;
  if (context.form != null) fitnessContext += ` | Form (TSB): ${context.form}`;
  if (context.load_trend) fitnessContext += ` | Trend: ${context.load_trend}`;
  if (context.overtraining_risk && context.overtraining_risk !== 'low') {
    fitnessContext += ` | Overtraining risk: ${context.overtraining_risk}`;
  }

  let planContext = '';
  if (context.block_name && context.current_week) {
    planContext += `Training block: ${context.block_name} (week ${context.current_week}/${context.total_weeks})`;
    planContext += `\nBlock purpose: ${context.block_purpose}`;
  }
  if (context.goal_event) planContext += `\nGoal event: ${context.goal_event}`;

  const prompt = `${athleteContext ? `Athlete: ${athleteContext}` : ''}
${fitnessContext ? `Fitness: ${fitnessContext}` : ''}
${planContext}
${context.health !== 'No health data available.' ? `Health: ${context.health}` : ''}
${context.proprietary_metrics ? `Performance metrics:\n${context.proprietary_metrics}` : ''}

Latest activity:
${activityStats}

Recent training context (last ${(recentActivities || []).length} activities):
${trendContext}

${context.week_schedule_text !== 'No planned workouts this week.' ? `This week's schedule:\n${context.week_schedule_text}` : ''}

Give one specific, actionable coaching insight about this activity in 2-3 sentences. Reference actual numbers from the data. If the activity was a planned workout, comment on how actual performance compared to the plan. Don't be generic — be specific about what you notice and what the athlete should consider next.`;

  // Call Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const claude = new Anthropic({ apiKey });

  // Build persona-aware system prompt
  const systemPrompt = `You are ${persona.name}, a cycling coach AI for Tribos.
Your philosophy: ${persona.philosophy}
Your voice: ${persona.voice}
Analyze the activity data and give one specific, actionable insight in 2-3 sentences. Be direct and reference actual numbers. No greetings or sign-offs.`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }]
  });

  const insightText = response.content?.[0]?.text?.trim();
  return insightText || null;
}

function formatActivityStats(activity) {
  const distance = (activity.distance_meters || activity.distance || 0) / 1000;
  const duration = activity.duration_seconds || activity.moving_time || 0;
  const elevation = activity.elevation_gain_meters || activity.total_elevation_gain || 0;
  const power = activity.average_power_watts || activity.average_watts;
  const hr = activity.average_heart_rate || activity.average_hr;
  const cadence = activity.average_cadence;
  const np = activity.normalized_power_watts || activity.normalized_power;
  const tss = activity.tss;

  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  let stats = `Name: ${activity.name || 'Unnamed'}\n`;
  stats += `Type: ${activity.type || 'Ride'}\n`;
  stats += `Distance: ${distance.toFixed(1)} km\n`;
  stats += `Duration: ${durationStr}\n`;
  stats += `Elevation: ${Math.round(elevation)}m\n`;
  if (tss) stats += `TSS: ${tss}\n`;
  if (power) stats += `Average Power: ${Math.round(power)}W\n`;
  if (np) stats += `Normalized Power: ${Math.round(np)}W\n`;
  if (hr) stats += `Average HR: ${Math.round(hr)} bpm\n`;
  if (cadence) stats += `Average Cadence: ${Math.round(cadence)} rpm\n`;
  if (activity.execution_score) stats += `Execution Score: ${activity.execution_score}/100 (${activity.execution_rating || ''})\n`;

  return stats;
}

function formatTrendContext(recentActivities, currentActivity) {
  if (recentActivities.length <= 1) {
    return 'This is one of the athlete\'s first activities on the platform.';
  }

  // Exclude the current activity from trend calculation
  const others = recentActivities.filter(a => a.start_date !== currentActivity.start_date);
  if (others.length === 0) return 'Limited activity history available.';

  const totalDistance = others.reduce((sum, a) => sum + ((a.distance_meters || a.distance || 0) / 1000), 0);
  const totalDuration = others.reduce((sum, a) => sum + (a.duration_seconds || a.moving_time || 0), 0);
  const avgDistance = totalDistance / others.length;
  const avgDuration = totalDuration / others.length;

  const avgHours = Math.floor(avgDuration / 3600);
  const avgMinutes = Math.floor((avgDuration % 3600) / 60);
  const durationStr = avgHours > 0 ? `${avgHours}h ${avgMinutes}m` : `${avgMinutes}m`;

  let context = `Average ride: ${avgDistance.toFixed(1)} km, ${durationStr}\n`;
  context += `Total activities in window: ${others.length}\n`;

  // Check if recent activity is longer/shorter than average
  const currentDist = (currentActivity.distance_meters || currentActivity.distance || 0) / 1000;
  if (currentDist > avgDistance * 1.3) {
    context += 'This activity was notably longer than their average.';
  } else if (currentDist < avgDistance * 0.7) {
    context += 'This was a shorter activity than their usual.';
  }

  return context;
}
