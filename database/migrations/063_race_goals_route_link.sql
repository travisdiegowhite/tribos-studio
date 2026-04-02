-- Migration: Link routes to race goals
-- Adds route_id foreign key so athletes can associate a saved route with a race goal

ALTER TABLE race_goals
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_race_goals_route_id ON race_goals(route_id);
