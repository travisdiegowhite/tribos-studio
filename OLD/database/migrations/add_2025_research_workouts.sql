-- 2025 Research-Based Workout Templates Migration
-- Adds comprehensive workout library based on latest training research

-- Ensure columns exist (idempotent)
ALTER TABLE workout_templates
ADD COLUMN IF NOT EXISTS intensity_factor DECIMAL CHECK (intensity_factor >= 0 AND intensity_factor <= 2.5),
ADD COLUMN IF NOT EXISTS focus_area TEXT CHECK (focus_area IN ('aerobic_base', 'muscular_endurance', 'threshold', 'vo2max', 'anaerobic', 'recovery', 'mixed')),
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Insert 2025 research-based workouts
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
-- POLARIZED TRAINING WORKOUTS (2025 Research)
-- ============================================================
(
  '30/30 Intervals',
  'vo2max',
  '30 seconds hard, 30 seconds easy. Based on 2025 research showing maximum time at VO2max. 3 sets of 8 repetitions.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "sets": [
      {
        "intervals": {
          "sets": 8,
          "work": {"duration": 0.5, "zone": 5, "power_pct_ftp": 130, "description": "30sec hard"},
          "rest": {"duration": 0.5, "zone": 2, "power_pct_ftp": 60, "description": "30sec easy"}
        },
        "rest_between_sets": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
      }
    ],
    "repeat_sets": 3,
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  85,
  60,
  'flat',
  'advanced',
  0.95,
  'vo2max',
  ARRAY['vo2max', '30-30', 'intervals', 'high-intensity', 'polarized', '2025-research']
),
(
  '40/20 Intervals',
  'vo2max',
  '40 seconds on, 20 seconds off. High-intensity VO2max work. 3 sets of 6 repetitions.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "sets": [
      {
        "intervals": {
          "sets": 6,
          "work": {"duration": 0.67, "zone": 5, "power_pct_ftp": 125, "description": "40sec hard"},
          "rest": {"duration": 0.33, "zone": 2, "power_pct_ftp": 55, "description": "20sec easy"}
        },
        "rest_between_sets": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
      }
    ],
    "repeat_sets": 3,
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  80,
  55,
  'flat',
  'advanced',
  0.93,
  'vo2max',
  ARRAY['vo2max', '40-20', 'intervals', 'high-intensity', '2025-research']
),
(
  'Bossi Intervals (5x5)',
  'vo2max',
  'Advanced VO2max workout. Surging intervals alternating between VO2max and threshold. Research shows more time above 90% VO2max.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 5,
      "work": [
        {"duration": 0.5, "zone": 5, "power_pct_ftp": 120, "description": "30sec surge"},
        {"duration": 1, "zone": 4, "power_pct_ftp": 95, "description": "1min threshold"},
        {"duration": 0.5, "zone": 5, "power_pct_ftp": 120, "description": "30sec surge"},
        {"duration": 1, "zone": 4, "power_pct_ftp": 95, "description": "1min threshold"},
        {"duration": 0.5, "zone": 5, "power_pct_ftp": 120, "description": "30sec surge"},
        {"duration": 1.5, "zone": 4, "power_pct_ftp": 95, "description": "90sec threshold"}
      ],
      "rest": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  100,
  65,
  'flat',
  'advanced',
  1.00,
  'vo2max',
  ARRAY['vo2max', 'bossi', 'surges', 'advanced', '2025-research']
),
(
  '4x8min VO2 Max',
  'vo2max',
  'Long VO2max intervals. 2025 research shows 4x8 intervals are optimal for VO2max gains.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 4,
      "work": {"duration": 8, "zone": 5, "power_pct_ftp": 110, "description": "8min VO2"},
      "rest": {"duration": 4, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  105,
  75,
  'flat',
  'advanced',
  1.00,
  'vo2max',
  ARRAY['vo2max', 'intervals', 'long-intervals', '2025-research']
),
(
  'Polarized Long Ride',
  'long_ride',
  'Foundation of polarized training. 4-hour Zone 2 endurance ride. Stay disciplined in Zone 2.',
  '{
    "warmup": {"duration": 15, "zone": 1, "power_pct_ftp": 55},
    "main": [
      {"duration": 210, "zone": 2, "power_pct_ftp": 68, "cadence": "85-95", "description": "Steady Zone 2"}
    ],
    "cooldown": {"duration": 15, "zone": 1, "power_pct_ftp": 50}
  }',
  180,
  240,
  'rolling',
  'intermediate',
  0.68,
  'aerobic_base',
  ARRAY['polarized', 'endurance', 'z2', 'long-ride']
),
(
  'Polarized Intensity Day',
  'vo2max',
  'The "hard day" in polarized training (20% high intensity). 4x8min VO2max with long Z2 bookends.',
  '{
    "warmup": {"duration": 20, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 4,
      "work": {"duration": 8, "zone": 5, "power_pct_ftp": 110, "description": "8min VO2"},
      "rest": {"duration": 4, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 20, "zone": 2, "power_pct_ftp": 65}
  }',
  110,
  90,
  'flat',
  'advanced',
  1.00,
  'vo2max',
  ARRAY['polarized', 'vo2max', 'high-intensity']
),

