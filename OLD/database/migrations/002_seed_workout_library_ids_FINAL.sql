-- Migration: Seed Workout Templates with Library IDs (FINAL - Actually Bulletproof)
-- Date: 2025-11-24
-- Description: Maps workout_templates to workout library IDs from src/data/workoutLibrary.js
-- IMPORTANT: This migration is COMPLETELY IDEMPOTENT and handles existing library_ids

-- ============================================================
-- Step 1: Report current state
-- ============================================================

DO $$
DECLARE
  template_count INTEGER;
  mapped_count INTEGER;
  unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO template_count FROM workout_templates WHERE is_system_template = true;
  SELECT COUNT(*) INTO mapped_count FROM workout_templates WHERE is_system_template = true AND library_id IS NOT NULL;
  unmapped_count := template_count - mapped_count;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Current State:';
  RAISE NOTICE '  Total system templates: %', template_count;
  RAISE NOTICE '  Already mapped: %', mapped_count;
  RAISE NOTICE '  Need mapping: %', unmapped_count;
  RAISE NOTICE '===========================================';
END $$;

-- ============================================================
-- Step 2: Update existing templates (SKIP if library_id already exists)
-- ============================================================

-- This version ONLY updates if:
-- 1. The library_id is NOT already in use by ANY template
-- 2. The target template has library_id = NULL
-- 3. The template matches the name pattern

