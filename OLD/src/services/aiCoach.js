/**
 * AI Training Coach Service
 * Provides conversational coaching advice using Claude AI
 */

import { supabase } from '../supabase';
import { calculateCTL, calculateATL, calculateTSB } from '../utils/trainingPlans';
import { analyzeRidingPatterns } from '../utils/rideAnalysis';
import { getUserSpeedProfile } from '../utils/speedAnalysis';

// NOTE: Anthropic client now runs server-side via /api/coach endpoint
// This removes the security risk of exposing API keys in the browser

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return ''; // Use relative URLs in production (same origin)
  }
  return 'http://localhost:3001'; // Development API server
};

/**
 * System prompt that defines the AI coach's personality and knowledge
 */
const COACHING_SYSTEM_PROMPT = `You are an expert cycling coach with deep knowledge of training science, physiology, and periodization. Your role is to provide personalized coaching advice to cyclists based on their training data, goals, and current fitness level.

## Your Expertise
- Training metrics interpretation (CTL, ATL, TSB, TSS, FTP)
- Periodization and training plan design
- Workout prescription (recovery, endurance, tempo, sweet spot, threshold, VO2max)
- Training stress management and fatigue monitoring
- Route planning for specific training objectives
- Cycling physiology and adaptation
- Training methodologies (Polarized, Sweet Spot, Pyramidal, Threshold-focused)

## Your Personality
- Supportive and encouraging, but honest about training reality
- Data-driven but focused on the human element
- Concise and actionable (2-3 paragraphs max per response)
- Use cycling terminology but explain complex concepts when needed
- Balance ambition with recovery and long-term sustainability

## Your Capabilities
You have access to the user's:
- Current training metrics (CTL, ATL, TSB)
- Active training plan and current phase
- Recent ride history (30-90 days)
- Performance profile (FTP, speed by terrain, riding patterns)
- Training goals and fitness level

## Response Guidelines
1. **Be Specific**: Reference actual data points from the user's training
2. **Be Actionable**: Always provide clear next steps or recommendations
3. **Explain Why**: Connect recommendations to training principles
4. **Consider Context**: Factor in fatigue, recent intensity, and upcoming goals
5. **Adapt Communication**: Match the user's level (beginner, intermediate, advanced)

## Quick Actions You Can Suggest
- "Generate route for [workout type]"
- "Show me recovery rides"
- "Adjust my plan"
- "Explain this metric"

When suggesting routes or workouts, format them clearly so the system can extract and execute them.`;

/**
 * Aggregate training context for AI coach
 * Gathers all relevant data about the user's training
 */
