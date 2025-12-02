// Vercel API Route: Secure AI Training Coach
// Server-side endpoint for AI coaching conversations

import Anthropic from '@anthropic-ai/sdk';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';
import { WORKOUT_LIBRARY_FOR_AI, WORKOUT_TOOLS } from './utils/workoutLibrary.js';

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

// System prompt for the AI coach
const COACHING_SYSTEM_PROMPT = `You are an expert cycling coach with deep knowledge of:
- Training periodization and load management
- Power-based training and TSS/CTL/ATL/TSB metrics
- Cycling physiology and performance optimization
- Recovery and fatigue management
- Workout prescription for different training phases
- Route planning and terrain strategy

Your Personality:
- Supportive and encouraging, but honest and realistic
- Data-driven but emphasize listening to one's body
- Clear and concise (avoid jargon unless explaining it)
- Focus on sustainable long-term improvement over quick fixes

Guidelines for Your Responses:
1. Always be specific - reference actual data from the athlete's training
2. Keep responses to 2-3 paragraphs maximum (be concise!)
3. Provide actionable next steps, not just explanations
4. Explain the "why" behind recommendations
5. Consider both the metrics and the context (life stress, weather, upcoming events)
6. Balance ambition with recovery and injury prevention
7. **CRITICAL**: Whenever you suggest specific workouts, YOU MUST use the recommend_workout tool for EACH workout. Do NOT just describe workouts in text - use the tool so they can click to add them to their calendar

When discussing metrics:
- CTL (Chronic Training Load): 42-day fitness level
- ATL (Acute Training Load): 7-day fatigue level
- TSB (Training Stress Balance): Form status (CTL - ATL)
- Positive TSB = rested/fresh, Negative TSB = fatigued
- TSB ranges: <-30 (overreaching), -10 to -30 (productive), -10 to +5 (optimal race form), >+25 (detraining)

${WORKOUT_LIBRARY_FOR_AI}

**HOW TO RECOMMEND WORKOUTS:**

⚠️ CRITICAL: Whenever you recommend specific workouts, you MUST use the recommend_workout tool. Never just describe workouts in text.

**Trigger phrases that require tool use:**
- "what should I ride"
- "plan my week"
- "add workouts"
- "schedule training"
- "recommend a workout"
- Any question asking for specific workout suggestions

**Correct approach (ALWAYS DO THIS):**
1. Give brief explanation (1-2 sentences about reasoning)
2. Use recommend_workout tool for EACH specific workout
3. The athlete sees clickable cards to add to calendar

**GOOD Example:**
User: "What should I ride this week?"
Assistant: "Based on your TSB of +8, you're well-rested and ready for quality work. Let's build with some sweet spot and recovery."
[Calls recommend_workout tool for recovery_spin on Monday]
[Calls recommend_workout tool for three_by_ten_sst on Wednesday]
[Calls recommend_workout tool for foundation_miles on Saturday]

**BAD Example (DO NOT DO THIS):**
User: "What should I ride this week?"
Assistant: "You should do a recovery ride on Monday (30min, Zone 1), sweet spot intervals on Wednesday (3x10min at 88-93% FTP), and an endurance ride on Saturday."
[No tool calls = athlete can't add workouts = WRONG]

**Key points:**
- ALWAYS call the tool when recommending specific workouts
- Use actual workout_ids from the library (recovery_spin, three_by_ten_sst, etc.)
- One tool call = one workout
- Multiple workouts = multiple tool calls
- scheduled_date format: "today", "tomorrow", "this_monday", "next_tuesday", or "YYYY-MM-DD"

**If athlete asks general training advice without requesting specific workouts:**
- You can discuss principles, explain concepts, answer questions
- You do NOT need to use the tool
- Only use tool when athlete wants specific workout recommendations

Remember: The tool is how athletes add workouts to their calendar. Without it, they can't act on your advice!`;

