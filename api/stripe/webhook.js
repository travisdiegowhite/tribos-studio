// Vercel API Route: Stripe Webhook Handler
// Handles subscription lifecycle events from Stripe

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service key for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Stripe webhook secret for signature verification
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Verify Stripe webhook signature
 * We do manual verification to avoid importing full Stripe SDK in serverless
 */
async function verifyStripeSignature(payload, signature) {
  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return false;
  }

  try {
    const crypto = await import('crypto');
    const elements = signature.split(',');
    const signatureElements = {};

    for (const element of elements) {
      const [key, value] = element.split('=');
      signatureElements[key] = value;
    }

    const timestamp = signatureElements['t'];
    const expectedSignature = signatureElements['v1'];

    if (!timestamp || !expectedSignature) {
      return false;
    }

    // Check timestamp is within 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
      console.error('Webhook timestamp too old');
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const computedSignature = crypto
      .createHmac('sha256', endpointSecret)
      .update(signedPayload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Log webhook event for debugging and idempotency
 */
async function logWebhookEvent(eventId, eventType, data, processed = false, error = null) {
  try {
    await supabase
      .from('stripe_webhook_log')
      .upsert({
        stripe_event_id: eventId,
        event_type: eventType,
        data,
        processed,
        error,
        processed_at: processed ? new Date().toISOString() : null
      }, {
        onConflict: 'stripe_event_id'
      });
  } catch (err) {
    console.error('Failed to log webhook event:', err);
  }
}

/**
 * Check if event was already processed (idempotency)
 */
async function isEventProcessed(eventId) {
  const { data } = await supabase
    .from('stripe_webhook_log')
    .select('processed')
    .eq('stripe_event_id', eventId)
    .single();

  return data?.processed === true;
}

/**
 * Get or create subscription record for a user
 */
async function getOrCreateSubscription(userId, stripeCustomerId) {
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) {
    return existing;
  }

  const { data: newSub, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      tier_slug: 'free',
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }

  return newSub;
}

/**
 * Find user by Stripe customer ID or email
 */
async function findUserByStripeCustomer(customerId, customerEmail) {
  // First try by customer ID in subscriptions table
  const { data: subData } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (subData) {
    return subData.user_id;
  }

  // Fall back to finding by email
  if (customerEmail) {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email?.toLowerCase() === customerEmail.toLowerCase());
    if (user) {
      return user.id;
    }
  }

  return null;
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(session) {
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const customerEmail = session.customer_email || session.customer_details?.email;

  // Find the user
  const userId = await findUserByStripeCustomer(customerId, customerEmail);

  if (!userId) {
    console.error('No user found for checkout session:', { customerId, customerEmail });
    return;
  }

  // Update subscription record
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      tier_slug: 'pro', // Will be refined by subscription.updated event
      status: 'active',
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Error updating subscription on checkout:', error);
    throw error;
  }

  console.log(`Checkout completed for user ${userId}`);
}

/**
 * Handle customer.subscription.created/updated events
 */
async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const priceId = subscription.items?.data?.[0]?.price?.id;

  // Map status to our status
  const statusMap = {
    'active': 'active',
    'trialing': 'trialing',
    'past_due': 'past_due',
    'canceled': 'canceled',
    'unpaid': 'unpaid',
    'incomplete': 'incomplete',
    'incomplete_expired': 'expired'
  };

  // Determine tier from price ID
  let tierSlug = 'free';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
    tierSlug = 'pro';
  }
  // For active subscriptions with any paid price, default to pro
  if (status === 'active' && priceId) {
    tierSlug = 'pro';
  }

  // Find user
  const { data: subData } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!subData) {
    console.error('No subscription record found for customer:', customerId);
    return;
  }

  // Update subscription
  const { error } = await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      tier_slug: tierSlug,
      status: statusMap[status] || status,
      current_period_start: subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
      trial_start: subscription.trial_start
        ? new Date(subscription.trial_start * 1000).toISOString()
        : null,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }

  console.log(`Subscription updated for customer ${customerId}: ${tierSlug} (${status})`);
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  // Downgrade to free tier
  const { error } = await supabase
    .from('subscriptions')
    .update({
      tier_slug: 'free',
      status: 'canceled',
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('Error handling subscription deletion:', error);
    throw error;
  }

  console.log(`Subscription canceled for customer ${customerId}`);
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handleInvoicePaymentSucceeded(invoice) {
  const customerId = invoice.customer;

  // Find user
  const { data: subData } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!subData) {
    console.log('No subscription found for invoice, may be a new customer');
    return;
  }

  // Record payment in billing history
  const { error } = await supabase
    .from('billing_history')
    .insert({
      user_id: subData.user_id,
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: invoice.payment_intent,
      amount_cents: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      description: invoice.lines?.data?.[0]?.description || 'Subscription payment',
      invoice_url: invoice.hosted_invoice_url,
      receipt_url: invoice.receipt_url
    });

  if (error) {
    console.error('Error recording payment:', error);
  }

  console.log(`Payment recorded for user ${subData.user_id}: ${invoice.amount_paid} ${invoice.currency}`);
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(invoice) {
  const customerId = invoice.customer;

  // Update subscription status to past_due
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('Error updating subscription on payment failure:', error);
  }

  console.log(`Payment failed for customer ${customerId}`);
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate configuration
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Get raw body for signature verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const signature = req.headers['stripe-signature'];

    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && endpointSecret) {
      const isValid = await verifyStripeSignature(rawBody, signature);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventId = event.id;
    const eventType = event.type;

    console.log(`Received Stripe webhook: ${eventType} (${eventId})`);

    // Check idempotency
    if (await isEventProcessed(eventId)) {
      console.log(`Event ${eventId} already processed, skipping`);
      return res.status(200).json({ received: true, skipped: true });
    }

    // Log event
    await logWebhookEvent(eventId, eventType, event.data);

    // Handle event
    try {
      switch (eventType) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object);
          break;

        default:
          console.log(`Unhandled event type: ${eventType}`);
      }

      // Mark as processed
      await logWebhookEvent(eventId, eventType, event.data, true);

    } catch (handlerError) {
      console.error(`Error handling ${eventType}:`, handlerError);
      await logWebhookEvent(eventId, eventType, event.data, false, handlerError.message);
      // Still return 200 to prevent Stripe retries for business logic errors
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: 'Webhook processing failed' });
  }
}

// Vercel config to get raw body
export const config = {
  api: {
    bodyParser: false
  }
};
