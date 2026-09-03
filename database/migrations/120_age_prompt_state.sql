-- 120 — Nudge state for the missing-age prompt
--
-- Migration 119 added `birth_year` and Settings/onboarding now capture it, but
-- 58 of 63 existing profiles have no age from ANY of the three sources
-- (date_of_birth, birth_year, metrics_age). Those athletes silently get the
-- non-masters coaching path, the standard recovery default and the default
-- 42/7-day EWA time constants, with nothing ever asking them the one question
-- that would change it.
--
-- So the app asks — a few times, then stops.
--
-- BOUNDED BY CONSTRUCTION, which is why there is no "never ask again" button
-- to store. The prompt appears at most MAX_AGE_PROMPTS times (see
-- src/hooks/useAgePrompt.ts) spaced several qualifying opens apart, and then
-- never again whether or not the athlete answered. A cap the code cannot
-- exceed is a better promise than a checkbox someone has to find, and it keeps
-- the dialog to two buttons.
--
-- Answering ends it permanently without touching these columns: the prompt's
-- precondition is that no age exists, so a saved age is self-clearing.
--
-- age_prompt_opens     qualifying opens since the last ask. Reset to 0 each
--                      time we ask.
-- age_prompt_shown     how many times we have asked. The cap reads this.
-- age_prompt_last_open the day gate. An "open" is an AppShell mount, so a
--                      refresh-happy afternoon would otherwise burn through
--                      the whole allowance in an hour; counting one per
--                      calendar day makes the spacing mean what it says.
--
-- NOT NULL DEFAULT 0 on the counters so the read path never has to distinguish
-- "never opened" from "opened zero times" — they are the same thing here.
-- age_prompt_last_open is nullable precisely because "never" IS distinct from
-- any date, and a null must not read as "already counted today".

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS age_prompt_opens smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS age_prompt_shown smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS age_prompt_last_open date;

COMMENT ON COLUMN public.user_profiles.age_prompt_opens IS
  'Qualifying app opens (max one per calendar day) since the missing-age prompt was last shown. Reset to 0 on each showing.';
COMMENT ON COLUMN public.user_profiles.age_prompt_shown IS
  'Times the missing-age prompt has been shown. The prompt stops permanently at MAX_AGE_PROMPTS (src/hooks/useAgePrompt.ts), answered or not.';
COMMENT ON COLUMN public.user_profiles.age_prompt_last_open IS
  'Calendar day of the last counted open. Null means never counted; used to gate age_prompt_opens to one increment per day.';
