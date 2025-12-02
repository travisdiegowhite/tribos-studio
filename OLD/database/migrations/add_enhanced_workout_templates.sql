-- Enhanced Workout Templates Migration
-- Adds curated workout templates based on proven cycling training methods

-- Add new columns to workout_templates for better categorization
ALTER TABLE workout_templates
ADD COLUMN IF NOT EXISTS intensity_factor DECIMAL CHECK (intensity_factor >= 0 AND intensity_factor <= 2.5),
ADD COLUMN IF NOT EXISTS focus_area TEXT CHECK (focus_area IN ('aerobic_base', 'muscular_endurance', 'threshold', 'vo2max', 'anaerobic', 'recovery', 'mixed')),
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Insert enhanced workout templates
INSERT INTO workout_templates (
  name,
  workout_type,
  description,
  structure,
  target_tss,
  duration,
  terrain_type,
  difficulty_level,
  intensity_factor,
  focus_area,
  tags
) VALUES
-- ============================================================
-- RECOVERY WORKOUTS
-- ============================================================
(
  'Active Recovery - Z2',
  'recovery',
  'One hour of steady Zone 2 riding for active recovery. Promotes blood flow and aids recovery without adding training stress.',
  '{
    "intervals": {
      "sets": 12,
      "work": {"duration": 5, "zone": 2, "intensity": 0.65, "power_pct_ftp": 65}
    }
  }',
  40,
  60,
  'flat',
  'beginner',
  0.65,
  'recovery',
  ARRAY['recovery', 'z2', 'easy', 'active-recovery']
),

-- ============================================================
-- SWEET SPOT TRAINING (SST)
-- ============================================================
(
  'Traditional SST',
  'sweet_spot',
  'Classic 45-minute sweet spot workout. Single sustained effort at 88-93% FTP to build threshold without excessive fatigue.',
  '{
    "warmup": {"duration": 10, "zone": 1, "power_pct_ftp": 25},
    "main": [{"duration": 45, "zone": 3.5, "intensity": 0.90, "power_pct_ftp": 90}],
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 25}
  }',
  100,
  65,
  'flat',
  'intermediate',
  0.90,
  'threshold',
  ARRAY['sst', 'sweet-spot', 'threshold-building']
),
(
  '3x10 Sweet Spot',
  'sweet_spot',
  '3 x 10min sweet spot intervals with 5min recovery. Classic SST workout for building sustainable power.',
  '{
    "warmup": {"duration": 5, "zone": 1, "power_pct_ftp": 50},
    "intervals": {
      "sets": 3,
      "work": {"duration": 10, "zone": 3.5, "intensity": 0.90, "power_pct_ftp": 90},
      "rest": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 5, "zone": 1, "power_pct_ftp": 25}
  }',
  85,
  45,
  'flat',
  'intermediate',
  0.90,
  'threshold',
  ARRAY['sst', 'intervals', 'sweet-spot']
),

-- ============================================================
-- THRESHOLD INTERVALS
-- ============================================================
(
  'Tempo Bursts',
  'threshold',
  'Tempo intervals with short bursts. 3 sets of 4x(2min @ 90% + 5sec sprint) with 4min recovery between sets.',
  '{
    "warmup": {"duration": 10, "zone": 2, "power_pct_ftp": 55},
    "blocks": [
      {
        "intervals": {
          "sets": 4,
          "work": [
            {"duration": 2, "zone": 3, "intensity": 0.90, "power_pct_ftp": 90},
            {"duration": 0.083, "zone": 7, "intensity": 1.73, "power_pct_ftp": 173}
          ],
          "rest": {"duration": 0, "zone": 1}
        }
      },
      {"rest": {"duration": 4, "zone": 1}},
      {
        "intervals": {
          "sets": 4,
          "work": [
            {"duration": 2, "zone": 3, "intensity": 0.90, "power_pct_ftp": 90},
            {"duration": 0.083, "zone": 7, "intensity": 1.73, "power_pct_ftp": 173}
          ],
          "rest": {"duration": 0, "zone": 1}
        }
      },
      {"rest": {"duration": 4, "zone": 1}},
      {
        "intervals": {
          "sets": 4,
          "work": [
            {"duration": 2, "zone": 3, "intensity": 0.90, "power_pct_ftp": 90},
            {"duration": 0.083, "zone": 7, "intensity": 1.73, "power_pct_ftp": 173}
          ],
          "rest": {"duration": 0, "zone": 1}
        }
      }
    ],
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 25}
  }',
  95,
  75,
  'flat',
  'advanced',
  0.98,
  'mixed',
  ARRAY['threshold', 'tempo', 'sprints', 'neuromuscular']
),
(
  'Descending Pyramid',
  'threshold',
  'Pyramid intervals at threshold: 20min + 10min + 5min with 5min recovery. Tests mental toughness and pacing.',
  '{
    "warmup": {"duration": 10, "zone": 2, "power_pct_ftp": 50},
    "intervals": {
      "custom": [
        {"duration": 20, "zone": 4, "intensity": 0.98, "power_pct_ftp": 98},
        {"duration": 5, "zone": 1, "power_pct_ftp": 50},
        {"duration": 10, "zone": 4, "intensity": 0.98, "power_pct_ftp": 98},
        {"duration": 5, "zone": 1, "power_pct_ftp": 50},
        {"duration": 5, "zone": 4, "intensity": 0.98, "power_pct_ftp": 98},
        {"duration": 5, "zone": 1, "power_pct_ftp": 50}
      ]
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 25}
  }',
  105,
  70,
  'flat',
  'advanced',
  0.98,
  'threshold',
  ARRAY['threshold', 'ftp', 'pyramid', 'lactate-threshold']
),

