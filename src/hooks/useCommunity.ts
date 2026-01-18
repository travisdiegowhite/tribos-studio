/**
 * useCommunity Hook
 * Manages pod memberships, check-ins, and community features
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Types
export interface Pod {
  id: string;
  name: string;
  description: string | null;
  goal_type: string;
  experience_level: string;
  max_members: number;
  is_public: boolean;
  is_open: boolean;
  checkin_day: number;
  member_count: number;
  total_checkins: number;
  current_week_checkins: number;
  created_by: string;
  created_at: string;
}

export interface PodMembership {
  id: string;
  pod_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'active' | 'left' | 'removed';
  joined_at: string;
  pod?: Pod;
}

export interface PodCheckIn {
  id: string;
  pod_id: string;
  user_id: string;
  week_start: string;
  rides_completed: number;
  rides_planned: number | null;
  total_hours: number | null;
  total_tss: number | null;
  reflection: string | null;
  training_mood: 'struggling' | 'okay' | 'good' | 'great' | 'crushing_it' | null;
  highlights: string[];
  challenges: string[];
  next_week_focus: string | null;
  encouragement_count: number;
  created_at: string;
  user_profile?: {
    display_name: string | null;
    community_display_name: string | null;
  };
}

export interface PodMatch {
  pod_id: string;
  pod_name: string;
  pod_description: string | null;
  goal_type: string;
  experience_level: string;
  member_count: number;
  max_members: number;
  match_score: number;
}

export type TrainingMood = 'struggling' | 'okay' | 'good' | 'great' | 'crushing_it';

export interface CheckInData {
  reflection?: string;
  training_mood?: TrainingMood;
  highlights?: string[];
  challenges?: string[];
  next_week_focus?: string;
}

interface UseCommunityOptions {
  userId: string | null;
  autoLoad?: boolean;
}

interface UseCommunityReturn {
  // State
  pods: PodMembership[];
  activePod: PodMembership | null;
  checkIns: PodCheckIn[];
  loading: boolean;
  error: string | null;

  // Current week info
  currentWeekStart: string;
  hasCheckedInThisWeek: boolean;
  podCheckInCount: number;

  // Operations
  loadPods: () => Promise<void>;
  loadCheckIns: (podId: string, weeks?: number) => Promise<void>;
  createCheckIn: (podId: string, data: CheckInData) => Promise<boolean>;
  updateCheckIn: (checkInId: string, data: Partial<CheckInData>) => Promise<boolean>;

  // Pod operations
  joinPod: (podId: string) => Promise<boolean>;
  leavePod: (podId: string) => Promise<boolean>;
  createPod: (data: Partial<Pod>) => Promise<Pod | null>;
  findMatchingPods: (goalType?: string, experienceLevel?: string) => Promise<PodMatch[]>;

  // Encouragements
  addEncouragement: (checkInId: string, type?: string, message?: string) => Promise<boolean>;

  // Utilities
  getWeekStart: (date?: Date) => string;
  shouldPromptCheckIn: () => boolean;
}

/**
 * Get the Monday of the current week as YYYY-MM-DD
 */
