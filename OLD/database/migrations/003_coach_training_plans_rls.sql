-- =====================================================
-- COACH TRAINING PLANS RLS POLICIES
-- =====================================================
-- Add RLS policies to allow coaches to create and manage
-- training plans for their athletes

-- =====================================================
-- Allow coaches to create training plans for their athletes
-- =====================================================

CREATE POLICY "Coaches can create training plans for athletes"
  ON training_plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_athlete_relationships
      WHERE coach_id = auth.uid()
        AND athlete_id = training_plans.user_id
        AND status = 'active'
        AND can_assign_workouts = true
    )
  );

-- =====================================================
-- Allow coaches to view their athletes' training plans
-- =====================================================

CREATE POLICY "Coaches can view athlete training plans"
  ON training_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_athlete_relationships
      WHERE coach_id = auth.uid()
        AND athlete_id = training_plans.user_id
        AND status = 'active'
    )
  );

-- =====================================================
-- Allow coaches to update their athletes' training plans
-- =====================================================

CREATE POLICY "Coaches can update athlete training plans"
  ON training_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coach_athlete_relationships
      WHERE coach_id = auth.uid()
        AND athlete_id = training_plans.user_id
        AND status = 'active'
        AND can_assign_workouts = true
    )
  );

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Coach training plans RLS policies created successfully!';
  RAISE NOTICE 'Coaches can now create, view, and update training plans for their athletes';
END $$;