-- ============================================================
-- VO2 MAX INTERVALS
-- ============================================================
(
  '8x2min VO2 Max',
  'vo2max',
  '8 x 2min at 120% FTP with 2min recovery. Classic VO2 max workout to increase aerobic capacity.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 60},
    "intervals": {
      "sets": 8,
      "work": {"duration": 2, "zone": 5, "intensity": 1.20, "power_pct_ftp": 120},
      "rest": {"duration": 2, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 25}
  }',
  90,
  57,
  'flat',
  'advanced',
  1.20,
  'vo2max',
  ARRAY['vo2max', 'intervals', 'high-intensity']
),
(
  '5x4min VO2 Max',
  'vo2max',
  '5 x 4min at 115% FTP with 4min recovery. Longer VO2 intervals for sustained high intensity.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 60},
    "intervals": {
      "sets": 5,
      "work": {"duration": 4, "zone": 5, "intensity": 1.15, "power_pct_ftp": 115},
      "rest": {"duration": 4, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 25}
  }',
  95,
  65,
  'flat',
  'advanced',
  1.15,
  'vo2max',
  ARRAY['vo2max', 'intervals', 'aerobic-capacity']
),

-- ============================================================
-- ENDURANCE WORKOUTS
-- ============================================================
(
  'Foundation Endurance',
  'endurance',
  '90 minutes of steady Zone 2 riding. Core workout for building aerobic base and fat oxidation.',
  '{
    "warmup": {"duration": 10, "zone": 1, "power_pct_ftp": 50},
    "main": [{"duration": 90, "zone": 2, "intensity": 0.68, "power_pct_ftp": 68}],
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 40}
  }',
  75,
  110,
  'flat',
  'intermediate',
  0.68,
  'aerobic_base',
  ARRAY['endurance', 'z2', 'base', 'aerobic']
),
(
  '2-Hour Base Ride',
  'long_ride',
  'Extended endurance ride with some tempo. Builds aerobic endurance and muscular endurance.',
  '{
    "warmup": {"duration": 15, "zone": 1, "power_pct_ftp": 50},
    "main": [
      {"duration": 60, "zone": 2, "intensity": 0.68, "power_pct_ftp": 68},
      {"duration": 20, "zone": 3, "intensity": 0.85, "power_pct_ftp": 85},
      {"duration": 30, "zone": 2, "intensity": 0.68, "power_pct_ftp": 68}
    ],
    "cooldown": {"duration": 15, "zone": 1, "power_pct_ftp": 40}
  }',
  110,
  140,
  'rolling',
  'intermediate',
  0.72,
  'aerobic_base',
  ARRAY['endurance', 'long-ride', 'weekend', 'base']
),

