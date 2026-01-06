// Vercel API Route: AI Training Coach
// Server-side endpoint for AI coaching conversations

import Anthropic from '@anthropic-ai/sdk';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { WORKOUT_LIBRARY_FOR_AI, WORKOUT_TOOLS } from './utils/workoutLibrary.js';
import { setupCors } from './utils/cors.js';

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
7. **CRITICAL**: Whenever you suggest specific workouts, YOU MUST use the recommend_workout tool for EACH workout

When discussing metrics:
- CTL (Chronic Training Load): 42-day fitness level
- ATL (Acute Training Load): 7-day fatigue level
- TSB (Training Stress Balance): Form status (CTL - ATL)
- Positive TSB = rested/fresh, Negative TSB = fatigued
- TSB ranges: <-30 (overreaching), -10 to -30 (productive), -10 to +5 (optimal race form), >+25 (detraining)

${WORKOUT_LIBRARY_FOR_AI}

**HOW TO RECOMMEND WORKOUTS:**

When you recommend specific workouts, you MUST use the recommend_workout tool. Never just describe workouts in text.

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

**Key points:**
- ALWAYS call the tool when recommending specific workouts
- Use actual workout_ids from the library (recovery_spin, three_by_ten_sst, etc.)
- One tool call = one workout
- Multiple workouts = multiple tool calls
- scheduled_date format: "today", "tomorrow", "this_monday", "next_tuesday", or "YYYY-MM-DD"

Remember: The tool is how athletes add workouts to their calendar. Without it, they can't act on your advice!`;

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
      maxTokens = 1024
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

    // Build system message with training context
    // Add current date at the very top for time awareness
    const today = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dateStr = `${dayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

    let systemPrompt = `IMPORTANT - TODAY'S DATE: ${dateStr}\nIgnore any outdated date references in conversation history. Always use today's date above when planning workouts for "this week", "tomorrow", etc.\n\n${COACHING_SYSTEM_PROMPT}`;
    if (trainingContext) {
      systemPrompt += `\n\n=== ATHLETE'S CURRENT TRAINING CONTEXT ===\n${trainingContext}\n\nUse this context to provide personalized coaching advice.`;
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

    // Call Claude API
    const model = 'claude-sonnet-4-5-20250929';

    const response = await claude.messages.create({
      model: model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
      tools: WORKOUT_TOOLS
    });

    // Extract text response and tool uses
    const textContent = response.content.find(block => block.type === 'text');
    const toolUses = response.content.filter(block => block.type === 'tool_use');

    const responseText = textContent?.text || '';

    // Extract workout recommendations from tool uses
    const workoutRecommendations = toolUses
      .filter(tool => tool.name === 'recommend_workout')
      .map(tool => ({
        id: tool.id,
        ...tool.input
      }));

    return res.status(200).json({
      success: true,
      message: responseText,
      workoutRecommendations: workoutRecommendations.length > 0 ? workoutRecommendations : null,
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