CREATE OR REPLACE FUNCTION safe_update_library_id(
  p_library_id TEXT,
  p_name_pattern TEXT,
  p_min_duration INTEGER DEFAULT NULL,
  p_max_duration INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER := 0;
  v_candidate_count INTEGER := 0;
BEGIN
  -- First, check if this library_id is already assigned to ANY template
  IF EXISTS (SELECT 1 FROM workout_templates WHERE library_id = p_library_id) THEN
    RAISE NOTICE 'Skipping %: library_id already exists in database', p_library_id;
    RETURN 0;
  END IF;

  -- Count how many templates match the pattern and need mapping
  IF p_min_duration IS NOT NULL AND p_max_duration IS NOT NULL THEN
    SELECT COUNT(*) INTO v_candidate_count
    FROM workout_templates
    WHERE name ILIKE p_name_pattern
      AND duration BETWEEN p_min_duration AND p_max_duration
      AND library_id IS NULL
      AND is_system_template = true;
  ELSIF p_min_duration IS NOT NULL THEN
    SELECT COUNT(*) INTO v_candidate_count
    FROM workout_templates
    WHERE name ILIKE p_name_pattern
      AND duration <= p_min_duration
      AND library_id IS NULL
      AND is_system_template = true;
  ELSIF p_max_duration IS NOT NULL THEN
    SELECT COUNT(*) INTO v_candidate_count
    FROM workout_templates
    WHERE name ILIKE p_name_pattern
      AND duration >= p_max_duration
      AND library_id IS NULL
      AND is_system_template = true;
  ELSE
    SELECT COUNT(*) INTO v_candidate_count
    FROM workout_templates
    WHERE name ILIKE p_name_pattern
      AND library_id IS NULL
      AND is_system_template = true;
  END IF;

  -- If no candidates, skip
  IF v_candidate_count = 0 THEN
    RAISE NOTICE 'Skipping %: no matching templates found', p_library_id;
    RETURN 0;
  END IF;

  -- If multiple candidates, only update the first one (to avoid ambiguity)
  IF v_candidate_count > 1 THEN
    RAISE NOTICE 'Warning: % matches % templates, will only map the first one', p_library_id, v_candidate_count;
  END IF;

  -- Update the first matching template
  IF p_min_duration IS NOT NULL AND p_max_duration IS NOT NULL THEN
    UPDATE workout_templates
    SET library_id = p_library_id
    WHERE id = (
      SELECT id FROM workout_templates
      WHERE name ILIKE p_name_pattern
        AND duration BETWEEN p_min_duration AND p_max_duration
        AND library_id IS NULL
        AND is_system_template = true
      ORDER BY created_at
      LIMIT 1
    );
  ELSIF p_min_duration IS NOT NULL THEN
    UPDATE workout_templates
    SET library_id = p_library_id
    WHERE id = (
      SELECT id FROM workout_templates
      WHERE name ILIKE p_name_pattern
        AND duration <= p_min_duration
        AND library_id IS NULL
        AND is_system_template = true
      ORDER BY created_at
      LIMIT 1
    );
  ELSIF p_max_duration IS NOT NULL THEN
    UPDATE workout_templates
    SET library_id = p_library_id
    WHERE id = (
      SELECT id FROM workout_templates
      WHERE name ILIKE p_name_pattern
        AND duration >= p_max_duration
        AND library_id IS NULL
        AND is_system_template = true
      ORDER BY created_at
      LIMIT 1
    );
  ELSE
    UPDATE workout_templates
    SET library_id = p_library_id
    WHERE id = (
      SELECT id FROM workout_templates
      WHERE name ILIKE p_name_pattern
        AND library_id IS NULL
        AND is_system_template = true
      ORDER BY created_at
      LIMIT 1
    );
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RAISE NOTICE 'Mapped % to 1 template', p_library_id;
  END IF;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- Apply mappings using the safe function
DO $$
DECLARE
  total_mapped INTEGER := 0;
  mapped INTEGER := 0;
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Updating existing templates...';
  RAISE NOTICE '===========================================';

  -- Recovery workouts
  SELECT safe_update_library_id('recovery_spin', '%Recovery Spin%', 40) INTO mapped;
  total_mapped := total_mapped + mapped;

  SELECT safe_update_library_id('easy_recovery_ride', '%Recovery Ride%', 40, 50) INTO mapped;
  total_mapped := total_mapped + mapped;

  -- Endurance / Base workouts
  SELECT safe_update_library_id('foundation_miles', '%Foundation%') INTO mapped;
  total_mapped := total_mapped + mapped;

  SELECT safe_update_library_id('endurance_base_build', '%Endurance Base Build%') INTO mapped;
  total_mapped := total_mapped + mapped;

  SELECT safe_update_library_id('long_endurance_ride', '%Long Endurance%', NULL, 150) INTO mapped;
  total_mapped := total_mapped + mapped;

  -- Tempo workouts
  SELECT safe_update_library_id('tempo_ride', '%Tempo Ride%') INTO mapped;
  total_mapped := total_mapped + mapped;

  -- Sweet Spot workouts
  SELECT safe_update_library_id('traditional_sst', '%Sweet Spot Intervals%') INTO mapped;
  total_mapped := total_mapped + mapped;

  SELECT safe_update_library_id('three_by_ten_sst', '%3%10%') INTO mapped;
  total_mapped := total_mapped + mapped;

  -- Threshold / FTP workouts
  SELECT safe_update_library_id('two_by_twenty_ftp', '%2%20%') INTO mapped;
  total_mapped := total_mapped + mapped;

  -- VO2 Max workouts
  SELECT safe_update_library_id('thirty_thirty_intervals', '%30%30%') INTO mapped;
  total_mapped := total_mapped + mapped;

  SELECT safe_update_library_id('five_by_four_vo2', '%VO2 Max Intervals%') INTO mapped;
  total_mapped := total_mapped + mapped;

  -- Climbing workouts
  SELECT safe_update_library_id('hill_repeats', '%Hill Repeat%', 75) INTO mapped;
  total_mapped := total_mapped + mapped;

  -- Sprint / Anaerobic workouts
  SELECT safe_update_library_id('sprint_intervals', '%Sprint%') INTO mapped;
  total_mapped := total_mapped + mapped;

  -- Race simulation
  SELECT safe_update_library_id('race_simulation', '%Race Simulation%') INTO mapped;
  total_mapped := total_mapped + mapped;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Updated % existing templates', total_mapped;
  RAISE NOTICE '===========================================';
END $$;

-- Clean up the temporary function
DROP FUNCTION IF EXISTS safe_update_library_id(TEXT, TEXT, INTEGER, INTEGER);

-- ============================================================
-- Step 3: Insert missing essential templates (ONLY if needed)
-- ============================================================

DO $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Creating missing templates...';
  RAISE NOTICE '===========================================';

  -- Recovery Spin
  IF NOT EXISTS (SELECT 1 FROM workout_templates WHERE library_id = 'recovery_spin') THEN
    INSERT INTO workout_templates (name, workout_type, description, structure, target_tss, duration, terrain_type, difficulty_level, library_id, is_system_template)
    VALUES (
      'Recovery Spin',
      'recovery',
      'Easy spinning for active recovery. Focus on smooth pedaling.',
      '{"warmup": null, "main": [{"duration": 30, "zone": 1, "powerPctFTP": 45}], "cooldown": null}',
      20, 30, 'flat', 'beginner', 'recovery_spin', true
    );
    inserted_count := inserted_count + 1;
    RAISE NOTICE 'Created: Recovery Spin (recovery_spin)';
  END IF;

  -- Foundation Miles
  IF NOT EXISTS (SELECT 1 FROM workout_templates WHERE library_id = 'foundation_miles') THEN
    INSERT INTO workout_templates (name, workout_type, description, structure, target_tss, duration, terrain_type, difficulty_level, library_id, is_system_template)
    VALUES (
      'Foundation Miles',
      'endurance',
      'Classic Zone 2 endurance ride for aerobic base building.',
      '{"warmup": {"duration": 10, "zone": 1}, "main": [{"duration": 45, "zone": 2}], "cooldown": {"duration": 5, "zone": 1}}',
      55, 60, 'flat', 'beginner', 'foundation_miles', true
    );
    inserted_count := inserted_count + 1;
    RAISE NOTICE 'Created: Foundation Miles (foundation_miles)';
  END IF;

  -- 3x10 Sweet Spot
  IF NOT EXISTS (SELECT 1 FROM workout_templates WHERE library_id = 'three_by_ten_sst') THEN
    INSERT INTO workout_templates (name, workout_type, description, structure, target_tss, duration, terrain_type, difficulty_level, library_id, is_system_template)
    VALUES (
      '3x10 Sweet Spot',
      'sweet_spot',
      '3x10-minute Sweet Spot intervals with short recovery.',
      '{"warmup": {"duration": 15, "zone": 2}, "main": [{"type": "repeat", "sets": 3, "work": {"duration": 10, "zone": 3.5}, "rest": {"duration": 5, "zone": 1}}], "cooldown": {"duration": 10, "zone": 1}}',
      80, 60, 'flat', 'intermediate', 'three_by_ten_sst', true
    );
    inserted_count := inserted_count + 1;
    RAISE NOTICE 'Created: 3x10 Sweet Spot (three_by_ten_sst)';
  END IF;

  -- 2x20 at FTP
  IF NOT EXISTS (SELECT 1 FROM workout_templates WHERE library_id = 'two_by_twenty_ftp') THEN
    INSERT INTO workout_templates (name, workout_type, description, structure, target_tss, duration, terrain_type, difficulty_level, library_id, is_system_template)
    VALUES (
      '2x20 at FTP',
      'threshold',
      'Classic 2x20-minute intervals at FTP. The gold standard threshold workout.',
      '{"warmup": {"duration": 15, "zone": 2}, "main": [{"type": "repeat", "sets": 2, "work": {"duration": 20, "zone": 4}, "rest": {"duration": 5, "zone": 1}}], "cooldown": {"duration": 10, "zone": 1}}',
      90, 70, 'flat', 'advanced', 'two_by_twenty_ftp', true
    );
    inserted_count := inserted_count + 1;
    RAISE NOTICE 'Created: 2x20 at FTP (two_by_twenty_ftp)';
  END IF;

  -- 30/30 Intervals
  IF NOT EXISTS (SELECT 1 FROM workout_templates WHERE library_id = 'thirty_thirty_intervals') THEN
    INSERT INTO workout_templates (name, workout_type, description, structure, target_tss, duration, terrain_type, difficulty_level, library_id, is_system_template)
    VALUES (
      '30/30 Intervals',
      'vo2max',
      '30 seconds hard, 30 seconds easy. Maximizes time at VO2max.',
      '{"warmup": {"duration": 15, "zone": 2}, "main": [{"type": "repeat", "sets": 3, "work": [{"type": "repeat", "sets": 8, "work": [{"duration": 0.5, "zone": 5}, {"duration": 0.5, "zone": 2}]}], "rest": {"duration": 5, "zone": 1}}], "cooldown": {"duration": 10, "zone": 1}}',
      85, 60, 'flat', 'advanced', 'thirty_thirty_intervals', true
    );
    inserted_count := inserted_count + 1;
    RAISE NOTICE 'Created: 30/30 Intervals (thirty_thirty_intervals)';
  END IF;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Inserted % new templates', inserted_count;
  RAISE NOTICE '===========================================';
END $$;

-- ============================================================
-- Step 4: Report final state
-- ============================================================

DO $$
DECLARE
  mapped_count INTEGER;
  unmapped_count INTEGER;
  template_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO template_count FROM workout_templates WHERE is_system_template = true;
  SELECT COUNT(*) INTO mapped_count FROM workout_templates WHERE is_system_template = true AND library_id IS NOT NULL;
  unmapped_count := template_count - mapped_count;

  RAISE NOTICE '===========================================';
  RAISE NOTICE '✅ Migration Complete!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Total system templates: %', template_count;
  RAISE NOTICE 'Mapped templates: %', mapped_count;
  RAISE NOTICE 'Unmapped templates: %', unmapped_count;

  IF unmapped_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Note: % templates still unmapped', unmapped_count;
    RAISE NOTICE 'This is normal if you have custom templates.';
    RAISE NOTICE 'Run the diagnostic query to see which ones.';
  END IF;
  RAISE NOTICE '===========================================';
END $$;

-- Add helpful comment
COMMENT ON COLUMN workout_templates.library_id IS 'Maps to frontend WORKOUT_LIBRARY keys (e.g., three_by_ten_sst, recovery_spin)';
