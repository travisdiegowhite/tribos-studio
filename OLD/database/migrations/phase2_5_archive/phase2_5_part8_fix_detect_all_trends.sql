-- Phase 2.5: Ride Intelligence - Part 8: Fix detect_all_trends
-- Created: 2025-11-16
-- Description: Fixes detect_all_trends to properly collect UUIDs from detect_zone_fitness_trends
--              Error: "column id does not exist" when trying to ARRAY_AGG(id)
--              Fix: ARRAY_AGG the UUID values directly, not a non-existent id column

-- ============================================================================
-- FIX: detect_all_trends - Fix ARRAY_AGG to collect UUIDs properly
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_all_trends(
  p_user_id UUID,
  p_lookback_days INTEGER DEFAULT 28
)
RETURNS TABLE (
  trend_count INTEGER,
  ftp_trend UUID,
  zone_trends UUID[],
  volume_trend UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ftp_trend UUID;
  v_zone_trends UUID[];
  v_volume_trend UUID;
  v_total_count INTEGER;
BEGIN
  -- Detect FTP trend
  v_ftp_trend := detect_ftp_trend(p_user_id, p_lookback_days);

  -- Detect zone fitness trends
  -- FIXED: detect_zone_fitness_trends returns SETOF UUID, not a table with id column
  -- Just aggregate the returned UUIDs directly
  SELECT ARRAY_AGG(trend_id) INTO v_zone_trends
  FROM detect_zone_fitness_trends(p_user_id, p_lookback_days) AS trend_id;

  -- Detect volume trend
  v_volume_trend := detect_volume_trends(p_user_id, p_lookback_days / 7);

  -- Count total trends
  v_total_count :=
    (CASE WHEN v_ftp_trend IS NOT NULL THEN 1 ELSE 0 END) +
    COALESCE(array_length(v_zone_trends, 1), 0) +
    (CASE WHEN v_volume_trend IS NOT NULL THEN 1 ELSE 0 END);

  RETURN QUERY SELECT
    v_total_count,
    v_ftp_trend,
    v_zone_trends,
    v_volume_trend;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION detect_all_trends TO authenticated;

-- Comments
COMMENT ON FUNCTION detect_all_trends IS 'Runs all trend detection algorithms and returns summary (FIXED: proper UUID aggregation)';
