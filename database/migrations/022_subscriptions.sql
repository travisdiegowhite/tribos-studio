-- Migration: Subscriptions and Billing
-- Description: Add subscription management tables for Stripe integration
-- Date: 2025-01-07

-- ============================================================================
-- SUBSCRIPTION TIERS (configuration table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_tiers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price_monthly_cents INTEGER NOT NULL DEFAULT 0,
    stripe_price_id TEXT,
    features JSONB DEFAULT '{}',
    limits JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tiers
INSERT INTO subscription_tiers (name, slug, description, price_monthly_cents, features, limits, sort_order) VALUES
(
    'Free',
    'free',
    'Get started with basic training tools',
    0,
    '{"training_plans": true, "routes": true, "activity_sync": true, "basic_analytics": true}',
    '{"max_active_plans": 1, "max_routes_per_month": 5, "activity_history_days": 30, "ai_coach_sessions": 0}',
    0
),
(
    'Pro',
    'pro',
    'Unlimited training with AI coaching',
    1499,
    '{"training_plans": true, "routes": true, "activity_sync": true, "basic_analytics": true, "advanced_analytics": true, "ai_coach": true, "realtime_sync": true, "priority_support": true}',
    '{"max_active_plans": -1, "max_routes_per_month": -1, "activity_history_days": -1, "ai_coach_sessions": -1}',
    1
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- USER SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier_id UUID REFERENCES subscription_tiers(id),
    tier_slug TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create indexes for efficient querying
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_tier ON subscriptions(tier_slug);

-- ============================================================================
-- FEATURE USAGE TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, feature, period_start)
);

CREATE INDEX idx_feature_usage_user ON feature_usage(user_id);
CREATE INDEX idx_feature_usage_user_feature ON feature_usage(user_id, feature);
CREATE INDEX idx_feature_usage_period ON feature_usage(period_start, period_end);

-- ============================================================================
-- BILLING HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT,
    stripe_invoice_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT NOT NULL,
    description TEXT,
    invoice_url TEXT,
    receipt_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_billing_history_user ON billing_history(user_id);
CREATE INDEX idx_billing_history_created ON billing_history(created_at DESC);

-- ============================================================================
-- STRIPE WEBHOOK LOG (for debugging and idempotency)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_webhook_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stripe_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    data JSONB,
    processed BOOLEAN DEFAULT false,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_stripe_webhook_event_id ON stripe_webhook_log(stripe_event_id);
CREATE INDEX idx_stripe_webhook_type ON stripe_webhook_log(event_type);
CREATE INDEX idx_stripe_webhook_processed ON stripe_webhook_log(processed);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Subscription tiers are public (read-only for all)
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active subscription tiers"
    ON subscription_tiers
    FOR SELECT
    USING (is_active = true);

-- Subscriptions - users can only view their own
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
    ON subscriptions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Feature usage - users can view their own
ALTER TABLE feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feature usage"
    ON feature_usage
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Billing history - users can view their own
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own billing history"
    ON billing_history
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Webhook log - service role only (no RLS policies for users)
ALTER TABLE stripe_webhook_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get user's current tier with limits
CREATE OR REPLACE FUNCTION get_user_subscription_tier(p_user_id UUID)
RETURNS TABLE (
    tier_slug TEXT,
    tier_name TEXT,
    status TEXT,
    features JSONB,
    limits JSONB,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(s.tier_slug, 'free') as tier_slug,
        COALESCE(t.name, 'Free') as tier_name,
        COALESCE(s.status, 'active') as status,
        COALESCE(t.features, '{"training_plans": true, "routes": true, "activity_sync": true, "basic_analytics": true}'::jsonb) as features,
        COALESCE(t.limits, '{"max_active_plans": 1, "max_routes_per_month": 5, "activity_history_days": 30, "ai_coach_sessions": 0}'::jsonb) as limits,
        s.current_period_end,
        COALESCE(s.cancel_at_period_end, false) as cancel_at_period_end
    FROM subscriptions s
    LEFT JOIN subscription_tiers t ON t.slug = s.tier_slug
    WHERE s.user_id = p_user_id
    UNION ALL
    SELECT
        'free'::TEXT,
        'Free'::TEXT,
        'active'::TEXT,
        '{"training_plans": true, "routes": true, "activity_sync": true, "basic_analytics": true}'::jsonb,
        '{"max_active_plans": 1, "max_routes_per_month": 5, "activity_history_days": 30, "ai_coach_sessions": 0}'::jsonb,
        NULL::TIMESTAMPTZ,
        false
    WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = p_user_id)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check feature access
