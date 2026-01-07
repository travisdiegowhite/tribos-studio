// Vercel API Route: Stripe Customer Portal
// Creates a portal session for subscription management

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { setupCors } from '../utils/cors.js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Verify user from JWT token
 */
async function verifyUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization token provided' };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  return { user, error: null };
}

export default async function handler(req, res) {
  // Handle CORS
  if (setupCors(req, res)) {
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate configuration
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Verify user
  const { user, error: authError } = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: authError || 'Unauthorized' });
  }

  try {
    // Get user's Stripe customer ID
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription?.stripe_customer_id) {
      return res.status(400).json({
        error: 'No subscription found',
        message: 'You need to subscribe first before accessing the billing portal'
      });
    }

    const { returnUrl } = req.body;
    const origin = req.headers.origin || 'https://tribos.studio';
    const finalReturnUrl = returnUrl || `${origin}/settings`;

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: finalReturnUrl
    });

    return res.status(200).json({
      url: portalSession.url
    });

  } catch (error) {
    console.error('Portal session error:', error);
    return res.status(500).json({
      error: 'Failed to create portal session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
