/**
 * Cross-Training Activities Hook
 * Manages cross-training activities data (strength, yoga, running, etc.)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Types
export interface ActivityType {
  id: string;
  user_id: string | null;
  name: string;
  category: 'strength' | 'flexibility' | 'cardio' | 'recovery' | 'mind_body' | 'other';
  description: string | null;
  icon: string;
  color: string;
  default_duration_minutes: number;
  default_intensity: number;
  metrics_config: Record<string, unknown>;
  tss_per_hour_base: number;
  tss_intensity_multiplier: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrossTrainingActivity {
  id: string;
  user_id: string;
  activity_type_id: string | null;
  activity_date: string;
  start_time: string | null;
  duration_minutes: number;
  intensity: number;
  perceived_effort: number | null;
  metrics: Record<string, unknown>;
  estimated_tss: number | null;
  mood_before: number | null;
  mood_after: number | null;
  notes: string | null;
  source: 'manual' | 'garmin' | 'strava' | 'apple_health';
  external_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  activity_type?: ActivityType;
}

export interface CreateActivityInput {
  activity_type_id: string | null;
  activity_date: string;
  start_time?: string | null;
  duration_minutes: number;
  intensity: number;
  perceived_effort?: number | null;
  metrics?: Record<string, unknown>;
  mood_before?: number | null;
  mood_after?: number | null;
  notes?: string | null;
}

export interface CreateActivityTypeInput {
  name: string;
  category: ActivityType['category'];
  description?: string;
  icon?: string;
  color?: string;
  default_duration_minutes?: number;
  default_intensity?: number;
  metrics_config?: Record<string, unknown>;
  tss_per_hour_base?: number;
  tss_intensity_multiplier?: number;
}

export interface CrossTrainingStats {
  totalActivities: number;
  totalDuration: number;
  totalTSS: number;
  activitiesByCategory: Record<string, number>;
  averageIntensity: number;
}

// Category display info
export const ACTIVITY_CATEGORIES = {
  strength: { label: 'Strength', color: '#9E5A3C', icon: 'barbell' },
  flexibility: { label: 'Flexibility', color: '#6B7F94', icon: 'yoga' },
  cardio: { label: 'Cardio', color: '#6B8C72', icon: 'run' },
  recovery: { label: 'Recovery', color: '#64748b', icon: 'bed' },
  mind_body: { label: 'Mind & Body', color: '#6366f1', icon: 'brain' },
  other: { label: 'Other', color: '#9ca3af', icon: 'activity' },
} as const;

export function useCrossTraining() {
  const { user } = useAuth();
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [activities, setActivities] = useState<CrossTrainingActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all available activity types (system + user's custom)
  const fetchActivityTypes = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('activity_types')
        .select('*')
        .or(`is_system.eq.true,user_id.eq.${user.id}`)
        .order('category')
        .order('name');

      if (fetchError) throw fetchError;
      setActivityTypes(data || []);
    } catch (err) {
      console.error('Error fetching activity types:', err);
      setError('Failed to load activity types');
    }
  }, [user]);

  // Fetch activities for a date range
  const fetchActivities = useCallback(async (startDate?: string, endDate?: string) => {
    if (!user) return;

    try {
      let query = supabase
        .from('cross_training_activities')
        .select(`
          *,
          activity_type:activity_types(*)
        `)
        .eq('user_id', user.id)
        .order('activity_date', { ascending: false });

      if (startDate) {
        query = query.gte('activity_date', startDate);
      }
      if (endDate) {
        query = query.lte('activity_date', endDate);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setActivities(data || []);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError('Failed to load activities');
    }
  }, [user]);

  // Fetch activities for a specific date
  const fetchActivitiesForDate = useCallback(async (date: string): Promise<CrossTrainingActivity[]> => {
    if (!user) return [];

    try {
      const { data, error: fetchError } = await supabase
        .from('cross_training_activities')
        .select(`
          *,
          activity_type:activity_types(*)
        `)
        .eq('user_id', user.id)
        .eq('activity_date', date)
        .order('start_time');

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching activities for date:', err);
      return [];
    }
  }, [user]);

  // Create a new activity
  const createActivity = useCallback(async (input: CreateActivityInput): Promise<CrossTrainingActivity | null> => {
    if (!user) return null;

    try {
      const { data, error: createError } = await supabase
        .from('cross_training_activities')
        .insert({
          user_id: user.id,
          activity_type_id: input.activity_type_id,
          activity_date: input.activity_date,
          start_time: input.start_time || null,
          duration_minutes: input.duration_minutes,
          intensity: input.intensity,
          perceived_effort: input.perceived_effort || null,
          metrics: input.metrics || {},
          mood_before: input.mood_before || null,
          mood_after: input.mood_after || null,
          notes: input.notes || null,
          source: 'manual',
        })
        .select(`
          *,
          activity_type:activity_types(*)
        `)
        .single();

      if (createError) throw createError;

      // Update local state
      setActivities(prev => [data, ...prev]);
      return data;
    } catch (err) {
      console.error('Error creating activity:', err);
      setError('Failed to create activity');
      return null;
    }
  }, [user]);

  // Update an activity
  const updateActivity = useCallback(async (
    id: string,
    updates: Partial<CreateActivityInput>
  ): Promise<CrossTrainingActivity | null> => {
    if (!user) return null;

    try {
      const { data, error: updateError } = await supabase
        .from('cross_training_activities')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select(`
          *,
          activity_type:activity_types(*)
        `)
        .single();

      if (updateError) throw updateError;

      // Update local state
      setActivities(prev => prev.map(a => a.id === id ? data : a));
      return data;
    } catch (err) {
      console.error('Error updating activity:', err);
      setError('Failed to update activity');
      return null;
    }
  }, [user]);

  // Delete an activity
  const deleteActivity = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error: deleteError } = await supabase
        .from('cross_training_activities')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      // Update local state
      setActivities(prev => prev.filter(a => a.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting activity:', err);
      setError('Failed to delete activity');
      return false;
    }
  }, [user]);

  // Create a custom activity type
  const createActivityType = useCallback(async (input: CreateActivityTypeInput): Promise<ActivityType | null> => {
    if (!user) return null;

    try {
      const { data, error: createError } = await supabase
        .from('activity_types')
        .insert({
          user_id: user.id,
          name: input.name,
          category: input.category,
          description: input.description || null,
          icon: input.icon || 'activity',
          color: input.color || '#6366f1',
          default_duration_minutes: input.default_duration_minutes || 30,
          default_intensity: input.default_intensity || 5,
          metrics_config: input.metrics_config || {},
          tss_per_hour_base: input.tss_per_hour_base || 50,
          tss_intensity_multiplier: input.tss_intensity_multiplier || 0.12,
          is_system: false,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Update local state
      setActivityTypes(prev => [...prev, data]);
      return data;
    } catch (err) {
      console.error('Error creating activity type:', err);
      setError('Failed to create activity type');
      return null;
    }
  }, [user]);

  // Update a custom activity type
  const updateActivityType = useCallback(async (
    id: string,
    updates: Partial<CreateActivityTypeInput>
  ): Promise<ActivityType | null> => {
    if (!user) return null;

    try {
      const { data, error: updateError } = await supabase
        .from('activity_types')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('is_system', false)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update local state
      setActivityTypes(prev => prev.map(t => t.id === id ? data : t));
      return data;
    } catch (err) {
      console.error('Error updating activity type:', err);
      setError('Failed to update activity type');
      return null;
    }
  }, [user]);

  // Delete a custom activity type
  const deleteActivityType = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error: deleteError } = await supabase
        .from('activity_types')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('is_system', false);

      if (deleteError) throw deleteError;

      // Update local state
      setActivityTypes(prev => prev.filter(t => t.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting activity type:', err);
      setError('Failed to delete activity type');
      return false;
    }
  }, [user]);

  // Get activity stats for a date range
  const getStats = useCallback(async (startDate: string, endDate: string): Promise<CrossTrainingStats | null> => {
    if (!user) return null;

    try {
      const { data, error: fetchError } = await supabase
        .from('cross_training_activities')
        .select(`
          duration_minutes,
          intensity,
          estimated_tss,
          activity_type:activity_types(category)
        `)
        .eq('user_id', user.id)
        .gte('activity_date', startDate)
        .lte('activity_date', endDate);

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        return {
          totalActivities: 0,
          totalDuration: 0,
          totalTSS: 0,
          activitiesByCategory: {},
          averageIntensity: 0,
        };
      }

      const stats: CrossTrainingStats = {
        totalActivities: data.length,
        totalDuration: data.reduce((sum, a) => sum + (a.duration_minutes || 0), 0),
        totalTSS: data.reduce((sum, a) => sum + (a.estimated_tss || 0), 0),
        activitiesByCategory: {},
        averageIntensity: data.reduce((sum, a) => sum + (a.intensity || 0), 0) / data.length,
      };

      // Count by category
      data.forEach(a => {
        const category = (a.activity_type as { category: string } | null)?.category || 'other';
        stats.activitiesByCategory[category] = (stats.activitiesByCategory[category] || 0) + 1;
      });

      return stats;
    } catch (err) {
      console.error('Error getting stats:', err);
      return null;
    }
  }, [user]);

  // Get total TSS for a specific date (for training load calculations)
  const getTSSForDate = useCallback(async (date: string): Promise<number> => {
    if (!user) return 0;

    try {
      const { data, error: fetchError } = await supabase
        .from('cross_training_activities')
        .select('estimated_tss')
        .eq('user_id', user.id)
        .eq('activity_date', date);

      if (fetchError) throw fetchError;

      return (data || []).reduce((sum, a) => sum + (a.estimated_tss || 0), 0);
    } catch (err) {
      console.error('Error getting TSS for date:', err);
      return 0;
    }
  }, [user]);

  // Get daily TSS for a date range (for CTL/ATL calculations)
  const getDailyTSSRange = useCallback(async (startDate: string, endDate: string): Promise<Map<string, number>> => {
    if (!user) return new Map();

    try {
      const { data, error: fetchError } = await supabase
        .from('cross_training_activities')
        .select('activity_date, estimated_tss')
        .eq('user_id', user.id)
        .gte('activity_date', startDate)
        .lte('activity_date', endDate);

      if (fetchError) throw fetchError;

      const dailyTSS = new Map<string, number>();
      (data || []).forEach(a => {
        const current = dailyTSS.get(a.activity_date) || 0;
        dailyTSS.set(a.activity_date, current + (a.estimated_tss || 0));
      });

      return dailyTSS;
    } catch (err) {
      console.error('Error getting daily TSS range:', err);
      return new Map();
    }
  }, [user]);

  // Get recent activities for AI context
  const getRecentActivitiesForContext = useCallback(async (days: number = 14): Promise<{
    date: string;
    type: string;
    category: string;
    duration: number;
    intensity: number;
    tss: number;
  }[]> => {
    if (!user) return [];

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const { data, error: fetchError } = await supabase
        .from('cross_training_activities')
        .select(`
          activity_date,
          duration_minutes,
          intensity,
          estimated_tss,
          activity_type:activity_types(name, category)
        `)
        .eq('user_id', user.id)
        .gte('activity_date', startDate.toISOString().split('T')[0])
        .order('activity_date', { ascending: false });

      if (fetchError) throw fetchError;

      return (data || []).map(a => ({
        date: a.activity_date,
        type: (a.activity_type as { name: string } | null)?.name || 'Unknown',
        category: (a.activity_type as { category: string } | null)?.category || 'other',
        duration: a.duration_minutes,
        intensity: a.intensity,
        tss: a.estimated_tss || 0,
      }));
    } catch (err) {
      console.error('Error getting recent activities for context:', err);
      return [];
    }
  }, [user]);

  // Get user's frequently used activity types
  const getFrequentActivityTypes = useCallback(async (limit: number = 5): Promise<ActivityType[]> => {
    if (!user) return [];

    try {
      // Get activity type usage counts
      const { data: usageData, error: usageError } = await supabase
        .from('cross_training_activities')
        .select('activity_type_id')
        .eq('user_id', user.id)
        .not('activity_type_id', 'is', null);

      if (usageError) throw usageError;

      // Count usage
      const usageCounts = new Map<string, number>();
      (usageData || []).forEach(a => {
        if (a.activity_type_id) {
          const count = usageCounts.get(a.activity_type_id) || 0;
          usageCounts.set(a.activity_type_id, count + 1);
        }
      });

      // Sort by usage and get top IDs
      const sortedIds = Array.from(usageCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);

      // Get the actual activity types
      if (sortedIds.length === 0) return [];

      const { data: typesData, error: typesError } = await supabase
        .from('activity_types')
        .select('*')
        .in('id', sortedIds);

      if (typesError) throw typesError;

      // Sort by original usage order
      return (typesData || []).sort((a, b) => {
        const aIdx = sortedIds.indexOf(a.id);
        const bIdx = sortedIds.indexOf(b.id);
        return aIdx - bIdx;
      });
    } catch (err) {
      console.error('Error getting frequent activity types:', err);
      return [];
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([
        fetchActivityTypes(),
        fetchActivities()
      ]).finally(() => setLoading(false));
    }
  }, [user, fetchActivityTypes, fetchActivities]);

  return {
    // Data
    activityTypes,
    activities,
    loading,
    error,

    // Activity CRUD
    fetchActivities,
    fetchActivitiesForDate,
    createActivity,
    updateActivity,
    deleteActivity,

    // Activity Type CRUD
    fetchActivityTypes,
    createActivityType,
    updateActivityType,
    deleteActivityType,

    // Stats & Analysis
    getStats,
    getTSSForDate,
    getDailyTSSRange,
    getRecentActivitiesForContext,
    getFrequentActivityTypes,

    // Utility
    clearError: () => setError(null),
  };
}

export default useCrossTraining;
