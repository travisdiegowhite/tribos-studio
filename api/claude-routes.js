// Vercel API Route: Secure Claude AI Route Generation
// This moves Claude AI calls server-side to protect API keys

import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
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
        error: 'Server configuration error - AI service not configured'
      });
    }

    // Initialize Claude client (server-side only)
    const claude = new Anthropic({
      apiKey: apiKey,
    });

    // Validate request body
    const { prompt, maxTokens = 2000, temperature = 0.7 } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid prompt is required'
      });
    }

    // Validate prompt length (prevent abuse)
    if (prompt.length > 10000) {
      return res.status(400).json({
        success: false,
        error: `Prompt too long: ${prompt.length} characters (max 10,000)`
      });
    }

    console.log(`✅ Calling Claude API - prompt: ${prompt.length} chars`);

    // Call Claude API
    // Claude Sonnet 4.5 - Best balance of intelligence, speed, and cost
    const model = 'claude-sonnet-4-5-20250929';

    const response = await claude.messages.create({
      model: model,
      max_tokens: Math.min(maxTokens, 3000), // Cap max tokens
      temperature: Math.max(0, Math.min(temperature, 1)), // Clamp temperature
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    console.log('✅ Claude API response received');

    return res.status(200).json({
      success: true,
      content: response.content[0].text,
      usage: response.usage
    });

  } catch (error) {
    console.error('❌ Claude API Error:', {
      status: error.status,
      message: error.message,
      type: error.type
    });

    // Determine user-friendly error message
    let clientError = 'Route generation failed';
    let statusCode = 500;

    if (error.status === 429) {
      clientError = 'Rate limit exceeded. Please try again in a minute.';
      statusCode = 429;
    } else if (error.status === 401 || error.status === 403) {
      clientError = 'AI service authentication error. Please contact support.';
      statusCode = 500;
    } else if (error.status === 400) {
      clientError = 'Invalid request. Please try a simpler prompt.';
      statusCode = 400;
    } else if (error.status >= 500) {
      clientError = 'AI service temporarily unavailable. Please try again.';
      statusCode = 503;
    }

    return res.status(statusCode).json({
      success: false,
      error: clientError,
      errorCode: error.code,
      errorType: error.type
    });
  }
}
