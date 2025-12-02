-- Migration: Seed Workout Templates with Library IDs
-- Date: 2025-11-24
-- Description: Maps workout_templates to workout library IDs from src/data/workoutLibrary.js
-- IMPORTANT: This migration is IDEMPOTENT - safe to run multiple times

-- ============================================================
-- Check and report current state
-- ============================================================

DO $$
DECLARE
  template_count INTEGER;
  mapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO template_count FROM workout_templates WHERE is_system_template = true;
  SELECT COUNT(*) INTO mapped_count FROM workout_templates WHERE is_system_template = true AND library_id IS NOT NULL;

  RAISE NOTICE 'Total system templates: %', template_count;
  RAISE NOTICE 'Already mapped: %', mapped_count;
  RAISE NOTICE 'Need mapping: %', template_count - mapped_count;
END $$;

-- ============================================================
-- Update existing templates with library IDs (only if not already set)
-- ============================================================

-- Recovery workouts
UPDATE workout_templates SET library_id = 'recovery_spin'
WHERE name ILIKE '%Recovery Spin%' AND duration <= 40
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'easy_recovery_ride'
WHERE name ILIKE '%Recovery Ride%' AND duration BETWEEN 40 AND 50
  AND library_id IS NULL
  AND is_system_template = true;

-- Endurance / Base workouts
UPDATE workout_templates SET library_id = 'foundation_miles'
WHERE (name ILIKE '%Foundation%' OR (name ILIKE '%Endurance%' AND duration BETWEEN 50 AND 70))
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'endurance_base_build'
WHERE (name ILIKE '%Endurance Base Build%' OR name ILIKE '%Base Build%')
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'long_endurance_ride'
WHERE name ILIKE '%Long Endurance%' AND duration >= 150
  AND library_id IS NULL
  AND is_system_template = true;

-- Tempo workouts
UPDATE workout_templates SET library_id = 'tempo_ride'
WHERE name ILIKE '%Tempo%' AND name NOT ILIKE '%2x20%'
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'two_by_twenty_tempo'
WHERE name ILIKE '%Tempo%' AND name ILIKE '%2%20%'
  AND library_id IS NULL
  AND is_system_template = true;

-- Sweet Spot workouts
UPDATE workout_templates SET library_id = 'traditional_sst'
WHERE (name ILIKE '%Traditional Sweet Spot%' OR name ILIKE '%Sweet Spot Intervals%')
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'three_by_ten_sst'
WHERE name ILIKE '%3%10%' AND (name ILIKE '%Sweet Spot%' OR name ILIKE '%SST%')
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'four_by_twelve_sst'
WHERE name ILIKE '%4%12%' AND (name ILIKE '%Sweet Spot%' OR name ILIKE '%SST%')
  AND library_id IS NULL
  AND is_system_template = true;

-- Threshold / FTP workouts
UPDATE workout_templates SET library_id = 'two_by_twenty_ftp'
WHERE name ILIKE '%2%20%' AND (name ILIKE '%FTP%' OR name ILIKE '%Threshold%')
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'over_under_intervals'
WHERE name ILIKE '%Over%Under%'
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'three_by_twelve_threshold'
WHERE name ILIKE '%3%12%' AND name ILIKE '%Threshold%'
  AND library_id IS NULL
  AND is_system_template = true;

-- VO2 Max workouts
UPDATE workout_templates SET library_id = 'thirty_thirty_intervals'
WHERE name ILIKE '%30%30%'
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'forty_twenty_intervals'
WHERE name ILIKE '%40%20%'
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'five_by_four_vo2'
WHERE (name ILIKE '%5%4%' OR name ILIKE '%VO2 Max Intervals%') AND name ILIKE '%VO2%'
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'four_by_eight_vo2'
WHERE name ILIKE '%4%8%' AND name ILIKE '%VO2%'
  AND library_id IS NULL
  AND is_system_template = true;

-- Climbing workouts
UPDATE workout_templates SET library_id = 'hill_repeats'
WHERE name ILIKE '%Hill Repeat%' AND duration <= 75
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'climbing_repeats_long'
WHERE name ILIKE '%Climbing%' AND name ILIKE '%Long%'
  AND library_id IS NULL
  AND is_system_template = true;

-- Sprint / Anaerobic workouts
UPDATE workout_templates SET library_id = 'sprint_intervals'
WHERE name ILIKE '%Sprint%'
  AND library_id IS NULL
  AND is_system_template = true;

-- Polarized workouts
UPDATE workout_templates SET library_id = 'polarized_long_ride'
WHERE name ILIKE '%Polarized%' AND duration >= 180
  AND library_id IS NULL
  AND is_system_template = true;

UPDATE workout_templates SET library_id = 'polarized_intensity_day'
WHERE name ILIKE '%Polarized%' AND name ILIKE '%Intensity%'
  AND library_id IS NULL
  AND is_system_template = true;

-- Race simulation
UPDATE workout_templates SET library_id = 'race_simulation'
WHERE name ILIKE '%Race Simulation%'
  AND library_id IS NULL
  AND is_system_template = true;

-- ============================================================
-- Insert missing templates from workout library
-- ============================================================

-- Only insert templates that don't already exist (by library_id)
-- This approach avoids the ON CONFLICT issue entirely

DO $$
BEGIN
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
  END IF;
END $$;

-- ============================================================
-- Report final mapping status
-- ============================================================

DO $$
DECLARE
  mapped_count INTEGER;
  unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mapped_count FROM workout_templates WHERE is_system_template = true AND library_id IS NOT NULL;
  SELECT COUNT(*) INTO unmapped_count FROM workout_templates WHERE is_system_template = true AND library_id IS NULL;

  RAISE NOTICE '✅ Migration complete!';
  RAISE NOTICE 'Mapped templates: %', mapped_count;
  RAISE NOTICE 'Unmapped templates: %', unmapped_count;

  IF unmapped_count > 0 THEN
    RAISE NOTICE '⚠️  Some templates still need manual mapping';
  END IF;
END $$;

-- ============================================================
-- Verification query (optional - uncomment to run)
-- ============================================================

-- SELECT library_id, name, workout_type, duration, target_tss
-- FROM workout_templates
-- WHERE is_system_template = true
-- ORDER BY workout_type, duration;

COMMENT ON COLUMN workout_templates.library_id IS 'Maps to frontend WORKOUT_LIBRARY keys (e.g., three_by_ten_sst, recovery_spin)';
