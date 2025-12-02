// Vercel API Route: AI Coach Conversation History
// Manages CRUD operations for chat history

import { createClient } from '@supabase/supabase-js';
// import { rateLimitMiddleware } from './utils/rateLimit.js'; // Disabled until SUPABASE_SERVICE_KEY configured

// CORS helper
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

/**
 * Initialize Supabase client with user's auth context
 */
function getSupabaseClient(req) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
  }

  const client = createClient(supabaseUrl, supabaseKey);

  // Extract auth token from Authorization header if present
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Set the user's session for RLS to work
    client.auth.setSession({ access_token: token, refresh_token: '' });
  }

  return client;
}

/**
 * Main handler
 */
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
    return res.status(200).end();
  }

  try {
    const supabase = getSupabaseClient(req);

    // Route based on HTTP method
    switch (req.method) {
      case 'GET':
        return await handleGetHistory(req, res, supabase);
      case 'POST':
        return await handleSaveMessage(req, res, supabase);
      case 'DELETE':
        return await handleDeleteMessage(req, res, supabase);
      default:
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Coach history API error:', error);

    // Provide helpful error messages
    let errorMessage = error.message || 'Unknown error';
    let hint = '';

    if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
      hint = 'The ai_coach_conversations table does not exist. Run migration 003_ai_coach_conversations.sql in Supabase.';
    } else if (errorMessage.includes('Missing Supabase configuration')) {
      hint = 'Add SUPABASE_URL and SUPABASE_ANON_KEY to Vercel environment variables.';
    } else if (errorMessage.includes('row-level security')) {
      hint = 'Check RLS policies on ai_coach_conversations table.';
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: errorMessage,
      hint: hint,
      stack: error.stack
    });
  }
}

/**
 * GET /api/coach-history - Fetch conversation history
 * Query params:
 *   - user_id (required)
 *   - include_archived (boolean, default: false)
 *   - topic (filter by topic)
 *   - limit (default: 100)
 *   - offset (for pagination, default: 0)
 */
async function handleGetHistory(req, res, supabase) {
  const {
    user_id,
    include_archived = 'false',
    topic,
    limit = '100',
    offset = '0'
  } = req.query;

  // Validate user_id
  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: 'user_id is required'
    });
  }

  // Rate limiting (20 requests per 5 minutes)
  // Temporarily disabled until SUPABASE_SERVICE_KEY is configured
  // const rateLimitResult = await rateLimitMiddleware(req, res, 'COACH_HISTORY_GET', 20, 5);
  // if (rateLimitResult !== null) {
  //   return;
  // }

  try {
    // Build query
    let query = supabase
      .from('ai_coach_conversations')
      .select('*', { count: 'exact' })
      .eq('user_id', user_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Filter by archived status
    if (include_archived === 'false') {
      query = query.eq('is_archived', false);
    }

    // Filter by topic if specified
    if (topic && ['workouts', 'recovery', 'metrics', 'planning', 'general'].includes(topic)) {
      query = query.eq('topic', topic);
    }

    // Pagination
    const limitNum = Math.min(parseInt(limit, 10), 200); // Max 200 messages
    const offsetNum = parseInt(offset, 10);
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching conversation history:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch conversation history'
      });
    }

    console.log(`✅ Fetched ${data.length} messages for user ${user_id}`);

    return res.status(200).json({
      success: true,
      data: data,
      count: count,
      hasMore: count > (offsetNum + data.length)
    });

  } catch (error) {
    console.error('Error in handleGetHistory:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation history'
    });
  }
}

/**
 * POST /api/coach-history - Save a message to conversation history
 * Body:
 *   - user_id (required)
 *   - role (required: 'user' or 'assistant')
 *   - content (required)
 *   - workout_recommendations (optional)
 *   - actions (optional)
 *   - training_context (optional)
 *   - topic (optional, will be auto-classified if not provided)
 */
async function handleSaveMessage(req, res, supabase) {
  const {
    user_id,
    role,
    content,
    workout_recommendations,
    actions,
    training_context,
    topic
  } = req.body;

  // Validate required fields
  if (!user_id || !role || !content) {
    return res.status(400).json({
      success: false,
      error: 'user_id, role, and content are required'
    });
  }

  if (!['user', 'assistant', 'system'].includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'role must be user, assistant, or system'
    });
  }

  if (content.length > 10000) {
    return res.status(400).json({
      success: false,
      error: 'content exceeds maximum length of 10,000 characters'
    });
  }

  // Rate limiting (30 requests per 5 minutes - allows for rapid conversation)
  // Temporarily disabled until SUPABASE_SERVICE_KEY is configured
  // const rateLimitResult = await rateLimitMiddleware(req, res, 'COACH_HISTORY_POST', 30, 5);
  // if (rateLimitResult !== null) {
  //   return;
  // }

  try {
    // Build message object
    const message = {
      user_id,
      role,
      content,
      workout_recommendations: workout_recommendations || null,
      actions: actions || null,
      training_context: training_context || null,
      topic: topic || null // Will be auto-classified by trigger if null
    };

    const { data, error } = await supabase
      .from('ai_coach_conversations')
      .insert([message])
      .select()
      .single();

    if (error) {
      console.error('Error saving message:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to save message'
      });
    }

    console.log(`✅ Saved ${role} message for user ${user_id}, topic: ${data.topic}`);

    return res.status(201).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Error in handleSaveMessage:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save message'
    });
  }
}

/**
 * DELETE /api/coach-history - Soft-delete a message
 * Body:
 *   - user_id (required)
 *   - message_id (required)
 */
async function handleDeleteMessage(req, res, supabase) {
  const { user_id, message_id } = req.body;

  // Validate required fields
  if (!user_id || !message_id) {
    return res.status(400).json({
      success: false,
      error: 'user_id and message_id are required'
    });
  }

  // Rate limiting (10 deletes per 5 minutes)
  // Temporarily disabled until SUPABASE_SERVICE_KEY is configured
  // const rateLimitResult = await rateLimitMiddleware(req, res, 'COACH_HISTORY_DELETE', 10, 5);
  // if (rateLimitResult !== null) {
  //   return;
  // }

  try {
    // Soft delete: Set deleted_at timestamp
    const { data, error } = await supabase
      .from('ai_coach_conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', message_id)
      .eq('user_id', user_id) // Ensure user owns this message
      .is('deleted_at', null) // Don't re-delete
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - message not found or not owned by user
        return res.status(404).json({
          success: false,
          error: 'Message not found or already deleted'
        });
      }

      console.error('Error deleting message:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete message'
      });
    }

    console.log(`✅ Soft-deleted message ${message_id} for user ${user_id}`);

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Error in handleDeleteMessage:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    });
  }
}
