-- Health Metrics Table
-- Tracks daily health and recovery metrics for better training decisions

CREATE TABLE IF NOT EXISTS health_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,

  -- Recovery Metrics
  hrv INTEGER CHECK (hrv > 0 AND hrv <= 300), -- Heart Rate Variability (ms)
  resting_hr INTEGER CHECK (resting_hr > 0 AND resting_hr <= 200), -- Resting Heart Rate (bpm)
  sleep_hours DECIMAL(3,1) CHECK (sleep_hours >= 0 AND sleep_hours <= 24), -- Hours of sleep
  sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 10), -- Subjective 1-10 rating

  -- Body Metrics
  weight_kg DECIMAL(5,2) CHECK (weight_kg > 0 AND weight_kg <= 300),
  body_fat_percentage DECIMAL(4,1) CHECK (body_fat_percentage >= 0 AND body_fat_percentage <= 100),

  -- Wellness Metrics
  stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10), -- 1=low, 10=high
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10), -- 1=low, 10=high
  mood_rating INTEGER CHECK (mood_rating >= 1 AND mood_rating <= 10), -- 1=poor, 10=excellent
  muscle_soreness INTEGER CHECK (muscle_soreness >= 1 AND muscle_soreness <= 10), -- 1=none, 10=severe

  -- Integrated Device Data (synced from Garmin/Whoop/etc)
  body_battery INTEGER CHECK (body_battery >= 0 AND body_battery <= 100), -- Garmin Body Battery
  garmin_stress INTEGER CHECK (garmin_stress >= 0 AND garmin_stress <= 100), -- Garmin Stress Score
  readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100), -- Overall readiness (Whoop/Oura style)

  -- Notes
  notes TEXT,

  -- Tracking
  data_source TEXT DEFAULT 'manual' CHECK (data_source IN ('manual', 'garmin', 'whoop', 'oura', 'apple_health', 'strava')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one entry per user per day
  UNIQUE(user_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_health_metrics_user_date ON health_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_hrv ON health_metrics(user_id, hrv) WHERE hrv IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_health_metrics_sleep ON health_metrics(user_id, sleep_hours) WHERE sleep_hours IS NOT NULL;

-- Row Level Security
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health metrics"
  ON health_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health metrics"
  ON health_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health metrics"
  ON health_metrics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health metrics"
  ON health_metrics FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_health_metrics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_health_metrics_timestamp ON health_metrics;
CREATE TRIGGER trigger_update_health_metrics_timestamp
  BEFORE UPDATE ON health_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_health_metrics_timestamp();

-- Helper function to get recent health metrics summary
CREATE OR REPLACE FUNCTION get_health_metrics_summary(
  user_uuid UUID,
  days INTEGER DEFAULT 7
)
RETURNS TABLE (
  avg_hrv DECIMAL,
  avg_resting_hr DECIMAL,
  avg_sleep_hours DECIMAL,
  avg_stress DECIMAL,
  avg_energy DECIMAL,
  hrv_trend TEXT,
  sleep_trend TEXT
) AS $$
DECLARE
  recent_avg_hrv DECIMAL;
  prior_avg_hrv DECIMAL;
  recent_avg_sleep DECIMAL;
  prior_avg_sleep DECIMAL;
BEGIN
  -- Get recent averages (last N days)
  SELECT
    AVG(hrv),
    AVG(resting_hr),
    AVG(sleep_hours),
    AVG(stress_level),
    AVG(energy_level)
  INTO
    recent_avg_hrv,
    avg_resting_hr,
    recent_avg_sleep,
    avg_stress,
    avg_energy
  FROM health_metrics
  WHERE user_id = user_uuid
    AND date >= CURRENT_DATE - days
    AND date <= CURRENT_DATE;

  -- Get prior period averages (N days before that)
  SELECT
    AVG(hrv),
    AVG(sleep_hours)
  INTO
    prior_avg_hrv,
    prior_avg_sleep
  FROM health_metrics
  WHERE user_id = user_uuid
    AND date >= CURRENT_DATE - (days * 2)
    AND date < CURRENT_DATE - days;

  -- Determine trends
  hrv_trend := CASE
    WHEN recent_avg_hrv IS NULL OR prior_avg_hrv IS NULL THEN 'unknown'
    WHEN recent_avg_hrv > prior_avg_hrv * 1.05 THEN 'improving'
    WHEN recent_avg_hrv < prior_avg_hrv * 0.95 THEN 'declining'
    ELSE 'stable'
  END;

  sleep_trend := CASE
    WHEN recent_avg_sleep IS NULL OR prior_avg_sleep IS NULL THEN 'unknown'
    WHEN recent_avg_sleep > prior_avg_sleep + 0.5 THEN 'improving'
    WHEN recent_avg_sleep < prior_avg_sleep - 0.5 THEN 'declining'
    ELSE 'stable'
  END;

  -- Return results
  RETURN QUERY SELECT
    recent_avg_hrv as avg_hrv,
    avg_resting_hr,
    recent_avg_sleep as avg_sleep_hours,
    avg_stress,
    avg_energy,
    hrv_trend,
    sleep_trend;
END;
$$ LANGUAGE plpgsql;

-- Helper function to calculate recovery score from health metrics
CREATE OR REPLACE FUNCTION calculate_recovery_score(
  hrv_value INTEGER,
  sleep_hours_value DECIMAL,
  stress_value INTEGER,
  soreness_value INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  hrv_score INTEGER;
  sleep_score INTEGER;
  stress_score INTEGER;
  soreness_score INTEGER;
  total_score INTEGER;
BEGIN
  -- HRV Score (higher is better, typical range 30-100)
  hrv_score := CASE
    WHEN hrv_value IS NULL THEN 50
    WHEN hrv_value >= 70 THEN 100
    WHEN hrv_value >= 50 THEN 75
    WHEN hrv_value >= 30 THEN 50
    ELSE 25
  END;

  -- Sleep Score (7-9 hours optimal)
  sleep_score := CASE
    WHEN sleep_hours_value IS NULL THEN 50
    WHEN sleep_hours_value >= 7 AND sleep_hours_value <= 9 THEN 100
    WHEN sleep_hours_value >= 6 AND sleep_hours_value < 7 THEN 75
    WHEN sleep_hours_value >= 5 AND sleep_hours_value < 6 THEN 50
    ELSE 25
  END;

  -- Stress Score (inverted, lower is better)
  stress_score := CASE
    WHEN stress_value IS NULL THEN 50
    WHEN stress_value <= 3 THEN 100
    WHEN stress_value <= 5 THEN 75
    WHEN stress_value <= 7 THEN 50
    ELSE 25
  END;

  -- Soreness Score (inverted, lower is better)
  soreness_score := CASE
    WHEN soreness_value IS NULL THEN 50
    WHEN soreness_value <= 3 THEN 100
    WHEN soreness_value <= 5 THEN 75
    WHEN soreness_value <= 7 THEN 50
    ELSE 25
  END;

  -- Weighted average (HRV 35%, Sleep 35%, Stress 15%, Soreness 15%)
  total_score := ROUND(
    (hrv_score * 0.35) +
    (sleep_score * 0.35) +
    (stress_score * 0.15) +
    (soreness_score * 0.15)
  );

  RETURN total_score;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE health_metrics IS 'Daily health and recovery metrics for training optimization';
COMMENT ON COLUMN health_metrics.hrv IS 'Heart Rate Variability in milliseconds - higher generally indicates better recovery';
COMMENT ON COLUMN health_metrics.body_battery IS 'Garmin Body Battery score (0-100) - measures energy reserves';
COMMENT ON COLUMN health_metrics.readiness_score IS 'Overall readiness score (0-100) similar to Whoop/Oura';
COMMENT ON FUNCTION calculate_recovery_score IS 'Calculates a 0-100 recovery score from health metrics';
