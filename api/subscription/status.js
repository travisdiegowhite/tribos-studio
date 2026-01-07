// Vercel API Route: Subscription Status
// Returns the current user's subscription status and tier

import { createClient } from '@supabase/supabase-js';
import { setupCors } from '../utils/cors.js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate configuration
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
    // Get subscription using the helper function
    const { data: tierData, error: tierError } = await supabase
      .rpc('get_user_subscription_tier', { p_user_id: user.id });

    if (tierError) {
      console.error('Error getting subscription tier:', tierError);
      // Return free tier as fallback
      return res.status(200).json({
        tier: 'free',
        tierName: 'Free',
        status: 'active',
        features: {
          training_plans: true,
          routes: true,
          activity_sync: true,
          basic_analytics: true
        },
        limits: {
          max_active_plans: 1,
          max_routes_per_month: 5,
          activity_history_days: 30,
          ai_coach_sessions: 0
        },
        subscription: null
      });
    }

    const tier = tierData?.[0] || {
      tier_slug: 'free',
      tier_name: 'Free',
      status: 'active',
      features: { training_plans: true, routes: true, activity_sync: true, basic_analytics: true },
      limits: { max_active_plans: 1, max_routes_per_month: 5, activity_history_days: 30, ai_coach_sessions: 0 }
    };

    // Get full subscription details if they exist
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get feature usage for the current period
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const { data: usage } = await supabase
      .from('feature_usage')
      .select('feature, usage_count')
      .eq('user_id', user.id)
      .gte('period_start', periodStart.toISOString().split('T')[0]);

    const usageMap = {};
    (usage || []).forEach(u => {
      usageMap[u.feature] = u.usage_count;
    });

    return res.status(200).json({
      tier: tier.tier_slug,
      tierName: tier.tier_name,
      status: tier.status,
      features: tier.features,
      limits: tier.limits,
      currentPeriodEnd: tier.current_period_end,
      cancelAtPeriodEnd: tier.cancel_at_period_end,
      usage: usageMap,
      subscription: subscription ? {
        stripeCustomerId: subscription.stripe_customer_id,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at
      } : null
    });

  } catch (error) {
    console.error('Subscription status error:', error);
    return res.status(500).json({ error: 'Failed to get subscription status' });
  }
}
