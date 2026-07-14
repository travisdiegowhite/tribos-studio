// Vercel API Route: Secure Claude AI Route Generation
// This moves Claude AI calls server-side to protect API keys

import Anthropic from '@anthropic-ai/sdk';
import { setupCors } from './utils/cors.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import {
  rateLimitByUser,
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from './utils/rateLimit.js';
import { enforceAiQuota, enforceGlobalAiQuota } from './utils/aiQuota.js';

// Guests (tokenless requests) get a small daily generation allowance per IP;
// the structured 429 below is the client's signal to prompt account creation.
const GUEST_GENERATION_LIMIT = 3;
const GUEST_WINDOW_MINUTES = 24 * 60;

/**
 * Resolve the caller from the Authorization header, if any.
 * Tokenless or invalid-token requests are treated as guests (null) —
 * this endpoint intentionally supports unauthenticated trial traffic.
 */
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    // Auth backend hiccup — degrade to guest treatment rather than failing.
    console.warn('claude-routes: token validation unavailable:', err?.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) {
    return; // Was an OPTIONS request, already handled
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getUserFromAuthHeader(req);

    if (user) {
      const limited = await rateLimitByUser(
        req,
        res,
        RATE_LIMITS.CLAUDE_ROUTES.name,
        user.id,
        RATE_LIMITS.CLAUDE_ROUTES.limit,
        RATE_LIMITS.CLAUDE_ROUTES.windowMinutes
      );
      if (limited) return;
    } else {
      const guestLimit = await checkRateLimit(
        `claude-routes-guest:${getClientIp(req)}`,
        GUEST_GENERATION_LIMIT,
        GUEST_WINDOW_MINUTES
      );
      if (!guestLimit.allowed) {
        const retryAfter = Math.max(
          1,
          Math.ceil((guestLimit.resetAt.getTime() - Date.now()) / 1000)
        );
        res.setHeader('Retry-After', retryAfter.toString());
        return res.status(429).json({
          success: false,
          error: 'guest_generation_cap',
          message: 'Create a free account to keep generating routes.',
          resetAt: guestLimit.resetAt.toISOString(),
        });
      }
    }

    // Daily AI quota — per-user cap for authed users; guests (already capped
    // per-IP above) still count against the global ceiling
    const quotaExceeded = user
      ? await enforceAiQuota(req, res, user.id)
      : await enforceGlobalAiQuota(req, res);
    if (quotaExceeded !== null) return;
    // Validate API key exists
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('🚨 MISSING ANTHROPIC_API_KEY - Check Vercel environment variables!');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error - service not configured'
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
      clientError = 'Service authentication error. Please contact support.';
      statusCode = 500;
    } else if (error.status === 400) {
      clientError = 'Invalid request. Please try a simpler prompt.';
      statusCode = 400;
    } else if (error.status >= 500) {
      clientError = 'Service temporarily unavailable. Please try again.';
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
