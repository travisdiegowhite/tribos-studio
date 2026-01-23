// Vercel API Route: AI Training Coach
// Server-side endpoint for AI coaching conversations

import Anthropic from '@anthropic-ai/sdk';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { WORKOUT_LIBRARY_FOR_AI, ALL_COACH_TOOLS } from './utils/workoutLibrary.js';
import { handleFitnessHistoryQuery } from './utils/fitnessHistoryTool.js';
import { setupCors } from './utils/cors.js';

// Base coaching knowledge (date context added dynamically)
const COACHING_KNOWLEDGE = `You are an expert cycling coach with deep knowledge of:
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

**CALENDAR & RACE GOALS ACCESS:**
You have DIRECT ACCESS to the athlete's calendar and race goals. This data is provided in the "ATHLETE'S CURRENT TRAINING CONTEXT" section below. When the athlete asks about their races, events, or calendar:
- You CAN see their race names, dates, distances, elevation, race types, and goals
- You CAN calculate exactly how many days/weeks until each race
- You CAN provide race-specific training plans based on their actual event details
- DO NOT tell the athlete you "can't see" their calendar - you have full access to their race goals
- Reference their specific races by name when giving advice (e.g., "For Old Man Winter on March 15th...")
- Use the race date to calculate preparation timelines and periodization phases

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

Remember: The tool is how athletes add workouts to their calendar. Without it, they can't act on your advice!

**HISTORICAL FITNESS ANALYSIS:**

You have access to the athlete's fitness history through the query_fitness_history tool.
Use this tool whenever the athlete asks about:
- Past performance ("How was my fitness last year?")
- Comparisons ("Am I fitter now than before?")
- Peak periods ("When was I at my best?")
- Trends ("Am I building or losing fitness?")
- Seasonal patterns ("What time of year am I usually strongest?")

**Trigger phrases for history tool:**
- "compare to last year"
- "this time last year"
- "when was I"
- "peak fitness"
- "trending"
- "building fitness"
- "losing fitness"
- "year over year"
- "historically"

IMPORTANT: Always use the query_fitness_history tool for historical questions. Never guess about past performance - the tool has actual data.`;

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
      userLocalDate = null,
      userId = null,
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

    // Build system message with date context FIRST
    // Use user's local date if provided, otherwise fall back to server date
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let dateStr;
    let dayOfWeek;
    let todayDate;
    let todayMonth;
    let todayYear;

    if (userLocalDate && userLocalDate.dateString) {
      // Use the user's local date from the browser
      dateStr = userLocalDate.dateString;
      dayOfWeek = userLocalDate.dayOfWeek;
      todayDate = userLocalDate.date;
      todayMonth = userLocalDate.month;
      todayYear = userLocalDate.year;
    } else {
      // Fallback to server date (UTC)
      const today = new Date();
      dateStr = `${dayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
      dayOfWeek = today.getDay();
      todayDate = today.getDate();
      todayMonth = today.getMonth();
      todayYear = today.getFullYear();
    }

    // Calculate this week's date range using user's local date
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayDate = todayDate + mondayOffset;
    const sundayDate = mondayDate + 6;
    // Simplified week range display
    const weekRangeStr = `Week of ${monthNames[todayMonth]} ${mondayDate > 0 ? mondayDate : todayDate}, ${todayYear}`;

    // Build the full system prompt with date as the foundation
    let systemPrompt = `=== CURRENT DATE & TIME CONTEXT ===
TODAY IS: ${dateStr}
${weekRangeStr}

CRITICAL: The conversation history below may contain outdated references to past dates (weeks or months ago).
You MUST use the current date above as your reference point. When the athlete asks about "this week", "tomorrow", "Monday", etc., calculate from TODAY'S DATE shown above.

=== YOUR ROLE ===
${COACHING_KNOWLEDGE}`;

    if (trainingContext) {
      systemPrompt += `\n\n=== ATHLETE'S CURRENT TRAINING CONTEXT (INCLUDING RACE CALENDAR) ===
IMPORTANT: You have DIRECT ACCESS to all information below. This includes their race goals, event dates, distances, and performance targets. Reference this data directly in your responses.

${trainingContext}`;
    }

    systemPrompt += `\n\n=== INSTRUCTIONS ===
Use the current date context and athlete data above to provide personalized, time-appropriate coaching advice.
When races are listed above, use their exact names, dates, and details in your response - you have full visibility into their calendar.`;

    // Limit conversation history to last 10 messages to prevent stale context from dominating
    // Also filter out any messages with empty content (Claude API requires non-empty content)
    const recentHistory = conversationHistory
      .filter(msg => msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0)
      .slice(-10);

    // Build conversation messages - prepend date reminder to user's message
    const userMessageWithDate = `[Today is ${dateStr}]\n\n${message}`;

    const messages = [
      ...recentHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: userMessageWithDate
      }
    ];

    // Call Claude API
    const model = 'claude-sonnet-4-5-20250929';

    let response = await claude.messages.create({
      model: model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
      tools: ALL_COACH_TOOLS
    });

    // Check if we need to handle fitness history tool calls
    let toolUses = response.content.filter(block => block.type === 'tool_use');
    const fitnessHistoryUses = toolUses.filter(tool => tool.name === 'query_fitness_history');

    console.log(`🤖 Coach response: ${toolUses.length} tool uses, ${fitnessHistoryUses.length} fitness history queries`);
    if (fitnessHistoryUses.length > 0) {
      console.log(`🤖 Fitness history tool requested. userId: ${userId}`);
    }

    // If fitness history tools were called, execute them and continue conversation
    if (fitnessHistoryUses.length > 0 && userId) {
      const toolResults = [];

      for (const tool of fitnessHistoryUses) {
        try {
          const result = await handleFitnessHistoryQuery(userId, tool.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify(result)
          });
        } catch (error) {
          console.error('Fitness history tool error:', error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify({
              success: false,
              error: 'Failed to retrieve fitness history'
            })
          });
        }
      }

      // Continue conversation with tool results
      const continueMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ];

      response = await claude.messages.create({
        model: model,
        max_tokens: Math.min(maxTokens, 4096),
        temperature: 0.7,
        system: systemPrompt,
        messages: continueMessages,
        tools: ALL_COACH_TOOLS
      });

      // Update tool uses from the continued response
      toolUses = response.content.filter(block => block.type === 'tool_use');
    }

    // Extract text response
    const textContent = response.content.find(block => block.type === 'text');
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
