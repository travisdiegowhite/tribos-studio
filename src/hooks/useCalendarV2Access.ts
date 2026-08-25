import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Access gate for the rebuilt calendar at /calendar.
 *
 * Two layers, AND-ed, mirroring the Route Builder 2.0 gate (migration 090) —
 * the one rebuild in this codebase whose cutover actually completed:
 *
 *   1. `VITE_CALENDAR_V2_ENABLED === 'true'` in the deploy env. The master
 *      kill switch: flipping it off revokes access for everyone immediately,
 *      with no database write.
 *   2. `user_profiles.calendar_v2_enabled = TRUE` for this specific user.
 *
 * | env   | user column | nav    | /calendar          |
 * |-------|-------------|--------|--------------------|
 * | true  | true        | shown  | works              |
 * | true  | false       | hidden | redirect to /train |
 * | false | any         | hidden | redirect to /train |
 *
 * FAILS CLOSED. Any read error, missing row, or absent session denies access
 * rather than defaulting open — a half-built calendar surfacing by accident is
 * worse than one nobody can reach.
 */
export function useCalendarV2Access(userId?: string | null): {
  hasAccess: boolean;
  isLoading: boolean;
} {
  const envEnabled = import.meta.env.VITE_CALENDAR_V2_ENABLED === 'true';
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // No env flag or no user — deny without spending a query.
    if (!envEnabled || !userId) {
      setHasAccess(false);
      setIsLoading(false);
      return () => { cancelled = true; };
    }

    setIsLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('calendar_v2_enabled')
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.warn('useCalendarV2Access: denying access after read error:', error.message);
          setHasAccess(false);
        } else {
          setHasAccess(data?.calendar_v2_enabled === true);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('useCalendarV2Access: denying access after exception:', (err as Error)?.message);
          setHasAccess(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [envEnabled, userId]);

  return { hasAccess, isLoading };
}

export default useCalendarV2Access;
