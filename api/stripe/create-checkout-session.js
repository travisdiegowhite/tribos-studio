// Vercel API Route: Create Stripe Checkout Session
// Creates a checkout session for subscription purchases

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

/**
 * Get or create Stripe customer for user
 */
async function getOrCreateStripeCustomer(user) {
  // Check if user already has a Stripe customer ID
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (subscription?.stripe_customer_id) {
    // Verify customer still exists in Stripe
    try {
      const customer = await stripe.customers.retrieve(subscription.stripe_customer_id);
      if (!customer.deleted) {
        return subscription.stripe_customer_id;
      }
    } catch (err) {
      console.log('Stripe customer not found, creating new one');
    }
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      supabase_user_id: user.id
    }
  });

  // Save customer ID to subscriptions table
  await supabase
    .from('subscriptions')
    .upsert({
      user_id: user.id,
      stripe_customer_id: customer.id,
      tier_slug: 'free',
      status: 'active'
    }, {
      onConflict: 'user_id'
    });

  return customer.id;
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
    const { priceId, successUrl, cancelUrl } = req.body;

    // Use environment variable for price ID if not provided
    const finalPriceId = priceId || process.env.STRIPE_PRICE_ID_PRO;

    if (!finalPriceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user);

    // Determine URLs
    const origin = req.headers.origin || 'https://tribos.studio';
    const finalSuccessUrl = successUrl || `${origin}/settings?subscription=success`;
    const finalCancelUrl = cancelUrl || `${origin}/settings?subscription=canceled`;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: finalPriceId,
          quantity: 1
        }
      ],
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      subscription_data: {
        metadata: {
          supabase_user_id: user.id
        }
      },
      metadata: {
        supabase_user_id: user.id
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Collect billing address for tax purposes
      billing_address_collection: 'auto',
      // Customer can update payment method
      customer_update: {
        address: 'auto',
        name: 'auto'
      }
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Checkout session error:', error);
    return res.status(500).json({
      error: 'Failed to create checkout session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
