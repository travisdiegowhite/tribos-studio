-- Migration 046: Advanced Ride Analytics
-- Adds columns for cutting-edge per-ride and longitudinal analytics
-- Enables pacing analysis, match burning, fatigue resistance, HR zones,
-- cadence analysis, training monotony/strain, dynamic FTP, and MMP progression

-- ─── Per-Ride Analytics (stored per activity) ─────────────────────────────

-- Advanced ride analytics computed from power/HR/cadence streams
-- Stored as JSONB to allow flexible schema evolution
-- Contains: pacing, match_burning, fatigue_resistance, hr_zones,
--   cadence_analysis, variability_index, efficiency_factor
ALTER TABLE activities ADD COLUMN IF NOT EXISTS ride_analytics JSONB;

-- Workout execution score (0-100) comparing planned vs actual
ALTER TABLE activities ADD COLUMN IF NOT EXISTS execution_score INTEGER;

-- Execution score rating: nailed_it, good, acceptable, deviated, missed
ALTER TABLE activities ADD COLUMN IF NOT EXISTS execution_rating TEXT;

-- Link to the planned workout this activity fulfilled
ALTER TABLE activities ADD COLUMN IF NOT EXISTS matched_planned_workout_id UUID
  REFERENCES planned_workouts(id) ON DELETE SET NULL;

-- Index for finding activities with analytics data
CREATE INDEX IF NOT EXISTS idx_activities_ride_analytics
  ON activities ((ride_analytics IS NOT NULL))
  WHERE ride_analytics IS NOT NULL;

-- Index for execution scoring queries
CREATE INDEX IF NOT EXISTS idx_activities_execution_score
  ON activities (execution_score)
  WHERE execution_score IS NOT NULL;

-- ─── Longitudinal Analytics (stored in fitness_snapshots) ─────────────────

-- Training monotony (mean daily TSS / stdev) — overtraining risk indicator
-- Values > 2.0 indicate high risk
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS training_monotony NUMERIC(4,2);

-- Training strain (weekly TSS × monotony) — combined stress indicator
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS training_strain NUMERIC(8,0);

-- Overtraining risk level: low, watch, moderate, high
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS overtraining_risk TEXT;

-- Dynamic FTP estimate from recent best efforts
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS estimated_ftp INTEGER;

-- FTP estimation method: '95% of best 20-min power', '75% of best 5-min power', etc.
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS ftp_estimation_method TEXT;

-- FTP estimation confidence: low, moderate, high, very_high
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS ftp_estimation_confidence TEXT;

-- Best efforts at key durations for the snapshot period (90-day window)
-- Format: {"5s": 850, "60s": 450, "300s": 320, "1200s": 280, "3600s": 240}
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS best_efforts JSONB;

-- Average efficiency factor (NP/avgHR) for the week
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS avg_efficiency_factor NUMERIC(4,2);

-- Average variability index for the week
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS avg_variability_index NUMERIC(4,2);

-- Average workout execution score for the week (0-100)
ALTER TABLE fitness_snapshots ADD COLUMN IF NOT EXISTS avg_execution_score INTEGER;

COMMENT ON COLUMN activities.ride_analytics IS 'Advanced per-ride analytics: pacing, match burning, fatigue resistance, HR zones, cadence. JSONB for flexible evolution.';
COMMENT ON COLUMN activities.execution_score IS 'Workout execution score (0-100) comparing planned vs actual performance';
COMMENT ON COLUMN activities.execution_rating IS 'Execution rating: nailed_it, good, acceptable, deviated, missed';
COMMENT ON COLUMN activities.matched_planned_workout_id IS 'The planned workout this activity matched/fulfilled';

COMMENT ON COLUMN fitness_snapshots.training_monotony IS 'Training monotony (mean/stdev daily TSS). Values > 2.0 indicate overtraining risk.';
COMMENT ON COLUMN fitness_snapshots.training_strain IS 'Training strain (weekly TSS × monotony). Combined stress indicator.';
COMMENT ON COLUMN fitness_snapshots.overtraining_risk IS 'Overtraining risk level: low, watch, moderate, high';
COMMENT ON COLUMN fitness_snapshots.estimated_ftp IS 'Dynamically estimated FTP from recent best power efforts';
COMMENT ON COLUMN fitness_snapshots.ftp_estimation_method IS 'Method used for FTP estimation';
COMMENT ON COLUMN fitness_snapshots.ftp_estimation_confidence IS 'Confidence level of FTP estimate: low, moderate, high, very_high';
COMMENT ON COLUMN fitness_snapshots.best_efforts IS 'Best MMP at key durations for the 90-day window ending at snapshot week';
COMMENT ON COLUMN fitness_snapshots.avg_efficiency_factor IS 'Average Efficiency Factor (NP/avgHR) for the week';
COMMENT ON COLUMN fitness_snapshots.avg_variability_index IS 'Average Variability Index (NP/avgPower) for the week';
COMMENT ON COLUMN fitness_snapshots.avg_execution_score IS 'Average workout execution score for the week';
