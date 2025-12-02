/**
 * Optimized AI Training Coach Service
 * Uses compact context and intelligent model selection
 */

// Get API base URL
const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return '';
  }
  return 'http://localhost:3001';
};

/**
 * Send message to optimized AI coach endpoint
 *
 * @param {string} userId - User ID
 * @param {string} message - User's message
 * @param {Array} conversationHistory - Recent conversation (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Coach response with metadata
 */
export async function sendCoachMessage(userId, message, conversationHistory = [], options = {}) {
  const {
    useCache = true,
    forceModel = null
  } = options;

  console.log('💬 Sending message to optimized AI coach:', message);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/coach-optimized`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        userId,
        message,
        conversationHistory,
        useCache,
        forceModel
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

    console.log('✅ Optimized AI coach response:', {
      model: data.metadata?.modelUsed,
      reason: data.metadata?.modelReason,
      responseTime: data.metadata?.responseTimeMs,
      cacheHit: data.metadata?.cacheHit,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      cachedTokens: data.usage?.cache_read_input_tokens || 0
    });

    return {
      message: data.message,
      workoutRecommendations: data.workoutRecommendations,
      context: data.context,
      usage: data.usage,
      metadata: data.metadata
    };

  } catch (error) {
    console.error('Error calling optimized AI coach:', error);
    throw error;
  }
}

/**
 * Get quick coaching insight (uses optimized endpoint)
 */
export async function getQuickInsight(userId, topic) {
  const topicPrompts = {
    tsb: 'Explain my current TSB and what it means for training today.',
    workout_today: 'What workout should I do today?',
    recovery: 'Do I need more recovery?',
    route: 'Suggest a route for my next workout.',
    progress: 'How is my training progressing?',
    metrics: 'Explain my training metrics in simple terms.'
  };

  const prompt = topicPrompts[topic] || topic;
  return sendCoachMessage(userId, prompt, [], { useCache: true });
}

/**
 * Extract actionable items from coach response
 */
export function extractActions(coachResponse) {
  const actions = [];

  if (coachResponse.toLowerCase().includes('generate route') ||
      coachResponse.toLowerCase().includes('create a route')) {
    actions.push({
      type: 'generate_route',
      label: 'Generate Route',
      icon: 'Map'
    });
  }

  if (coachResponse.toLowerCase().includes('do a') &&
      (coachResponse.toLowerCase().includes('ride') ||
       coachResponse.toLowerCase().includes('workout'))) {
    actions.push({
      type: 'view_workouts',
      label: 'View Workouts',
      icon: 'Activity'
    });
  }

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
 * Detect if AI recommended workouts but didn't use the tool
 */
export function detectMissedWorkoutRecommendations(coachResponse, workoutRecommendations) {
  if (workoutRecommendations && workoutRecommendations.length > 0) {
    return false;
  }

  const response = coachResponse.toLowerCase();

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

  const schedulePatterns = [
    /on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /this (week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /tomorrow/i,
    /today/i,
    /(plan|schedule) (for|your)/i
  ];

  const hasWorkoutPhrase = workoutPhrases.some(phrase => response.includes(phrase));
  const hasSchedule = schedulePatterns.some(pattern => pattern.test(response));

  return hasWorkoutPhrase && hasSchedule;
}

export default {
  sendCoachMessage,
  getQuickInsight,
  extractActions,
  detectMissedWorkoutRecommendations
};
