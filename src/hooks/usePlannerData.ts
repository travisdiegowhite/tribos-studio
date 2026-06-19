/**
 * usePlannerData - Shared data loader for the Training Planner.
 *
 * Extracted from PlannerPage so the planner can be rendered both as a
 * standalone page (interim) and inline as the "Plan" mode of the Training
 * Dashboard's Calendar tab. Both surfaces must resolve the SAME canonical
 * active plan, so the active-plans query orders by `started_at desc` with a
 * `created_at desc` tie-break — matching the dashboard and coach resolvers
 * (see src/utils/coachWorkoutScheduler.js and TrainingDashboard.jsx).
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Flexible activity type — we select('*') so allow extra fields.
export interface PlannerActivity {
  id: string;
  user_id: string;
  name?: string;
  type?: string;
  start_date: string;
  start_date_local?: string;
  moving_time?: number;
  duration_seconds?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_watts?: number;
  trainer?: boolean;
  [key: string]: unknown;
}

export interface PlannerPlan {
  id: string;
  name: string;
  status: string;
  started_at: string;
  sport_type?: string | null;
  [key: string]: unknown;
}

export interface PlannerData {
  loading: boolean;
  error: string | null;
  activities: PlannerActivity[];
  ftp: number | null;
  unitsPreference: string;
  userLocation: string | null;
  activePlans: PlannerPlan[];
  selectedPlanId: string | null;
  setSelectedPlanId: (id: string | null) => void;
  activePlan: PlannerPlan | null;
  reload: () => Promise<void>;
}

export function usePlannerData(userId: string | null): PlannerData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<PlannerActivity[]>([]);
  const [ftp, setFtp] = useState<number | null>(null);
  const [unitsPreference, setUnitsPreference] = useState<string>('imperial');
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [activePlans, setActivePlans] = useState<PlannerPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch user profile for FTP and units preference
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('ftp, units_preference, location')
          .eq('id', userId)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error loading profile:', profileError);
        }
        if (cancelled) return;
        if (profileData?.ftp) setFtp(profileData.ftp);
        if (profileData?.units_preference) setUnitsPreference(profileData.units_preference);
        if (profileData?.location) setUserLocation(profileData.location);

        // Fetch activities (last 90 days for context). Exclude duplicates.
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: activityData, error: activityError } = await supabase
          .from('activities')
          .select('*')
          .eq('user_id', userId)
          .is('duplicate_of', null)
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        if (cancelled) return;
        if (activityError) {
          console.error('Error loading activities:', activityError);
        } else {
          setActivities((activityData as PlannerActivity[]) || []);
        }

        // Fetch all active training plans. Canonical = most-recent-active,
        // with a stable created_at tie-break so every surface agrees.
        const { data: planData, error: planError } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .order('created_at', { ascending: false });

        if (cancelled) return;
        if (planError) {
          console.error('Error loading plans:', planError);
        } else if (planData && planData.length > 0) {
          setActivePlans(planData as PlannerPlan[]);
          setSelectedPlanId((planData as PlannerPlan[])[0].id);
        } else {
          setActivePlans([]);
          setSelectedPlanId(null);
        }
      } catch (err) {
        console.error('Error loading planner data:', err);
        if (!cancelled) setError('Failed to load training data. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Re-query active plans after updates (e.g. plan activated / coach added workout).
  const reload = useCallback(async () => {
    if (!userId) return;

    const { data } = await supabase
      .from('training_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      const plans = data as PlannerPlan[];
      setActivePlans(plans);
      setSelectedPlanId((prev) => (prev && plans.find((p) => p.id === prev) ? prev : plans[0].id));
    } else {
      setActivePlans([]);
      setSelectedPlanId(null);
    }
  }, [userId]);

  const activePlan = activePlans.find((p) => p.id === selectedPlanId) ?? null;

  return {
    loading,
    error,
    activities,
    ftp,
    unitsPreference,
    userLocation,
    activePlans,
    selectedPlanId,
    setSelectedPlanId,
    activePlan,
    reload,
  };
}
