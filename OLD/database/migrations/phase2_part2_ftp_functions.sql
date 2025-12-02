-- ============================================================================
-- Phase 2 - Part 2: FTP Functions & Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_ftp(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT ftp_watts FROM user_ftp_history
    WHERE user_id = user_uuid AND is_current = TRUE
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_lthr(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT lthr_bpm FROM user_ftp_history
    WHERE user_id = user_uuid AND is_current = TRUE
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_current_ftp(
  user_uuid UUID,
  new_ftp INTEGER,
  new_lthr INTEGER DEFAULT NULL,
  test_date_param DATE DEFAULT CURRENT_DATE,
  test_type_param VARCHAR(50) DEFAULT 'manual',
  route_id_param UUID DEFAULT NULL,
  notes_param TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_ftp_id UUID;
BEGIN
  UPDATE user_ftp_history SET is_current = FALSE, updated_at = NOW()
  WHERE user_id = user_uuid;

  INSERT INTO user_ftp_history (
    user_id, ftp_watts, lthr_bpm, test_date, test_type, route_id, notes, is_current
  ) VALUES (
    user_uuid, new_ftp, new_lthr, test_date_param, test_type_param, route_id_param, notes_param, TRUE
  ) RETURNING id INTO new_ftp_id;

  RETURN new_ftp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION initialize_training_zones(
  user_uuid UUID,
  ftp_watts INTEGER,
  lthr_bpm INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM training_zones WHERE user_id = user_uuid;

  INSERT INTO training_zones (user_id, zone_name, zone_number, power_min, power_max, ftp_percent_min, ftp_percent_max, hr_min, hr_max, lthr_percent_min, lthr_percent_max, description, color) VALUES
  (user_uuid, 'recovery', 1, 0, ROUND(ftp_watts * 0.55), 0, 55, CASE WHEN lthr_bpm IS NOT NULL THEN 0 END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.68) END, 0, 68, 'Active recovery, very easy spinning', '#51cf66'),
  (user_uuid, 'endurance', 2, ROUND(ftp_watts * 0.56), ROUND(ftp_watts * 0.75), 56, 75, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.69) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.83) END, 69, 83, 'Aerobic base building, conversational pace', '#4dabf7'),
  (user_uuid, 'tempo', 3, ROUND(ftp_watts * 0.76), ROUND(ftp_watts * 0.87), 76, 87, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.84) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.94) END, 84, 94, 'Moderately hard, sustained effort', '#ffd43b'),
  (user_uuid, 'sweet_spot', 4, ROUND(ftp_watts * 0.88), ROUND(ftp_watts * 0.93), 88, 93, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.95) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.05) END, 95, 105, 'High aerobic training, efficient fitness gains', '#ff922b'),
  (user_uuid, 'threshold', 5, ROUND(ftp_watts * 0.94), ROUND(ftp_watts * 1.05), 94, 105, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.00) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.02) END, 100, 102, 'Lactate threshold, ~1 hour sustainable', '#ff6b6b'),
  (user_uuid, 'vo2max', 6, ROUND(ftp_watts * 1.06), ROUND(ftp_watts * 1.20), 106, 120, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.03) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.06) END, 103, 106, 'Maximal aerobic power, 3-8 min intervals', '#cc5de8'),
  (user_uuid, 'anaerobic', 7, ROUND(ftp_watts * 1.21), ROUND(ftp_watts * 1.50), 121, 150, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.06) END, CASE WHEN lthr_bpm IS NOT NULL THEN 220 END, 106, 110, 'Sprints and neuromuscular power, <3 min', '#862e9c');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_create_zones_on_ftp_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = TRUE THEN
    PERFORM initialize_training_zones(NEW.user_id, NEW.ftp_watts, NEW.lthr_bpm);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_zones ON user_ftp_history;

CREATE TRIGGER trigger_auto_create_zones
  AFTER INSERT ON user_ftp_history
  FOR EACH ROW
  WHEN (NEW.is_current = TRUE)
  EXECUTE FUNCTION auto_create_zones_on_ftp_insert();

CREATE OR REPLACE FUNCTION get_ftp_history(user_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (id UUID, ftp_watts INTEGER, lthr_bpm INTEGER, test_date DATE, test_type VARCHAR, is_current BOOLEAN, created_at TIMESTAMP) AS $$
BEGIN
  RETURN QUERY
  SELECT h.id, h.ftp_watts, h.lthr_bpm, h.test_date, h.test_type, h.is_current, h.created_at
  FROM user_ftp_history h
  WHERE h.user_id = user_uuid
  ORDER BY h.test_date DESC, h.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_training_zones(user_uuid UUID)
RETURNS TABLE (zone_name VARCHAR, zone_number INTEGER, power_min INTEGER, power_max INTEGER, hr_min INTEGER, hr_max INTEGER, ftp_percent_min DECIMAL, ftp_percent_max DECIMAL, description TEXT, color VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT tz.zone_name, tz.zone_number, tz.power_min, tz.power_max, tz.hr_min, tz.hr_max, tz.ftp_percent_min, tz.ftp_percent_max, tz.description, tz.color
  FROM training_zones tz
  WHERE tz.user_id = user_uuid
  ORDER BY tz.zone_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_zone_for_power(user_uuid UUID, power_watts INTEGER)
RETURNS VARCHAR AS $$
DECLARE
  zone_result VARCHAR;
BEGIN
  SELECT zone_name INTO zone_result
  FROM training_zones
  WHERE user_id = user_uuid AND power_watts >= power_min AND power_watts <= power_max
  ORDER BY zone_number LIMIT 1;
  RETURN COALESCE(zone_result, 'unknown');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Part 2 Complete: FTP Functions & Triggers created' as status;
