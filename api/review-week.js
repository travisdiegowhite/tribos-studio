/**
 * Review Week API Endpoint
 * Analyzes a week's training plan and provides AI-powered suggestions
 *
 * Enhanced with Adaptive Training Intelligence:
 * - Compares planned vs actual workouts
 * - Analyzes workout adaptations
 * - Considers user patterns for personalized suggestions
 * - Generates actionable plan adjustments
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

/**
 * Format adaptation analysis for the prompt
 */
function formatAdaptations(adaptations) {
  if (!adaptations || adaptations.length === 0) {
    return 'No adaptation data available for this week.';
  }

  return adaptations
    .map((a) => {
      const planned = a.planned || {};
      const actual = a.actual || {};
      const analysis = a.analysis || {};

      let summary = `- ${a.adaptationType}: `;

      if (planned.workoutType) {
        summary += `Planned ${planned.workoutType} (${planned.duration}min, ${planned.tss} TSS)`;
      }

      if (actual.workoutType && a.adaptationType !== 'skipped') {
        summary += ` → Actual ${actual.workoutType} (${actual.duration}min, ${actual.tss} TSS)`;
      }

      if (analysis.stimulusAchievedPct !== null && analysis.stimulusAchievedPct !== undefined) {
        summary += ` [${analysis.stimulusAchievedPct}% stimulus achieved]`;
      }

      if (a.userFeedback?.reason) {
        summary += ` (Reason: ${a.userFeedback.reason})`;
      }

      return summary;
    })
    .join('\n');
}

/**
 * Format user patterns for the prompt
 */
function formatUserPatterns(patterns) {
  if (!patterns || !patterns.hasEnoughData) {
    return 'Insufficient historical data for pattern analysis.';
  }

  const lines = [];

  if (patterns.avgWeeklyCompliance !== null) {
    lines.push(`- Average weekly compliance: ${Math.round(patterns.avgWeeklyCompliance)}%`);
  }

  if (patterns.problematicDays?.length > 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const problemDays = patterns.problematicDays.map((d) => dayNames[d]).join(', ');
    lines.push(`- Frequently missed days: ${problemDays}`);
  }

  if (patterns.commonAdaptations?.length > 0) {
    const topAdaptation = patterns.commonAdaptations[0];
    lines.push(
      `- Most common adaptation: ${topAdaptation.type} (${Math.round(topAdaptation.frequency * 100)}% of workouts)`
    );
  }

  if (patterns.tendsToUndertrain) {
    lines.push(
      `- Pattern: Tends to undertrain (avg ${Math.round(patterns.avgTssAchievementPct || 0)}% of planned TSS)`
    );
  }

  if (patterns.tendsToOverreach) {
    lines.push(
      `- Pattern: Tends to overreach (avg ${Math.round(patterns.avgTssAchievementPct || 0)}% of planned TSS)`
    );
  }

  return lines.length > 0 ? lines.join('\n') : 'No significant patterns detected.';
}

/**
 * Build the prompt for week review
 */
