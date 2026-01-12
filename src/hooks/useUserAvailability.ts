/**
 * useUserAvailability Hook
 * Manages user's training day availability and preferences
 *
 * Features:
 * - Global weekly availability (blocked/preferred days)
 * - Date-specific overrides
 * - Training preferences (max workouts/week, etc.)
 * - Availability resolution for specific dates
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type {
  AvailabilityStatus,
  UserDayAvailabilityDB,
  UserDateOverrideDB,
  UserTrainingPreferencesDB,
  DayAvailability,
  DateOverride,
  ResolvedAvailability,
  UserAvailabilityConfig,
  SetDayAvailabilityInput,
  SetDateOverrideInput,
  UpdateTrainingPreferencesInput,
  DayOfWeek,
} from '../types/training';

// Day mapping
const DAY_NAMES: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

interface UseUserAvailabilityOptions {
  userId: string | null;
  autoLoad?: boolean;
}

interface UseUserAvailabilityReturn {
  // State
  weeklyAvailability: DayAvailability[];
  dateOverrides: Map<string, DateOverride>;
  preferences: UserAvailabilityConfig['preferences'] | null;
  loading: boolean;
  error: string | null;

  // Core operations
  loadAvailability: () => Promise<void>;
  setDayAvailability: (input: SetDayAvailabilityInput) => Promise<boolean>;
  setDateOverride: (input: SetDateOverrideInput) => Promise<boolean>;
  removeDateOverride: (date: string) => Promise<boolean>;
  updatePreferences: (input: UpdateTrainingPreferencesInput) => Promise<boolean>;

  // Query operations
  getAvailabilityForDate: (date: string | Date) => ResolvedAvailability;
  getAvailabilityForRange: (startDate: string | Date, endDate: string | Date) => ResolvedAvailability[];
  getBlockedDaysOfWeek: () => number[];
  getPreferredDaysOfWeek: () => number[];

  // Bulk operations
  setMultipleDayAvailabilities: (inputs: SetDayAvailabilityInput[]) => Promise<boolean>;
  clearAllOverrides: () => Promise<boolean>;

  // Utilities
  isDateBlocked: (date: string | Date) => boolean;
  isDatePreferred: (date: string | Date) => boolean;
  canScheduleWorkout: (date: string | Date, durationMinutes?: number) => boolean;
}

export function useUserAvailability({
  userId,
  autoLoad = true,
}: UseUserAvailabilityOptions): UseUserAvailabilityReturn {
  const [weeklyAvailability, setWeeklyAvailability] = useState<DayAvailability[]>([]);
  const [dateOverrides, setDateOverrides] = useState<Map<string, DateOverride>>(new Map());
  const [preferences, setPreferences] = useState<UserAvailabilityConfig['preferences'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // LOAD AVAILABILITY
  // ============================================================
  const loadAvailability = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load all three in parallel
      const [dayAvailResult, overridesResult, prefsResult] = await Promise.all([
        supabase
          .from('user_day_availability')
          .select('*')
          .eq('user_id', userId)
          .order('day_of_week', { ascending: true }),
        supabase
          .from('user_date_overrides')
          .select('*')
          .eq('user_id', userId)
          .order('specific_date', { ascending: true }),
        supabase
          .from('user_training_preferences')
          .select('*')
          .eq('user_id', userId)
          .single(),
      ]);

      // Process weekly availability
      const dayAvailData = (dayAvailResult.data || []) as UserDayAvailabilityDB[];
      const dayAvailMap = new Map(dayAvailData.map((d) => [d.day_of_week, d]));

      // Build full week (0-6), filling in defaults for missing days
      const fullWeek: DayAvailability[] = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dbEntry = dayAvailMap.get(dayIndex);
        fullWeek.push({
          dayOfWeek: dayIndex,
          dayName: DAY_NAMES[dayIndex],
          status: dbEntry
            ? dbEntry.is_blocked
              ? 'blocked'
              : dbEntry.is_preferred
                ? 'preferred'
                : 'available'
            : 'available',
          maxDurationMinutes: dbEntry?.max_duration_minutes || null,
          notes: dbEntry?.notes || null,
        });
      }
      setWeeklyAvailability(fullWeek);

      // Process date overrides
      const overridesData = (overridesResult.data || []) as UserDateOverrideDB[];
      const overridesMap = new Map<string, DateOverride>();
      for (const override of overridesData) {
        overridesMap.set(override.specific_date, {
          date: override.specific_date,
          status:
            override.is_blocked === true
              ? 'blocked'
              : override.is_preferred === true
                ? 'preferred'
                : 'available',
          isOverride: true,
          maxDurationMinutes: override.max_duration_minutes,
          notes: override.notes,
        });
      }
      setDateOverrides(overridesMap);

      // Process preferences
      if (prefsResult.data) {
        const prefsData = prefsResult.data as UserTrainingPreferencesDB;
        setPreferences({
          maxWorkoutsPerWeek: prefsData.max_workouts_per_week,
          maxHoursPerWeek: prefsData.max_hours_per_week,
          maxHardDaysPerWeek: prefsData.max_hard_days_per_week,
          preferMorningWorkouts: prefsData.prefer_morning_workouts,
          preferWeekendLongRides: prefsData.prefer_weekend_long_rides,
          minRestDaysPerWeek: prefsData.min_rest_days_per_week,
        });
      } else if (prefsResult.error?.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is fine (use defaults)
        console.warn('Error loading preferences:', prefsResult.error);
      }
    } catch (err: any) {
      console.error('Error loading availability:', err);
      setError(err.message || 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ============================================================
  // SET DAY AVAILABILITY
  // ============================================================
  const setDayAvailability = useCallback(
    async (input: SetDayAvailabilityInput): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        const { dayOfWeek, status, maxDurationMinutes, notes } = input;

        // Upsert the availability
        const { error: upsertError } = await supabase.from('user_day_availability').upsert(
          {
            user_id: userId,
            day_of_week: dayOfWeek,
            is_blocked: status === 'blocked',
            is_preferred: status === 'preferred',
            max_duration_minutes: maxDurationMinutes ?? null,
            notes: notes ?? null,
          },
          {
            onConflict: 'user_id,day_of_week',
          }
        );

        if (upsertError) throw upsertError;

        // Update local state
        setWeeklyAvailability((prev) =>
          prev.map((day) =>
            day.dayOfWeek === dayOfWeek
              ? {
                  ...day,
                  status,
                  maxDurationMinutes: maxDurationMinutes ?? null,
                  notes: notes ?? null,
                }
              : day
          )
        );

        return true;
      } catch (err: any) {
        console.error('Error setting day availability:', err);
        setError(err.message || 'Failed to set day availability');
        return false;
      }
    },
    [userId]
  );

  // ============================================================
  // SET DATE OVERRIDE
  // ============================================================
  const setDateOverride = useCallback(
    async (input: SetDateOverrideInput): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        const { date, status, maxDurationMinutes, notes } = input;

        // Upsert the override
        const { error: upsertError } = await supabase.from('user_date_overrides').upsert(
          {
            user_id: userId,
            specific_date: date,
            is_blocked: status === 'blocked' ? true : status === 'available' ? false : null,
            is_preferred: status === 'preferred' ? true : null,
            max_duration_minutes: maxDurationMinutes ?? null,
            notes: notes ?? null,
          },
          {
            onConflict: 'user_id,specific_date',
          }
        );

        if (upsertError) throw upsertError;

        // Update local state
        setDateOverrides((prev) => {
          const newMap = new Map(prev);
          newMap.set(date, {
            date,
            status,
            isOverride: true,
            maxDurationMinutes: maxDurationMinutes ?? null,
            notes: notes ?? null,
          });
          return newMap;
        });

        return true;
      } catch (err: any) {
        console.error('Error setting date override:', err);
        setError(err.message || 'Failed to set date override');
        return false;
      }
    },
    [userId]
  );

  // ============================================================
  // REMOVE DATE OVERRIDE
  // ============================================================
  const removeDateOverride = useCallback(
    async (date: string): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        const { error: deleteError } = await supabase
          .from('user_date_overrides')
          .delete()
          .eq('user_id', userId)
          .eq('specific_date', date);

        if (deleteError) throw deleteError;

        // Update local state
        setDateOverrides((prev) => {
          const newMap = new Map(prev);
          newMap.delete(date);
          return newMap;
        });

        return true;
      } catch (err: any) {
        console.error('Error removing date override:', err);
        setError(err.message || 'Failed to remove date override');
        return false;
      }
    },
    [userId]
  );

  // ============================================================
  // UPDATE PREFERENCES
  // ============================================================
  const updatePreferences = useCallback(
    async (input: UpdateTrainingPreferencesInput): Promise<boolean> => {
      if (!userId) return false;

      try {
        setError(null);

        // Build update object, only including provided fields
        const updateData: Record<string, any> = { user_id: userId };
        if (input.maxWorkoutsPerWeek !== undefined) {
          updateData.max_workouts_per_week = input.maxWorkoutsPerWeek;
        }
        if (input.maxHoursPerWeek !== undefined) {
          updateData.max_hours_per_week = input.maxHoursPerWeek;
        }
        if (input.maxHardDaysPerWeek !== undefined) {
          updateData.max_hard_days_per_week = input.maxHardDaysPerWeek;
        }
        if (input.preferMorningWorkouts !== undefined) {
          updateData.prefer_morning_workouts = input.preferMorningWorkouts;
        }
        if (input.preferWeekendLongRides !== undefined) {
          updateData.prefer_weekend_long_rides = input.preferWeekendLongRides;
        }
        if (input.minRestDaysPerWeek !== undefined) {
          updateData.min_rest_days_per_week = input.minRestDaysPerWeek;
        }

        // Upsert preferences
        const { error: upsertError } = await supabase.from('user_training_preferences').upsert(updateData, {
          onConflict: 'user_id',
        });

        if (upsertError) throw upsertError;

        // Update local state
        setPreferences((prev) => ({
          maxWorkoutsPerWeek: input.maxWorkoutsPerWeek ?? prev?.maxWorkoutsPerWeek ?? null,
          maxHoursPerWeek: input.maxHoursPerWeek ?? prev?.maxHoursPerWeek ?? null,
          maxHardDaysPerWeek: input.maxHardDaysPerWeek ?? prev?.maxHardDaysPerWeek ?? null,
          preferMorningWorkouts: input.preferMorningWorkouts ?? prev?.preferMorningWorkouts ?? null,
          preferWeekendLongRides: input.preferWeekendLongRides ?? prev?.preferWeekendLongRides ?? true,
          minRestDaysPerWeek: input.minRestDaysPerWeek ?? prev?.minRestDaysPerWeek ?? 1,
        }));

        return true;
      } catch (err: any) {
        console.error('Error updating preferences:', err);
        setError(err.message || 'Failed to update preferences');
        return false;
      }
    },
    [userId]
  );

  // ============================================================
  // GET AVAILABILITY FOR DATE
  // ============================================================
  const getAvailabilityForDate = useCallback(
    (date: string | Date): ResolvedAvailability => {
      const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

      // Check for date override first
      const override = dateOverrides.get(dateStr);
      if (override) {
        return {
          date: dateStr,
          status: override.status,
          isOverride: true,
          maxDurationMinutes: override.maxDurationMinutes,
          notes: override.notes,
        };
      }

      // Fall back to weekly availability
      const dateObj = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
      const dayOfWeek = dateObj.getDay();
      const dayAvail = weeklyAvailability.find((d) => d.dayOfWeek === dayOfWeek);

      return {
        date: dateStr,
        status: dayAvail?.status || 'available',
        isOverride: false,
        maxDurationMinutes: dayAvail?.maxDurationMinutes || null,
        notes: dayAvail?.notes || null,
      };
    },
    [weeklyAvailability, dateOverrides]
  );

  // ============================================================
  // GET AVAILABILITY FOR RANGE
  // ============================================================
  const getAvailabilityForRange = useCallback(
    (startDate: string | Date, endDate: string | Date): ResolvedAvailability[] => {
      const start = typeof startDate === 'string' ? new Date(startDate + 'T12:00:00') : startDate;
      const end = typeof endDate === 'string' ? new Date(endDate + 'T12:00:00') : endDate;

      const results: ResolvedAvailability[] = [];
      const current = new Date(start);

      while (current <= end) {
        results.push(getAvailabilityForDate(current));
        current.setDate(current.getDate() + 1);
      }

      return results;
    },
    [getAvailabilityForDate]
  );

  // ============================================================
  // GET BLOCKED/PREFERRED DAYS OF WEEK
  // ============================================================
  const getBlockedDaysOfWeek = useCallback((): number[] => {
    return weeklyAvailability.filter((d) => d.status === 'blocked').map((d) => d.dayOfWeek);
  }, [weeklyAvailability]);

  const getPreferredDaysOfWeek = useCallback((): number[] => {
    return weeklyAvailability.filter((d) => d.status === 'preferred').map((d) => d.dayOfWeek);
  }, [weeklyAvailability]);

  // ============================================================
  // BULK OPERATIONS
  // ============================================================
  const setMultipleDayAvailabilities = useCallback(
    async (inputs: SetDayAvailabilityInput[]): Promise<boolean> => {
      if (!userId || inputs.length === 0) return false;

      try {
        setError(null);

        // Build upsert data
        const upsertData = inputs.map((input) => ({
          user_id: userId,
          day_of_week: input.dayOfWeek,
          is_blocked: input.status === 'blocked',
          is_preferred: input.status === 'preferred',
          max_duration_minutes: input.maxDurationMinutes ?? null,
          notes: input.notes ?? null,
        }));

        const { error: upsertError } = await supabase.from('user_day_availability').upsert(upsertData, {
          onConflict: 'user_id,day_of_week',
        });

        if (upsertError) throw upsertError;

        // Reload to get fresh state
        await loadAvailability();

        return true;
      } catch (err: any) {
        console.error('Error setting multiple day availabilities:', err);
        setError(err.message || 'Failed to set day availabilities');
        return false;
      }
    },
    [userId, loadAvailability]
  );

  const clearAllOverrides = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;

    try {
      setError(null);

      const { error: deleteError } = await supabase
        .from('user_date_overrides')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      setDateOverrides(new Map());
      return true;
    } catch (err: any) {
      console.error('Error clearing overrides:', err);
      setError(err.message || 'Failed to clear overrides');
      return false;
    }
  }, [userId]);

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================
  const isDateBlocked = useCallback(
    (date: string | Date): boolean => {
      return getAvailabilityForDate(date).status === 'blocked';
    },
    [getAvailabilityForDate]
  );

  const isDatePreferred = useCallback(
    (date: string | Date): boolean => {
      return getAvailabilityForDate(date).status === 'preferred';
    },
    [getAvailabilityForDate]
  );

  const canScheduleWorkout = useCallback(
    (date: string | Date, durationMinutes?: number): boolean => {
      const avail = getAvailabilityForDate(date);

      if (avail.status === 'blocked') {
        return false;
      }

      // Check duration constraint if provided
      if (durationMinutes && avail.maxDurationMinutes) {
        return durationMinutes <= avail.maxDurationMinutes;
      }

      return true;
    },
    [getAvailabilityForDate]
  );

  // ============================================================
  // AUTO-LOAD ON MOUNT
  // ============================================================
  useEffect(() => {
    if (autoLoad && userId) {
      loadAvailability();
    }
  }, [autoLoad, userId, loadAvailability]);

  return {
    // State
    weeklyAvailability,
    dateOverrides,
    preferences,
    loading,
    error,

    // Core operations
    loadAvailability,
    setDayAvailability,
    setDateOverride,
    removeDateOverride,
    updatePreferences,

    // Query operations
    getAvailabilityForDate,
    getAvailabilityForRange,
    getBlockedDaysOfWeek,
    getPreferredDaysOfWeek,

    // Bulk operations
    setMultipleDayAvailabilities,
    clearAllOverrides,

    // Utilities
    isDateBlocked,
    isDatePreferred,
    canScheduleWorkout,
  };
}

export default useUserAvailability;
