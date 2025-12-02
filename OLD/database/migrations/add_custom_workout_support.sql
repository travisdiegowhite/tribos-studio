-- Migration: Add Custom Workout Support
-- Description: Extends workout_templates table to support user-created workouts with privacy controls and sharing
-- Date: 2025-11-22
-- Version: 1.1 (Complete)

-- =====================================================
-- STEP 1: Extend workout_templates table
-- =====================================================

-- Add columns for custom workout support
ALTER TABLE workout_templates
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_system_template BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'climbing', 'anaerobic', 'racing')),
  ADD COLUMN IF NOT EXISTS coach_notes TEXT,
  ADD COLUMN IF NOT EXISTS primary_zone INTEGER CHECK (primary_zone >= 1 AND primary_zone <= 7),
  ADD COLUMN IF NOT EXISTS intensity_factor DECIMAL CHECK (intensity_factor >= 0 AND intensity_factor <= 2.0),
  ADD COLUMN IF NOT EXISTS focus_area TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Mark existing templates as system templates
UPDATE workout_templates
SET is_system_template = true,
    is_public = true
WHERE created_by_user_id IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_workout_templates_creator ON workout_templates(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_workout_templates_category ON workout_templates(category);
CREATE INDEX IF NOT EXISTS idx_workout_templates_system ON workout_templates(is_system_template) WHERE is_system_template = true;
CREATE INDEX IF NOT EXISTS idx_workout_templates_public ON workout_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_workout_templates_focus_area ON workout_templates(focus_area);
CREATE INDEX IF NOT EXISTS idx_workout_templates_tags ON workout_templates USING GIN(tags);

-- Add comments for documentation
COMMENT ON COLUMN workout_templates.created_by_user_id IS 'User who created this workout (NULL for system templates)';
COMMENT ON COLUMN workout_templates.is_system_template IS 'True for library workouts, false for custom workouts';
COMMENT ON COLUMN workout_templates.is_public IS 'Whether workout is publicly visible (future feature)';
COMMENT ON COLUMN workout_templates.category IS 'Workout category for filtering and organization';
COMMENT ON COLUMN workout_templates.coach_notes IS 'Coaching tips and guidance for this workout';
COMMENT ON COLUMN workout_templates.primary_zone IS 'Primary training zone (1-7) for this workout';
COMMENT ON COLUMN workout_templates.intensity_factor IS 'Normalized power intensity factor (IF)';
COMMENT ON COLUMN workout_templates.focus_area IS 'Primary training focus (e.g., aerobic_base, vo2max, threshold)';
COMMENT ON COLUMN workout_templates.tags IS 'Searchable tags for filtering workouts';

-- =====================================================
-- STEP 2: Create workout_shares table
-- =====================================================

CREATE TABLE IF NOT EXISTS workout_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_id UUID REFERENCES workout_templates(id) ON DELETE CASCADE NOT NULL,
  shared_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  can_edit BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Ensure a workout is only shared once with each user
  UNIQUE(workout_id, shared_with_user_id)
);

-- Add indexes for workout_shares
CREATE INDEX IF NOT EXISTS idx_workout_shares_workout ON workout_shares(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_shares_shared_with ON workout_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_workout_shares_shared_by ON workout_shares(shared_by_user_id);

-- Add comment for documentation
COMMENT ON TABLE workout_shares IS 'Tracks which workouts are shared with which users (bidirectional sharing between coaches and athletes)';

-- =====================================================
-- STEP 3: Extend planned_workouts table
-- =====================================================

-- Add template_id to link assigned workouts to templates
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL;

-- Add index for template_id lookups
CREATE INDEX IF NOT EXISTS idx_planned_workouts_template ON planned_workouts(template_id);

-- Add comment
COMMENT ON COLUMN planned_workouts.template_id IS 'Links assigned workout to its template (library or custom workout)';

-- =====================================================
-- STEP 4: Update RLS Policies for workout_templates
-- =====================================================

-- Enable RLS if not already enabled
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- Drop old policy if exists
DROP POLICY IF EXISTS "Anyone can view workout templates" ON workout_templates;

-- Users can view:
-- 1. System templates (library workouts)
-- 2. Their own custom workouts
-- 3. Workouts shared with them
CREATE POLICY "Users can view accessible workouts"
  ON workout_templates FOR SELECT
  USING (
    is_system_template = true  -- Library workouts are always visible
    OR created_by_user_id = auth.uid()  -- Own custom workouts
    OR EXISTS (  -- Workouts shared with user
      SELECT 1 FROM workout_shares
      WHERE workout_shares.workout_id = workout_templates.id
      AND workout_shares.shared_with_user_id = auth.uid()
    )
  );

-- Users can create custom workouts (not system templates)
CREATE POLICY "Users can create custom workouts"
  ON workout_templates FOR INSERT
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND is_system_template = false
  );

-- Users can update only their own custom workouts
CREATE POLICY "Users can update own custom workouts"
  ON workout_templates FOR UPDATE
  USING (created_by_user_id = auth.uid() AND is_system_template = false)
  WITH CHECK (created_by_user_id = auth.uid() AND is_system_template = false);

-- Users can delete only their own custom workouts
CREATE POLICY "Users can delete own custom workouts"
  ON workout_templates FOR DELETE
  USING (created_by_user_id = auth.uid() AND is_system_template = false);

-- =====================================================
-- STEP 5: Create RLS Policies for workout_shares
-- =====================================================

-- Enable RLS
ALTER TABLE workout_shares ENABLE ROW LEVEL SECURITY;

