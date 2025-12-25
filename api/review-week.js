/**
 * Review Week API Endpoint
 * Analyzes a week's training plan and provides AI-powered suggestions
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

/**
 * Build the prompt for week review
 */
function buildReviewPrompt(data) {
  const { weekStart, plannedWorkouts, goals, userContext } = data;

  // Format workouts for the prompt
  const workoutSummary = plannedWorkouts
    .map((w, i) => {
      const day = new Date(w.scheduledDate).toLocaleDateString('en-US', { weekday: 'long' });
      return `- ${day}: ${w.workout?.name || w.workoutType || 'Unknown'} (TSS: ${w.targetTSS}, Duration: ${w.targetDuration}min)`;
    })
    .join('\n');

  // Calculate week totals
  const totalTSS = plannedWorkouts.reduce((sum, w) => sum + (w.targetTSS || 0), 0);
  const totalDuration = plannedWorkouts.reduce((sum, w) => sum + (w.targetDuration || 0), 0);
  const workoutCount = plannedWorkouts.length;
  const restDays = 7 - workoutCount;

  // Format goals
  const goalSummary = goals?.length
    ? goals.map((g) => `- ${g.name} (Priority: ${g.priority}${g.targetDate ? `, Target: ${g.targetDate}` : ''})`).join('\n')
    : 'No specific goals set';

  // User context
  const contextInfo = userContext
    ? `
Current Fitness Metrics:
- FTP: ${userContext.ftp || 'Unknown'} watts
- CTL (Fitness): ${userContext.ctl || 'Unknown'}
- ATL (Fatigue): ${userContext.atl || 'Unknown'}
- TSB (Form): ${userContext.tsb || 'Unknown'}
`
    : '';

  return `You are an expert cycling coach reviewing a week's training plan. Analyze the plan and provide actionable feedback.

Week Starting: ${weekStart}

PLANNED WORKOUTS:
${workoutSummary || 'No workouts planned'}

WEEK SUMMARY:
- Total Planned TSS: ${totalTSS}
- Total Duration: ${Math.round(totalDuration / 60 * 10) / 10} hours
- Workout Days: ${workoutCount}
- Rest Days: ${restDays}

ATHLETE GOALS:
${goalSummary}
${contextInfo}

Please analyze this training week and provide feedback in the following JSON format:

{
  "insights": [
    {
      "type": "suggestion" | "warning" | "praise",
      "message": "Your feedback message",
      "priority": "high" | "medium" | "low",
      "targetDate": "YYYY-MM-DD" (optional, if the suggestion is for a specific day),
      "suggestedWorkoutId": "workout-id" (optional, if suggesting a specific workout)
    }
  ],
  "weeklyAnalysis": {
    "plannedTSS": ${totalTSS},
    "recommendations": ["recommendation 1", "recommendation 2"]
  }
}

Focus on:
1. Training load balance (not too much, not too little)
2. Recovery time between hard efforts
3. Progression towards stated goals
4. Variety and specificity of workouts
5. Rest day placement

Keep insights concise and actionable. Limit to 3-5 most important insights.`;
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
    const { weekStart, plannedWorkouts, goals, userContext } = req.body;

    // Validate required fields
    if (!weekStart) {
      return res.status(400).json({ error: 'weekStart is required' });
    }

    // Build the prompt
    const prompt = buildReviewPrompt({
      weekStart,
      plannedWorkouts: plannedWorkouts || [],
      goals: goals || [],
      userContext: userContext || null,
    });

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
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
