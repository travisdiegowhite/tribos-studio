-- Migration: Gear Tracking System
-- Adds unified gear tracking for cycling bikes and running shoes,
-- with component-level maintenance tracking, activity-gear linking,
-- and alert dismissal persistence.

-- ============================================================
-- 1. gear_items — Parent gear items (bikes and shoes)
-- ============================================================

CREATE TABLE IF NOT EXISTS gear_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_type TEXT NOT NULL CHECK (sport_type IN ('cycling', 'running')),
  gear_type TEXT NOT NULL CHECK (gear_type IN ('bike', 'shoes')),
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  purchase_date DATE,
  purchase_price NUMERIC,
  notes TEXT,
  total_distance_logged NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  retirement_date DATE,
  is_default BOOLEAN DEFAULT false,
  strava_gear_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE gear_items IS 'Parent gear items: bikes (cycling) and shoes (running)';
COMMENT ON COLUMN gear_items.total_distance_logged IS 'Accumulated distance in meters from linked activities';
COMMENT ON COLUMN gear_items.strava_gear_id IS 'Strava gear ID string (e.g. b12345678) for auto-matching on webhook';
COMMENT ON COLUMN gear_items.is_default IS 'Whether this is the default gear for its sport_type (one per user+sport_type)';

-- RLS
ALTER TABLE gear_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gear items"
  ON gear_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gear items"
  ON gear_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gear items"
  ON gear_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gear items"
  ON gear_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to gear items"
  ON gear_items FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_gear_items_user_id
  ON gear_items(user_id);

CREATE INDEX idx_gear_items_user_sport_status
  ON gear_items(user_id, sport_type, status);

-- Enforce at most one default per user + sport_type among active items
CREATE UNIQUE INDEX idx_gear_items_one_default
  ON gear_items(user_id, sport_type)
  WHERE is_default = true AND status = 'active';

CREATE INDEX idx_gear_items_strava_gear_id
  ON gear_items(strava_gear_id)
  WHERE strava_gear_id IS NOT NULL;

-- ============================================================
-- 2. gear_components — Child components for bikes
-- ============================================================

CREATE TABLE IF NOT EXISTS gear_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  installed_date DATE DEFAULT CURRENT_DATE,
  distance_at_install NUMERIC DEFAULT 0,
  warning_threshold_meters NUMERIC,
  replace_threshold_meters NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced')),
  replaced_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE gear_components IS 'Components installed on gear items (e.g. chain, tires, cassette)';
COMMENT ON COLUMN gear_components.distance_at_install IS 'Snapshot of parent gear_items.total_distance_logged at install time (meters)';
COMMENT ON COLUMN gear_components.warning_threshold_meters IS 'Distance in meters since install at which to show warning alert';
COMMENT ON COLUMN gear_components.replace_threshold_meters IS 'Distance in meters since install at which to show replace alert';

-- RLS
ALTER TABLE gear_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gear components"
  ON gear_components FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gear components"
  ON gear_components FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gear components"
  ON gear_components FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gear components"
  ON gear_components FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to gear components"
  ON gear_components FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_gear_components_gear_item
  ON gear_components(gear_item_id);

CREATE INDEX idx_gear_components_user_id
  ON gear_components(user_id);

-- ============================================================
-- 3. activity_gear — Links activities to gear items
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL DEFAULT 'auto' CHECK (assigned_by IN ('auto', 'manual', 'strava')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id)
);

COMMENT ON TABLE activity_gear IS 'Junction table linking activities to gear items (one gear per activity)';
COMMENT ON COLUMN activity_gear.assigned_by IS 'How gear was assigned: auto (default gear), manual (user chose), strava (matched via Strava gear_id)';

-- RLS
ALTER TABLE activity_gear ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity gear"
  ON activity_gear FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity gear"
  ON activity_gear FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activity gear"
  ON activity_gear FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own activity gear"
  ON activity_gear FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to activity gear"
  ON activity_gear FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_activity_gear_activity
  ON activity_gear(activity_id);

CREATE INDEX idx_activity_gear_gear_item
  ON activity_gear(gear_item_id);

CREATE INDEX idx_activity_gear_user
  ON activity_gear(user_id);

-- ============================================================
-- 4. gear_alert_dismissals — Tracks dismissed alerts
-- ============================================================

CREATE TABLE IF NOT EXISTS gear_alert_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_item_id UUID REFERENCES gear_items(id) ON DELETE CASCADE,
  gear_component_id UUID REFERENCES gear_components(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('warning', 'replace')),
  dismissed_at_distance NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE gear_alert_dismissals IS 'Tracks which gear alerts a user has dismissed';
COMMENT ON COLUMN gear_alert_dismissals.dismissed_at_distance IS 'Distance in meters at the time of dismissal';

-- RLS
ALTER TABLE gear_alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alert dismissals"
  ON gear_alert_dismissals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alert dismissals"
  ON gear_alert_dismissals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alert dismissals"
  ON gear_alert_dismissals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alert dismissals"
  ON gear_alert_dismissals FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to alert dismissals"
  ON gear_alert_dismissals FOR ALL
  USING (auth.role() = 'service_role');

-- Index
CREATE INDEX idx_gear_alert_dismissals_user
  ON gear_alert_dismissals(user_id);

-- ============================================================
-- 5. RPC function for atomic distance increment
-- ============================================================

CREATE OR REPLACE FUNCTION increment_gear_distance(p_gear_id UUID, p_distance NUMERIC)
RETURNS VOID AS $$
  UPDATE gear_items
  SET total_distance_logged = total_distance_logged + p_distance,
      updated_at = NOW()
  WHERE id = p_gear_id;
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION increment_gear_distance IS 'Atomically increment gear distance to avoid race conditions during concurrent webhook processing';
