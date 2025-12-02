/**
 * Model Selection Utility
 * Intelligently selects between Haiku (fast/cheap) and Sonnet (powerful/expensive)
 * based on question complexity and context requirements
 */

// Model identifiers
export const MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001', // Latest Haiku 4.5
  SONNET: 'claude-sonnet-4-5-20250929' // Latest Sonnet 4.5
};

// Cost per 1M tokens (approximate)
export const MODEL_COSTS = {
  [MODELS.HAIKU]: {
    input: 0.80,
    output: 4.00
  },
  [MODELS.SONNET]: {
    input: 3.00,
    output: 15.00
  }
};

/**
 * Patterns that indicate simple questions suitable for Haiku
 */
const SIMPLE_QUESTION_PATTERNS = [
  // Quick status checks
  /how (am i|was my)/i,
  /how('| i)s my/i,
  /what('| i)s my/i,

  // Binary/simple decisions
  /should i (ride|rest|train)/i,
  /can i (ride|train)/i,
  /do i need/i,

  // Timing questions
  /when (should|can|is)/i,
  /when('| i)s (my|the) next/i,

  // Simple counts/stats
  /how many/i,
  /how much/i,
  /how long/i,

  // Single metric explanations
  /what does (tsb|ctl|atl|tss) mean/i,
  /explain (my )?(tsb|ctl|atl|tss)/i,

  // Quick insights
  /am i (ready|rested|fatigued|overtrained)/i,
  /quick (insight|summary|overview)/i,

  // Today/tomorrow questions
  /today/i,
  /tomorrow/i
];

/**
 * Patterns that indicate complex questions requiring Sonnet
 */
const COMPLEX_QUESTION_PATTERNS = [
  // Planning and strategy
  /plan (my|a|the)/i,
  /create (a )?plan/i,
  /build (a )?plan/i,
  /design (a )?workout/i,

  // Multiple workouts or week-long planning
  /(weekly|week) (plan|schedule|training)/i,
  /next (week|month)/i,
  /schedule.*week/i,

  // Route generation or complex recommendations
  /generate.*route/i,
  /suggest.*route/i,
  /recommend.*route/i,

  // Multi-part questions
  /and (also|what|how|when|should)/i,

  // Analysis requiring reasoning
  /why (is|am|do|should)/i,
  /analyze/i,
  /compare/i,

  // Workout prescription (requires tool use)
  /add.*workout/i,
  /schedule.*workout/i,
  /what.*should.*ride.*this week/i,

  // Detailed explanations
  /explain (in detail|how|why)/i,
  /breakdown/i,
  /detail/i
];

/**
 * Analyze question complexity based on various factors
 *
 * @param {string} question - User's question
 * @param {Array} conversationHistory - Recent conversation context
 * @returns {Object} Analysis result with model recommendation
 */
export function analyzeQuestionComplexity(question, conversationHistory = []) {
  const lowerQuestion = question.toLowerCase().trim();
  const wordCount = question.split(/\s+/).length;

  // Check for explicit complex patterns first
  const isExplicitlyComplex = COMPLEX_QUESTION_PATTERNS.some(pattern =>
    pattern.test(lowerQuestion)
  );

  if (isExplicitlyComplex) {
    return {
      model: MODELS.SONNET,
      reason: 'Complex question pattern detected (planning, multi-step, or tool use required)',
      confidence: 'high'
    };
  }

  // Check for simple patterns
  const isExplicitlySimple = SIMPLE_QUESTION_PATTERNS.some(pattern =>
    pattern.test(lowerQuestion)
  );

  if (isExplicitlySimple && wordCount < 15) {
    return {
      model: MODELS.HAIKU,
      reason: 'Simple factual question',
      confidence: 'high'
    };
  }

  // Word count heuristic
  if (wordCount > 30) {
    return {
      model: MODELS.SONNET,
      reason: 'Long, detailed question requiring nuanced response',
      confidence: 'medium'
    };
  }

  // Question marks (multiple questions = complex)
  const questionMarkCount = (question.match(/\?/g) || []).length;
  if (questionMarkCount > 1) {
    return {
      model: MODELS.SONNET,
      reason: 'Multiple questions asked',
      confidence: 'medium'
    };
  }

  // Conversation context (follow-ups might be complex)
  if (conversationHistory.length > 2) {
    const recentContext = conversationHistory.slice(-2);
    const hasWorkoutDiscussion = recentContext.some(msg =>
      /workout|training|plan|schedule/i.test(msg.content)
    );

    if (hasWorkoutDiscussion && /those|these|that|it/i.test(lowerQuestion)) {
      return {
        model: MODELS.SONNET,
        reason: 'Follow-up question in complex conversation context',
        confidence: 'medium'
      };
    }
  }

  // Default to Haiku for short, simple questions
  if (wordCount <= 10 && !isExplicitlyComplex) {
    return {
      model: MODELS.HAIKU,
      reason: 'Short question, likely simple response needed',
      confidence: 'medium'
    };
  }

  // When in doubt, use Sonnet for quality
  return {
    model: MODELS.SONNET,
    reason: 'Moderate complexity, using Sonnet for quality',
    confidence: 'low'
  };
}

/**
 * Select the appropriate model with reasoning
 *
 * @param {string} question - User's question
 * @param {Array} conversationHistory - Recent conversation context
 * @param {Object} options - Override options
 * @returns {Object} Model selection result
 */
export function selectModel(question, conversationHistory = [], options = {}) {
  const {
    forceModel = null,
    preferQuality = false,
    preferSpeed = false
  } = options;

  // Allow forced model selection
  if (forceModel) {
    return {
      model: forceModel,
      reason: 'Forced model selection',
      confidence: 'override'
    };
  }

  // Analyze complexity
  const analysis = analyzeQuestionComplexity(question, conversationHistory);

  // Apply preference overrides
  if (preferQuality && analysis.model === MODELS.HAIKU && analysis.confidence !== 'high') {
    return {
      ...analysis,
      model: MODELS.SONNET,
      reason: `${analysis.reason} (upgraded to Sonnet for quality preference)`
    };
  }

  if (preferSpeed && analysis.model === MODELS.SONNET && analysis.confidence === 'low') {
    return {
      ...analysis,
      model: MODELS.HAIKU,
      reason: `${analysis.reason} (downgraded to Haiku for speed preference)`
    };
  }

  return analysis;
}

/**
 * Estimate cost for a given request
 *
 * @param {string} model - Model identifier
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} outputTokens - Estimated output tokens
 * @returns {number} Estimated cost in USD
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;

  const inputCost = (inputTokens / 1000000) * costs.input;
  const outputCost = (outputTokens / 1000000) * costs.output;

  return inputCost + outputCost;
}

/**
 * Get model configuration for API call
 *
 * @param {string} model - Model identifier
 * @returns {Object} Model configuration
 */
export function getModelConfig(model) {
  const configs = {
    [MODELS.HAIKU]: {
      model: MODELS.HAIKU,
      maxTokens: 1024, // Haiku for quick responses
      temperature: 0.7
    },
    [MODELS.SONNET]: {
      model: MODELS.SONNET,
      maxTokens: 2048, // Sonnet for detailed responses + tool use
      temperature: 0.7
    }
  };

  return configs[model] || configs[MODELS.SONNET];
}

export default {
  MODELS,
  MODEL_COSTS,
  analyzeQuestionComplexity,
  selectModel,
  estimateCost,
  getModelConfig
};