function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust to Monday (day 1). If Sunday (0), go back 6 days
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export function useCommunity({
  userId,
  autoLoad = true,
}: UseCommunityOptions): UseCommunityReturn {
  const [pods, setPods] = useState<PodMembership[]>([]);
  const [checkIns, setCheckIns] = useState<PodCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentWeekStart = useMemo(() => getWeekStart(), []);

  // ============================================================
  // LOAD USER'S PODS
  // ============================================================
  const loadPods = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('pod_memberships')
        .select(`
          *,
          pod:pods(*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (fetchError) throw fetchError;

      setPods(data || []);
    } catch (err: any) {
      console.error('Error loading pods:', err);
      setError(err.message || 'Failed to load pods');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ============================================================
  // LOAD CHECK-INS FOR A POD
  // ============================================================
  const loadCheckIns = useCallback(async (podId: string, weeks: number = 4) => {
    try {
      setError(null);

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      const { data, error: fetchError } = await supabase
        .from('pod_check_ins')
        .select(`
          *,
          user_profile:user_profiles(display_name, community_display_name)
        `)
        .eq('pod_id', podId)
        .gte('week_start', startDate.toISOString().split('T')[0])
        .order('week_start', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setCheckIns(data || []);
    } catch (err: any) {
      console.error('Error loading check-ins:', err);
      setError(err.message || 'Failed to load check-ins');
    }
  }, []);

  // ============================================================
  // CREATE CHECK-IN
  // ============================================================
  const createCheckIn = useCallback(async (podId: string, data: CheckInData): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      // Get training stats for the week from activities
      const weekEnd = new Date();
      const weekStart = new Date(currentWeekStart);

      const { data: activities, error: activityError } = await supabase
        .from('activities')
        .select('duration_seconds, tss')
        .eq('user_id', userId)
        .gte('start_date', weekStart.toISOString())
        .lte('start_date', weekEnd.toISOString());

      if (activityError) {
        console.warn('Could not fetch activity stats:', activityError);
      }

      const ridesCompleted = activities?.length || 0;
      const totalHours = activities?.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) / 3600 || 0;
      const totalTss = activities?.reduce((sum, a) => sum + (a.tss || 0), 0) || 0;

      // Get planned workouts count if user has an active plan
      const { data: plannedData } = await supabase
        .from('planned_workouts')
        .select('id')
        .eq('user_id', userId)
        .gte('scheduled_date', currentWeekStart)
        .lt('scheduled_date', weekEnd.toISOString().split('T')[0]);

      const ridesPlanned = plannedData?.length || null;

      const { error: insertError } = await supabase
        .from('pod_check_ins')
        .insert({
          pod_id: podId,
          user_id: userId,
          week_start: currentWeekStart,
          rides_completed: ridesCompleted,
          rides_planned: ridesPlanned,
          total_hours: Math.round(totalHours * 100) / 100,
          total_tss: Math.round(totalTss),
          reflection: data.reflection || null,
          training_mood: data.training_mood || null,
          highlights: data.highlights || [],
          challenges: data.challenges || [],
          next_week_focus: data.next_week_focus || null,
        });

      if (insertError) throw insertError;

      // Reload check-ins
      await loadCheckIns(podId);

      return true;
    } catch (err: any) {
      console.error('Error creating check-in:', err);
      setError(err.message || 'Failed to create check-in');
      return false;
    }
  }, [userId, currentWeekStart, loadCheckIns]);

  // ============================================================
  // UPDATE CHECK-IN
  // ============================================================
  const updateCheckIn = useCallback(async (checkInId: string, data: Partial<CheckInData>): Promise<boolean> => {
    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('pod_check_ins')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkInId);

      if (updateError) throw updateError;

      // Update local state
      setCheckIns(prev =>
        prev.map(c =>
          c.id === checkInId ? { ...c, ...data } : c
        )
      );

      return true;
    } catch (err: any) {
      console.error('Error updating check-in:', err);
      setError(err.message || 'Failed to update check-in');
      return false;
    }
  }, []);

  // ============================================================
  // JOIN POD
  // ============================================================
  const joinPod = useCallback(async (podId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: insertError } = await supabase
        .from('pod_memberships')
        .insert({
          pod_id: podId,
          user_id: userId,
          role: 'member',
          status: 'active',
        });

      if (insertError) throw insertError;

      // Reload pods
      await loadPods();

      return true;
    } catch (err: any) {
      console.error('Error joining pod:', err);
      setError(err.message || 'Failed to join pod');
      return false;
    }
  }, [userId, loadPods]);

  // ============================================================
  // LEAVE POD
  // ============================================================
  const leavePod = useCallback(async (podId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('pod_memberships')
        .update({
          status: 'left',
          left_at: new Date().toISOString(),
        })
        .eq('pod_id', podId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Reload pods
      await loadPods();

      return true;
    } catch (err: any) {
      console.error('Error leaving pod:', err);
      setError(err.message || 'Failed to leave pod');
      return false;
    }
  }, [userId, loadPods]);

  // ============================================================
  // CREATE POD
  // ============================================================
  const createPod = useCallback(async (data: Partial<Pod>): Promise<Pod | null> => {
    if (!userId) return null;

    try {
      setError(null);

      const { data: newPod, error: insertError } = await supabase
        .from('pods')
        .insert({
          name: data.name || 'My Pod',
          description: data.description || null,
          goal_type: data.goal_type || 'general_fitness',
          experience_level: data.experience_level || 'mixed',
          max_members: data.max_members || 8,
          is_public: data.is_public ?? true,
          is_open: data.is_open ?? true,
          checkin_day: data.checkin_day ?? 0, // Sunday
          created_by: userId,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Auto-join as admin
      await supabase
        .from('pod_memberships')
        .insert({
          pod_id: newPod.id,
          user_id: userId,
          role: 'admin',
          status: 'active',
        });

      // Reload pods
      await loadPods();

      return newPod;
    } catch (err: any) {
      console.error('Error creating pod:', err);
      setError(err.message || 'Failed to create pod');
      return null;
    }
  }, [userId, loadPods]);

  // ============================================================
  // FIND MATCHING PODS
  // ============================================================
  const findMatchingPods = useCallback(async (
    goalType?: string,
    experienceLevel?: string
  ): Promise<PodMatch[]> => {
    if (!userId) return [];

    try {
      setError(null);

      const { data, error: rpcError } = await supabase
        .rpc('find_matching_pods', {
          p_user_id: userId,
          p_goal_type: goalType || null,
          p_experience_level: experienceLevel || null,
          p_limit: 10,
        });

      if (rpcError) throw rpcError;

      return data || [];
    } catch (err: any) {
      console.error('Error finding pods:', err);
      setError(err.message || 'Failed to find pods');
      return [];
    }
  }, [userId]);

  // ============================================================
  // ADD ENCOURAGEMENT
  // ============================================================
  const addEncouragement = useCallback(async (
    checkInId: string,
    type: string = 'encourage',
    message?: string
  ): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: insertError } = await supabase
        .from('pod_encouragements')
        .insert({
          check_in_id: checkInId,
          user_id: userId,
          type,
          message: message || null,
        });

      if (insertError) throw insertError;

      // Update local state
      setCheckIns(prev =>
        prev.map(c =>
          c.id === checkInId
            ? { ...c, encouragement_count: c.encouragement_count + 1 }
            : c
        )
      );

      return true;
    } catch (err: any) {
      // Ignore duplicate key errors (already encouraged)
      if (err.code === '23505') {
        return true;
      }
      console.error('Error adding encouragement:', err);
      setError(err.message || 'Failed to add encouragement');
      return false;
    }
  }, [userId]);

  // ============================================================
  // COMPUTED VALUES
  // ============================================================
  const activePod = useMemo(() => {
    // Return the first active pod (could add logic to pick preferred)
    return pods.length > 0 ? pods[0] : null;
  }, [pods]);

  const hasCheckedInThisWeek = useMemo(() => {
    if (!userId || !activePod) return false;
    return checkIns.some(
      c => c.user_id === userId &&
           c.pod_id === activePod.pod_id &&
           c.week_start === currentWeekStart
    );
  }, [userId, activePod, checkIns, currentWeekStart]);

  const podCheckInCount = useMemo(() => {
    if (!activePod) return 0;
    return checkIns.filter(
      c => c.pod_id === activePod.pod_id && c.week_start === currentWeekStart
    ).length;
  }, [activePod, checkIns, currentWeekStart]);

  const shouldPromptCheckIn = useCallback(() => {
    if (!activePod || hasCheckedInThisWeek) return false;

    // Prompt on Sunday (check-in day) or later in the week
    const today = new Date().getDay();
    const checkInDay = activePod.pod?.checkin_day ?? 0;

    return today >= checkInDay;
  }, [activePod, hasCheckedInThisWeek]);

  // ============================================================
  // AUTO-LOAD ON MOUNT
  // ============================================================
  useEffect(() => {
    if (autoLoad && userId) {
      loadPods();
    }
  }, [autoLoad, userId, loadPods]);

  // Load check-ins when active pod changes
  useEffect(() => {
    if (activePod?.pod_id) {
      loadCheckIns(activePod.pod_id);
    }
  }, [activePod?.pod_id, loadCheckIns]);

  return {
    // State
    pods,
    activePod,
    checkIns,
    loading,
    error,

    // Current week info
    currentWeekStart,
    hasCheckedInThisWeek,
    podCheckInCount,

    // Operations
    loadPods,
    loadCheckIns,
    createCheckIn,
    updateCheckIn,

    // Pod operations
    joinPod,
    leavePod,
    createPod,
    findMatchingPods,

    // Encouragements
    addEncouragement,

    // Utilities
    getWeekStart: (date?: Date) => getWeekStart(date),
    shouldPromptCheckIn,
  };
}

export default useCommunity;
