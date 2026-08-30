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
  Tabs,
  ScrollArea,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { formatLocalDate, addDays, parsePlanStartDate } from '../utils/dateUtils';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import { getAllPlans, getPlansByGoal, getPlansByFitnessLevel, getPlansByCategory } from '../data/trainingPlanTemplates';
import { getAllRunningPlans, getRunningPlansByCategory } from '../data/runningPlanTemplates';
import { TRAINING_PHASES, GOAL_TYPES, FITNESS_LEVELS, WORKOUT_TYPES, PLAN_CATEGORIES, redistributeWorkouts } from '../utils/trainingPlans';
import { WORKOUT_LIBRARY } from '../data/workoutLibrary';
import { RUNNING_WORKOUT_LIBRARY } from '../data/runningWorkoutLibrary';
import { supabase } from '../lib/supabase';
import { insertSessions } from '../lib/calendar/calendarMutations';
import { useAuth } from '../contexts/AuthContext';
import { trackFeature, EventType } from '../utils/activityTracking';
import { ArrowsClockwise, Bicycle, Calendar, CaretRight, Check, Clock, DotsThreeVertical, Info, Pause, PersonSimpleRun, Play, Target, Trash, TrendUp, X } from '@phosphor-icons/react';

/**
 * Training Plan Browser Component
 * Allows users to browse, preview, and activate training plans
 */
