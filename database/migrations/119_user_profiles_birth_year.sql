-- 119 — Birth year on user_profiles
--
-- The masters coaching rules (MST-2, MST-3, MST-4) all gate on `age >= 40`,
-- and age came only from `date_of_birth` — set on 3 of 63 profiles. Three
-- evidence-backed rules were unreachable for effectively everyone.
--
-- A YEAR, not a date. Nothing in the rules needs a birthday: the only question
-- ever asked is which side of 40 the athlete is on, and a year answers that to
-- within twelve months. Asking for a full date of birth to compute a boolean
-- collects more personal data than the feature needs, and is a bigger ask at
-- the moment someone is deciding whether to fill in a settings field at all.
--
-- `date_of_birth` is kept and still wins where it is set — it is strictly more
-- precise, three athletes have it, and dropping a column with live data to
-- save a coalesce would be silly. New capture writes birth_year only.
--
-- The bounds are sanity rails, not policy: 1900 rejects a mistyped year, and
-- the upper bound is open-ended enough to survive the next century without a
-- migration. Nullable, because "not answered" must stay distinguishable from
-- any answer — a null age skips the masters rules rather than guessing.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS birth_year smallint
  CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2100));

COMMENT ON COLUMN public.user_profiles.birth_year IS
  'Year of birth. Year only, by design: the coaching rules only ask whether the athlete is 40+. Nullable = not answered. date_of_birth takes precedence where set.';
