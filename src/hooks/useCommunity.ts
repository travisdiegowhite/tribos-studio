/**
 * useCommunity Hook
 * Manages cafe memberships, check-ins, and community features
 * "The Cafe" - named after cycling's cafe culture where riders gather to share stories
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Types
export interface Cafe {
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

export interface CafeMembership {
  id: string;
  cafe_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'active' | 'left' | 'removed';
  joined_at: string;
  cafe?: Cafe;
}

export interface CafeCheckIn {
  id: string;
  cafe_id: string;
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

export interface CafeMatch {
  cafe_id: string;
  cafe_name: string;
  cafe_description: string | null;
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
  cafes: CafeMembership[];
  activeCafe: CafeMembership | null;
  checkIns: CafeCheckIn[];
  loading: boolean;
  error: string | null;

  // Current week info
  currentWeekStart: string;
  hasCheckedInThisWeek: boolean;
  cafeCheckInCount: number;

  // Operations
  loadCafes: () => Promise<void>;
  loadCheckIns: (cafeId: string, weeks?: number) => Promise<void>;
  createCheckIn: (cafeId: string, data: CheckInData) => Promise<boolean>;
  updateCheckIn: (checkInId: string, data: Partial<CheckInData>) => Promise<boolean>;

  // Cafe operations
  joinCafe: (cafeId: string) => Promise<boolean>;
  leaveCafe: (cafeId: string) => Promise<boolean>;
  createCafe: (data: Partial<Cafe>) => Promise<Cafe | null>;
  findMatchingCafes: (goalType?: string, experienceLevel?: string) => Promise<CafeMatch[]>;

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
  const [cafes, setCafes] = useState<CafeMembership[]>([]);
  const [checkIns, setCheckIns] = useState<CafeCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentWeekStart = useMemo(() => getWeekStart(), []);

  // ============================================================
  // LOAD USER'S CAFES
  // ============================================================
  const loadCafes = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('cafe_memberships')
        .select(`
          *,
          cafe:cafes(*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (fetchError) throw fetchError;

      setCafes(data || []);
    } catch (err: any) {
      console.error('Error loading cafes:', err);
      setError(err.message || 'Failed to load cafes');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ============================================================
  // LOAD CHECK-INS FOR A CAFE
  // ============================================================
  const loadCheckIns = useCallback(async (cafeId: string, weeks: number = 4) => {
    try {
      setError(null);

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      const { data, error: fetchError } = await supabase
        .from('cafe_check_ins')
        .select(`
          *,
          user_profile:user_profiles(display_name, community_display_name)
        `)
        .eq('cafe_id', cafeId)
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
  const createCheckIn = useCallback(async (cafeId: string, data: CheckInData): Promise<boolean> => {
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
        .from('cafe_check_ins')
        .insert({
          cafe_id: cafeId,
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
      await loadCheckIns(cafeId);

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
        .from('cafe_check_ins')
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
  // JOIN CAFE
  // ============================================================
  const joinCafe = useCallback(async (cafeId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: insertError } = await supabase
        .from('cafe_memberships')
        .insert({
          cafe_id: cafeId,
          user_id: userId,
          role: 'member',
          status: 'active',
        });

      if (insertError) throw insertError;

      // Reload cafes
      await loadCafes();

      return true;
    } catch (err: any) {
      console.error('Error joining cafe:', err);
      setError(err.message || 'Failed to join cafe');
      return false;
    }
  }, [userId, loadCafes]);

  // ============================================================
  // LEAVE CAFE
  // ============================================================
  const leaveCafe = useCallback(async (cafeId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('cafe_memberships')
        .update({
          status: 'left',
          left_at: new Date().toISOString(),
        })
        .eq('cafe_id', cafeId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Reload cafes
      await loadCafes();

      return true;
    } catch (err: any) {
      console.error('Error leaving cafe:', err);
      setError(err.message || 'Failed to leave cafe');
      return false;
    }
  }, [userId, loadCafes]);

  // ============================================================
  // CREATE CAFE
  // ============================================================
  const createCafe = useCallback(async (data: Partial<Cafe>): Promise<Cafe | null> => {
    if (!userId) return null;

    try {
      setError(null);

      const { data: newCafe, error: insertError } = await supabase
        .from('cafes')
        .insert({
          name: data.name || 'My Cafe',
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
        .from('cafe_memberships')
        .insert({
          cafe_id: newCafe.id,
          user_id: userId,
          role: 'admin',
          status: 'active',
        });

      // Reload cafes
      await loadCafes();

      return newCafe;
    } catch (err: any) {
      console.error('Error creating cafe:', err);
      setError(err.message || 'Failed to create cafe');
      return null;
    }
  }, [userId, loadCafes]);

  // ============================================================
  // FIND MATCHING CAFES
  // ============================================================
  const findMatchingCafes = useCallback(async (
    goalType?: string,
    experienceLevel?: string
  ): Promise<CafeMatch[]> => {
    if (!userId) return [];

    try {
      setError(null);

      const { data, error: rpcError } = await supabase
        .rpc('find_matching_cafes', {
          p_user_id: userId,
          p_goal_type: goalType || null,
          p_experience_level: experienceLevel || null,
          p_limit: 10,
        });

      if (rpcError) throw rpcError;

      return data || [];
    } catch (err: any) {
      console.error('Error finding cafes:', err);
      setError(err.message || 'Failed to find cafes');
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
        .from('cafe_encouragements')
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
  const activeCafe = useMemo(() => {
    // Return the first active cafe (could add logic to pick preferred)
    return cafes.length > 0 ? cafes[0] : null;
  }, [cafes]);

  const hasCheckedInThisWeek = useMemo(() => {
    if (!userId || !activeCafe) return false;
    return checkIns.some(
      c => c.user_id === userId &&
           c.cafe_id === activeCafe.cafe_id &&
           c.week_start === currentWeekStart
    );
  }, [userId, activeCafe, checkIns, currentWeekStart]);

  const cafeCheckInCount = useMemo(() => {
    if (!activeCafe) return 0;
    return checkIns.filter(
      c => c.cafe_id === activeCafe.cafe_id && c.week_start === currentWeekStart
    ).length;
  }, [activeCafe, checkIns, currentWeekStart]);

  const shouldPromptCheckIn = useCallback(() => {
    if (!activeCafe || hasCheckedInThisWeek) return false;

    // Prompt on Sunday (check-in day) or later in the week
    const today = new Date().getDay();
    const checkInDay = activeCafe.cafe?.checkin_day ?? 0;

    return today >= checkInDay;
  }, [activeCafe, hasCheckedInThisWeek]);

  // ============================================================
  // AUTO-LOAD ON MOUNT
  // ============================================================
  useEffect(() => {
    if (autoLoad && userId) {
      loadCafes();
    }
  }, [autoLoad, userId, loadCafes]);

  // Load check-ins when active cafe changes
  useEffect(() => {
    if (activeCafe?.cafe_id) {
      loadCheckIns(activeCafe.cafe_id);
    }
  }, [activeCafe?.cafe_id, loadCheckIns]);

  return {
    // State
    cafes,
    activeCafe,
    checkIns,
    loading,
    error,

    // Current week info
    currentWeekStart,
    hasCheckedInThisWeek,
    cafeCheckInCount,

    // Operations
    loadCafes,
    loadCheckIns,
    createCheckIn,
    updateCheckIn,

    // Cafe operations
    joinCafe,
    leaveCafe,
    createCafe,
    findMatchingCafes,

    // Encouragements
    addEncouragement,

    // Utilities
    getWeekStart: (date?: Date) => getWeekStart(date),
    shouldPromptCheckIn,
  };
}

export default useCommunity;