function buildReviewPrompt(data) {
  const {
    weekStart,
    plannedWorkouts,
    completedActivities,
    adaptations,
    goals,
    userContext,
    userPatterns,
  } = data;

  // Determine if this is a retrospective review (has actual data) or prospective (planning only)
  const isRetrospective = completedActivities?.length > 0 || adaptations?.length > 0;

  // Format planned workouts
  const workoutSummary = plannedWorkouts
    .map((w) => {
      const day = new Date(w.scheduledDate).toLocaleDateString('en-US', { weekday: 'long' });
      return `- ${day}: ${w.workout?.name || w.workoutType || 'Unknown'} (TSS: ${w.targetTSS}, Duration: ${w.targetDuration}min)`;
    })
    .join('\n');

  // Format completed activities
  const activitiesSummary =
    completedActivities?.length > 0
      ? completedActivities
          .map((a) => {
            const day = new Date(a.date).toLocaleDateString('en-US', { weekday: 'long' });
            return `- ${day}: ${a.name || 'Activity'} (TSS: ${a.tss || 'N/A'}, Duration: ${a.duration}min, IF: ${a.intensityFactor?.toFixed(2) || 'N/A'})`;
          })
          .join('\n')
      : 'No activities recorded yet.';

  // Calculate week totals
  const totalPlannedTSS = plannedWorkouts.reduce((sum, w) => sum + (w.targetTSS || 0), 0);
  const totalPlannedDuration = plannedWorkouts.reduce((sum, w) => sum + (w.targetDuration || 0), 0);
  const totalActualTSS = completedActivities?.reduce((sum, a) => sum + (a.tss || 0), 0) || 0;
  const totalActualDuration = completedActivities?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
  const workoutCount = plannedWorkouts.filter((w) => w.workoutType !== 'rest').length;
  const completedCount = completedActivities?.length || 0;
  const restDays = 7 - workoutCount;

  // TSS achievement percentage
  const tssAchievementPct = totalPlannedTSS > 0 ? Math.round((totalActualTSS / totalPlannedTSS) * 100) : 0;

  // Format goals
  const goalSummary = goals?.length
    ? goals
        .map(
          (g) =>
            `- ${g.name} (Priority: ${g.priority}${g.targetDate ? `, Target: ${g.targetDate}` : ''})`
        )
        .join('\n')
    : 'No specific goals set';

  // User context
  const contextInfo = userContext
    ? `
Current Fitness Metrics:
- FTP: ${userContext.ftp || 'Unknown'} watts
- CTL (Fitness): ${userContext.ctl || 'Unknown'}
- ATL (Fatigue): ${userContext.atl || 'Unknown'}
- TSB (Form): ${userContext.tsb || 'Unknown'}
- Current Phase: ${userContext.currentPhase || 'Unknown'}
- Weekly TSS Target: ${userContext.weeklyTssTarget || 'Not set'}
`
    : '';

  // Adaptation summary
  const adaptationSummary = formatAdaptations(adaptations);

  // User patterns summary
  const patternsSummary = formatUserPatterns(userPatterns);

  // Build prompt based on mode
  if (isRetrospective) {
    // Retrospective analysis: comparing planned vs actual
    return `You are an expert cycling coach analyzing a week's training comparing what was PLANNED vs what was ACTUALLY completed. Your goal is to provide actionable feedback and suggest plan adjustments for the remaining week or next week.

Week Starting: ${weekStart}

═══════════════════════════════════════════════════
PLANNED WORKOUTS:
═══════════════════════════════════════════════════
${workoutSummary || 'No workouts planned'}

═══════════════════════════════════════════════════
ACTUALLY COMPLETED:
═══════════════════════════════════════════════════
${activitiesSummary}

═══════════════════════════════════════════════════
ADAPTATION ANALYSIS:
═══════════════════════════════════════════════════
${adaptationSummary}

═══════════════════════════════════════════════════
WEEK COMPARISON:
═══════════════════════════════════════════════════
- Planned TSS: ${totalPlannedTSS} | Actual TSS: ${totalActualTSS} (${tssAchievementPct}% achieved)
- Planned Duration: ${Math.round((totalPlannedDuration / 60) * 10) / 10} hours | Actual: ${Math.round((totalActualDuration / 60) * 10) / 10} hours
- Planned Workouts: ${workoutCount} | Completed: ${completedCount}
- Rest Days: ${restDays}

═══════════════════════════════════════════════════
ATHLETE PROFILE:
═══════════════════════════════════════════════════
Goals:
${goalSummary}
${contextInfo}
Historical Patterns:
${patternsSummary}

═══════════════════════════════════════════════════
ANALYSIS INSTRUCTIONS:
═══════════════════════════════════════════════════
1. Assess each adaptation: Was it beneficial, acceptable, or concerning?
2. Calculate cumulative training stimulus deficit or surplus
3. Identify patterns (e.g., consistently truncating workouts, skipping certain days)
4. Consider the user's historical patterns when making suggestions
5. Suggest specific adjustments to recover missed training stimulus

Please provide your analysis in the following JSON format:

{
  "insights": [
    {
      "type": "suggestion" | "warning" | "praise" | "adaptation_needed",
      "title": "Short title for the insight",
      "message": "Detailed explanation and recommendation",
      "priority": "high" | "medium" | "low",
      "suggestedAction": {
        "type": "add_workout" | "swap_workout" | "extend_phase" | "add_recovery" | "adjust_targets" | "reschedule",
        "details": { ... action-specific details ... }
      }
    }
  ],
  "weeklyAnalysis": {
    "plannedTSS": ${totalPlannedTSS},
    "actualTSS": ${totalActualTSS},
    "tssAchievementPct": ${tssAchievementPct},
    "overallAssessment": "on_track" | "minor_deviation" | "significant_deviation" | "concerning",
    "stimulusDeficit": {
      "sweet_spot_minutes": 0,
      "threshold_minutes": 0,
      "endurance_minutes": 0,
      "total_tss": 0
    },
    "recommendations": ["recommendation 1", "recommendation 2"],
    "adjustmentUrgency": "none" | "low" | "medium" | "high"
  }
}

Focus on:
1. Whether adaptations were acceptable given the context (fatigue, time constraints)
2. Cumulative impact on weekly training goals
3. Specific suggestions to recover missed stimulus (if any)
4. Pattern-based predictions for the remaining week
5. Whether the current trajectory supports the athlete's goals

Be specific and actionable. If suggesting a workout, include the type and duration.`;
  } else {
    // Prospective analysis: planning review only
    return `You are an expert cycling coach reviewing a week's training plan. Analyze the plan and provide actionable feedback.

Week Starting: ${weekStart}

═══════════════════════════════════════════════════
PLANNED WORKOUTS:
═══════════════════════════════════════════════════
${workoutSummary || 'No workouts planned'}

═══════════════════════════════════════════════════
WEEK SUMMARY:
═══════════════════════════════════════════════════
- Total Planned TSS: ${totalPlannedTSS}
- Total Duration: ${Math.round((totalPlannedDuration / 60) * 10) / 10} hours
- Workout Days: ${workoutCount}
- Rest Days: ${restDays}

═══════════════════════════════════════════════════
ATHLETE PROFILE:
═══════════════════════════════════════════════════
Goals:
${goalSummary}
${contextInfo}
Historical Patterns:
${patternsSummary}

Please analyze this training week and provide feedback in the following JSON format:

{
  "insights": [
    {
      "type": "suggestion" | "warning" | "praise",
      "title": "Short title for the insight",
      "message": "Your feedback message",
      "priority": "high" | "medium" | "low",
      "targetDate": "YYYY-MM-DD",
      "suggestedWorkoutId": "workout-id"
    }
  ],
  "weeklyAnalysis": {
    "plannedTSS": ${totalPlannedTSS},
    "overallAssessment": "well_balanced" | "needs_adjustment" | "too_hard" | "too_easy",
    "recommendations": ["recommendation 1", "recommendation 2"]
  }
}

Focus on:
1. Training load balance (not too much, not too little)
2. Recovery time between hard efforts
3. Progression towards stated goals
4. Variety and specificity of workouts
5. Rest day placement
6. Consider the athlete's historical patterns (if available)

Keep insights concise and actionable. Limit to 3-5 most important insights.`;
  }
}

