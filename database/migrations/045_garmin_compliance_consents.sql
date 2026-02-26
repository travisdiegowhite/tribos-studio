-- Migration: Add consent tracking columns for Garmin Developer Program compliance
-- Required by Garmin Connect Developer Program Agreement v8 (Sections 4.5, 5.3, 15.4, 15.10)

-- ToS and Privacy Policy acceptance tracking
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tos_version TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS privacy_version TEXT;

-- AI consent tracking (Section 15.10 - AI transparency and consent)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ai_consent_granted_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ai_consent_withdrawn_at TIMESTAMPTZ;

-- Garmin data transfer consent (Section 4.5)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS garmin_data_consent_at TIMESTAMPTZ;

-- User data rights tracking (Section 15.4)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_deletion_requested_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS data_export_requested_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN user_profiles.tos_accepted_at IS 'Timestamp when user accepted Terms of Service';
COMMENT ON COLUMN user_profiles.tos_version IS 'Version of ToS accepted (e.g., 2026-02)';
COMMENT ON COLUMN user_profiles.privacy_accepted_at IS 'Timestamp when user accepted Privacy Policy';
COMMENT ON COLUMN user_profiles.privacy_version IS 'Version of Privacy Policy accepted (e.g., 2026-02)';
COMMENT ON COLUMN user_profiles.ai_consent_granted_at IS 'Timestamp when user opted in to AI-powered features';
COMMENT ON COLUMN user_profiles.ai_consent_withdrawn_at IS 'Timestamp when user opted out of AI-powered features';
COMMENT ON COLUMN user_profiles.garmin_data_consent_at IS 'Timestamp when user consented to Garmin data transfer';
COMMENT ON COLUMN user_profiles.account_deletion_requested_at IS 'Timestamp when user requested account deletion';
COMMENT ON COLUMN user_profiles.data_export_requested_at IS 'Timestamp of last data export request';
