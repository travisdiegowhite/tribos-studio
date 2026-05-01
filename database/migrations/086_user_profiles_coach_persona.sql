-- 086: Persist coach persona on user_profiles
--
-- The Today view needs persona to survive device changes. Persona is
-- already stored on user_coach_settings.coaching_persona, but the spec
-- locates the canonical column on user_profiles for the broader Tribos
-- surface area. This adds a stable column the Today view (and any
-- future surface) can read from a single place.
--
-- Backfill: copy the existing coaching_persona value from
-- user_coach_settings where it has been set (anything other than
-- 'pending'). New writers should write to BOTH columns until a future
-- migration retires user_coach_settings.coaching_persona.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS coach_persona_id TEXT
    CHECK (coach_persona_id IN
      ('hammer', 'scientist', 'encourager', 'pragmatist', 'competitor'));

COMMENT ON COLUMN user_profiles.coach_persona_id IS
  'Selected coach persona — canonical home for the value the Today view reads. Backfilled from user_coach_settings.coaching_persona on migration 086.';

-- Backfill from user_coach_settings (best-effort; any user with a
-- non-pending coaching_persona gets it copied over)
UPDATE user_profiles up
SET coach_persona_id = ucs.coaching_persona
FROM user_coach_settings ucs
WHERE ucs.user_id = up.id
  AND ucs.coaching_persona IS NOT NULL
  AND ucs.coaching_persona <> 'pending'
  AND up.coach_persona_id IS NULL;
