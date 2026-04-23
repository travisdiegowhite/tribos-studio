-- Migration 083: Add target TFI band to race_goals
--
-- Adds target_tfi_min and target_tfi_max so the correction-proposal trigger
-- knows what fitness range the athlete should arrive at on race day.
-- These are user-editable via Settings → Goals. NULL means "no target set"
-- and the trigger will skip correction proposals for that goal.
--
-- Naming: TFI (Training Fitness Index) is the canonical Tribos term for
-- Chronic Training Load (CTL). User-facing labels may still say "CTL"
-- for rider familiarity, but the schema uses TFI throughout.

ALTER TABLE public.race_goals
  ADD COLUMN IF NOT EXISTS target_tfi_min INT,
  ADD COLUMN IF NOT EXISTS target_tfi_max INT;

-- Verification query (run before marking migration done):
-- SELECT id, name, race_date, target_tfi_min, target_tfi_max
-- FROM public.race_goals
-- WHERE target_tfi_min IS NOT NULL OR target_tfi_max IS NOT NULL
-- LIMIT 10;