-- ============================================================
-- SWEET SPOT TRAINING (SST) - EXPANDED
-- ============================================================
(
  '4x12 Sweet Spot',
  'sweet_spot',
  '4x12-minute Sweet Spot intervals with short recovery. Advanced SST workout with high training stress.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 4,
      "work": {"duration": 12, "zone": 3.5, "power_pct_ftp": 90, "description": "Sweet Spot"},
      "rest": {"duration": 3, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  95,
  80,
  'flat',
  'advanced',
  0.90,
  'threshold',
  ARRAY['sst', 'sweet-spot', 'intervals', 'high-volume']
),
(
  'Sweet Spot Progression',
  'sweet_spot',
  'Progressive Sweet Spot intervals: 20min + 15min + 10min with slight power increase.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "main": [
      {"duration": 20, "zone": 3.5, "power_pct_ftp": 90, "description": "20min SST"},
      {"duration": 5, "zone": 1, "power_pct_ftp": 50, "description": "Recovery"},
      {"duration": 15, "zone": 3.5, "power_pct_ftp": 91, "description": "15min SST"},
      {"duration": 5, "zone": 1, "power_pct_ftp": 50, "description": "Recovery"},
      {"duration": 10, "zone": 3.5, "power_pct_ftp": 92, "description": "10min SST"}
    ],
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  105,
  90,
  'rolling',
  'advanced',
  0.91,
  'threshold',
  ARRAY['sst', 'sweet-spot', 'progression', 'pyramid']
),

-- ============================================================
-- THRESHOLD / FTP BUILDING
-- ============================================================
(
  '2x20 at FTP',
  'threshold',
  'The gold standard threshold workout. 2x20-minute intervals at 100% FTP. If you cannot complete both, FTP may be too high.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 2,
      "work": {"duration": 20, "zone": 4, "power_pct_ftp": 100, "description": "20min at FTP"},
      "rest": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  90,
  70,
  'flat',
  'advanced',
  0.95,
  'threshold',
  ARRAY['threshold', 'ftp', '2x20', 'classic']
),
(
  '3x12 Threshold',
  'threshold',
  '3x12-minute threshold intervals. Alternative to 2x20 with slightly shorter intervals.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 3,
      "work": {"duration": 12, "zone": 4, "power_pct_ftp": 98, "description": "12min threshold"},
      "rest": {"duration": 4, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  95,
  75,
  'flat',
  'advanced',
  0.96,
  'threshold',
  ARRAY['threshold', 'ftp', 'intervals']
),

-- ============================================================
-- CLIMBING WORKOUTS
-- ============================================================
(
  'Hill Repeats (6x3min)',
  'hill_repeats',
  '6x3-minute hill repeats at threshold power with low cadence. Best done on actual climbs.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 6,
      "work": {"duration": 3, "zone": 4, "power_pct_ftp": 95, "cadence": "60-70", "description": "3min climb"},
      "rest": {"duration": 3, "zone": 1, "power_pct_ftp": 50, "description": "Easy descent/recovery"}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  80,
  70,
  'hilly',
  'advanced',
  0.88,
  'muscular_endurance',
  ARRAY['climbing', 'hill-repeats', 'threshold']
),
(
  'Long Climbing Repeats (6x5min)',
  'hill_repeats',
  '6x5-minute climbing intervals at 95% FTP with low cadence (65rpm). Builds climbing-specific muscular endurance.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "intervals": {
      "sets": 6,
      "work": {"duration": 5, "zone": 4, "power_pct_ftp": 95, "cadence": "65", "description": "5min climb"},
      "rest": {"duration": 5, "zone": 1, "power_pct_ftp": 50}
    },
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  90,
  85,
  'hilly',
  'advanced',
  0.90,
  'muscular_endurance',
  ARRAY['climbing', 'hill-repeats', 'threshold', 'low-cadence']
),

-- ============================================================
-- RACE SIMULATION
-- ============================================================
(
  'Race Simulation',
  'intervals',
  'Simulates race dynamics with varied efforts and surges. Practices tempo, attacks, surges, and chases.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 65},
    "main": [
      {"duration": 20, "zone": 3, "power_pct_ftp": 85, "description": "Tempo pace"},
      {"duration": 5, "zone": 4, "power_pct_ftp": 100, "description": "Attack!"},
      {"duration": 5, "zone": 2, "power_pct_ftp": 70, "description": "Recover in group"},
      {
        "type": "repeat",
        "sets": 4,
        "work": [
          {"duration": 1, "zone": 5, "power_pct_ftp": 120, "description": "Surge"},
          {"duration": 4, "zone": 3, "power_pct_ftp": 85, "description": "Settle"}
        ]
      },
      {"duration": 10, "zone": 4, "power_pct_ftp": 100, "description": "Chase effort"}
    ],
    "cooldown": {"duration": 15, "zone": 1, "power_pct_ftp": 50}
  }',
  105,
  90,
  'rolling',
  'advanced',
  0.95,
  'mixed',
  ARRAY['race-simulation', 'mixed', 'surges', 'racing']
),

