// Vercel API Route: Optimized AI Training Coach
// Server-side endpoint with compact context and intelligent model selection

import Anthropic from '@anthropic-ai/sdk';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { WORKOUT_LIBRARY_FOR_AI, WORKOUT_TOOLS } from './utils/workoutLibrary.js';
import { buildCoachingContext } from './utils/coachingContextServer.js';
import { selectModel, getModelConfig } from './utils/modelSelector.js';

// In-memory cache (simple, works in serverless with caveats)
const contextCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// CORS helper
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

// Optimized system prompt (shorter, cached)
const COACHING_SYSTEM_PROMPT = `You are an expert cycling coach specializing in power-based training and data-driven optimization.

Expertise: Training periodization, TSS/CTL/ATL/TSB metrics, workout prescription, recovery management, route planning.

Personality: Supportive, honest, concise (2-3 paragraphs max), data-driven but human-focused.

Key Metrics:
- CTL (Chronic Training Load): 42-day fitness
- ATL (Acute Training Load): 7-day fatigue
- TSB (Training Stress Balance): CTL - ATL (form status)
  - TSB < -30: Overreaching
  - TSB -10 to -30: Productive training
  - TSB -10 to +5: Race-ready
  - TSB > +25: Detraining risk

Guidelines:
1. Reference actual data from athlete's context
2. Provide actionable next steps
3. Explain the "why" behind recommendations
4. Balance intensity with recovery

${WORKOUT_LIBRARY_FOR_AI}

CRITICAL: When recommending specific workouts, ALWAYS use the recommend_workout tool. Never just describe workouts in text.

Trigger phrases requiring tool use:
- "what should I ride"
- "plan my week"
- "schedule training"
- "recommend a workout"

Example (CORRECT):
User: "What should I ride this week?"
Assistant: "Based on your TSB of +8, you're fresh and ready for quality work."
[Calls recommend_workout for recovery_spin]
[Calls recommend_workout for three_by_ten_sst]

Example (WRONG - DO NOT DO):
Assistant: "Do a recovery ride Monday, sweet spot Wednesday..." [No tool calls]

The tool is how athletes add workouts to their calendar!`;

export default async function handler(req, res) {
  // CORS handling
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('🚨 MISSING ANTHROPIC_API_KEY');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    const claude = new Anthropic({ apiKey });

    // Parse request
    const {
      userId,
      message,
      conversationHistory = [],
      useCache = true,
      forceModel = null
    } = req.body;

    console.log('📝 Optimized AI Coach Request:', {
      userId,
      messageLength: message?.length || 0,
      historyLength: conversationHistory.length,
      useCache
    });

    if (!userId || !message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userId and message are required'
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Message too long (max 5,000 characters)'
      });
    }

    // Rate limiting
    const rateLimitResult = await rateLimitMiddleware(req, res, 'AI_COACH_OPTIMIZED', 15, 5);
    if (rateLimitResult !== null) return;

    // Get or build coaching context (with caching)
    let context;
    const cacheKey = `context:${userId}`;
    const cachedEntry = contextCache.get(cacheKey);

    if (useCache && cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
      context = cachedEntry.context;
      console.log('✅ Cache HIT for user:', userId);
    } else {
      console.log('📊 Building fresh coaching context...');
      context = await buildCoachingContext(userId);

      // Cache the result
      contextCache.set(cacheKey, {
        context,
        timestamp: Date.now()
      });

      // Clean up old cache entries (simple cleanup)
      if (contextCache.size > 500) {
        const now = Date.now();
        for (const [key, entry] of contextCache.entries()) {
          if (now - entry.timestamp > CACHE_TTL_MS) {
            contextCache.delete(key);
          }
        }
      }

      console.log('💾 Cached context (size:', contextCache.size, ')');
    }

    // Format compact context
    const contextPrompt = `## Training Context\n${JSON.stringify(context, null, 2)}`;

    // Intelligent model selection
    const modelSelection = selectModel(message, conversationHistory, { forceModel });
    const modelConfig = getModelConfig(modelSelection.model);

    console.log('🤖 Model selected:', modelSelection.model, '(', modelSelection.reason, ')');

    // Build messages
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: `${contextPrompt}\n\n## My Question\n${message}`
      }
    ];

    // Call Claude API
    const startTime = Date.now();
    const response = await claude.messages.create({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
      system: [
        {
          type: 'text',
          text: COACHING_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' } // Enable prompt caching
        }
      ],
      messages,
      tools: WORKOUT_TOOLS
    });

    const responseTime = Date.now() - startTime;

    // Extract response
    const textContent = response.content.find(block => block.type === 'text');
    const toolUses = response.content.filter(block => block.type === 'tool_use');
    const responseText = textContent?.text || '';

    const workoutRecommendations = toolUses
      .filter(tool => tool.name === 'recommend_workout')
      .map(tool => ({
        id: tool.id,
        ...tool.input
      }));

    console.log('✅ Response received:', {
      model: modelSelection.model,
      responseTime: `${responseTime}ms`,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheHit: response.usage.cache_read_input_tokens > 0,
      cachedTokens: response.usage.cache_read_input_tokens || 0,
      workouts: workoutRecommendations.length
    });

    return res.status(200).json({
      success: true,
      message: responseText,
      workoutRecommendations: workoutRecommendations.length > 0 ? workoutRecommendations : null,
      context, // Return context for debugging
      usage: response.usage,
      metadata: {
        modelUsed: modelSelection.model,
        modelReason: modelSelection.reason,
        responseTimeMs: responseTime,
        cacheHit: response.usage.cache_read_input_tokens > 0,
        estimatedTokensSaved: Math.round(
          JSON.stringify(context).length / 3.5 // vs old verbose format
        )
      }
    });

  } catch (error) {
    console.error('❌ Claude API Error:', {
      status: error.status,
      message: error.message,
      type: error.type
    });

    let clientError = 'AI coaching request failed';
    let statusCode = 500;

    if (error.status === 429) {
      clientError = 'Too many requests. Please try again in a minute.';
      statusCode = 429;
    } else if (error.status === 401 || error.status === 403) {
      clientError = 'AI service authentication error.';
      statusCode = 500;
    } else if (error.status === 400) {
      clientError = 'Invalid request. Please try a different question.';
      statusCode = 400;
    } else if (error.status >= 500) {
      clientError = 'AI coaching service temporarily unavailable.';
      statusCode = 503;
    }

    return res.status(statusCode).json({
      success: false,
      error: clientError,
      debug: process.env.NODE_ENV === 'development' ? {
        originalStatus: error.status,
        originalMessage: error.message
      } : undefined
    });
  }
}