/**
 * Parse AI response to extract JSON
 */
function parseAIResponse(text) {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse JSON from AI response:', e);
    }
  }

  // Fallback response
  return {
    insights: [
      {
        type: 'suggestion',
        title: 'Analysis Unavailable',
        message: 'Unable to analyze the training week. Please try again.',
        priority: 'medium',
      },
    ],
    weeklyAnalysis: {
      plannedTSS: 0,
      recommendations: [],
    },
  };
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      weekStart,
      plannedWorkouts,
      completedActivities,
      adaptations,
      goals,
      userContext,
      userPatterns,
    } = req.body;

    // Validate required fields
    if (!weekStart) {
      return res.status(400).json({ error: 'weekStart is required' });
    }

    // Build the prompt
    const prompt = buildReviewPrompt({
      weekStart,
      plannedWorkouts: plannedWorkouts || [],
      completedActivities: completedActivities || [],
      adaptations: adaptations || [],
      goals: goals || [],
      userContext: userContext || null,
      userPatterns: userPatterns || null,
    });

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048, // Increased for more detailed analysis
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text from response
    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse the response
    const result = parseAIResponse(responseText);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Week review error:', error);

    // Return a graceful error response
    return res.status(500).json({
      error: 'Failed to review week',
      insights: [
        {
          type: 'warning',
          title: 'Service Unavailable',
          message: 'AI review is temporarily unavailable. Please try again later.',
          priority: 'medium',
        },
      ],
      weeklyAnalysis: {
        plannedTSS: 0,
        recommendations: [],
      },
    });
  }
}