export async function getTrainingContext(userId) {
  console.log('📊 Gathering training context for AI coach...');

  try {
    // 1. Get user profile and preferences
    const { data: profile } = await supabase
      .from('user_preferences_complete')
      .select('*')
      .eq('user_id', userId)
      .single();

    // 2. Get active training plan
    const { data: activePlan } = await supabase
      .from('training_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    // 3. Get recent rides (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: recentRides } = await supabase
      .from('routes')
      .select('*')
      .eq('user_id', userId)
      .gte('recorded_at', ninetyDaysAgo.toISOString())
      .order('recorded_at', { ascending: false });

    // Debug: Check ride data structure
    console.log('🔍 Sample rides for AI Coach:', {
      totalRides: recentRides?.length || 0,
      firstRide: recentRides?.[0] ? {
        recorded_at: recentRides[0].recorded_at,
        created_at: recentRides[0].created_at,
        tss: recentRides[0].tss,
        distance: recentRides[0].distance
      } : null,
      ridesWithTSS: recentRides?.filter(r => r.tss && r.tss > 0).length || 0
    });

    // 4. Calculate current training metrics
    const trainingMetrics = calculateTrainingMetricsFromRides(recentRides);

    // 5. Get speed profile (personalization data)
    const speedProfile = await getUserSpeedProfile(userId);

    // 6. Analyze riding patterns
    const ridingPatterns = await analyzeRidingPatterns(recentRides || []);

    // 7. Get upcoming planned workouts
    let upcomingWorkouts = [];
    if (activePlan) {
      const { data: workouts } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('plan_id', activePlan.id)
        .eq('completed', false)
        .gte('week_number', activePlan.current_week)
        .order('week_number', { ascending: true })
        .order('day_of_week', { ascending: true})
        .limit(7);

      upcomingWorkouts = workouts || [];
    }

    // 8. Get health metrics (last 7 days)
    const { data: healthMetrics } = await supabase
      .from('health_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(7);

    // Calculate health metrics averages
    let healthSummary = null;
    if (healthMetrics && healthMetrics.length > 0) {
      const avgHrv = healthMetrics.filter(m => m.hrv).length > 0
        ? Math.round(healthMetrics.filter(m => m.hrv).reduce((sum, m) => sum + m.hrv, 0) / healthMetrics.filter(m => m.hrv).length)
        : null;

      const avgSleep = healthMetrics.filter(m => m.sleep_hours).length > 0
        ? (healthMetrics.filter(m => m.sleep_hours).reduce((sum, m) => sum + m.sleep_hours, 0) / healthMetrics.filter(m => m.sleep_hours).length).toFixed(1)
        : null;

      const avgStress = healthMetrics.filter(m => m.stress_level).length > 0
        ? (healthMetrics.filter(m => m.stress_level).reduce((sum, m) => sum + m.stress_level, 0) / healthMetrics.filter(m => m.stress_level).length).toFixed(1)
        : null;

      const avgEnergy = healthMetrics.filter(m => m.energy_level).length > 0
        ? (healthMetrics.filter(m => m.energy_level).reduce((sum, m) => sum + m.energy_level, 0) / healthMetrics.filter(m => m.energy_level).length).toFixed(1)
        : null;

      healthSummary = {
        recentEntry: healthMetrics[0],
        averages: {
          hrv: avgHrv,
          sleep: avgSleep,
          stress: avgStress,
          energy: avgEnergy
        },
        daysTracked: healthMetrics.length
      };
    }

    // Build context object
    const context = {
      profile: {
        fitnessLevel: activePlan?.fitness_level || profile?.fitness_level || 'intermediate',
        ftp: activePlan?.ftp || 250,
        maxHeartRate: activePlan?.max_heart_rate,
        hoursPerWeek: activePlan?.hours_per_week,
        primaryGoal: activePlan?.goal_type || profile?.primary_goal || 'general_fitness'
      },
      trainingPlan: activePlan ? {
        name: activePlan.name,
        goalEventDate: activePlan.goal_event_date,
        currentWeek: activePlan.current_week,
        totalWeeks: activePlan.duration_weeks,
        currentPhase: activePlan.current_phase,
        status: activePlan.status
      } : null,
      metrics: {
        ctl: trainingMetrics.ctl,
        atl: trainingMetrics.atl,
        tsb: trainingMetrics.tsb,
        weeklyTSS: trainingMetrics.weeklyTSS,
        last7DaysTSS: trainingMetrics.last7DaysTSS,
        formStatus: interpretFormStatus(trainingMetrics.tsb)
      },
      recentActivity: {
        totalRides: recentRides?.length || 0,
        last30Days: recentRides?.filter(r => {
          const rideDate = new Date(r.recorded_at);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return rideDate >= thirtyDaysAgo;
        }).length || 0,
        lastRideDate: recentRides?.[0]?.recorded_at,
        ridingPatterns: ridingPatterns
      },
      speedProfile: {
        roadSpeed: speedProfile.effectiveRoadSpeed || speedProfile.baseRoadSpeed,
        gravelSpeed: speedProfile.effectiveGravelSpeed || speedProfile.baseGravelSpeed,
        climbingSpeed: speedProfile.effectiveClimbingSpeed || speedProfile.baseClimbingSpeed,
        hasSufficientData: speedProfile.hasSufficientData,
        ridesAnalyzed: speedProfile.ridesAnalyzedCount || 0
      },
      upcomingWorkouts: upcomingWorkouts.map(w => ({
        dayOfWeek: w.day_of_week,
        type: w.workout_type,
        targetTSS: w.target_tss,
        duration: w.target_duration,
        zone: w.target_zone,
        description: w.description
      })),
      trainingContext: profile ? {
        fatigueLevel: profile.fatigue_level,
        recentIntensity: profile.recent_intensity,
        currentPhase: profile.current_phase,
        injuryAreas: profile.injury_areas,
        recoveryFocus: profile.recovery_focus
      } : null,
      health: healthSummary
    };

    console.log('✅ Training context gathered:', {
      hasActivePlan: !!activePlan,
      recentRides: recentRides?.length || 0,
      ctl: trainingMetrics.ctl,
      tsb: trainingMetrics.tsb
    });

    return context;

  } catch (error) {
    console.error('Error gathering training context:', error);
    throw error;
  }
}

/**
 * Helper function to estimate TSS from ride data
 * MUST match the calculation in TrainingDashboard
 */
function estimateTSSFromRide(ride) {
  // If we have actual training_stress_score, use it
  if (ride.training_stress_score && ride.training_stress_score > 0) {
    return ride.training_stress_score;
  }

  // Otherwise estimate from ride metrics
  const distanceKm = ride.distance_km || ride.distance || 0;
  const elevationM = ride.elevation_gain_m || ride.elevation_gain || 0;
  const durationSeconds = ride.duration_seconds || ride.duration || 3600;

  // Simple estimation: 50 TSS/hour base + elevation factor
  const baseTSS = (durationSeconds / 3600) * 50;
  const elevationFactor = (elevationM / 300) * 10;
  return Math.round(baseTSS + elevationFactor);
}

/**
 * Calculate training metrics from ride history
 * MUST match the calculation in TrainingDashboard for consistency
 */
export function calculateTrainingMetricsFromRides(rides) {
  if (!rides || rides.length === 0) {
    return {
      ctl: 0,
      atl: 0,
      tsb: 0,
      weeklyTSS: 0,
      last7DaysTSS: 0
    };
  }

  // Group rides by date and sum TSS
  const dailyTSS = {};
  const now = new Date();

  rides.forEach(ride => {
    const date = ride.recorded_at?.split('T')[0];
    if (date) {
      const tss = estimateTSSFromRide(ride);
      dailyTSS[date] = (dailyTSS[date] || 0) + tss;
    }
  });

  // Create array of TSS values for last 90 days (fill missing days with 0)
  const tssValues = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    tssValues.push(dailyTSS[dateStr] || 0);
  }

  // Calculate CTL (needs full 42+ day history for accurate exponential weighting)
  const ctl = calculateCTL(tssValues);

  // Calculate ATL (7-day exponentially weighted average - use full array, function handles weighting)
  const atl = calculateATL(tssValues);

  // Calculate TSB (Form = Fitness - Fatigue)
  const tsb = calculateTSB(ctl, atl);

  // Calculate weekly TSS (sum of last 7 days)
  const last7DaysTSS = tssValues.slice(-7).reduce((sum, tss) => sum + tss, 0);

  // Debug logging
  console.log('📊 AI Coach Metrics Calculation:', {
    totalRides: rides.length,
    daysWithTSS: Object.keys(dailyTSS).length,
    tssValuesLength: tssValues.length,
    last7Days: tssValues.slice(-7),
    ctl,
    atl,
    tsb,
    weeklyTSS: last7DaysTSS
  });

  return {
    ctl,
    atl,
    tsb,
    weeklyTSS: last7DaysTSS,
    last7DaysTSS
  };
}

/**
 * Interpret TSB (Training Stress Balance) into human-readable form status
 */
function interpretFormStatus(tsb) {
  if (tsb > 25) return { status: 'fresh', color: 'green', message: 'Well rested and ready for hard training' };
  if (tsb > 5) return { status: 'rested', color: 'blue', message: 'Good form for moderate to hard efforts' };
  if (tsb > -10) return { status: 'neutral', color: 'yellow', message: 'Balanced training stress' };
  if (tsb > -30) return { status: 'fatigued', color: 'orange', message: 'Accumulated fatigue - consider recovery' };
  return { status: 'very_fatigued', color: 'red', message: 'High fatigue - recovery needed' };
}

/**
 * Format training context into natural language for Claude
 */
function formatContextForPrompt(context) {
  let prompt = '## Current Training Context\n\n';

  // Profile
  prompt += `**Athlete Profile:**\n`;
  prompt += `- Fitness Level: ${context.profile.fitnessLevel}\n`;
  prompt += `- FTP: ${context.profile.ftp}W\n`;
  if (context.profile.maxHeartRate) {
    prompt += `- Max HR: ${context.profile.maxHeartRate} bpm\n`;
  }
  prompt += `- Training Volume: ${context.profile.hoursPerWeek} hours/week\n`;
  prompt += `- Primary Goal: ${context.profile.primaryGoal}\n\n`;

  // Active training plan
  if (context.trainingPlan) {
    prompt += `**Active Training Plan:**\n`;
    prompt += `- Plan: ${context.trainingPlan.name}\n`;
    prompt += `- Week ${context.trainingPlan.currentWeek} of ${context.trainingPlan.totalWeeks}\n`;
    prompt += `- Phase: ${context.trainingPlan.currentPhase}\n`;
    if (context.trainingPlan.goalEventDate) {
      const daysUntilEvent = Math.ceil(
        (new Date(context.trainingPlan.goalEventDate) - new Date()) / (1000 * 60 * 60 * 24)
      );
      prompt += `- Event in ${daysUntilEvent} days (${context.trainingPlan.goalEventDate})\n`;
    }
    prompt += '\n';
  }

  // Training metrics
  prompt += `**Current Metrics:**\n`;
  prompt += `- CTL (Fitness): ${Math.round(context.metrics.ctl)}\n`;
  prompt += `- ATL (Fatigue): ${Math.round(context.metrics.atl)}\n`;
  prompt += `- TSB (Form): ${Math.round(context.metrics.tsb)} - ${context.metrics.formStatus.message}\n`;
  prompt += `- Weekly TSS: ${Math.round(context.metrics.weeklyTSS)}\n`;
  prompt += `- Last 7 Days TSS: ${Math.round(context.metrics.last7DaysTSS)}\n\n`;

  // Recent activity
  prompt += `**Recent Activity:**\n`;
  prompt += `- Total Rides (90d): ${context.recentActivity.totalRides}\n`;
  prompt += `- Last 30 Days: ${context.recentActivity.last30Days} rides\n`;
  if (context.recentActivity.lastRideDate) {
    const lastRide = new Date(context.recentActivity.lastRideDate);
    const daysAgo = Math.ceil((new Date() - lastRide) / (1000 * 60 * 60 * 24));
    prompt += `- Last Ride: ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago\n`;
  }
  if (context.recentActivity.ridingPatterns?.ridingStyle) {
    prompt += `- Riding Style: ${context.recentActivity.ridingPatterns.ridingStyle.style}\n`;
  }
  prompt += '\n';

  // Speed profile
  if (context.speedProfile.hasSufficientData) {
    prompt += `**Performance Profile:**\n`;
    prompt += `- Road Speed: ${context.speedProfile.roadSpeed} km/h\n`;
    prompt += `- Gravel Speed: ${context.speedProfile.gravelSpeed} km/h\n`;
    prompt += `- Climbing Speed: ${context.speedProfile.climbingSpeed} km/h\n`;
    prompt += `- Based on ${context.speedProfile.ridesAnalyzed} rides\n\n`;
  }

  // Upcoming workouts
  if (context.upcomingWorkouts && context.upcomingWorkouts.length > 0) {
    prompt += `**Upcoming Workouts (Next 7 Days):**\n`;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    context.upcomingWorkouts.slice(0, 3).forEach(workout => {
      prompt += `- ${dayNames[workout.dayOfWeek]}: ${workout.type} (${workout.duration}min, ${workout.targetTSS} TSS, Zone ${workout.zone})\n`;
    });
    prompt += '\n';
  }

  // Training context (fatigue, recovery)
  if (context.trainingContext) {
    prompt += `**Training Context:**\n`;
    prompt += `- Fatigue Level: ${context.trainingContext.fatigueLevel}\n`;
    prompt += `- Recent Intensity: ${context.trainingContext.recentIntensity}\n`;
    if (context.trainingContext.injuryAreas && context.trainingContext.injuryAreas.length > 0) {
      prompt += `- Injury Areas: ${context.trainingContext.injuryAreas.join(', ')}\n`;
    }
    if (context.trainingContext.recoveryFocus && context.trainingContext.recoveryFocus.length > 0) {
      prompt += `- Recovery Focus: ${context.trainingContext.recoveryFocus.join(', ')}\n`;
    }
    prompt += '\n';
  }

  // Health & Recovery Metrics
  if (context.health) {
    prompt += `**Health & Recovery Metrics (Last 7 Days):**\n`;
    if (context.health.averages.hrv) {
      prompt += `- HRV: ${context.health.averages.hrv}ms avg\n`;
    }
    if (context.health.averages.sleep) {
      prompt += `- Sleep: ${context.health.averages.sleep}h avg\n`;
    }
    if (context.health.averages.stress) {
      prompt += `- Stress Level: ${context.health.averages.stress}/10 avg\n`;
    }
    if (context.health.averages.energy) {
      prompt += `- Energy Level: ${context.health.averages.energy}/10 avg\n`;
    }
    prompt += `- Days Tracked: ${context.health.daysTracked}\n`;

    // Add interpretation
    if (context.health.averages.hrv) {
      if (context.health.averages.hrv > 60) {
        prompt += `- HRV Status: Good recovery (${context.health.averages.hrv}ms is above average)\n`;
      } else if (context.health.averages.hrv < 40) {
        prompt += `- HRV Status: Low recovery (${context.health.averages.hrv}ms suggests fatigue)\n`;
      }
    }
    if (context.health.averages.sleep && context.health.averages.sleep < 7) {
      prompt += `- Sleep Alert: Below recommended 7-9 hours (${context.health.averages.sleep}h avg)\n`;
    }
    prompt += '\n';
  }

  return prompt;
}

/**
 * Send message to AI coach and get response
 * Now uses server-side API endpoint for security
 */
export async function sendCoachMessage(userId, message, conversationHistory = []) {
  console.log('💬 Sending message to AI coach:', message);

  try {
    // Gather training context
    const context = await getTrainingContext(userId);

    // Format context into prompt
    const contextPrompt = formatContextForPrompt(context);

    // Call server-side API endpoint
    const response = await fetch(`${getApiBaseUrl()}/api/coach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        message: message,
        conversationHistory: conversationHistory,
        trainingContext: contextPrompt,
        isQuickInsight: false,
        maxTokens: 2048 // Increased from 1024 to allow for tool use + explanations
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get coach response');
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'AI coach request failed');
    }

    console.log('✅ AI coach response received');

    return {
      message: data.message,
      context: context, // Return context for debugging/UI
      usage: data.usage || {}
    };

  } catch (error) {
    console.error('Error calling AI coach:', error);
    throw error;
  }
}

/**
 * Get quick coaching insight for a specific topic
 * Used for one-off questions without full conversation
 */
export async function getQuickInsight(userId, topic) {
  const topicPrompts = {
    tsb: 'Explain my current TSB (Training Stress Balance) and what it means for my training today.',
    workout_today: 'What workout should I do today based on my training plan and current form?',
    recovery: 'Do I need more recovery? Analyze my recent training load and fatigue.',
    route: 'Suggest a route for my next workout based on my training plan.',
    progress: 'How is my training progressing? Am I on track for my goals?',
    metrics: 'Explain my training metrics (CTL, ATL, TSB) in simple terms.'
  };

  const prompt = topicPrompts[topic] || topic;
  return sendCoachMessage(userId, prompt);
}

/**
 * Extract actionable items from coach response
 * Identifies if the coach is suggesting a specific action
 */
export function extractActions(coachResponse) {
  const actions = [];

  // Check for route generation suggestion
  if (coachResponse.toLowerCase().includes('generate route') ||
      coachResponse.toLowerCase().includes('create a route')) {
    actions.push({
      type: 'generate_route',
      label: 'Generate Route',
      icon: 'Map'
    });
  }

  // Check for workout suggestion
  if (coachResponse.toLowerCase().includes('do a') &&
      (coachResponse.toLowerCase().includes('ride') ||
       coachResponse.toLowerCase().includes('workout'))) {
    actions.push({
      type: 'view_workouts',
      label: 'View Workouts',
      icon: 'Activity'
    });
  }

  // Check for plan adjustment
  if (coachResponse.toLowerCase().includes('adjust') &&
      coachResponse.toLowerCase().includes('plan')) {
    actions.push({
      type: 'adjust_plan',
      label: 'Adjust Plan',
      icon: 'Settings'
    });
  }

  return actions;
}

/**
 * Detect if AI recommended workouts in text but didn't use the tool
 * This is a fallback to help users when AI fails to use tool properly
 */
export function detectMissedWorkoutRecommendations(coachResponse, workoutRecommendations) {
  // If AI already used the tool, no problem
  if (workoutRecommendations && workoutRecommendations.length > 0) {
    return false;
  }

  const response = coachResponse.toLowerCase();

  // Patterns that suggest AI is recommending specific workouts
  const workoutPhrases = [
    'recovery ride',
    'endurance ride',
    'sweet spot',
    'threshold',
    'vo2max',
    'intervals',
    'tempo',
    'hill repeats',
    'sprint',
    'base miles',
    'foundation miles'
  ];

  // Patterns that suggest scheduling
  const schedulePatterns = [
    /on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /this (week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /tomorrow/i,
    /today/i,
    /(plan|schedule) (for|your)/i
  ];

  // Check if response contains workout phrases AND scheduling patterns
  const hasWorkoutPhrase = workoutPhrases.some(phrase => response.includes(phrase));
  const hasSchedule = schedulePatterns.some(pattern => pattern.test(response));

  return hasWorkoutPhrase && hasSchedule;
}

export default {
  sendCoachMessage,
  getQuickInsight,
  getTrainingContext,
  extractActions,
  detectMissedWorkoutRecommendations
};
