/**
 * resolveActivePlan — the single source of truth for "which training plan is active."
 *
 * Before the calendar redesign, four surfaces resolved the active plan with three
 * different orderings (TrainingDashboard by recency, useTrainingPlan by priority,
 * getToday by recency, the coach by recency+auto-create), so they could each pick a
 * different plan. This is the one canonical resolver: the active plan is the
 * highest-priority active plan ('primary' before 'secondary'), tie-broken by most
 * recently started/created.
 *
 * Note: with the user-scoped calendar, plan membership no longer gates which workouts
 * render — this resolver is used only where a single "current plan" is still needed:
 * the calendar header (name/week/compliance) and attaching newly-added workouts.
 */

interface SupabaseLike {
  from: (table: string) => any;
}

export interface ActivePlanRow {
  id: string;
  name?: string;
  status?: string;
  priority?: string | null;
  sport_type?: string | null;
  template_id?: string | null;
  duration_weeks?: number | null;
  current_week?: number | null;
  started_at?: string | null;
  start_date?: string | null;
  [key: string]: unknown;
}

/**
 * @param supabase  Supabase client (browser or admin)
 * @param userId    Athlete id
 * @param sportType Optional sport filter ('cycling' | 'running'). NULL sport_type rows
 *                  are treated as 'cycling'. Omit to resolve across all sports.
 * @returns the active plan row, or null if the athlete has none.
 */
export async function resolveActivePlan(
  supabase: SupabaseLike,
  userId: string,
  sportType?: string | null,
): Promise<ActivePlanRow | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    // 'primary' sorts before 'secondary' ascending; then most-recently started/created.
    .order('priority', { ascending: true })
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) return null;

  const rows = data as ActivePlanRow[];
  if (sportType) {
    const match = rows.find(
      (p) => (p.sport_type ?? 'cycling') === sportType,
    );
    return match ?? null;
  }
  return rows[0] ?? null;
}
