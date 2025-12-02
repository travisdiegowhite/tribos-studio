-- Beta Feedback Schema
-- Stores feedback, bug reports, and feature requests from beta users

CREATE TABLE IF NOT EXISTS beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Feedback details
  feedback_type VARCHAR(50) NOT NULL CHECK (feedback_type IN ('bug', 'feature', 'improvement', 'question', 'general')),
  message TEXT NOT NULL,

  -- Context information
  page_url TEXT, -- Current page when feedback was submitted
  user_agent TEXT, -- Browser/device info
  screenshot_url TEXT, -- Optional screenshot URL

  -- Metadata
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'in_progress', 'completed', 'wont_fix')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_id ON beta_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON beta_feedback(status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_type ON beta_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created_at ON beta_feedback(created_at DESC);

-- Enable Row Level Security
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own feedback
CREATE POLICY "Users can insert their own feedback"
  ON beta_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
  ON beta_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for admin access)
CREATE POLICY "Service role can manage all feedback"
  ON beta_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_beta_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER beta_feedback_updated_at_trigger
  BEFORE UPDATE ON beta_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_beta_feedback_updated_at();

-- Optional: Function to get feedback stats
CREATE OR REPLACE FUNCTION get_beta_feedback_stats(time_period INTERVAL DEFAULT '30 days')
RETURNS TABLE (
  total_feedback BIGINT,
  bugs BIGINT,
  features BIGINT,
  improvements BIGINT,
  new_count BIGINT,
  reviewed_count BIGINT,
  completed_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_feedback,
    COUNT(*) FILTER (WHERE feedback_type = 'bug')::BIGINT as bugs,
    COUNT(*) FILTER (WHERE feedback_type = 'feature')::BIGINT as features,
    COUNT(*) FILTER (WHERE feedback_type = 'improvement')::BIGINT as improvements,
    COUNT(*) FILTER (WHERE status = 'new')::BIGINT as new_count,
    COUNT(*) FILTER (WHERE status = 'reviewed')::BIGINT as reviewed_count,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed_count
  FROM beta_feedback
  WHERE created_at >= NOW() - time_period;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
