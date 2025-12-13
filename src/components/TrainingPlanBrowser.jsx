import { useState, useMemo } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Box,
  Button,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Paper,
  Progress,
  Divider,
  ThemeIcon,
  Timeline,
  Alert,
  Menu,
  ActionIcon,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { formatLocalDate, addDays, toNoonUTC, parsePlanStartDate } from '../utils/dateUtils';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { toNoonUTCFromTimezone, formatLocalDateInTimezone, getTodayInTimezone } from '../utils/timezoneUtils';
import {
  IconTarget,
  IconClock,
  IconTrendingUp,
  IconCalendar,
  IconInfoCircle,
  IconChevronRight,
  IconCheck,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconDotsVertical,
  IconX,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { getAllPlans, getPlansByGoal, getPlansByFitnessLevel } from '../data/trainingPlanTemplates';
import { TRAINING_PHASES, GOAL_TYPES, FITNESS_LEVELS, WORKOUT_TYPES } from '../utils/trainingPlans';
import { WORKOUT_LIBRARY } from '../data/workoutLibrary';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Training Plan Browser Component
 * Allows users to browse, preview, and activate training plans
 */
const TrainingPlanBrowser = ({ activePlan, onPlanActivated, compact = false }) => {
  const { user } = useAuth();
  const { timezone } = useUserPreferences();
  const [filter, setFilter] = useState('all');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [managingPlan, setManagingPlan] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedStartDate, setSelectedStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0); // Use noon to avoid timezone boundary issues
    return tomorrow;
  });
  const [planToActivate, setPlanToActivate] = useState(null);

  // Get all plans and filter
  const allPlans = useMemo(() => getAllPlans(), []);

  // Helper to get plan start date (supports both old and new schema)
  const getPlanStartDate = (plan) => plan?.started_at || plan?.start_date;

  // Calculate plan progress
  const getPlanProgress = (plan) => {
    const planStart = getPlanStartDate(plan);
    if (!planStart) return { week: 1, progress: 0, daysRemaining: 0 };

    // Use parsePlanStartDate for timezone-safe parsing
    const startDate = parsePlanStartDate(planStart);
    if (!startDate) return { week: 1, progress: 0, daysRemaining: 0 };

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare at midnight to avoid partial day issues
    const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const durationWeeks = plan.duration_weeks || 8;
    const currentWeek = Math.min(Math.floor(daysSinceStart / 7) + 1, durationWeeks);
    const totalDays = durationWeeks * 7;
    const progress = Math.min(100, Math.round((daysSinceStart / totalDays) * 100));
    const daysRemaining = Math.max(0, totalDays - daysSinceStart);

    return { week: currentWeek, progress, daysRemaining };
  };

  // Pause/Resume plan
  const handleTogglePause = async () => {
    if (!activePlan?.id) return;
    setManagingPlan(true);

    try {
      const newStatus = activePlan.status === 'paused' ? 'active' : 'paused';
      const updates = {
        status: newStatus,
        paused_at: newStatus === 'paused' ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('training_plans')
        .update(updates)
        .eq('id', activePlan.id);

      if (error) throw error;

      notifications.show({
        title: newStatus === 'paused' ? 'Plan Paused' : 'Plan Resumed',
        message: newStatus === 'paused'
          ? 'Your training plan has been paused. Resume when ready.'
          : 'Your training plan is now active again!',
        color: newStatus === 'paused' ? 'yellow' : 'lime',
      });

      if (onPlanActivated) {
        onPlanActivated({ ...activePlan, ...updates });
      }
    } catch (error) {
      console.error('Failed to toggle plan status:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update plan status',
        color: 'red',
      });
    } finally {
      setManagingPlan(false);
    }
  };

  // Cancel/Delete plan
  const handleDeletePlan = async () => {
    if (!activePlan?.id) return;
    setManagingPlan(true);

    try {
      // Delete planned workouts first
      await supabase
        .from('planned_workouts')
        .delete()
        .eq('plan_id', activePlan.id);

      // Delete the plan
      const { error } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', activePlan.id);

      if (error) throw error;

      notifications.show({
        title: 'Plan Removed',
        message: 'Your training plan has been removed',
        color: 'gray',
      });

      setConfirmDeleteOpen(false);

      if (onPlanActivated) {
        onPlanActivated(null);
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to remove plan',
        color: 'red',
      });
    } finally {
      setManagingPlan(false);
    }
  };

  // Regenerate workouts for existing plan
  const handleRegenerateWorkouts = async () => {
    if (!activePlan?.id) return;
    setManagingPlan(true);

    try {
      // Delete existing planned workouts
      await supabase
        .from('planned_workouts')
        .delete()
        .eq('plan_id', activePlan.id);

      // Get the template for this plan
      const template = allPlans.find(p => p.id === activePlan.template_id);

      // Generate workouts
      const workouts = [];

      // Helper to get workout based on methodology
      const getWorkoutForDay = (methodology, dayOfWeek, weekNum, totalWeeks) => {
        const isRecoveryWeek = weekNum % 4 === 0;

        const defaultPatterns = {
          polarized: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'endurance', workout: 'endurance_base_build' },
              3: { type: 'vo2max', workout: 'five_by_four_vo2' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'endurance', workout: 'polarized_long_ride' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          sweet_spot: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'sweet_spot', workout: 'traditional_sst' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'sweet_spot', workout: 'four_by_twelve_sst' },
              6: { type: 'endurance', workout: 'endurance_base_build' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          threshold: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'threshold', workout: 'two_by_twenty_ftp' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'tempo', workout: 'progressive_tempo' },
              6: { type: 'endurance', workout: 'endurance_base_build' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          pyramidal: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'endurance', workout: 'endurance_base_build' },
              3: { type: 'tempo', workout: 'progressive_tempo' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'endurance', workout: 'polarized_long_ride' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          endurance: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'endurance', workout: 'foundation_miles' },
              3: { type: 'endurance', workout: 'endurance_base_build' },
              4: { type: 'rest', workout: null },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'endurance', workout: 'endurance_base_build' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'rest', workout: null },
              5: { type: 'recovery', workout: 'easy_recovery_ride' },
              6: { type: 'rest', workout: null },
            },
          },
        };

        const methodology_key = methodology || 'endurance';
        const methodPattern = defaultPatterns[methodology_key] || defaultPatterns.endurance;
        const weekPattern = isRecoveryWeek ? methodPattern.recovery : methodPattern.regular;
        return weekPattern[dayOfWeek] || { type: 'rest', workout: null };
      };

      const totalWeeks = activePlan.duration_weeks || template?.duration || 8;
      const methodology = activePlan.methodology || template?.methodology || 'endurance';
      // Use parsePlanStartDate for timezone-safe parsing
      const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan)) || new Date();
      planStartDate.setHours(0, 0, 0, 0);

      // Helper to calculate scheduled date - simple offset from start date
      const calculateScheduledDate = (weekNum, dayOfWeek) => {
        // weekNum: 1, 2, 3... (which week of the plan)
        // dayOfWeek: 0-6 (offset within the week)
        const daysFromStart = (weekNum - 1) * 7 + dayOfWeek;
        const workoutDate = addDays(planStartDate, daysFromStart);
        return formatLocalDate(workoutDate);
      };

      // Use template weekTemplates if available
      if (template?.weekTemplates) {
        for (let week = 1; week <= totalWeeks; week++) {
          const weekTemplate = template.weekTemplates[week] || template.weekTemplates[1];
          if (weekTemplate) {
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            dayNames.forEach((dayName, dayIndex) => {
              const dayPlan = weekTemplate[dayName];
              if (dayPlan) {
                const workoutInfo = dayPlan.workout ? WORKOUT_LIBRARY[dayPlan.workout] : null;
                workouts.push({
                  plan_id: activePlan.id,
                  user_id: user.id, // Required by database schema
                  week_number: week,
                  day_of_week: dayIndex,
                  scheduled_date: calculateScheduledDate(week, dayIndex),
                  workout_type: dayPlan.workout ? (workoutInfo?.category || 'endurance') : 'rest',
                  workout_id: dayPlan.workout || null,
                  name: workoutInfo?.name || (dayPlan.workout ? 'Workout' : 'Rest Day'), // Required NOT NULL
                  duration_minutes: workoutInfo?.duration || 0, // Required NOT NULL
                  notes: dayPlan.notes || '',
                  target_tss: workoutInfo?.targetTSS || 0,
                  target_duration: workoutInfo?.duration || 0,
                  completed: false,
                });
              }
            });
          }
        }
      } else {
        // Generate based on methodology
        for (let week = 1; week <= totalWeeks; week++) {
          for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const dayWorkout = getWorkoutForDay(methodology, dayOfWeek, week, totalWeeks);
            const workoutInfo = dayWorkout.workout ? WORKOUT_LIBRARY[dayWorkout.workout] : null;
            workouts.push({
              plan_id: activePlan.id,
              user_id: user.id, // Required by database schema
              week_number: week,
              day_of_week: dayOfWeek,
              scheduled_date: calculateScheduledDate(week, dayOfWeek),
              workout_type: dayWorkout.type || 'rest',
              workout_id: dayWorkout.workout || null,
              name: workoutInfo?.name || (dayWorkout.type === 'rest' ? 'Rest Day' : `${dayWorkout.type || 'Workout'}`), // Required NOT NULL
              duration_minutes: workoutInfo?.duration || 0, // Required NOT NULL
              notes: '',
              target_tss: workoutInfo?.targetTSS || 0,
              target_duration: workoutInfo?.duration || 0,
              completed: false,
            });
          }
        }
      }

      if (workouts.length > 0) {
        const { error: workoutError } = await supabase
          .from('planned_workouts')
          .insert(workouts);

        if (workoutError) throw workoutError;
      }

      notifications.show({
        title: 'Workouts Generated',
        message: `Created ${workouts.length} workouts for your plan`,
        color: 'lime',
        icon: <IconCheck size={16} />,
      });

      // Refresh the plan
      if (onPlanActivated) {
        const { data: refreshedPlan } = await supabase
          .from('training_plans')
          .select('*')
          .eq('id', activePlan.id)
          .single();
        if (refreshedPlan) onPlanActivated(refreshedPlan);
      }
    } catch (error) {
      console.error('Failed to regenerate workouts:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to generate workouts',
        color: 'red',
      });
    } finally {
      setManagingPlan(false);
    }
  };

  // End plan early (mark as completed)
  const handleEndPlan = async () => {
    if (!activePlan?.id) return;
    setManagingPlan(true);

    try {
      const { error } = await supabase
        .from('training_plans')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', activePlan.id);

      if (error) throw error;

      notifications.show({
        title: 'Plan Completed',
        message: 'Great work! Your training plan has been marked as complete.',
        color: 'lime',
        icon: <IconCheck size={16} />,
      });

      if (onPlanActivated) {
        onPlanActivated(null);
      }
    } catch (error) {
      console.error('Failed to end plan:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to complete plan',
        color: 'red',
      });
    } finally {
      setManagingPlan(false);
    }
  };

  const filteredPlans = useMemo(() => {
    if (filter === 'all') return allPlans;
    if (['beginner', 'intermediate', 'advanced'].includes(filter)) {
      return getPlansByFitnessLevel(filter);
    }
    return getPlansByGoal(filter);
  }, [allPlans, filter]);

  // Get methodology color
  const getMethodologyColor = (methodology) => {
    const colors = {
      polarized: 'blue',
      sweet_spot: 'orange',
      pyramidal: 'grape',
      threshold: 'red',
      endurance: 'teal',
    };
    return colors[methodology] || 'gray';
  };

  // Get goal icon
  const getGoalIcon = (goal) => {
    return GOAL_TYPES[goal]?.icon || '🚴';
  };

  // Show date picker modal before activation
  const handleShowDatePicker = (plan) => {
    if (!user?.id) {
      notifications.show({
        title: 'Sign In Required',
        message: 'Please sign in to start a training plan',
        color: 'yellow',
      });
      return;
    }
    // Close the preview modal first
    setPreviewOpen(false);
    setPlanToActivate(plan);
    // Reset date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    setSelectedStartDate(tomorrow);
    setDatePickerOpen(true);
  };

  // Activate a training plan with specified start date
  const handleActivatePlan = async (plan, startDate) => {
    if (!user?.id || !startDate) {
      return;
    }

    setActivating(true);
    setDatePickerOpen(false);

    try {
      // Deactivate any existing active plan
      if (activePlan?.id) {
        await supabase
          .from('training_plans')
          .update({ status: 'completed', ended_at: new Date().toISOString() })
          .eq('id', activePlan.id);
      }

      // Use the provided start date
      const planStartDate = new Date(startDate);

      // Extract the calendar day the user selected (in browser local time)
      // and store at noon UTC - this preserves the intended date without timezone shifts
      const year = planStartDate.getFullYear();
      const month = planStartDate.getMonth();
      const day = planStartDate.getDate();
      const startDateISO = new Date(Date.UTC(year, month, day, 12, 0, 0, 0)).toISOString();

      const { data: newPlan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          template_id: plan.id,
          name: plan.name,
          duration_weeks: plan.duration,
          methodology: plan.methodology,
          goal: plan.goal,
          fitness_level: plan.fitnessLevel,
          started_at: startDateISO,
          start_date: startDateISO, // Include for backwards compatibility
          status: 'active',
        })
        .select()
        .single();

      if (planError) throw planError;

      // Generate planned workouts for each week
      const workouts = [];

      // Helper to get workout based on methodology and fitness level
      const getWorkoutForDay = (methodology, fitnessLevel, dayOfWeek, weekNum, totalWeeks) => {
        // Determine phase (base, build, peak, taper)
        const progress = weekNum / totalWeeks;
        let phase = 'base';
        if (progress > 0.3 && progress <= 0.6) phase = 'build';
        else if (progress > 0.6 && progress <= 0.85) phase = 'peak';
        else if (progress > 0.85) phase = 'taper';

        // Recovery week every 4th week
        const isRecoveryWeek = weekNum % 4 === 0;

        // Default workout patterns by day of week (0=Sun, 1=Mon, ...)
        // Most plans: Mon=recovery, Tue=endurance, Wed=intensity, Thu=easy, Fri=tempo/sst, Sat=long, Sun=rest
        const defaultPatterns = {
          polarized: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'endurance', workout: 'endurance_base_build' },
              3: { type: 'vo2max', workout: 'five_by_four_vo2' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'endurance', workout: 'polarized_long_ride' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          sweet_spot: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'sweet_spot', workout: 'traditional_sst' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'sweet_spot', workout: 'four_by_twelve_sst' },
              6: { type: 'endurance', workout: 'endurance_base_build' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          threshold: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'threshold', workout: 'two_by_twenty_ftp' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'tempo', workout: 'progressive_tempo' },
              6: { type: 'endurance', workout: 'endurance_base_build' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          pyramidal: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'endurance', workout: 'endurance_base_build' },
              3: { type: 'tempo', workout: 'progressive_tempo' },
              4: { type: 'recovery', workout: 'recovery_spin' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'endurance', workout: 'polarized_long_ride' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'recovery', workout: 'easy_recovery_ride' },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'rest', workout: null },
            },
          },
          endurance: {
            regular: {
              0: { type: 'rest', workout: null },
              1: { type: 'recovery', workout: 'easy_recovery_ride' },
              2: { type: 'endurance', workout: 'foundation_miles' },
              3: { type: 'endurance', workout: 'endurance_base_build' },
              4: { type: 'rest', workout: null },
              5: { type: 'endurance', workout: 'foundation_miles' },
              6: { type: 'endurance', workout: 'endurance_base_build' },
            },
            recovery: {
              0: { type: 'rest', workout: null },
              1: { type: 'rest', workout: null },
              2: { type: 'recovery', workout: 'recovery_spin' },
              3: { type: 'endurance', workout: 'foundation_miles' },
              4: { type: 'rest', workout: null },
              5: { type: 'recovery', workout: 'easy_recovery_ride' },
              6: { type: 'rest', workout: null },
            },
          },
        };

        // Get the appropriate pattern
        const methodPattern = defaultPatterns[methodology] || defaultPatterns.endurance;
        const weekPattern = isRecoveryWeek ? methodPattern.recovery : methodPattern.regular;
        return weekPattern[dayOfWeek] || { type: 'rest', workout: null };
      };

      // Helper to calculate scheduled date for a workout
      // Simple offset: Day 0 of Week 1 = start date, Day 1 = start date + 1, etc.
      const calculateScheduledDate = (weekNum, dayOfWeek) => {
        // weekNum: 1, 2, 3... (which week of the plan)
        // dayOfWeek: 0-6 (offset within the week)
        const daysFromStart = (weekNum - 1) * 7 + dayOfWeek;
        const workoutDate = addDays(planStartDate, daysFromStart);
        return formatLocalDate(workoutDate);
      };

      // Use explicit weekTemplates if available, otherwise generate
      if (plan.weekTemplates) {
        for (let week = 1; week <= plan.duration; week++) {
          const weekTemplate = plan.weekTemplates[week] || plan.weekTemplates[1];

          if (weekTemplate) {
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

            dayNames.forEach((dayName, dayIndex) => {
              const dayPlan = weekTemplate[dayName];
              if (dayPlan) {
                const workoutInfo = dayPlan.workout ? WORKOUT_LIBRARY[dayPlan.workout] : null;

                workouts.push({
                  plan_id: newPlan.id,
                  user_id: user.id, // Required by database schema
                  week_number: week,
                  day_of_week: dayIndex,
                  scheduled_date: calculateScheduledDate(week, dayIndex),
                  workout_type: dayPlan.workout ? (workoutInfo?.category || 'endurance') : 'rest',
                  workout_id: dayPlan.workout || null,
                  name: workoutInfo?.name || (dayPlan.workout ? 'Workout' : 'Rest Day'), // Required NOT NULL
                  duration_minutes: workoutInfo?.duration || 0, // Required NOT NULL
                  notes: dayPlan.notes || '',
                  target_tss: workoutInfo?.targetTSS || 0,
                  target_duration: workoutInfo?.duration || 0,
                  completed: false,
                });
              }
            });
          }
        }
      } else {
        // Generate workouts based on methodology
        for (let week = 1; week <= plan.duration; week++) {
          for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const dayWorkout = getWorkoutForDay(
              plan.methodology,
              plan.fitnessLevel,
              dayOfWeek,
              week,
              plan.duration
            );

            const workoutInfo = dayWorkout.workout ? WORKOUT_LIBRARY[dayWorkout.workout] : null;

            workouts.push({
              plan_id: newPlan.id,
              user_id: user.id, // Required by database schema
              week_number: week,
              day_of_week: dayOfWeek,
              scheduled_date: calculateScheduledDate(week, dayOfWeek),
              workout_type: dayWorkout.type || 'rest',
              workout_id: dayWorkout.workout || null,
              name: workoutInfo?.name || (dayWorkout.type === 'rest' ? 'Rest Day' : `${dayWorkout.type || 'Workout'}`), // Required NOT NULL
              duration_minutes: workoutInfo?.duration || 0, // Required NOT NULL
              notes: '',
              target_tss: workoutInfo?.targetTSS || 0,
              target_duration: workoutInfo?.duration || 0,
              completed: false,
            });
          }
        }
      }

      if (workouts.length > 0) {
        console.log(`Inserting ${workouts.length} workouts for plan ${newPlan.id}`);
        console.log('Sample workout:', workouts[0]);
        console.log('Current user ID:', user.id);

        // Verify the plan was created and is accessible
        const { data: verifyPlan, error: verifyError } = await supabase
          .from('training_plans')
          .select('id, user_id')
          .eq('id', newPlan.id)
          .single();

        if (verifyError || !verifyPlan) {
          console.error('Plan verification failed:', verifyError);
          throw new Error('Failed to verify plan was created');
        }

        console.log('Plan verified:', verifyPlan);

        // Insert workouts - try bulk first, then fall back to individual inserts
        const { error: workoutError } = await supabase
          .from('planned_workouts')
          .insert(workouts);

        if (workoutError) {
          console.error('Failed to create workouts (bulk):', workoutError);
          console.error('Error details:', JSON.stringify(workoutError, null, 2));

          // Try inserting in smaller batches
          console.log('Attempting batch insert...');
          const batchSize = 10;
          let successCount = 0;

          for (let i = 0; i < workouts.length; i += batchSize) {
            const batch = workouts.slice(i, i + batchSize);
            const { error: batchError } = await supabase
              .from('planned_workouts')
              .insert(batch);

            if (batchError) {
              console.error(`Batch ${i / batchSize + 1} failed:`, batchError);
            } else {
              successCount += batch.length;
            }
          }

          if (successCount > 0) {
            console.log(`Created ${successCount} of ${workouts.length} workouts via batch insert`);
            notifications.show({
              title: 'Partial Success',
              message: `Created ${successCount} of ${workouts.length} workouts.`,
              color: 'yellow',
            });
          } else {
            // Try using the database function as last resort
            console.log('Attempting database function fallback...');
            try {
              const { data: funcResult, error: funcError } = await supabase
                .rpc('create_planned_workouts', {
                  p_plan_id: newPlan.id,
                  p_workouts: workouts,
                });

              if (funcError) {
                console.error('Database function failed:', funcError);
                notifications.show({
                  title: 'Warning',
                  message: 'Plan activated but workouts could not be created. Please run the database migration.',
                  color: 'red',
                });
              } else {
                console.log(`Created ${funcResult} workouts via database function`);
              }
            } catch (funcErr) {
              console.error('Database function not available:', funcErr);
              notifications.show({
                title: 'Warning',
                message: 'Plan activated but workouts could not be created. Please run database migration 011.',
                color: 'red',
              });
            }
          }
        } else {
          console.log(`Successfully created ${workouts.length} workouts for plan`);
        }
      } else {
        console.warn('No workouts generated for plan - check template structure');
      }

      const formattedDate = planStartDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
      notifications.show({
        title: 'Plan Activated',
        message: `${plan.name} starts ${formattedDate}!`,
        color: 'lime',
        icon: <IconCheck size={16} />,
      });

      setPreviewOpen(false);
      setSelectedPlan(null);
      setPlanToActivate(null);

      if (onPlanActivated) {
        onPlanActivated(newPlan);
      }
    } catch (error) {
      console.error('Failed to activate plan:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to activate training plan. Please try again.',
        color: 'red',
      });
    } finally {
      setActivating(false);
    }
  };

  // Preview a plan
  const handlePreviewPlan = (plan) => {
    setSelectedPlan(plan);
    setPreviewOpen(true);
  };

  // Render plan card
  const renderPlanCard = (plan) => (
    <Card
      key={plan.id}
      withBorder
      p="md"
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s',
        borderColor: tokens.colors.bgTertiary,
      }}
      onClick={() => handlePreviewPlan(plan)}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box style={{ flex: 1 }}>
            <Group gap="xs" mb={4}>
              <Text size="lg">{getGoalIcon(plan.goal)}</Text>
              <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary }}>
                {plan.name}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {plan.description}
            </Text>
          </Box>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Badge size="xs" color={getMethodologyColor(plan.methodology)} variant="light">
            {plan.methodology}
          </Badge>
          <Badge size="xs" variant="outline">
            {plan.duration} weeks
          </Badge>
          <Badge size="xs" color="gray" variant="light">
            {FITNESS_LEVELS[plan.fitnessLevel]?.name || plan.fitnessLevel}
          </Badge>
        </Group>

        <Group gap="lg">
          <Group gap={4}>
            <IconClock size={14} style={{ color: tokens.colors.textMuted }} />
            <Text size="xs" c="dimmed">
              {plan.hoursPerWeek?.min}-{plan.hoursPerWeek?.max} hrs/wk
            </Text>
          </Group>
          <Group gap={4}>
            <IconTrendingUp size={14} style={{ color: tokens.colors.textMuted }} />
            <Text size="xs" c="dimmed">
              {plan.weeklyTSS?.min}-{plan.weeklyTSS?.max} TSS
            </Text>
          </Group>
        </Group>

        <Button
          variant="light"
          color="lime"
          size="xs"
          fullWidth
          rightSection={<IconChevronRight size={14} />}
        >
          Preview Plan
        </Button>
      </Stack>
    </Card>
  );

  // Render plan preview modal
  const renderPlanPreview = () => {
    if (!selectedPlan) return null;

    return (
      <Modal
        opened={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={
          <Group gap="sm">
            <Text size="xl">{getGoalIcon(selectedPlan.goal)}</Text>
            <Text fw={600} size="lg">{selectedPlan.name}</Text>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          {/* Plan Overview */}
          <Text size="sm" c="dimmed">{selectedPlan.description}</Text>

          {/* Key Stats */}
          <SimpleGrid cols={3} spacing="xs">
            <Paper p="sm" withBorder ta="center">
              <IconCalendar size={20} style={{ color: tokens.colors.textMuted, marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.duration}</Text>
              <Text size="xs" c="dimmed">weeks</Text>
            </Paper>
            <Paper p="sm" withBorder ta="center">
              <IconClock size={20} style={{ color: tokens.colors.textMuted, marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.hoursPerWeek?.min}-{selectedPlan.hoursPerWeek?.max}</Text>
              <Text size="xs" c="dimmed">hrs/week</Text>
            </Paper>
            <Paper p="sm" withBorder ta="center">
              <IconTrendingUp size={20} style={{ color: tokens.colors.textMuted, marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.weeklyTSS?.min}-{selectedPlan.weeklyTSS?.max}</Text>
              <Text size="xs" c="dimmed">weekly TSS</Text>
            </Paper>
          </SimpleGrid>

          {/* Badges */}
          <Group gap="xs">
            <Badge color={getMethodologyColor(selectedPlan.methodology)} variant="filled">
              {selectedPlan.methodology} Training
            </Badge>
            <Badge color="gray" variant="light">
              {FITNESS_LEVELS[selectedPlan.fitnessLevel]?.name}
            </Badge>
            <Badge color="blue" variant="light">
              {GOAL_TYPES[selectedPlan.goal]?.name}
            </Badge>
          </Group>

          <Divider />

          {/* Phases Timeline */}
          <Box>
            <Text fw={600} size="sm" mb="sm">Training Phases</Text>
            <Timeline active={-1} bulletSize={24} lineWidth={2}>
              {selectedPlan.phases?.map((phase, idx) => {
                const phaseInfo = TRAINING_PHASES[phase.phase];
                const weekRange = phase.weeks.length === 1
                  ? `Week ${phase.weeks[0]}`
                  : `Weeks ${phase.weeks[0]}-${phase.weeks[phase.weeks.length - 1]}`;

                return (
                  <Timeline.Item
                    key={idx}
                    bullet={
                      <ThemeIcon size={24} color={phaseInfo?.color || 'gray'} radius="xl">
                        <IconTarget size={14} />
                      </ThemeIcon>
                    }
                    title={
                      <Group gap="xs">
                        <Text size="sm" fw={500}>{phaseInfo?.name || phase.phase}</Text>
                        <Badge size="xs" variant="light">{weekRange}</Badge>
                      </Group>
                    }
                  >
                    <Text size="xs" c="dimmed">{phase.focus}</Text>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </Box>

          {/* Expected Gains */}
          {selectedPlan.expectedGains && (
            <>
              <Divider />
              <Box>
                <Text fw={600} size="sm" mb="sm">Expected Outcomes</Text>
                <Stack gap="xs">
                  {Object.entries(selectedPlan.expectedGains).map(([key, value]) => (
                    <Group key={key} gap="sm">
                      <ThemeIcon size="sm" color="lime" variant="light">
                        <IconCheck size={12} />
                      </ThemeIcon>
                      <Text size="sm">
                        <Text span fw={500}>{key.replace(/_/g, ' ')}: </Text>
                        {value}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Target Audience */}
          {selectedPlan.targetAudience && (
            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              <Text size="sm">{selectedPlan.targetAudience}</Text>
            </Alert>
          )}

          {/* Activate Button */}
          <Button
            color="lime"
            size="md"
            fullWidth
            leftSection={<IconPlayerPlay size={18} />}
            onClick={() => handleShowDatePicker(selectedPlan)}
            loading={activating}
            disabled={activePlan?.template_id === selectedPlan.id}
          >
            {activePlan?.template_id === selectedPlan.id
              ? 'Currently Active'
              : activePlan
              ? 'Switch to This Plan'
              : 'Start This Plan'}
          </Button>

          {activePlan && activePlan.template_id !== selectedPlan.id && (
            <Text size="xs" c="dimmed" ta="center">
              Starting a new plan will end your current plan
            </Text>
          )}
        </Stack>
      </Modal>
    );
  };

  // Compact view for sidebar
  if (compact) {
    return (
      <Card withBorder p="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <ThemeIcon size="md" color="lime" variant="light">
              <IconCalendar size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">Training Plans</Text>
          </Group>
          <Badge size="xs" color="lime" variant="light">
            {allPlans.length} plans
          </Badge>
        </Group>

        <Stack gap="xs">
          {allPlans.slice(0, 3).map((plan) => (
            <Paper
              key={plan.id}
              p="sm"
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={() => handlePreviewPlan(plan)}
            >
              <Group justify="space-between">
                <Box>
                  <Text size="sm" fw={500}>{plan.name}</Text>
                  <Text size="xs" c="dimmed">{plan.duration} weeks</Text>
                </Box>
                <IconChevronRight size={16} style={{ color: tokens.colors.textMuted }} />
              </Group>
            </Paper>
          ))}

          <Button variant="subtle" color="lime" size="xs" fullWidth>
            View All Plans
          </Button>
        </Stack>

        {renderPlanPreview()}
      </Card>
    );
  }

  // Full view
  return (
    <Box>
      {/* Filter Controls */}
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Text fw={600} size="lg" style={{ color: tokens.colors.textPrimary }}>
          Training Plans
        </Text>
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Beginner', value: 'beginner' },
            { label: 'Intermediate', value: 'intermediate' },
            { label: 'Advanced', value: 'advanced' },
          ]}
        />
      </Group>

      {/* Goal Filter Badges */}
      <Group gap="xs" mb="md">
        {Object.entries(GOAL_TYPES).map(([key, goal]) => (
          <Badge
            key={key}
            variant={filter === key ? 'filled' : 'light'}
            color={filter === key ? 'lime' : 'gray'}
            style={{ cursor: 'pointer' }}
            onClick={() => setFilter(filter === key ? 'all' : key)}
          >
            {goal.icon} {goal.name}
          </Badge>
        ))}
      </Group>

      {/* Active Plan Card with Management */}
      {activePlan && (
        <Card withBorder mb="md" p="md" style={{ borderColor: tokens.colors.electricLime, borderWidth: 2 }}>
          <Group justify="space-between" mb="sm">
            <Group gap="sm">
              <ThemeIcon size="lg" color="lime" variant="light">
                <IconPlayerPlay size={18} />
              </ThemeIcon>
              <Box>
                <Text fw={600}>{activePlan.name}</Text>
                <Text size="xs" c="dimmed">
                  Started {getPlanStartDate(activePlan) ? new Date(getPlanStartDate(activePlan)).toLocaleDateString() : 'Not started'}
                </Text>
              </Box>
            </Group>

            <Group gap="xs">
              <Badge
                color={activePlan.status === 'paused' ? 'yellow' : 'lime'}
                variant="filled"
              >
                {activePlan.status === 'paused' ? 'Paused' : 'Active'}
              </Badge>

              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray">
                    <IconDotsVertical size={16} />
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>Plan Actions</Menu.Label>
                  <Menu.Item
                    leftSection={activePlan.status === 'paused' ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
                    onClick={handleTogglePause}
                    disabled={managingPlan}
                  >
                    {activePlan.status === 'paused' ? 'Resume Plan' : 'Pause Plan'}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconCheck size={14} />}
                    onClick={handleEndPlan}
                    disabled={managingPlan}
                  >
                    Mark as Complete
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconRefresh size={14} />}
                    onClick={handleRegenerateWorkouts}
                    disabled={managingPlan}
                  >
                    Regenerate Workouts
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={managingPlan}
                  >
                    Remove Plan
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>

          {/* Progress Bar */}
          {(() => {
            const { week, progress, daysRemaining } = getPlanProgress(activePlan);
            return (
              <Box>
                <Group justify="space-between" mb={4}>
                  <Text size="xs" c="dimmed">Week {week} of {activePlan.duration_weeks}</Text>
                  <Text size="xs" c="dimmed">{daysRemaining} days remaining</Text>
                </Group>
                <Progress value={progress} color="lime" size="sm" radius="xl" />
                {activePlan.compliance_percentage > 0 && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Compliance: {Math.round(activePlan.compliance_percentage)}% ({activePlan.workouts_completed}/{activePlan.workouts_total} workouts)
                  </Text>
                )}
              </Box>
            );
          })()}
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        opened={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Remove Training Plan"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to remove "{activePlan?.name}"? This will delete all scheduled workouts and cannot be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDeletePlan} loading={managingPlan}>
              Remove Plan
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Start Date Picker Modal */}
      <Modal
        opened={datePickerOpen}
        onClose={() => {
          setDatePickerOpen(false);
          setPlanToActivate(null);
        }}
        title={
          <Group gap="sm">
            <ThemeIcon size="lg" color="lime" variant="light">
              <IconCalendar size={18} />
            </ThemeIcon>
            <Box>
              <Text fw={600}>Choose Start Date</Text>
              {planToActivate && (
                <Text size="xs" c="dimmed">{planToActivate.name}</Text>
              )}
            </Box>
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="md">
          {/* Visual Calendar */}
          <Box style={{ display: 'flex', justifyContent: 'center' }}>
            <DatePicker
              value={selectedStartDate}
              onChange={(date) => {
                // Handle date selection - date can be Date, null, or undefined
                if (date) {
                  // Ensure we have a proper Date object
                  const dateObj = date instanceof Date ? date : new Date(date);
                  if (!isNaN(dateObj.getTime())) {
                    // CRITICAL: Normalize to NOON local time using year/month/day
                    // Using noon (not midnight) provides buffer against timezone boundary issues
                    const localDate = new Date(
                      dateObj.getFullYear(),
                      dateObj.getMonth(),
                      dateObj.getDate(),
                      12, 0, 0, 0
                    );
                    setSelectedStartDate(localDate);
                  }
                }
              }}
              minDate={(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return today;
              })()}
              size="md"
              highlightToday
              allowDeselect={false}
            />
          </Box>

          {/* Date Summary */}
          {selectedStartDate && planToActivate && (
            <Paper p="md" withBorder radius="md" style={{ backgroundColor: `${tokens.colors.electricLime}10` }}>
              <SimpleGrid cols={2}>
                <Box>
                  <Text size="xs" c="dimmed" tt="uppercase">Starts</Text>
                  <Text fw={600}>
                    {selectedStartDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed" tt="uppercase">Ends</Text>
                  <Text fw={600}>
                    {(() => {
                      const endDate = new Date(selectedStartDate);
                      endDate.setDate(endDate.getDate() + (planToActivate.duration * 7) - 1);
                      return endDate.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                    })()}
                  </Text>
                </Box>
              </SimpleGrid>
              <Text size="xs" c="dimmed" ta="center" mt="sm">
                {planToActivate.duration} weeks • {planToActivate.methodology?.replace('_', ' ')} training
              </Text>
            </Paper>
          )}

          <Divider />

          <Group justify="space-between">
            <Button
              variant="subtle"
              onClick={() => {
                setDatePickerOpen(false);
                setPlanToActivate(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="lime"
              size="md"
              leftSection={<IconPlayerPlay size={18} />}
              onClick={() => handleActivatePlan(planToActivate, selectedStartDate)}
              loading={activating}
              disabled={!selectedStartDate}
            >
              Start Training
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Plan Grid */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {filteredPlans.map(renderPlanCard)}
      </SimpleGrid>

      {filteredPlans.length === 0 && (
        <Paper p="xl" ta="center" withBorder>
          <Text c="dimmed">No plans match your filter criteria</Text>
        </Paper>
      )}

      {renderPlanPreview()}
    </Box>
  );
};

export default TrainingPlanBrowser;
