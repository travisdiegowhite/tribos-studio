/**
 * AI Workout Integration Service
 * Handles applying AI-recommended workouts to athlete's training calendar
 *
 * Note: This service uses the API endpoint rather than direct Supabase calls
 * to ensure consistent validation and schema handling
 */

/**
 * Apply an AI-recommended workout to the athlete's calendar
 * Uses the apply-ai-workout API endpoint for consistency
 * @param {string} athleteId - Athlete user ID
 * @param {object} recommendation - Workout recommendation from AI
 * @returns {Promise} Created planned workout
 */
export const applyAIWorkoutRecommendation = async (athleteId, recommendation) => {
  try {
    // Call the API endpoint instead of direct database access
    const response = await fetch('/api/apply-ai-workout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        athleteId: athleteId,
        recommendation: recommendation
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to add workout');
    }

    return { data: result.data, error: null };
  } catch (err) {
    console.error('Error applying AI workout recommendation:', err);
    return { data: null, error: err };
  }
};

/**
 * Batch apply multiple AI workout recommendations
 * @param {string} athleteId - Athlete user ID
 * @param {array} recommendations - Array of workout recommendations
 * @returns {Promise} Array of results
 */
export const batchApplyAIRecommendations = async (athleteId, recommendations) => {
  try {
    const results = [];

    for (const rec of recommendations) {
      const result = await applyAIWorkoutRecommendation(athleteId, rec);
      results.push({
        recommendation: rec,
        success: !result.error,
        data: result.data,
        error: result.error
      });
    }

    return { data: results, error: null };
  } catch (err) {
    console.error('Error batch applying recommendations:', err);
    return { data: null, error: err };
  }
};

// Export as default object
const aiWorkoutIntegration = {
  applyAIWorkoutRecommendation,
  batchApplyAIRecommendations
};

export default aiWorkoutIntegration;