-- ============================================================
-- RECOVERY WORKOUTS - EXPANDED
-- ============================================================
(
  'Recovery Spin (30min)',
  'recovery',
  'Easy spinning for active recovery. Should feel almost effortless. Purpose is recovery, not training stress.',
  '{
    "main": [
      {"duration": 30, "zone": 1, "power_pct_ftp": 45, "cadence": "85-95", "description": "Easy spin"}
    ]
  }',
  20,
  30,
  'flat',
  'beginner',
  0.40,
  'recovery',
  ARRAY['recovery', 'z1', 'easy', 'active-recovery']
),
(
  'Easy Recovery Ride (45min)',
  'recovery',
  'Extended recovery ride. Ideal for day after hard training. Promotes blood flow without adding stress.',
  '{
    "main": [
      {"duration": 45, "zone": 1, "power_pct_ftp": 50, "cadence": "85-95", "description": "Easy endurance pace"}
    ]
  }',
  30,
  45,
  'flat',
  'beginner',
  0.45,
  'recovery',
  ARRAY['recovery', 'z1', 'z2', 'easy']
),

-- ============================================================
-- ENDURANCE WORKOUTS - EXPANDED
-- ============================================================
(
  'Foundation Miles (60min)',
  'endurance',
  'Classic Zone 2 endurance ride. Should be conversational pace. Builds mitochondrial density and fat oxidation.',
  '{
    "warmup": {"duration": 10, "zone": 1, "power_pct_ftp": 50},
    "main": [
      {"duration": 45, "zone": 2, "power_pct_ftp": 65, "cadence": "85-95", "description": "Steady Zone 2"}
    ],
    "cooldown": {"duration": 5, "zone": 1, "power_pct_ftp": 45}
  }',
  55,
  60,
  'flat',
  'beginner',
  0.65,
  'aerobic_base',
  ARRAY['endurance', 'z2', 'base', 'aerobic']
),
(
  'Endurance Base Build (90min)',
  'endurance',
  'Perfect midweek endurance ride. Builds aerobic engine without excessive fatigue.',
  '{
    "warmup": {"duration": 10, "zone": 1, "power_pct_ftp": 55},
    "main": [
      {"duration": 70, "zone": 2, "power_pct_ftp": 68, "cadence": "85-95", "description": "Steady endurance"}
    ],
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  70,
  90,
  'rolling',
  'intermediate',
  0.67,
  'aerobic_base',
  ARRAY['endurance', 'z2', 'base', 'long-ride']
),
(
  'Endurance with Neuromuscular Bursts',
  'endurance',
  'Zone 2 endurance ride with periodic 15-second bursts. Maintains neuromuscular power during base phase.',
  '{
    "warmup": {"duration": 10, "zone": 1, "power_pct_ftp": 55},
    "main": [
      {
        "type": "repeat",
        "sets": 10,
        "work": [
          {"duration": 0.25, "zone": 7, "power_pct_ftp": 200, "description": "15sec burst"},
          {"duration": 5.75, "zone": 2, "power_pct_ftp": 65, "description": "Easy Zone 2"}
        ]
      }
    ],
    "cooldown": {"duration": 15, "zone": 1, "power_pct_ftp": 50}
  }',
  70,
  85,
  'flat',
  'intermediate',
  0.68,
  'mixed',
  ARRAY['endurance', 'z2', 'bursts', 'neuromuscular']
),

-- ============================================================
-- TEMPO WORKOUTS
-- ============================================================
(
  'Tempo Ride (60min)',
  'tempo',
  'Sustained Zone 3 tempo effort. Should feel "moderately hard" but sustainable.',
  '{
    "warmup": {"duration": 15, "zone": 2, "power_pct_ftp": 60},
    "main": [
      {"duration": 35, "zone": 3, "power_pct_ftp": 83, "cadence": "85-95", "description": "Steady tempo"}
    ],
    "cooldown": {"duration": 10, "zone": 1, "power_pct_ftp": 50}
  }',
  65,
  60,
  'rolling',
  'intermediate',
  0.83,
  'muscular_endurance',
  ARRAY['tempo', 'z3', 'aerobic-power']
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
  tags = EXCLUDED.tags,
  updated_at = CURRENT_TIMESTAMP;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_workout_templates_focus ON workout_templates(focus_area);
CREATE INDEX IF NOT EXISTS idx_workout_templates_difficulty ON workout_templates(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_workout_templates_tags ON workout_templates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_workout_templates_workout_type ON workout_templates(workout_type);
CREATE INDEX IF NOT EXISTS idx_workout_templates_duration ON workout_templates(duration);
CREATE INDEX IF NOT EXISTS idx_workout_templates_tss ON workout_templates(target_tss);

-- Add comments for documentation
COMMENT ON COLUMN workout_templates.intensity_factor IS 'Average intensity factor (IF) of the workout, used for TSS calculation';
COMMENT ON COLUMN workout_templates.focus_area IS 'Primary training focus: aerobic_base, muscular_endurance, threshold, vo2max, anaerobic, recovery, mixed';
COMMENT ON COLUMN workout_templates.tags IS 'Searchable tags for workout categorization and filtering';
