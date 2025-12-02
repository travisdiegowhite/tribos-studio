// Vercel API Route: Secure Claude AI Route Generation
// This moves Claude AI calls server-side to protect API keys

import Anthropic from '@anthropic-ai/sdk';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';

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
        error: 'Server configuration error - AI service not configured'
      });
    }

    console.log('✅ ANTHROPIC_API_KEY found, length:', apiKey.length);

    // Initialize Claude client (server-side only)
    const claude = new Anthropic({
      apiKey: apiKey,
    });

    // Validate request body
    const { prompt, maxTokens = 2000, temperature = 0.7 } = req.body;

    console.log('📝 Request validation:', {
      hasPrompt: !!prompt,
      promptType: typeof prompt,
      promptLength: prompt?.length || 0,
      maxTokens,
      temperature
    });

    if (!prompt || typeof prompt !== 'string') {
      console.error('❌ Invalid prompt:', { hasPrompt: !!prompt, type: typeof prompt });
      return res.status(400).json({
        success: false,
        error: 'Valid prompt is required'
      });
    }

    // Validate prompt length (prevent abuse)
    if (prompt.length > 10000) {
      console.error('❌ Prompt too long:', prompt.length);
      return res.status(400).json({
        success: false,
        error: `Prompt too long: ${prompt.length} characters (max 10,000)`
      });
    }

    if (prompt.length === 0) {
      console.error('❌ Empty prompt');
      return res.status(400).json({
        success: false,
        error: 'Prompt cannot be empty'
      });
    }

    // Rate limiting check
    const rateLimitResult = await rateLimitMiddleware(
      req,
      res,
      RATE_LIMITS.CLAUDE_ROUTES.name,
      RATE_LIMITS.CLAUDE_ROUTES.limit,
      RATE_LIMITS.CLAUDE_ROUTES.windowMinutes
    );

    // If rate limit exceeded, middleware already sent 429 response
    if (rateLimitResult !== null) {
      return;
    }

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.connection.remoteAddress;
    console.log(`✅ Calling Claude API - IP: ${clientIP}, prompt: ${prompt.length} chars, first 100 chars: "${prompt.substring(0, 100)}..."`);

    // Call Claude API
    // Use the latest Claude model (as of Nov 2025)
    // Claude Sonnet 4.5 - released Sept 29, 2025
    // Anthropic recommends this as the best balance of intelligence, speed, and cost
    // Exceptional performance in coding and agentic tasks
    const model = 'claude-sonnet-4-5-20250929';

    console.log('🤖 Calling Claude API with model:', model);

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

    console.log('✅ Claude API response received, content length:', response.content[0].text.length);

    return res.status(200).json({
      success: true,
      content: response.content[0].text,
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
    let clientError = 'Route generation failed';
    let statusCode = 500;
    let errorDetails = {};

    if (error.status === 429) {
      clientError = 'Rate limit exceeded. Please try again in a minute.';
      statusCode = 429;
      errorDetails = { retryAfter: 60 };
    } else if (error.status === 401 || error.status === 403) {
      clientError = 'AI service authentication error. Please contact support.';
      statusCode = 500; // Don't expose auth details to client
      console.error('🚨 ANTHROPIC_API_KEY issue - Check Vercel env vars!');
    } else if (error.status === 400) {
      clientError = 'Invalid request. Please try a simpler prompt.';
      statusCode = 400;
    } else if (error.status >= 400 && error.status < 500) {
      clientError = 'Invalid request to AI service';
      statusCode = 400;
    } else if (error.status >= 500) {
      clientError = 'AI service temporarily unavailable. Please try manual mode.';
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