-- Migration 044: User Activation Tracking & Proactive Insights
-- Supports the in-app activation guide and AI-generated coaching insights

-- ============================================================
-- 1. user_activation table
-- ============================================================

CREATE TABLE IF NOT EXISTS user_activation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  steps JSONB DEFAULT '{
    "connect_device": { "completed": false, "completed_at": null },
    "first_sync": { "completed": false, "completed_at": null },
    "first_insight": { "completed": false, "completed_at": null },
    "first_route": { "completed": false, "completed_at": null },
    "first_plan": { "completed": false, "completed_at": null }
  }'::jsonb NOT NULL,
  guide_dismissed BOOLEAN DEFAULT false NOT NULL,
  guide_dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS
ALTER TABLE user_activation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activation"
  ON user_activation FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own activation"
  ON user_activation FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-create activation record on user signup
CREATE OR REPLACE FUNCTION public.create_user_activation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_activation (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_activation
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_activation();


-- ============================================================
-- 2. proactive_insights table
-- ============================================================

CREATE TABLE IF NOT EXISTS proactive_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  insight_text TEXT,  -- NULL while pending generation
  insight_type TEXT NOT NULL CHECK (insight_type IN ('post_ride', 'weekly_summary', 'trend', 'suggestion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,  -- populated on failure
  seen BOOLEAN DEFAULT false NOT NULL,
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS - users can only see completed insights
ALTER TABLE proactive_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completed insights"
  ON proactive_insights FOR SELECT
  USING (auth.uid() = user_id AND status = 'completed');

CREATE POLICY "Users can update own insights (mark seen)"
  ON proactive_insights FOR UPDATE
  USING (auth.uid() = user_id AND status = 'completed')
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_proactive_insights_user_completed
  ON proactive_insights(user_id, created_at DESC)
  WHERE status = 'completed';

CREATE INDEX idx_proactive_insights_unseen
  ON proactive_insights(user_id)
  WHERE seen = false AND status = 'completed';

CREATE INDEX idx_proactive_insights_pending
  ON proactive_insights(status, created_at ASC)
  WHERE status = 'pending';


-- ============================================================
-- 3. Backfill activation records for existing users
-- ============================================================

-- Create activation records for all existing users
INSERT INTO user_activation (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_activation)
ON CONFLICT (user_id) DO NOTHING;

-- Mark connect_device as completed for users with integrations
UPDATE user_activation ua
SET steps = jsonb_set(
  ua.steps,
  '{connect_device}',
  jsonb_build_object('completed', true, 'completed_at', NOW()::text)
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM bike_computer_integrations bci
  WHERE bci.user_id = ua.user_id
);

-- Mark first_sync as completed for users with activities
UPDATE user_activation ua
SET steps = jsonb_set(
  ua.steps,
  '{first_sync}',
  jsonb_build_object('completed', true, 'completed_at', NOW()::text)
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM activities a
  WHERE a.user_id = ua.user_id
);

-- Mark first_route as completed for users with routes
UPDATE user_activation ua
SET steps = jsonb_set(
  ua.steps,
  '{first_route}',
  jsonb_build_object('completed', true, 'completed_at', NOW()::text)
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM routes r
  WHERE r.user_id = ua.user_id
);

-- Mark first_plan as completed for users with training plans
UPDATE user_activation ua
SET steps = jsonb_set(
  ua.steps,
  '{first_plan}',
  jsonb_build_object('completed', true, 'completed_at', NOW()::text)
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM training_plans tp
  WHERE tp.user_id = ua.user_id
);

-- first_insight stays false for all existing users (new feature)
