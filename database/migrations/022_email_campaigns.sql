-- Migration: Email Campaigns & Tracking
-- Purpose: Admin batch email campaigns with delivery tracking
-- Security: Admin-only access via service_role

-- ============================================================================
-- EMAIL_CAMPAIGNS TABLE
-- Stores campaign metadata and configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Campaign metadata
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,  -- Optional plain text version

    -- Sender info
    from_name TEXT NOT NULL DEFAULT 'Tribos Studio',
    from_email TEXT NOT NULL DEFAULT 'noreply@tribos.studio',
    reply_to TEXT,

    -- Campaign type
    campaign_type TEXT NOT NULL DEFAULT 'announcement' CHECK (campaign_type IN (
        'announcement',   -- General announcements
        'feature',        -- New feature notification
        'newsletter',     -- Newsletter/updates
        'reengagement',   -- Win-back campaigns
        'beta_invite'     -- Beta invitations
    )),

    -- Audience selection
    audience_type TEXT NOT NULL DEFAULT 'users' CHECK (audience_type IN (
        'users',          -- Registered users (auth.users)
        'beta_signups',   -- Beta signup list
        'both'            -- Combined audience
    )),

    -- Filter criteria (JSONB for flexibility)
    filter_criteria JSONB NOT NULL DEFAULT '{}',
    -- Example: {
    --   "hasActivity": true,
    --   "activityCountMin": 1,
    --   "integrations": ["strava", "garmin"],
    --   "signedUpAfter": "2024-01-01",
    --   "lastSignInWithinDays": 30,
    --   "emailVerified": true,
    --   "betaStatus": "pending"
    -- }

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',          -- Being edited
        'sending',        -- Currently being sent
        'completed',      -- All emails sent
        'cancelled'       -- Cancelled
    )),

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Stats (denormalized for quick access)
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    complained_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,

    -- Audit
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON email_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON email_campaigns(created_by);

-- ============================================================================
-- EMAIL_RECIPIENTS TABLE
-- Individual recipient tracking per campaign
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,

    -- Recipient info
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    recipient_name TEXT,  -- For personalization

    -- Source of this recipient
    source TEXT NOT NULL DEFAULT 'users' CHECK (source IN ('users', 'beta_signups')),

    -- Resend tracking
    resend_email_id TEXT,  -- ID returned from Resend API

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',        -- Not yet sent
        'sent',           -- Sent to Resend
        'delivered',      -- Confirmed delivery
        'opened',         -- Email opened
        'clicked',        -- Link clicked
        'bounced',        -- Bounced (hard or soft)
        'complained',     -- Marked as spam
        'failed'          -- Send failed
    )),

    -- Event timestamps
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    first_opened_at TIMESTAMPTZ,
    first_clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    complained_at TIMESTAMPTZ,

    -- Engagement stats
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,

    -- Error tracking
    error_message TEXT,
    error_code TEXT,

    -- Metadata
    batch_number INTEGER,  -- Which batch this was sent in
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate recipients per campaign
    UNIQUE(campaign_id, email)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign ON email_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_user ON email_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_email ON email_recipients(email);
CREATE INDEX IF NOT EXISTS idx_email_recipients_resend_id ON email_recipients(resend_email_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_status ON email_recipients(status);
CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign_status ON email_recipients(campaign_id, status);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;

-- No client-side RLS policies - admin access only via service_role
COMMENT ON TABLE email_campaigns IS 'Admin email campaigns. Only accessible via service_role.';
COMMENT ON TABLE email_recipients IS 'Campaign recipient tracking. Only accessible via service_role.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON email_campaigns TO service_role;
GRANT ALL ON email_recipients TO service_role;

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_email_campaigns_updated_at ON email_campaigns;
CREATE TRIGGER trigger_email_campaigns_updated_at
    BEFORE UPDATE ON email_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_email_recipients_updated_at ON email_recipients;
CREATE TRIGGER trigger_email_recipients_updated_at
    BEFORE UPDATE ON email_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTION: Update campaign stats from recipients
-- ============================================================================
CREATE OR REPLACE FUNCTION update_campaign_stats(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE email_campaigns
    SET
        sent_count = (SELECT COUNT(*) FROM email_recipients WHERE campaign_id = p_campaign_id AND status != 'pending' AND status != 'failed'),
        delivered_count = (SELECT COUNT(*) FROM email_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered', 'opened', 'clicked')),
        opened_count = (SELECT COUNT(*) FROM email_recipients WHERE campaign_id = p_campaign_id AND first_opened_at IS NOT NULL),
        clicked_count = (SELECT COUNT(*) FROM email_recipients WHERE campaign_id = p_campaign_id AND first_clicked_at IS NOT NULL),
        bounced_count = (SELECT COUNT(*) FROM email_recipients WHERE campaign_id = p_campaign_id AND status = 'bounced'),
        complained_count = (SELECT COUNT(*) FROM email_recipients WHERE campaign_id = p_campaign_id AND status = 'complained'),
        failed_count = (SELECT COUNT(*) FROM email_recipients WHERE campaign_id = p_campaign_id AND status = 'failed'),
        updated_at = NOW()
    WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Increment recipient counter (for webhook updates)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_recipient_counter(p_resend_id TEXT, p_counter TEXT)
RETURNS VOID AS $$
BEGIN
    IF p_counter = 'open_count' THEN
        UPDATE email_recipients
        SET open_count = open_count + 1, updated_at = NOW()
        WHERE resend_email_id = p_resend_id;
    ELSIF p_counter = 'click_count' THEN
        UPDATE email_recipients
        SET click_count = click_count + 1, updated_at = NOW()
        WHERE resend_email_id = p_resend_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
