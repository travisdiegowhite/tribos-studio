/**
 * useAgePrompt — the "we still don't know how old you are" nudge.
 *
 * 58 of 63 profiles have no age from any of the three columns, which silently
 * costs those athletes the masters coaching rules (MST-2/3/4 all gate on
 * `age >= 40`), the age-based recovery default, and adaptive EWA time
 * constants. Onboarding now asks, but everyone who signed up before it did
 * would never be asked again — so the app asks them, a few times, then stops.
 *
 * BOUNDED BY CONSTRUCTION. At most MAX_AGE_PROMPTS showings, spaced
 * OPENS_BETWEEN_PROMPTS qualifying opens apart, and then never again whether
 * or not they answered. That is why there is no "never ask again" checkbox to
 * store or to find: a cap the code cannot exceed is a better promise, and it
 * keeps the dialog to two buttons.
 *
 * Answering ends it permanently without any extra bookkeeping — the whole
 * precondition is that no age exists, so a saved age is self-clearing.
 *
 * Every write here is best-effort. A nudge must never break the app it is
 * nudging inside of, so failures log and the prompt simply does not appear.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ageFromProfile,
  ageColumnsForBirthYear,
  AGE_COLUMNS,
} from '../utils/athleteAge';

/** How many showings before we stop asking for good. */
export const MAX_AGE_PROMPTS = 4;
/**
 * Qualifying opens between showings. An open is an AppShell mount and is
 * counted at most once per calendar day (see the day gate below), so this is
 * really "every third day the athlete uses the app" — about a fortnight of
 * normal use to run through the whole allowance.
 */
export const OPENS_BETWEEN_PROMPTS = 3;

const PROMPT_COLUMNS = 'age_prompt_opens, age_prompt_shown, age_prompt_last_open';

/** Local calendar day, not UTC — "today" should mean the athlete's today. */
function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Decide whether to ask this time, and pay for the answer.
 *
 * Counting the visit and recording the showing are the SAME write, so a prompt
 * can never be displayed without its cost being recorded — the one outcome
 * worse than never showing is showing forever.
 *
 * Resolves false, never throws: a nudge must not break the app it nudges
 * inside of.
 */
async function evaluate(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`${AGE_COLUMNS}, ${PROMPT_COLUMNS}`)
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return false;

    // The athlete already told us, in one form or another. Nothing to ask.
    if (ageFromProfile(data) != null) return false;
    if ((data.age_prompt_shown ?? 0) >= MAX_AGE_PROMPTS) return false;

    const today = localDay();
    // Already counted today. A refresh-happy afternoon must not burn the whole
    // allowance in an hour.
    if (data.age_prompt_last_open === today) return false;

    const opens = (data.age_prompt_opens ?? 0) + 1;
    const show = opens >= OPENS_BETWEEN_PROMPTS;

    const { error: writeError } = await supabase
      .from('user_profiles')
      .update(
        show
          ? {
              age_prompt_opens: 0,
              age_prompt_shown: (data.age_prompt_shown ?? 0) + 1,
              age_prompt_last_open: today,
            }
          : { age_prompt_opens: opens, age_prompt_last_open: today }
      )
      .eq('id', userId);

    if (writeError) {
      console.error('Age prompt bookkeeping failed, skipping:', writeError.message);
      return false;
    }

    return show;
  } catch (err) {
    console.error('Age prompt check failed:', err);
    return false;
  }
}

type Options = {
  /**
   * False while another lifecycle overlay owns the screen. Two modals must
   * never stack, and an unseen prompt must not burn a showing — so when this
   * is false the hook does nothing at all, not even counting the open.
   */
  enabled: boolean;
};

export function useAgePrompt(userId: string | undefined, { enabled }: Options) {
  const [shouldShow, setShouldShow] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * The evaluation runs at most once per mounted hook, but every effect
   * invocation subscribes to its RESULT.
   *
   * A plain "already ran" ref is not enough: StrictMode double-invokes effects
   * in dev, so the first invocation would do the database work while its own
   * cleanup marked it stale, and the second would be turned away by the ref —
   * paying for a showing that never appeared. Holding the promise instead
   * keeps the cost and the modal inseparable.
   */
  const run = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!userId || !enabled) return;

    let active = true;
    if (!run.current) run.current = evaluate(userId);
    run.current.then((show) => {
      if (active && show) setShouldShow(true);
    });

    return () => {
      active = false;
    };
  }, [userId, enabled]);

  const close = useCallback(() => setShouldShow(false), []);

  const saveBirthYear = useCallback(
    async (year: unknown, storedDob: string | null = null) => {
      if (!userId) return false;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('user_profiles')
          .update(ageColumnsForBirthYear(year, storedDob))
          .eq('id', userId);
        if (error) {
          console.error('Failed to save birth year:', error.message);
          return false;
        }
        setShouldShow(false);
        return true;
      } finally {
        setSaving(false);
      }
    },
    [userId]
  );

  return { shouldShow, saving, close, saveBirthYear };
}