export default async function handler(req, res) {
  // Get client origin
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  // Set CORS headers
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({}).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate API key exists
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('🚨 MISSING ANTHROPIC_API_KEY - Check Vercel environment variables!');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error - AI coaching service not configured'
      });
    }

    // Initialize Claude client (server-side only)
    const claude = new Anthropic({
      apiKey: apiKey,
    });

    // Validate request body
    const {
      message,
      conversationHistory = [],
      trainingContext = null,
      isQuickInsight = false,
      maxTokens = 1024
    } = req.body;

    console.log('📝 AI Coach Request:', {
      hasMessage: !!message,
      messageLength: message?.length || 0,
      historyLength: conversationHistory.length,
      hasContext: !!trainingContext,
      isQuickInsight
    });

    if (!message || typeof message !== 'string') {
      console.error('❌ Invalid message:', { hasMessage: !!message, type: typeof message });
      return res.status(400).json({
        success: false,
        error: 'Valid message is required'
      });
    }

    // Validate message length (prevent abuse)
    if (message.length > 5000) {
      console.error('❌ Message too long:', message.length);
      return res.status(400).json({
        success: false,
        error: `Message too long: ${message.length} characters (max 5,000)`
      });
    }

    // Rate limiting check (10 requests per 5 minutes per IP)
    const rateLimitResult = await rateLimitMiddleware(
      req,
      res,
      'AI_COACH',
      10,
      5
    );

    // If rate limit exceeded, middleware already sent 429 response
    if (rateLimitResult !== null) {
      return;
    }

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.connection.remoteAddress;
    console.log(`✅ Calling Claude API for coaching - IP: ${clientIP}`);

    // Build system message with training context if provided
    let systemPrompt = COACHING_SYSTEM_PROMPT;
    if (trainingContext) {
      systemPrompt += `\n\n=== ATHLETE'S CURRENT TRAINING CONTEXT ===\n${trainingContext}\n\nUse this context to provide personalized, data-driven coaching advice.`;
    }

    // Build conversation messages
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    // Call Claude API with latest Sonnet 4.5 model
    const model = 'claude-sonnet-4-5-20250929';

    console.log('🤖 Calling Claude API with model:', model);

    const response = await claude.messages.create({
      model: model,
      max_tokens: Math.min(maxTokens, 4096), // Cap max tokens (increased to allow for tool use + long responses)
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
      tools: WORKOUT_TOOLS
    });

    // Extract text response and tool uses
    const textContent = response.content.find(block => block.type === 'text');
    const toolUses = response.content.filter(block => block.type === 'tool_use');

    const responseText = textContent?.text || '';
    console.log('✅ Claude API response received, content length:', responseText.length);

    // Extract workout recommendations from tool uses
    const workoutRecommendations = toolUses
      .filter(tool => tool.name === 'recommend_workout')
      .map(tool => ({
        id: tool.id,
        ...tool.input
      }));

    if (workoutRecommendations.length > 0) {
      console.log('💪 Workout recommendations:', workoutRecommendations.length);
    }

    return res.status(200).json({
      success: true,
      message: responseText,
      workoutRecommendations: workoutRecommendations.length > 0 ? workoutRecommendations : null,
      usage: response.usage
    });

  } catch (error) {
    // Enhanced error logging for debugging
    console.error('❌ Claude API Error Details:', {
      status: error.status,
      message: error.message,
      type: error.type,
      code: error.code,
      headers: error.headers,
      requestId: error.request_id
    });

    // Log full error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error object:', JSON.stringify(error, null, 2));
    }

    // Determine user-friendly error message and status
    let clientError = 'AI coaching request failed';
    let statusCode = 500;
    let errorDetails = {};

    if (error.status === 429) {
      clientError = 'Too many requests. Please try again in a minute.';
      statusCode = 429;
      errorDetails = { retryAfter: 60 };
    } else if (error.status === 401 || error.status === 403) {
      clientError = 'AI service authentication error. Please contact support.';
      statusCode = 500; // Don't expose auth details to client
      console.error('🚨 ANTHROPIC_API_KEY issue - Check Vercel env vars!');
    } else if (error.status === 400) {
      clientError = 'Invalid request. Please try a different question.';
      statusCode = 400;
    } else if (error.status >= 400 && error.status < 500) {
      clientError = 'Invalid request to AI coaching service';
      statusCode = 400;
    } else if (error.status >= 500) {
      clientError = 'AI coaching service temporarily unavailable. Please try again later.';
      statusCode = 503;
    }

    return res.status(statusCode).json({
      success: false,
      error: clientError,
      errorCode: error.code,
      errorType: error.type,
      ...errorDetails,
      // Include details in development mode only
      debug: process.env.NODE_ENV === 'development' ? {
        originalStatus: error.status,
        originalMessage: error.message
      } : undefined
    });
  }
}