-- Users can view shares where they are either the sharer or sharee
CREATE POLICY "Users can view their workout shares"
  ON workout_shares FOR SELECT
  USING (
    shared_by_user_id = auth.uid()
    OR shared_with_user_id = auth.uid()
  );

-- Users can share their own workouts with others
-- Must be owner of the workout
-- For coaches: Can only share with active athletes
-- For athletes: Can share with active coaches
CREATE POLICY "Users can share their own workouts"
  ON workout_shares FOR INSERT
  WITH CHECK (
    shared_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM workout_templates
      WHERE workout_templates.id = workout_shares.workout_id
      AND workout_templates.created_by_user_id = auth.uid()
    )
    AND (
      -- Coaches can share with their active athletes
      EXISTS (
        SELECT 1 FROM coach_athlete_relationships
        WHERE coach_id = auth.uid()
        AND athlete_id = workout_shares.shared_with_user_id
        AND status = 'active'
      )
      OR
      -- Athletes can share with their active coaches
      EXISTS (
        SELECT 1 FROM coach_athlete_relationships
        WHERE athlete_id = auth.uid()
        AND coach_id = workout_shares.shared_with_user_id
        AND status = 'active'
      )
    )
  );

-- Users can delete shares they created
CREATE POLICY "Users can delete their shares"
  ON workout_shares FOR DELETE
  USING (shared_by_user_id = auth.uid());

-- =====================================================
-- STEP 6: Add helpful database functions
-- =====================================================

-- Function to get all accessible workouts for a user
CREATE OR REPLACE FUNCTION get_accessible_workouts(user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  difficulty_level TEXT,
  duration INTEGER,
  target_tss INTEGER,
  intensity_factor DECIMAL,
  focus_area TEXT,
  tags TEXT[],
  is_system_template BOOLEAN,
  created_by_user_id UUID,
  shared_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wt.id,
    wt.name,
    wt.category,
    wt.difficulty_level,
    wt.duration,
    wt.target_tss,
    wt.intensity_factor,
    wt.focus_area,
    wt.tags,
    wt.is_system_template,
    wt.created_by_user_id,
    CASE
      WHEN ws.shared_by_user_id IS NOT NULL THEN up.display_name
      ELSE NULL
    END AS shared_by
  FROM workout_templates wt
  LEFT JOIN workout_shares ws ON ws.workout_id = wt.id AND ws.shared_with_user_id = user_id
  LEFT JOIN user_profiles up ON up.id = ws.shared_by_user_id
  WHERE
    wt.is_system_template = true
    OR wt.created_by_user_id = user_id
    OR ws.shared_with_user_id = user_id
  ORDER BY
    wt.is_system_template DESC,
    wt.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count user's custom workouts
CREATE OR REPLACE FUNCTION count_user_custom_workouts(user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM workout_templates
    WHERE created_by_user_id = user_id
    AND is_system_template = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count workouts shared by user
CREATE OR REPLACE FUNCTION count_workouts_shared_by_user(user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(DISTINCT workout_id)
    FROM workout_shares
    WHERE shared_by_user_id = user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search workouts by tags
CREATE OR REPLACE FUNCTION search_workouts_by_tag(user_id UUID, search_tag TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  difficulty_level TEXT,
  duration INTEGER,
  target_tss INTEGER,
  tags TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wt.id,
    wt.name,
    wt.category,
    wt.difficulty_level,
    wt.duration,
    wt.target_tss,
    wt.tags
  FROM workout_templates wt
  LEFT JOIN workout_shares ws ON ws.workout_id = wt.id AND ws.shared_with_user_id = user_id
  WHERE
    (wt.is_system_template = true OR wt.created_by_user_id = user_id OR ws.shared_with_user_id = user_id)
    AND search_tag = ANY(wt.tags)
  ORDER BY
    wt.is_system_template DESC,
    wt.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VERIFICATION QUERIES (for testing)
-- =====================================================

-- To verify migration success, run these queries:

-- 1. Check new columns added
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'workout_templates'
-- AND column_name IN ('created_by_user_id', 'is_system_template', 'is_public', 'category', 'coach_notes', 'primary_zone', 'intensity_factor', 'focus_area', 'tags');

-- 2. Check workout_shares table created
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'workout_shares';

-- 3. Check indexes created
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('workout_templates', 'workout_shares', 'planned_workouts');

-- 4. Check RLS policies
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename IN ('workout_templates', 'workout_shares');

-- 5. Check functions created
-- SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%workout%';

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================

-- To rollback this migration:
-- DROP FUNCTION IF EXISTS get_accessible_workouts(UUID);
-- DROP FUNCTION IF EXISTS count_user_custom_workouts(UUID);
-- DROP FUNCTION IF EXISTS count_workouts_shared_by_user(UUID);
-- DROP FUNCTION IF EXISTS search_workouts_by_tag(UUID, TEXT);
-- DROP TABLE IF EXISTS workout_shares CASCADE;
-- ALTER TABLE planned_workouts DROP COLUMN IF EXISTS template_id;
-- ALTER TABLE workout_templates
--   DROP COLUMN IF EXISTS created_by_user_id,
--   DROP COLUMN IF EXISTS is_system_template,
--   DROP COLUMN IF EXISTS is_public,
--   DROP COLUMN IF EXISTS category,
--   DROP COLUMN IF EXISTS coach_notes,
--   DROP COLUMN IF EXISTS primary_zone,
--   DROP COLUMN IF EXISTS intensity_factor,
--   DROP COLUMN IF EXISTS focus_area,
--   DROP COLUMN IF EXISTS tags;