const TrainingPlanBrowser = ({ activePlan, onPlanActivated, compact = false }) => {
  const { user } = useAuth();
  const [sportFilter, setSportFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
    return tomorrow;
  });
  const [planToActivate, setPlanToActivate] = useState(null);

  // Get all plans (cycling + running) and filter by sport
  const allPlans = useMemo(() => {
    const cycling = getAllPlans().map(p => ({ ...p, sportType: p.sportType || 'cycling' }));
    const running = getAllRunningPlans().map(p => ({ ...p, sportType: p.sportType || 'running' }));
    const combined = [...cycling, ...running];
    if (sportFilter === 'cycling') return cycling;
    if (sportFilter === 'running') return running;
    return combined;
  }, [sportFilter]);

  // Helper to look up a workout in the correct library by sport type
  const getWorkoutFromLibrary = (workoutId, planSportType) => {
    if (!workoutId) return null;
    if (planSportType === 'running') {
      return RUNNING_WORKOUT_LIBRARY[workoutId] || WORKOUT_LIBRARY[workoutId] || null;
    }
    return WORKOUT_LIBRARY[workoutId] || RUNNING_WORKOUT_LIBRARY[workoutId] || null;
  };

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

      trackFeature(
        newStatus === 'paused' ? EventType.TRAINING_PLAN_PAUSE : EventType.TRAINING_PLAN_RESUME,
        { planId: activePlan.id, planName: activePlan.name }
      );

      notifications.show({
        title: newStatus === 'paused' ? 'Plan Paused' : 'Plan Resumed',
        message: newStatus === 'paused'
          ? 'Your training plan has been paused. Resume when ready.'
          : 'Your training plan is now active again!',
        color: newStatus === 'paused' ? 'yellow' : 'terracotta',
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
      // Detach the plan's entries rather than deleting them. This used to
      // delete every row with that plan_id — which, on a calendar the athlete
      // owns, means deleting sessions they may have moved, edited or already
      // ridden because a plan they no longer want once created them. A plan is
      // provenance; cancelling it clears the provenance, not the calendar.
      await supabase
        .from('calendar_entries')
        .update({ plan_id: null })
        .eq('user_id', user.id)
        .eq('plan_id', activePlan.id);

      // Delete the plan
      const { error } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', activePlan.id);

      if (error) throw error;

      trackFeature(EventType.TRAINING_PLAN_DELETE, {
        planId: activePlan.id,
        planName: activePlan.name
      });

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
      // Clear the plan's own generated future entries so the regeneration can
      // land. Scoped hard: only rows still carrying this plan_id, only ones the
      // athlete has NOT pinned, only ones not already done, and only from today
      // forward. Regenerating a plan is not licence to rewrite what the athlete
      // did or decided.
      await supabase
        .from('calendar_entries')
        .delete()
        .eq('user_id', user.id)
        .eq('plan_id', activePlan.id)
        .eq('pinned', false)
        .neq('status', 'done')
        .gte('date', formatLocalDate(new Date()));

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
                const workoutInfo = dayPlan.workout ? getWorkoutFromLibrary(dayPlan.workout, activePlan?.sportType || template?.sportType) : null;
                workouts.push({
                  date: calculateScheduledDate(week, dayIndex),
                  type: dayPlan.workout ? 'workout' : 'rest',
                  title: workoutInfo?.name || (dayPlan.workout ? 'Workout' : 'Rest Day'),
                  workout_id: dayPlan.workout || null,
                  workout_type: dayPlan.workout ? (workoutInfo?.category || 'endurance') : 'rest',
                  target_load: workoutInfo?.targetTSS || 0,
                  target_duration_min: workoutInfo?.duration || 0,
                  notes: dayPlan.notes || '',
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
            const workoutInfo = dayWorkout.workout ? getWorkoutFromLibrary(dayWorkout.workout, activePlan?.sportType || template?.sportType) : null;
            workouts.push({
              date: calculateScheduledDate(week, dayOfWeek),
              type: (dayWorkout.type || 'rest') === 'rest' ? 'rest' : 'workout',
              title: workoutInfo?.name || (dayWorkout.type === 'rest' ? 'Rest Day' : `${dayWorkout.type || 'Workout'}`),
              workout_id: dayWorkout.workout || null,
              workout_type: dayWorkout.type || 'rest',
              target_load: workoutInfo?.targetTSS || 0,
              target_duration_min: workoutInfo?.duration || 0,
            });
          }
        }
      }

      let inserted = 0;
      if (workouts.length > 0) {
        const written = await insertSessions(user.id, workouts, {
          source: 'plan',
          planId: activePlan.id,
        });
        if (!written.success) throw new Error(written.error);
        inserted = written.data.inserted;
      }

      notifications.show({
        title: 'Workouts Generated',
        message: `Created ${inserted} workouts for your plan`,
        color: 'terracotta',
        icon: <Check size={16} />,
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
        color: 'terracotta',
        icon: <Check size={16} />,
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
    let plans = allPlans;

    // First filter by category
    if (categoryFilter !== 'all') {
      // Get plans from both libraries matching the category
      const cyclingByCategory = getPlansByCategory(categoryFilter);
      const runningByCategory = getRunningPlansByCategory(categoryFilter);
      const allByCategory = [...cyclingByCategory, ...runningByCategory];
      // Intersect with current sport-filtered list
      const planIds = new Set(plans.map(p => p.id));
      plans = allByCategory.filter(p => planIds.has(p.id));
    }

    // Then filter by fitness level or goal
    if (filter !== 'all') {
      if (['beginner', 'intermediate', 'advanced'].includes(filter)) {
        plans = plans.filter(p => p.fitnessLevel === filter);
      } else {
        plans = plans.filter(p => p.goal === filter);
      }
    }

    return plans;
  }, [allPlans, categoryFilter, filter]);

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
      // Store the start date as YYYY-MM-DD string (simple, no timezone issues)
      // Create a clean Date object at midnight from the selected date
      const planStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const startDateStr = formatLocalDate(planStartDate);

      // Determine priority: primary if no existing active plan of the same sport, secondary otherwise
      const planSportType = plan.sportType || 'cycling';
      const hasPrimaryOfSameSport = activePlan && (activePlan.sport_type || 'cycling') === planSportType;
      const priority = hasPrimaryOfSameSport ? 'secondary' : 'primary';

      const planData = {
        user_id: user.id,
        template_id: plan.id,
        name: plan.name,
        sport_type: planSportType,
        duration_weeks: plan.duration,
        methodology: plan.methodology,
        goal: plan.goal,
        fitness_level: plan.fitnessLevel,
        started_at: startDateStr,
        start_date: startDateStr,
        status: 'active',
        priority,
      };
      console.log('Creating plan with data:', planData);

      const { data: newPlan, error: planError } = await supabase
        .from('training_plans')
        .insert(planData)
        .select()
        .single();

      if (planError) {
        console.error('Plan creation error:', planError);
        throw planError;
      }
      console.log('Plan created successfully:', newPlan?.id);

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
                const workoutInfo = dayPlan.workout ? getWorkoutFromLibrary(dayPlan.workout, plan.sportType) : null;

                workouts.push({
                  date: calculateScheduledDate(week, dayIndex),
                  type: dayPlan.workout ? 'workout' : 'rest',
                  title: workoutInfo?.name || (dayPlan.workout ? 'Workout' : 'Rest Day'),
                  workout_id: dayPlan.workout || null,
                  workout_type: dayPlan.workout ? (workoutInfo?.category || 'endurance') : 'rest',
                  target_load: workoutInfo?.targetTSS || 0,
                  target_duration_min: workoutInfo?.duration || 0,
                  notes: dayPlan.notes || '',
                  _weekNumber: week,
                  _dayOfWeek: dayIndex,
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

            const workoutInfo = dayWorkout.workout ? getWorkoutFromLibrary(dayWorkout.workout, plan.sportType) : null;

            workouts.push({
              date: calculateScheduledDate(week, dayOfWeek),
              type: (dayWorkout.type || 'rest') === 'rest' ? 'rest' : 'workout',
              title: workoutInfo?.name || (dayWorkout.type === 'rest' ? 'Rest Day' : `${dayWorkout.type || 'Workout'}`),
              workout_id: dayWorkout.workout || null,
              workout_type: dayWorkout.type || 'rest',
              target_load: workoutInfo?.targetTSS || 0,
              target_duration_min: workoutInfo?.duration || 0,
              _weekNumber: week,
              _dayOfWeek: dayOfWeek,
            });
          }
        }
      }

      // Fetch user availability directly (not from hook state, which may not be loaded yet)
      const [dayAvailResult, overridesResult, prefsResult] = await Promise.all([
        supabase
          .from('user_day_availability')
          .select('*')
          .eq('user_id', user.id)
          .order('day_of_week', { ascending: true }),
        supabase
          .from('user_date_overrides')
          .select('*')
          .eq('user_id', user.id)
          .order('specific_date', { ascending: true }),
        supabase
          .from('user_training_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      // Build weekly availability array
      const availDayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayAvailData = dayAvailResult.data || [];
      const dayAvailMap = new Map(dayAvailData.map(d => [d.day_of_week, d]));
      const fetchedAvailability = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dbEntry = dayAvailMap.get(dayIndex);
        fetchedAvailability.push({
          dayOfWeek: dayIndex,
          dayName: availDayNames[dayIndex],
          status: dbEntry
            ? dbEntry.is_blocked ? 'blocked' : dbEntry.is_preferred ? 'preferred' : 'available'
            : 'available',
          maxDurationMinutes: dbEntry?.max_duration_minutes || null,
          notes: dbEntry?.notes || null,
        });
      }

      // Build date overrides map
      const overridesData = overridesResult.data || [];
      const fetchedOverrides = new Map();
      for (const override of overridesData) {
        fetchedOverrides.set(override.specific_date, {
          date: override.specific_date,
          status: override.is_blocked ? 'blocked' : override.is_preferred ? 'preferred' : 'available',
          isOverride: true,
          maxDurationMinutes: override.max_duration_minutes,
          notes: override.notes,
        });
      }

      // Get preferences
      const prefsData = prefsResult.data;
      const fetchedPreferences = {
        maxWorkoutsPerWeek: prefsData?.max_workouts_per_week ?? null,
        preferWeekendLongRides: prefsData?.prefer_weekend_long_rides ?? true,
      };

      // Redistribute workouts based on user availability
      if (fetchedAvailability.some(d => d.status === 'blocked')) {
        const workoutsForRedistribution = workouts
          .filter(w => w.workout_id)
          .map(w => ({
            originalDate: w.date,
            dayOfWeek: w._dayOfWeek,
            weekNumber: w._weekNumber,
            workoutId: w.workout_id,
            workoutType: w.workout_type,
            targetTSS: w.target_load || null,
            targetDuration: w.target_duration_min || null,
          }));

        const redistributions = redistributeWorkouts(
          workoutsForRedistribution,
          fetchedAvailability,
          fetchedOverrides,
          fetchedPreferences
        );

        // Swap dates between a moved workout and whatever the move displaces.
        // The swap is still needed — two drafts on one date would collide on
        // slot 0 — but day_of_week no longer travels with it: the calendar
        // derives that from the date, so there is one field to keep straight
        // instead of two that could disagree.
        for (const r of redistributions) {
          if (r.originalDate !== r.newDate) {
            const movedWorkout = workouts.find(
              w => w.date === r.originalDate && w.workout_id === r.workoutId
            );
            const displacedEntry = workouts.find(
              w => w.date === r.newDate && w !== movedWorkout
            );
            if (movedWorkout) movedWorkout.date = r.newDate;
            if (displacedEntry) displacedEntry.date = r.originalDate;
          }
        }
      }

      let activatedCount = 0;
      if (workouts.length > 0) {
        // Strip the scratch fields the redistributor needed; they are not columns.
        const drafts = workouts.map(({ _weekNumber, _dayOfWeek, ...draft }) => draft);

        // Days the athlete has already filled are skipped, not overwritten, so
        // activating a plan cannot bury a race or a session they scheduled.
        const written = await insertSessions(user.id, drafts, {
          source: 'plan',
          planId: newPlan.id,
        });

        // The bulk → batch → RPC fallback chain that used to live here is gone
        // with the table it worked around. It existed because a plan insert hit
        // NOT NULL columns and a UNIQUE (plan_id, scheduled_date) index that a
        // redistribution could violate; none of those apply to an entry keyed
        // (user_id, date, slot) whose only required fields are a date and a
        // title. A failure now is a real failure and is reported as one.
        if (!written.success) {
          console.error('Failed to write the plan to the calendar:', written.error);
          notifications.show({
            title: 'Warning',
            message: `Plan activated, but its workouts could not be scheduled: ${written.error}`,
            color: 'red',
          });
        } else {
          activatedCount = written.data.inserted;
          const { skipped } = written.data;
          console.log(
            `Scheduled ${activatedCount} session(s) for plan ${newPlan.id}` +
            (skipped > 0 ? `; ${skipped} day(s) already had something and were left alone` : ''),
          );
          if (skipped > 0) {
            notifications.show({
              title: 'Plan Activated',
              message: `${activatedCount} sessions scheduled. ${skipped} day${skipped === 1 ? '' : 's'} already had something on your calendar and ${skipped === 1 ? 'was' : 'were'} left alone.`,
              color: 'yellow',
              autoClose: 8000,
            });
          }
        }
      } else {
        console.warn('No workouts generated for plan - check template structure');
      }

      trackFeature(EventType.TRAINING_PLAN_CREATE, {
        planId: newPlan.id,
        planName: plan.name,
        durationWeeks: plan.duration,
        methodology: plan.methodology,
        goal: plan.goal,
        fitnessLevel: plan.fitnessLevel,
        // What landed, not what was attempted.
        workoutCount: activatedCount
      });

      const formattedDate = planStartDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
      notifications.show({
        title: 'Plan Activated',
        message: `${plan.name} starts ${formattedDate}!`,
        color: 'terracotta',
        icon: <Check size={16} />,
      });

      setPreviewOpen(false);
      setSelectedPlan(null);
      setPlanToActivate(null);

      if (onPlanActivated) {
        onPlanActivated(newPlan);
      }
    } catch (error) {
      console.error('Failed to activate plan:', error);
      console.error('Error message:', error?.message);
      console.error('Error details:', JSON.stringify(error, null, 2));
      notifications.show({
        title: 'Error',
        message: `Failed to activate training plan: ${error?.message || 'Unknown error'}`,
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
        borderColor: 'var(--color-bg-secondary)',
      }}
      onClick={() => handlePreviewPlan(plan)}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box style={{ flex: 1 }}>
            <Group gap="xs" mb={4}>
              <Text size="lg">{getGoalIcon(plan.goal)}</Text>
              <Text fw={600} size="sm" style={{ color: 'var(--color-text-primary)' }}>
                {plan.name}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {plan.description}
            </Text>
          </Box>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Badge
            size="xs"
            color={plan.sportType === 'running' ? 'teal' : 'blue'}
            variant="light"
            leftSection={plan.sportType === 'running' ? <PersonSimpleRun size={10} /> : <Bicycle size={10} />}
          >
            {plan.sportType === 'running' ? 'Running' : 'Cycling'}
          </Badge>
          {plan.category && PLAN_CATEGORIES[plan.category] && (
            <Badge
              size="xs"
              variant="filled"
              style={{ backgroundColor: PLAN_CATEGORIES[plan.category].color }}
            >
              {PLAN_CATEGORIES[plan.category].icon} {PLAN_CATEGORIES[plan.category].name}
            </Badge>
          )}
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
            <Clock size={14} style={{ color: 'var(--color-text-muted)' }} />
            <Text size="xs" c="dimmed">
              {plan.hoursPerWeek?.min}-{plan.hoursPerWeek?.max} hrs/wk
            </Text>
          </Group>
          <Group gap={4}>
            <TrendUp size={14} style={{ color: 'var(--color-text-muted)' }} />
            <Text size="xs" c="dimmed">
              {plan.weeklyTSS?.min}-{plan.weeklyTSS?.max} RSS
            </Text>
          </Group>
        </Group>

        <Button
          variant="light"
          color="teal"
          size="xs"
          fullWidth
          rightSection={<CaretRight size={14} />}
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
          <SimpleGrid cols={{ base: 3 }} spacing="xs">
            <Paper p="sm" withBorder ta="center">
              <Calendar size={20} style={{ color: 'var(--color-text-muted)', marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.duration}</Text>
              <Text size="xs" c="dimmed">weeks</Text>
            </Paper>
            <Paper p="sm" withBorder ta="center">
              <Clock size={20} style={{ color: 'var(--color-text-muted)', marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.hoursPerWeek?.min}-{selectedPlan.hoursPerWeek?.max}</Text>
              <Text size="xs" c="dimmed">hrs/week</Text>
            </Paper>
            <Paper p="sm" withBorder ta="center">
              <TrendUp size={20} style={{ color: 'var(--color-text-muted)', marginBottom: 4 }} />
              <Text size="lg" fw={700}>{selectedPlan.weeklyTSS?.min}-{selectedPlan.weeklyTSS?.max}</Text>
              <Text size="xs" c="dimmed">weekly RSS</Text>
            </Paper>
          </SimpleGrid>

          {/* Badges */}
          <Group gap="xs">
            <Badge
              color={selectedPlan.sportType === 'running' ? 'teal' : 'blue'}
              variant="light"
              leftSection={selectedPlan.sportType === 'running' ? <PersonSimpleRun size={12} /> : <Bicycle size={12} />}
            >
              {selectedPlan.sportType === 'running' ? 'Running' : 'Cycling'}
            </Badge>
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
                        <Target size={14} />
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
                      <ThemeIcon size="sm" color="gray" variant="light">
                        <Check size={12} />
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
            <Alert icon={<Info size={16} />} color="blue" variant="light">
              <Text size="sm">{selectedPlan.targetAudience}</Text>
            </Alert>
          )}

          {/* Activate Button */}
          <Button
            color="teal"
            size="md"
            fullWidth
            leftSection={<Play size={18} />}
            onClick={() => handleShowDatePicker(selectedPlan)}
            loading={activating}
            disabled={activePlan?.template_id === selectedPlan.id}
          >
            {activePlan?.template_id === selectedPlan.id
              ? 'Currently Active'
              : activePlan
              ? 'Add This Plan'
              : 'Start This Plan'}
          </Button>

          {activePlan && activePlan.template_id !== selectedPlan.id && (
            <Text size="xs" c="dimmed" ta="center">
              This plan will be added alongside your current plan
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
            <ThemeIcon size="md" color="gray" variant="light">
              <Calendar size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">Training Plans</Text>
          </Group>
          <Badge size="xs" color="gray" variant="light">
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
                <CaretRight size={16} style={{ color: 'var(--color-text-muted)' }} />
              </Group>
            </Paper>
          ))}

          <Button variant="subtle" color="gray" size="xs" fullWidth>
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
      {/* Header */}
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Text fw={600} size="lg" style={{ color: 'var(--color-text-primary)' }}>
          Training Plans
        </Text>
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={sportFilter}
            onChange={(value) => {
              setSportFilter(value);
              setCategoryFilter('all');
              setFilter('all');
            }}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Cycling', value: 'cycling' },
              { label: 'Running', value: 'running' },
            ]}
          />
          <Badge size="lg" color="gray" variant="light">
            {filteredPlans.length} {filteredPlans.length === 1 ? 'plan' : 'plans'}
          </Badge>
        </Group>
      </Group>

      {/* Category Tabs */}
      <ScrollArea mb="md">
        <Tabs
          value={categoryFilter}
          onChange={(value) => {
            setCategoryFilter(value);
            setFilter('all'); // Reset secondary filter when category changes
          }}
          variant="pills"
          radius="xl"
        >
          <Tabs.List>
            <Tabs.Tab value="all" leftSection="📋">
              All Plans
            </Tabs.Tab>
            {Object.entries(PLAN_CATEGORIES).map(([key, cat]) => (
              <Tabs.Tab
                key={key}
                value={key}
                leftSection={cat.icon}
                style={{
                  '--tab-color': categoryFilter === key ? cat.color : undefined,
                }}
              >
                {cat.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      </ScrollArea>

      {/* Category Description */}
      {categoryFilter !== 'all' && PLAN_CATEGORIES[categoryFilter] && (
        <Paper p="sm" mb="md" withBorder radius="md" style={{ backgroundColor: `${PLAN_CATEGORIES[categoryFilter].color}10` }}>
          <Text size="sm" c="dimmed">
            {PLAN_CATEGORIES[categoryFilter].description}
          </Text>
        </Paper>
      )}

      {/* Secondary Filters */}
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { label: 'All Levels', value: 'all' },
            { label: 'Beginner', value: 'beginner' },
            { label: 'Intermediate', value: 'intermediate' },
            { label: 'Advanced', value: 'advanced' },
          ]}
        />
      </Group>

      {/* Active Plan Card with Management */}
      {activePlan && (
        <Card withBorder mb="md" p="md" style={{ borderColor: 'var(--color-teal)', borderWidth: 2 }}>
          <Group justify="space-between" mb="sm">
            <Group gap="sm">
              <ThemeIcon size="lg" color="teal" variant="light">
                <Play size={18} />
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
                color={activePlan.status === 'paused' ? 'yellow' : 'terracotta'}
                variant="filled"
              >
                {activePlan.status === 'paused' ? 'Paused' : 'Active'}
              </Badge>

              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray">
                    <DotsThreeVertical size={16} />
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>Plan Actions</Menu.Label>
                  <Menu.Item
                    leftSection={activePlan.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                    onClick={handleTogglePause}
                    disabled={managingPlan}
                  >
                    {activePlan.status === 'paused' ? 'Resume Plan' : 'Pause Plan'}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Check size={14} />}
                    onClick={handleEndPlan}
                    disabled={managingPlan}
                  >
                    Mark as Complete
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<ArrowsClockwise size={14} />}
                    onClick={handleRegenerateWorkouts}
                    disabled={managingPlan}
                  >
                    Regenerate Workouts
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<Trash size={14} />}
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
                <Progress value={progress} color="teal" size="sm" radius="xl" />
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
            <ThemeIcon size="lg" color="teal" variant="light">
              <Calendar size={18} />
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
                if (date) {
                  // Convert to native Date first (Mantine may return dayjs object)
                  const nativeDate = new Date(date);
                  // Fix timezone: add offset to correct UTC-to-local shift
                  const corrected = new Date(nativeDate.getTime() + nativeDate.getTimezoneOffset() * 60 * 1000);
                  setSelectedStartDate(corrected);
                }
              }}
              minDate={new Date()}
              size="md"
              highlightToday
              allowDeselect={false}
            />
          </Box>

          {/* Date Summary */}
          {selectedStartDate && planToActivate && (
            <Paper p="md" withBorder radius="md" style={{ backgroundColor: `${'var(--color-teal)'}10` }}>
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
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
              color="teal"
              size="md"
              leftSection={<Play size={18} />}
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
