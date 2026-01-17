-- Migration: 026_fitness_snapshots
-- Description: Historical fitness state tracking for AI coaching analysis
-- Date: 2025-01-17
--
-- Purpose: Store weekly snapshots of CTL/ATL/TSB and training metrics
-- to enable year-over-year comparisons and historical trend analysis

-- ============================================================================
-- FITNESS SNAPSHOTS TABLE
-- Weekly snapshots of fitness state for historical analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS fitness_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Snapshot timing
    snapshot_week DATE NOT NULL,  -- Monday of the snapshot week (ISO week start)
    snapshot_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When snapshot was computed

    -- Core training metrics (using existing calculation formulas)
    ctl INTEGER NOT NULL DEFAULT 0,  -- Chronic Training Load (42-day EWA)
    atl INTEGER NOT NULL DEFAULT 0,  -- Acute Training Load (7-day EWA)
    tsb INTEGER NOT NULL DEFAULT 0,  -- Training Stress Balance (CTL - ATL)

    -- FTP tracking
    ftp INTEGER,  -- FTP at time of snapshot
    ftp_source TEXT,  -- 'manual', 'test', 'auto_detected'

    -- Weekly activity summary
    weekly_tss INTEGER NOT NULL DEFAULT 0,  -- Total TSS for the week
    weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 0,  -- Total training hours
    weekly_ride_count INTEGER NOT NULL DEFAULT 0,
    weekly_distance_km NUMERIC(8,2) DEFAULT 0,
    weekly_elevation_m INTEGER DEFAULT 0,

    -- Power metrics (if available)
    avg_normalized_power INTEGER,  -- Weekly average NP
    peak_20min_power INTEGER,  -- Best 20min power during week

    -- Training distribution (% of TSS in each zone)
    zone_distribution JSONB,  -- {"z1": 5, "z2": 45, "z3": 20, "z4": 20, "z5": 10}

    -- Load trends (computed from rolling data)
    load_trend TEXT,  -- 'building', 'maintaining', 'declining', 'recovering'
    fitness_trend TEXT,  -- 'improving', 'stable', 'declining'

    -- Metadata
    activities_analyzed INTEGER DEFAULT 0,  -- Number of activities in computation
    computation_notes TEXT,  -- Any notes about data quality

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One snapshot per user per week
    UNIQUE(user_id, snapshot_week)
);

-- Indexes for efficient querying
CREATE INDEX idx_fitness_snapshots_user_week
    ON fitness_snapshots(user_id, snapshot_week DESC);
CREATE INDEX idx_fitness_snapshots_user_date
    ON fitness_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_fitness_snapshots_ctl
    ON fitness_snapshots(user_id, ctl DESC);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE fitness_snapshots ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
CREATE POLICY "Users can view their own fitness snapshots"
    ON fitness_snapshots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fitness snapshots"
    ON fitness_snapshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fitness snapshots"
    ON fitness_snapshots FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fitness snapshots"
    ON fitness_snapshots FOR DELETE
    USING (auth.uid() = user_id);

-- Service role for background computation
CREATE POLICY "Service role has full access to fitness snapshots"
    ON fitness_snapshots FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON fitness_snapshots TO authenticated;
GRANT ALL ON fitness_snapshots TO service_role;

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_fitness_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fitness_snapshots_updated_at
    BEFORE UPDATE ON fitness_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_fitness_snapshots_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE fitness_snapshots IS
'Weekly fitness state snapshots for historical analysis. Enables AI coach to compare current fitness to past periods and identify long-term trends.';

COMMENT ON COLUMN fitness_snapshots.snapshot_week IS
'Monday of the snapshot week (ISO week start). Used as unique key with user_id.';

COMMENT ON COLUMN fitness_snapshots.ctl IS
'Chronic Training Load - 42-day exponentially weighted average of daily TSS.';

COMMENT ON COLUMN fitness_snapshots.atl IS
'Acute Training Load - 7-day exponentially weighted average of daily TSS.';

COMMENT ON COLUMN fitness_snapshots.tsb IS
'Training Stress Balance (CTL - ATL). Positive = fresh, negative = fatigued.';

COMMENT ON COLUMN fitness_snapshots.load_trend IS
'Training load direction: building (>15% increase), maintaining, declining (<-30%), recovering (-15% to -30%).';
