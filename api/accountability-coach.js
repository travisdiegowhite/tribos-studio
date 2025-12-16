// Vercel API Route: Accountability Coach
// AI coach for cycling accountability with memory extraction

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://tribos-studio.vercel.app'];
  }
  return ['http://localhost:3000', 'http://localhost:5173'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// Memory extraction prompt to run after conversation
const MEMORY_EXTRACTION_PROMPT = `Analyze this conversation exchange and extract any important information worth remembering about the user.

USER MESSAGE: {user_message}
COACH RESPONSE: {coach_response}

Extract information that would be useful for future coaching conversations. Only extract if there's clear, specific information - don't infer or assume.

Categories:
- goal: Training goals, target events, races they're preparing for
- context: Life circumstances (work schedule, family, travel, stress)
- obstacle: Recurring challenges or barriers mentioned
- pattern: Behavioral patterns you notice
- win: Achievements, breakthroughs, successes
- preference: Preferences for workout timing, route types, etc.
- injury: Past or current injuries
- schedule: Regular schedule constraints

Memory types:
- short: Only relevant this week (expires in 7 days)
- medium: Relevant for the next month (expires in 30 days)
- long: Permanent, important facts that don't expire

Return a JSON array of memories to store (empty array if nothing worth remembering):
[
  {
    "type": "short|medium|long",
    "category": "goal|context|obstacle|pattern|win|preference|injury|schedule",
    "content": "brief, factual statement"
  }
]

Only extract concrete facts, not interpretations. If nothing noteworthy, return [].
Return ONLY the JSON array, no other text.`;

export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({}).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('MISSING ANTHROPIC_API_KEY');
      return res.status(500).json({
        success: false,
        error: 'AI coaching service not configured'
      });
    }

    const claude = new Anthropic({ apiKey });

    const {
      message,
      conversationHistory = [],
      systemPrompt,
      context = {},
      userId,
      maxTokens = 512 // Keep responses short for accountability
    } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid message is required'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message too long (max 2000 characters)'
      });
    }

    // Rate limiting (20 requests per 5 minutes)
    const rateLimitResult = await rateLimitMiddleware(
      req,
      res,
      'ACCOUNTABILITY_COACH',
      20,
      5
    );

    if (rateLimitResult !== null) {
      return;
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

    // Call Claude API for coach response
    const model = 'claude-sonnet-4-5-20250929';

    const response = await claude.messages.create({
      model,
      max_tokens: Math.min(maxTokens, 1024),
      temperature: 0.8, // Slightly more creative for personality
      system: systemPrompt,
      messages
    });

    const textContent = response.content.find(block => block.type === 'text');
    const coachResponse = textContent?.text || '';

    // Extract memories from the exchange (in background, don't block response)
    let extractedMemories = [];
    try {
      const extractionPrompt = MEMORY_EXTRACTION_PROMPT
        .replace('{user_message}', message)
        .replace('{coach_response}', coachResponse);

      const memoryResponse = await claude.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        temperature: 0,
        messages: [{ role: 'user', content: extractionPrompt }]
      });

      const memoryText = memoryResponse.content.find(b => b.type === 'text')?.text || '[]';

      // Parse memories
      try {
        let jsonText = memoryText.trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const memories = JSON.parse(jsonText);
        if (Array.isArray(memories) && memories.length > 0) {
          extractedMemories = memories;

          // Save memories to database
          if (userId) {
            for (const memory of memories) {
              const expiresAt = memory.type === 'short'
                ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                : memory.type === 'medium'
                  ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                  : null;

              await supabase.from('coach_memory').insert({
                user_id: userId,
                memory_type: memory.type,
                category: memory.category,
                content: memory.content,
                source_type: 'conversation',
                expires_at: expiresAt
              });
            }
          }
        }
      } catch {
        // Memory extraction failed, that's okay
      }
    } catch (memErr) {
      console.error('Memory extraction error (non-blocking):', memErr);
    }

    return res.status(200).json({
      success: true,
      message: coachResponse,
      extractedMemories: extractedMemories.length > 0 ? extractedMemories : null,
      usage: response.usage
    });

  } catch (error) {
    console.error('Accountability Coach Error:', error);

    let clientError = 'Coach request failed';
    let statusCode = 500;

    if (error.status === 429) {
      clientError = 'Too many requests. Please wait a moment.';
      statusCode = 429;
    } else if (error.status === 401 || error.status === 403) {
      clientError = 'AI service authentication error';
      statusCode = 500;
    } else if (error.status === 400) {
      clientError = 'Invalid request';
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      error: clientError
    });
  }
}