CREATE OR REPLACE FUNCTION check_feature_access(p_user_id UUID, p_feature TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_features JSONB;
BEGIN
    SELECT features INTO v_features
    FROM get_user_subscription_tier(p_user_id);

    RETURN COALESCE((v_features->>p_feature)::boolean, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and increment feature usage
CREATE OR REPLACE FUNCTION check_feature_limit(p_user_id UUID, p_feature TEXT, p_increment BOOLEAN DEFAULT false)
RETURNS TABLE (
    allowed BOOLEAN,
    current_usage INTEGER,
    max_allowed INTEGER,
    remaining INTEGER
) AS $$
DECLARE
    v_limits JSONB;
    v_limit_key TEXT;
    v_max_allowed INTEGER;
    v_current_usage INTEGER;
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- Get user's limits
    SELECT limits INTO v_limits
    FROM get_user_subscription_tier(p_user_id);

    -- Map feature to limit key
    v_limit_key := CASE p_feature
        WHEN 'routes' THEN 'max_routes_per_month'
        WHEN 'training_plans' THEN 'max_active_plans'
        WHEN 'ai_coach' THEN 'ai_coach_sessions'
        ELSE p_feature
    END;

    v_max_allowed := COALESCE((v_limits->>v_limit_key)::integer, 0);

    -- -1 means unlimited
    IF v_max_allowed = -1 THEN
        RETURN QUERY SELECT true, 0, -1, -1;
        RETURN;
    END IF;

    -- Calculate current period (monthly)
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;

    -- Get or create usage record
    INSERT INTO feature_usage (user_id, feature, usage_count, period_start, period_end)
    VALUES (p_user_id, p_feature, 0, v_period_start, v_period_end)
    ON CONFLICT (user_id, feature, period_start) DO NOTHING;

    -- Get current usage
    SELECT fu.usage_count INTO v_current_usage
    FROM feature_usage fu
    WHERE fu.user_id = p_user_id
      AND fu.feature = p_feature
      AND fu.period_start = v_period_start;

    v_current_usage := COALESCE(v_current_usage, 0);

    -- Increment if requested and allowed
    IF p_increment AND v_current_usage < v_max_allowed THEN
        UPDATE feature_usage fu
        SET usage_count = usage_count + 1, updated_at = NOW()
        WHERE fu.user_id = p_user_id
          AND fu.feature = p_feature
          AND fu.period_start = v_period_start;

        v_current_usage := v_current_usage + 1;
    END IF;

    RETURN QUERY SELECT
        v_current_usage < v_max_allowed OR (p_increment AND v_current_usage <= v_max_allowed),
        v_current_usage,
        v_max_allowed,
        GREATEST(0, v_max_allowed - v_current_usage);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feature_usage_updated_at
    BEFORE UPDATE ON feature_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_tiers_updated_at
    BEFORE UPDATE ON subscription_tiers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE subscription_tiers IS 'Available subscription plans with pricing and feature limits';
COMMENT ON TABLE subscriptions IS 'User subscription records linked to Stripe';
COMMENT ON TABLE feature_usage IS 'Monthly feature usage tracking for free tier limits';
COMMENT ON TABLE billing_history IS 'Payment history for users';
COMMENT ON TABLE stripe_webhook_log IS 'Log of Stripe webhook events for debugging and idempotency';
COMMENT ON FUNCTION get_user_subscription_tier IS 'Get user subscription tier with features and limits (returns free tier for users without subscription)';
COMMENT ON FUNCTION check_feature_access IS 'Check if user has access to a specific feature based on their tier';
COMMENT ON FUNCTION check_feature_limit IS 'Check if user is within their usage limits and optionally increment usage';
