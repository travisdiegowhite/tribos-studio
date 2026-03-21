-- 056: Add missing UNIQUE constraint on activity_efi.activity_id
--
-- The original 055 migration created activity_efi without a UNIQUE constraint
-- on activity_id (unlike activity_twl which has one). This caused upsert with
-- onConflict: 'activity_id' to silently fail, preventing EFI from being stored.

-- First deduplicate any existing rows (keep the most recent per activity)
DELETE FROM activity_efi a
USING activity_efi b
WHERE a.activity_id = b.activity_id
  AND a.computed_at < b.computed_at;

-- Now add the unique constraint
ALTER TABLE activity_efi
  ADD CONSTRAINT unique_activity_efi UNIQUE (activity_id);
