// Vercel API Route: Strava Webhook Subscription Management
// Used to create, view, and delete the webhook subscription
// This is an admin-only endpoint - one-time setup per application
// Documentation: https://developers.strava.com/docs/webhooks/

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

// CORS configuration
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://cycling-ai-app-v2.vercel.app'];
  }
  return ['http://localhost:3000'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

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
    return res.status(200).end();
  }

  // Verify admin authorization (simple check - you may want to enhance this)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  // Verify the user is authenticated via Supabase
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid authorization token' });
  }

  // For now, any authenticated user can manage webhooks
  // In production, you might want to restrict to specific admin users
  console.log('📋 Webhook subscription request from user:', user.id);

  switch (req.method) {
    case 'GET':
      return await viewSubscription(req, res);
    case 'POST':
      return await createSubscription(req, res);
    case 'DELETE':
      return await deleteSubscription(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * View current webhook subscription
 */
async function viewSubscription(req, res) {
  try {
    console.log('🔍 Viewing Strava webhook subscription...');

    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET
    });

    const response = await fetch(`${STRAVA_API_BASE}/push_subscriptions?${params}`, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to view subscription:', error);
      return res.status(response.status).json({ error: 'Failed to view subscription', details: error });
    }

    const subscriptions = await response.json();
    console.log('✅ Current subscriptions:', subscriptions);

    return res.status(200).json({
      success: true,
      subscriptions: subscriptions,
      hasSubscription: subscriptions.length > 0
    });

  } catch (error) {
    console.error('❌ View subscription error:', error);
    return res.status(500).json({ error: 'Failed to view subscription', details: error.message });
  }
}

/**
 * Create webhook subscription
 */
async function createSubscription(req, res) {
  try {
    const { callback_url } = req.body;

    // Use provided callback URL or default to production URL
    const webhookCallbackUrl = callback_url || 'https://www.tribos.studio/api/strava-webhook';

    console.log('🔔 Creating Strava webhook subscription...');
    console.log('📍 Callback URL:', webhookCallbackUrl);
    console.log('🔑 Verify Token:', VERIFY_TOKEN ? '(set)' : '(NOT SET!)');

    if (!VERIFY_TOKEN) {
      return res.status(500).json({
        error: 'STRAVA_WEBHOOK_VERIFY_TOKEN environment variable is not set'
      });
    }

    if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
      return res.status(500).json({
        error: 'Strava client credentials are not configured'
      });
    }

    // First, check if we already have a subscription
    const checkParams = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET
    });

    const checkResponse = await fetch(`${STRAVA_API_BASE}/push_subscriptions?${checkParams}`, {
      method: 'GET'
    });

    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      if (existing.length > 0) {
        console.log('ℹ️ Subscription already exists:', existing[0]);
        return res.status(200).json({
          success: true,
          message: 'Subscription already exists',
          subscription: existing[0]
        });
      }
    }

    // Create new subscription
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: webhookCallbackUrl,
      verify_token: VERIFY_TOKEN
    });

    const response = await fetch(`${STRAVA_API_BASE}/push_subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const responseText = await response.text();
    console.log('📨 Strava response:', response.status, responseText);

    if (!response.ok) {
      console.error('❌ Failed to create subscription:', responseText);

      // Parse common errors
      let errorMessage = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.errors) {
          errorMessage = errorJson.errors.map(e => `${e.field}: ${e.code}`).join(', ');
        }
      } catch (e) {
        // Use raw text
      }

      return res.status(response.status).json({
        error: 'Failed to create subscription',
        details: errorMessage,
        hint: 'Make sure your callback URL is publicly accessible and responds to GET requests'
      });
    }

    const subscription = JSON.parse(responseText);
    console.log('✅ Subscription created:', subscription);

    return res.status(201).json({
      success: true,
      message: 'Webhook subscription created',
      subscription: subscription
    });

  } catch (error) {
    console.error('❌ Create subscription error:', error);
    return res.status(500).json({ error: 'Failed to create subscription', details: error.message });
  }
}

/**
 * Delete webhook subscription
 */
async function deleteSubscription(req, res) {
  try {
    const { subscription_id } = req.body;

    if (!subscription_id) {
      // First, get the current subscription ID
      const checkParams = new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET
      });

      const checkResponse = await fetch(`${STRAVA_API_BASE}/push_subscriptions?${checkParams}`, {
        method: 'GET'
      });

      if (!checkResponse.ok) {
        return res.status(400).json({ error: 'Could not find subscription to delete' });
      }

      const existing = await checkResponse.json();
      if (existing.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No subscription to delete'
        });
      }

      // Delete the found subscription
      return await doDeleteSubscription(res, existing[0].id);
    }

    return await doDeleteSubscription(res, subscription_id);

  } catch (error) {
    console.error('❌ Delete subscription error:', error);
    return res.status(500).json({ error: 'Failed to delete subscription', details: error.message });
  }
}

/**
 * Actually delete the subscription
 */
async function doDeleteSubscription(res, subscriptionId) {
  console.log('🗑️ Deleting Strava webhook subscription:', subscriptionId);

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET
  });

  const response = await fetch(`${STRAVA_API_BASE}/push_subscriptions/${subscriptionId}?${params}`, {
    method: 'DELETE'
  });

  if (!response.ok && response.status !== 204) {
    const error = await response.text();
    console.error('❌ Failed to delete subscription:', error);
    return res.status(response.status).json({ error: 'Failed to delete subscription', details: error });
  }

  console.log('✅ Subscription deleted');

  return res.status(200).json({
    success: true,
    message: 'Webhook subscription deleted',
    deletedId: subscriptionId
  });
}
