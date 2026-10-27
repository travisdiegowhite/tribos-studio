-- Migration 138: strength and mobility calendar entries are sport 'other'.
--
-- The coach's calendar_change tool only accepted cycling | running, so every
-- strength, core, mobility or yoga session it wrote took the athlete's primary
-- sport. On 2026-10-27 that put 58 coach strength sessions on the calendar as
-- 'cycling', which had two effects:
--
--   - generate_block skipped them on every day that already held a ride
--     ("day already has a cycling session"), and
--   - activity auto-link could pair a completed ride with a strength session.
--
-- Writers now store 'other' for these (entrySport.js isStrengthSession,
-- OP_SPORTS). This re-tags the rows already written. None was linked to an
-- activity when this was written; the activity_id guard keeps any that has
-- been linked since as it is, rather than leaving a ride linked to an 'other'
-- entry.
--
-- Idempotent. APPLY BY HAND, then run the verification SELECT at the bottom.

UPDATE public.calendar_entries
   SET sport = 'other'
 WHERE type = 'workout'
   AND sport IN ('cycling', 'running')
   AND activity_id IS NULL
   AND (
        workout_type IN ('strength', 'core', 'flexibility', 'mobility', 'yoga')
     OR workout_id LIKE 'strength\_%'
     OR workout_id LIKE 'core\_%'
     OR workout_id LIKE 'flexibility\_%'
   );

-- Verification: expect no rows.
-- SELECT sport, count(*) FROM public.calendar_entries
--  WHERE type = 'workout' AND sport <> 'other'
--    AND (workout_type IN ('strength', 'core', 'flexibility', 'mobility', 'yoga')
--      OR workout_id LIKE 'strength\_%' OR workout_id LIKE 'core\_%' OR workout_id LIKE 'flexibility\_%')
--  GROUP BY 1;