-- ============================================================
-- CLIMBING SPECIFIC
-- ============================================================
(
  'Climbing Repeats',
  'hill_repeats',
  '6 x 5min climbing intervals at 95% FTP. Simulates sustained climbs at near-threshold intensity.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 60},
    "intervals": {
      "sets": 6,
      "work": {"duration": 5, "zone": 4, "intensity": 0.95, "power_pct_ftp": 95, "cadence": 65},
      "rest": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 30}
  }',
  90,
  85,
  'hilly',
  'advanced',
  0.95,
  'muscular_endurance',
  ARRAY['climbing', 'hill-repeats', 'threshold', 'low-cadence']
),
(
  'Over-Under Intervals',
  'threshold',
  'Classic over-under workout: 3 x 10min alternating 2min @ 95% and 1min @ 105% FTP. Teaches riding at threshold with surges.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 60},
    "intervals": {
      "sets": 3,
      "work": {
        "pattern": [
          {"duration": 2, "zone": 4, "intensity": 0.95, "power_pct_ftp": 95},
          {"duration": 1, "zone": 4, "intensity": 1.05, "power_pct_ftp": 105},
          {"duration": 2, "zone": 4, "intensity": 0.95, "power_pct_ftp": 95},
          {"duration": 1, "zone": 4, "intensity": 1.05, "power_pct_ftp": 105},
          {"duration": 2, "zone": 4, "intensity": 0.95, "power_pct_ftp": 95},
          {"duration": 1, "zone": 4, "intensity": 1.05, "power_pct_ftp": 105}
        ],
        "repeat": 1
      },
      "rest": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 30}
  }',
  100,
  75,
  'rolling',
  'advanced',
  1.00,
  'threshold',
  ARRAY['over-under', 'threshold', 'surges', 'race-simulation']
),

-- ============================================================
-- TEMPO WORKOUTS
-- ============================================================
(
  '2x20 Tempo',
  'tempo',
  'Classic 2 x 20min tempo intervals at 85% FTP with 10min recovery. Foundation workout for building aerobic power.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 60},
    "intervals": {
      "sets": 2,
      "work": {"duration": 20, "zone": 3, "intensity": 0.85, "power_pct_ftp": 85},
      "rest": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 15, "zone": 1, "power_pct_ftp": 30}
  }',
  85,
  90,
  'rolling',
  'intermediate',
  0.85,
  'muscular_endurance',
  ARRAY['tempo', 'z3', 'aerobic-power']
),

-- ============================================================
-- SPECIALTY WORKOUTS
-- ============================================================
(
  'Sprint Intervals',
  'intervals',
  '10 x 30sec max sprints with 4.5min recovery. Develops anaerobic power and neuromuscular coordination.',
  '{
    "warmup": {"duration": 20, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 10,
      "work": {"duration": 0.5, "zone": 7, "intensity": 2.0, "power_pct_ftp": 200, "effort": "max"},
      "rest": {"duration": 4.5, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 30}
  }',
  75,
  80,
  'flat',
  'advanced',
  1.25,
  'anaerobic',
  ARRAY['sprints', 'anaerobic', 'power', 'neuromuscular']
),
(
  'Endurance with Bursts',
  'endurance',
  '75min Z2 ride with 10 x 15sec bursts every 6min. Maintains endurance while adding neuromuscular stimulus.',
  '{
    "warmup": {"duration": 10, "zone": 1, "power_pct_ftp": 55},
    "main": {
      "pattern": [
        {"duration": 5.75, "zone": 2, "intensity": 0.68, "power_pct_ftp": 68},
        {"duration": 0.25, "zone": 7, "intensity": 1.5, "power_pct_ftp": 150}
      ],
      "repeat": 10
    },
    "main_rest": [{"duration": 5, "zone": 2, "intensity": 0.68, "power_pct_ftp": 68}],
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 40}
  }',
  70,
  85,
  'flat',
  'intermediate',
  0.75,
  'mixed',
  ARRAY['endurance', 'bursts', 'neuromuscular', 'z2-plus']
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  structure = EXCLUDED.structure,
  target_tss = EXCLUDED.target_tss,
  duration = EXCLUDED.duration,
  terrain_type = EXCLUDED.terrain_type,
  difficulty_level = EXCLUDED.difficulty_level,
  intensity_factor = EXCLUDED.intensity_factor,
  focus_area = EXCLUDED.focus_area,
  tags = EXCLUDED.tags;

-- Create index on new columns for better query performance
CREATE INDEX IF NOT EXISTS idx_workout_templates_focus ON workout_templates(focus_area);
CREATE INDEX IF NOT EXISTS idx_workout_templates_difficulty ON workout_templates(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_workout_templates_tags ON workout_templates USING GIN(tags);

COMMENT ON COLUMN workout_templates.intensity_factor IS 'Average intensity factor (IF) of the workout, used for TSS calculation';
COMMENT ON COLUMN workout_templates.focus_area IS 'Primary training focus: aerobic_base, muscular_endurance, threshold, vo2max, anaerobic, recovery, mixed';
COMMENT ON COLUMN workout_templates.tags IS 'Searchable tags for workout categorization and filtering';
