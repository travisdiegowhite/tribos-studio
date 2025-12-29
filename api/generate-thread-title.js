// Vercel API Route: Generate Thread Title
// Uses AI to generate concise, descriptive titles for conversation threads

import Anthropic from '@anthropic-ai/sdk';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { setupCors } from './utils/cors.js';

// System prompt for title generation
const TITLE_GENERATION_PROMPT = `You are a helpful assistant that generates concise conversation thread titles.

Based on the conversation messages provided, generate:
1. A short, descriptive title (3-6 words max)
2. A one-sentence summary of the conversation topic

Guidelines:
- Titles should be action-oriented when possible (e.g., "Sweet Spot Training Block", "Race Week Prep")
- For training discussions: mention the workout type or training focus
- For accountability discussions: mention the topic (check-in, motivation, planning)
- Keep it natural and conversational, not robotic
- Don't include dates in the title
- Don't use generic titles like "Training Discussion" - be specific

Coach Types:
- "strategist": Training Strategist - focuses on workout planning, performance, training structure
- "pulse": Pulse - focuses on accountability, motivation, check-ins, lifestyle

Examples:
- "Sweet Spot Block Planning" (strategist)
- "VO2max Interval Session" (strategist)
- "Weekly Check-in" (pulse)
- "Race Prep Mindset" (pulse)
- "Rest Day Discussion" (pulse)
- "Threshold Training Focus" (strategist)

Respond with JSON only:
{
  "title": "Short Title Here",
  "summary": "One sentence describing what this conversation is about."
}`;

export default async function handler(req, res) {
  // Setup CORS
  const corsResponse = setupCors(req, res);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (reuse coach rate limit config)
  const rateLimitResult = await rateLimitMiddleware(req, res, {
    key: 'thread-title',
    limit: 30,
    windowMs: 5 * 60 * 1000 // 30 requests per 5 minutes
  });

  if (rateLimitResult) {
    return; // Rate limit response already sent
  }

  try {
    const { messages, coachType } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Format messages for the prompt
    const conversationText = messages
      .slice(0, 4) // Only use first 4 messages for title generation
      .map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
      .join('\n');

    const coachContext = coachType === 'strategist'
      ? 'This is a Training Strategist conversation (workout planning, performance focus).'
      : 'This is a Pulse conversation (accountability, motivation, check-ins).';

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: TITLE_GENERATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${coachContext}\n\nConversation:\n${conversationText}\n\nGenerate a title and summary for this conversation thread.`
        }
      ]
    });

    // Extract text response
    const responseText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON response
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      // Fallback if JSON parsing fails
      console.error('Failed to parse title response:', parseError);
      result = {
        title: 'Conversation',
        summary: 'A conversation with your AI coach.'
      };
    }

    return res.status(200).json({
      title: result.title || 'Conversation',
      summary: result.summary || '',
      usage: response.usage
    });

  } catch (error) {
    console.error('Thread title generation error:', error);

    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60
      });
    }

    return res.status(500).json({
      error: 'Failed to generate thread title',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
