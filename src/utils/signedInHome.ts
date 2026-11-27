/**
 * Where a signed-in rider lands at `/` (Phase 1, routing-first front door).
 *
 * Riders with a current training plan keep `/today`; everyone else starts in
 * the route builder at `/ride/new`. One small query on training_plans
 * (status = 'active'), then isPlanCurrent so a stale 'active' row whose end
 * date has passed doesn't count. Any error keeps today's behaviour (`/today`).
 *
 * The answer is cached per user for the page's lifetime: RootRoute and
 * PublicRoute may both ask, and a plan change takes effect on the next load.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isPlanCurrent, type PlanDates } from './planLifecycle';

export const HOME_WITH_PLAN = '/today';
export const HOME_WITHOUT_PLAN = '/ride/new';

interface PlanQueryClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => PromiseLike<{ data: PlanDates[] | null; error: unknown }>;
      };
    };
  };
}

export async function resolveSignedInHome(
  client: PlanQueryClient,
  userId: string,
  todayStr?: string,
): Promise<string> {
  try {
    const { data, error } = await client
      .from('training_plans')
      .select('started_at,start_date,duration_weeks,end_date,target_event_date,blocks')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) return HOME_WITH_PLAN;
    const hasCurrentPlan = (data ?? []).some((plan) => isPlanCurrent(plan, todayStr));
    return hasCurrentPlan ? HOME_WITH_PLAN : HOME_WITHOUT_PLAN;
  } catch {
    return HOME_WITH_PLAN;
  }
}

const cache = new Map<string, string>();

/** Test seam. */
export function clearSignedInHomeCache(): void {
  cache.clear();
}

/**
 * The signed-in home for `userId`, or null while it resolves (and for no
 * user). Callers show their loading state on null.
 */
export function useSignedInHome(userId: string | null | undefined): string | null {
  const [home, setHome] = useState<string | null>(() => (userId ? cache.get(userId) ?? null : null));

  useEffect(() => {
    if (!userId) {
      setHome(null);
      return;
    }
    const cached = cache.get(userId);
    if (cached) {
      setHome(cached);
      return;
    }
    let cancelled = false;
    void resolveSignedInHome(supabase as unknown as PlanQueryClient, userId).then((path) => {
      cache.set(userId, path);
      if (!cancelled) setHome(path);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return home;
}
