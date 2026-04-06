import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  ActionIcon,
  Tooltip,
  Button,
  Paper,
  Progress,
  Box,
  Divider,
  SimpleGrid,
  ThemeIcon,
  Popover,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { WORKOUT_TYPES, TRAINING_PHASES, calculateTSS, estimateTSS } from '../utils/trainingPlans';
import { getWorkoutById } from '../data/workoutLibrary';
import { tokens } from '../theme';
import { formatLocalDate, addDays, parsePlanStartDate } from '../utils/dateUtils';
import RaceGoalModal from './RaceGoalModal';
import { StravaLogo, STRAVA_ORANGE } from './StravaBranding';
import { FuelBadge } from './fueling';
import { useCrossTraining, ACTIVITY_CATEGORIES } from '../hooks/useCrossTraining';
import CrossTrainingModal from './CrossTrainingModal';
import { WorkoutModal } from './planner/WorkoutModal';
import { CalendarLibrarySidebar } from './training/CalendarLibrarySidebar';
import { ArrowsLeftRight, Barbell, Bicycle, CalendarBlank, CaretLeft, CaretRight, Check, Circle, Clock, Cloud, CloudLightning, CloudRain, CloudSun, DotsSixVertical, Fire, Heartbeat, Moon, Path, PencilSimple, PersonSimpleRun, PersonSimpleWalk, Plus, Snowflake, Sun, Trash, TrendUp, Trophy, Wind, X } from '@phosphor-icons/react';
import { useWeatherForecast } from '../hooks/useWeatherForecast';
import { useRouteBuilderStore } from '../stores/routeBuilderStore';
import { getWeatherSeverity, formatTemperature } from '../utils/weather';

// Workout type → left border accent color mapping
const WORKOUT_TYPE_ACCENT = {
  endurance: '#2A8C82',    // teal
  vo2max: '#D4600A',       // orange
  threshold: '#D4600A',    // orange
  anaerobic: '#D4600A',    // orange
  sweet_spot: '#C49A0A',   // gold
  tempo: '#C49A0A',        // gold
  recovery: '#9A9990',     // grey
  racing: '#C43C2A',       // coral
  climbing: '#2A8C82',     // teal (similar to endurance)
  strength: '#9A9990',     // grey
  core: '#9A9990',         // grey
  flexibility: '#9A9990',  // grey
  rest: '#9A9990',         // grey
};

// Form bar: number of filled segments based on TSS
const getFormBarSegments = (tss) => {
  if (!tss || tss <= 0) return 0;
  if (tss <= 30) return 1;
  if (tss <= 60) return 2;
  if (tss <= 90) return 3;
  if (tss <= 120) return 4;
  return 5;
};

/**
 * Enhanced Training Calendar Component
 * Displays monthly calendar with planned workouts, completed rides,
 * weekly summaries, race goals, and workout editing capabilities
 */
const TrainingCalendar = ({ activePlan, rides = [], formatDistance: formatDistanceProp, ftp, onPlanUpdated, isImperial = false, refreshKey = 0, editMode = false, trainingMetrics = null }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Weather forecast for calendar days
  const viewport = useRouteBuilderStore.getState().viewport;
  const { forecast: weatherForecast } = useWeatherForecast(
    viewport?.latitude ?? null,
    viewport?.longitude ?? null
  );

  // Map OpenWeatherMap icon codes to Phosphor icons
  const getWeatherIcon = (iconCode, size = 12) => {
    const code = iconCode?.slice(0, 2);
    const isNight = iconCode?.endsWith('n');
    switch (code) {
      case '01': return isNight ? <Moon size={size} /> : <Sun size={size} />;
      case '02': return isNight ? <Cloud size={size} /> : <CloudSun size={size} />;
      case '03': return <Cloud size={size} />;
      case '04': return <Cloud size={size} weight="fill" />;
      case '09': case '10': return <CloudRain size={size} />;
      case '11': return <CloudLightning size={size} />;
      case '13': return <Snowflake size={size} />;
      default: return <Cloud size={size} />;
    }
  };

  // Anchor = Monday of last week (rolling 4-week view starts here)
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=Sun, 1=Mon...
    const daysBack = dow === 0 ? 13 : dow + 6; // back to last week's Monday
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - daysBack);
    return lastMonday;
  });
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Race goals state
  const [raceGoals, setRaceGoals] = useState([]);
  const [raceGoalModalOpen, setRaceGoalModalOpen] = useState(false);
  const [selectedRaceGoal, setSelectedRaceGoal] = useState(null);

  // Cross-training state
  const { fetchActivities, activities: crossTrainingActivities } = useCrossTraining();
  const [crossTrainingModalOpen, setCrossTrainingModalOpen] = useState(false);
  const [crossTrainingDate, setCrossTrainingDate] = useState(null);

  // Modal planned workout state (mapped from raw Supabase row to PlannerWorkout shape)
  const [modalPlannedWorkout, setModalPlannedWorkout] = useState(null);
  const [modalWorkoutDef, setModalWorkoutDef] = useState(null);

  // Drag and drop state
  const [draggedWorkout, setDraggedWorkout] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);

  // Edit mode sidebar state
  const [targetDay, setTargetDay] = useState(null);
  const [sidebarFilterCategory, setSidebarFilterCategory] = useState(null);
  const [libraryDraggedWorkoutId, setLibraryDraggedWorkoutId] = useState(null);

  // Edit mode interactive cell state
  const [popoverDate, setPopoverDate] = useState(null);
  const [moveSource, setMoveSource] = useState(null);
  const [deleteConfirmDate, setDeleteConfirmDate] = useState(null);

  // Helper to get plan start date (supports both old and new schema)
  const getPlanStartDate = (plan) => plan?.started_at || plan?.start_date;

  // Load planned workouts for current 4-week view
  // refreshKey allows parent to force a reload when workouts are added externally
  useEffect(() => {
    if (!user?.id || !activePlan?.id) return;
    loadPlannedWorkouts();
  }, [user?.id, activePlan?.id, anchorDate, refreshKey]);

  const loadPlannedWorkouts = async () => {
    // Early return if no active plan
    if (!activePlan?.id) {
      return;
    }

    try {
      // Calculate date range for the 4-week rolling view
      const startDateStr = formatLocalDate(anchorDate);
      const endDateStr = formatLocalDate(addDays(anchorDate, 28));

      // Query by scheduled_date range for simpler, more reliable matching
      const { data } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('plan_id', activePlan.id)
        .gte('scheduled_date', startDateStr)
        .lte('scheduled_date', endDateStr);

      if (data) {
        setPlannedWorkouts(data);
      }
    } catch (error) {
      console.error('Failed to load planned workouts:', error);
    }
  };

  // Load race goals for current month view
  useEffect(() => {
    if (!user?.id) return;
    loadRaceGoals();
  }, [user?.id, anchorDate]);

  const loadRaceGoals = async () => {
    try {
      // Calculate date range for the 4-week rolling view
      const startDateStr = formatLocalDate(anchorDate);
      const endDateStr = formatLocalDate(addDays(anchorDate, 28));

      console.log('Calendar loading race goals for range:', startDateStr, 'to', endDateStr);

      const { data, error } = await supabase
        .from('race_goals')
        .select('*')
        .eq('user_id', user.id)
        .gte('race_date', startDateStr)
        .lte('race_date', endDateStr)
        .order('race_date', { ascending: true });

      if (error) {
        // Table might not exist yet - fail silently
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('race_goals table not yet available');
          return;
        }
        throw error;
      }

      console.log('Calendar loaded race goals:', data?.length || 0, data);

      if (data) {
        setRaceGoals(data);
      }
    } catch (error) {
      console.error('Failed to load race goals:', error);
    }
  };

  // Get race goal for a specific date
  const getRaceGoalForDate = (date) => {
    if (!date) return null;
    const dateStr = formatLocalDate(date);
    return raceGoals.find(r => r.race_date === dateStr);
  };

  // Load cross-training activities for current 4-week view
  useEffect(() => {
    if (!user?.id) return;

    const startDateStr = formatLocalDate(anchorDate);
    const endDateStr = formatLocalDate(addDays(anchorDate, 28));

    // Fetch activities using the hook
    fetchActivities(startDateStr, endDateStr).catch(err => {
      // Table might not exist yet - fail silently
      console.log('Cross-training activities not available:', err.message);
    });
  }, [user?.id, anchorDate, fetchActivities]);

  // Open cross-training modal
  const openCrossTrainingModal = (date) => {
    setCrossTrainingDate(formatLocalDate(date));
    setCrossTrainingModalOpen(true);
  };

  // Open race goal modal
  const openRaceGoalModal = (raceGoal, date) => {
    setSelectedRaceGoal(raceGoal);
    setSelectedDate(date);
    setRaceGoalModalOpen(true);
  };

  // Navigate to Route Builder with workout context
  const handleCreateRoute = (e, workout, date) => {
    e.stopPropagation(); // Prevent opening edit modal

    // Map workout type to training goal
    const workoutTypeToGoal = {
      endurance: 'endurance',
      tempo: 'endurance',
      threshold: 'intervals',
      vo2max: 'intervals',
      anaerobic: 'intervals',
      recovery: 'recovery',
      climbing: 'hills',
      racing: 'endurance',
    };

    const params = new URLSearchParams({
      from: 'calendar',
      workoutType: workout.workout_type || 'endurance',
      trainingGoal: workoutTypeToGoal[workout.workout_type] || 'endurance',
      duration: workout.target_duration || 60,
      scheduledDate: formatLocalDate(date),
    });

    // Add optional params if they exist
    if (workout.workout_id) {
      params.set('workoutId', workout.workout_id);
    }
    if (workout.target_distance_km) {
      params.set('distance', workout.target_distance_km);
    }
    if (workout.name) {
      params.set('workoutName', workout.name);
    }

    navigate(`/routes/new?${params.toString()}`);
  };

  // Get 28 days for the rolling 4-week view (always starts on a Monday)
  const getRolling4Weeks = () => {
    const days = [];
    for (let i = 0; i < 28; i++) {
      days.push(addDays(anchorDate, i));
    }
    return days;
  };

  // Get workout for a specific date
  const getWorkoutForDate = (date) => {
    if (!date || !activePlan) return null;

    // Match by scheduled_date for reliable date matching
    // Use formatLocalDate to avoid timezone issues
    const dateStr = formatLocalDate(date);
    return plannedWorkouts.find(w => w.scheduled_date === dateStr);
  };

  // Get rides for a specific date
  const getRidesForDate = (date) => {
    if (!date) return [];

    // Use formatLocalDate to avoid timezone issues
    const dateStr = formatLocalDate(date);

    return rides.filter(ride => {
      const rideDate = new Date(ride.start_date || ride.recorded_at || ride.created_at);
      const rideDateStr = formatLocalDate(rideDate);
      return rideDateStr === dateStr;
    });
  };

  // Get cross-training activities for a specific date
  const getCrossTrainingForDate = (date) => {
    if (!date || !crossTrainingActivities) return [];

    const dateStr = formatLocalDate(date);
    return crossTrainingActivities.filter(activity => activity.activity_date === dateStr);
  };

  // Helper to get icon for cross-training category
  const getCrossTrainingIcon = (category) => {
    switch (category) {
      case 'strength': return <Barbell size={10} />;
      case 'flexibility': return <PersonSimpleWalk size={10} />;
      case 'cardio': return <PersonSimpleRun size={10} />;
      case 'recovery': return <PersonSimpleWalk size={10} />;
      default: return <Heartbeat size={10} />;
    }
  };

  // Calculate weekly summary stats
  const weeklyStats = useMemo(() => {
    if (!activePlan) return {};

    // Use parsePlanStartDate for timezone-safe parsing
    const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
    if (!planStartDate) return {};

    const stats = {};

    // Group workouts by week
    plannedWorkouts.forEach(workout => {
      if (!stats[workout.week_number]) {
        stats[workout.week_number] = {
          plannedTSS: 0,
          actualTSS: 0,
          completedCount: 0,
          totalCount: 0,
          plannedDuration: 0,
          actualDuration: 0,
        };
      }
      if (workout.workout_type !== 'rest') {
        stats[workout.week_number].totalCount++;
        stats[workout.week_number].plannedTSS += workout.target_tss || 0;
        stats[workout.week_number].plannedDuration += workout.target_duration || 0;
        if (workout.completed) {
          stats[workout.week_number].completedCount++;
          stats[workout.week_number].actualTSS += workout.actual_tss || workout.target_tss || 0;
          stats[workout.week_number].actualDuration += workout.actual_duration || workout.target_duration || 0;
        }
      }
    });

    // Add actual ride TSS from activities
    rides.forEach(ride => {
      const rideDate = new Date(ride.start_date);
      const daysSinceStart = Math.floor((rideDate - planStartDate) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.floor(daysSinceStart / 7) + 1;

      if (weekNumber > 0 && weekNumber <= activePlan.duration_weeks) {
        if (!stats[weekNumber]) {
          stats[weekNumber] = {
            plannedTSS: 0,
            actualTSS: 0,
            completedCount: 0,
            totalCount: 0,
            plannedDuration: 0,
            actualDuration: 0,
          };
        }
        // Prefer stored TSS, fall back to recomputation, cap at 500
        let rideTSS;
        if (ride.tss != null && ride.tss > 0) {
          rideTSS = ride.tss;
        } else if (ride.average_watts && ftp) {
          rideTSS = calculateTSS(ride.moving_time, ride.average_watts, ftp);
        } else {
          rideTSS = estimateTSS(
            (ride.moving_time || 0) / 60,
            (ride.distance || 0) / 1000,
            ride.total_elevation_gain || 0,
            'endurance'
          );
        }
        rideTSS = Math.min(rideTSS || 0, 500);
        stats[weekNumber].actualTSS += rideTSS;
        stats[weekNumber].actualDuration += (ride.moving_time || 0) / 60;
      }
    });

    return stats;
  }, [plannedWorkouts, rides, activePlan, ftp]);

  // Get current week number
  const getCurrentWeekNumber = () => {
    if (!activePlan) return 0;
    // Use parsePlanStartDate for timezone-safe parsing
    const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
    if (!planStartDate) return 1;

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare at midnight
    const daysSinceStart = Math.floor((now - planStartDate) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  };

  // Get current phase
  const getCurrentPhase = () => {
    if (!activePlan) return null;
    const currentWeek = getCurrentWeekNumber();
    const totalWeeks = activePlan.duration_weeks || 8;
    const progress = currentWeek / totalWeeks;

    if (progress <= 0.3) return { name: 'Base', color: 'blue' };
    if (progress <= 0.6) return { name: 'Build', color: 'orange' };
    if (progress <= 0.85) return { name: 'Peak', color: 'red' };
    return { name: 'Taper', color: 'green' };
  };

  // Navigate by 1 week
  const previousWeek = () => {
    setAnchorDate(prev => addDays(prev, -7));
  };

  const nextWeek = () => {
    setAnchorDate(prev => addDays(prev, 7));
  };

  // Reset to default rolling view (last week's Monday)
  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const daysBack = dow === 0 ? 13 : dow + 6;
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - daysBack);
    setAnchorDate(lastMonday);
  };

  // Toggle workout completion
  const toggleWorkoutCompletion = async (workout) => {
    try {
      const newCompletedStatus = !workout.completed;

      const updates = {
        completed: newCompletedStatus,
        completed_at: newCompletedStatus ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('planned_workouts')
        .update(updates)
        .eq('id', workout.id);

      if (error) throw error;

      // Reload workouts to reflect changes
      await loadPlannedWorkouts();
    } catch (error) {
      console.error('Failed to toggle workout completion:', error);
    }
  };

  // Map a raw Supabase workout row to PlannerWorkout shape for WorkoutModal
  const mapToModalWorkout = (raw) => {
    if (!raw) return null;
    const workoutDef = raw.workout_id ? getWorkoutById(raw.workout_id) : undefined;
    return {
      id: raw.id || '',
      planId: raw.plan_id || '',
      sportType: null,
      planPriority: 'primary',
      scheduledDate: raw.scheduled_date || '',
      workoutId: raw.workout_id || null,
      workoutType: raw.workout_type || null,
      targetTSS: raw.target_tss || 0,
      targetDuration: raw.target_duration || 0,
      notes: raw.notes || '',
      completed: raw.completed || false,
      completedAt: raw.completed_at || null,
      activityId: raw.activity_id || null,
      actualTSS: raw.actual_tss || null,
      actualDuration: raw.actual_duration || null,
      workout: workoutDef || undefined,
    };
  };

  // Open edit modal for a workout or date
  const openEditModal = (workout, date) => {
    setSelectedWorkout(workout);
    setSelectedDate(date);

    const mappedWorkout = mapToModalWorkout(workout);
    setModalPlannedWorkout(mappedWorkout);
    setModalWorkoutDef(mappedWorkout?.workout || null);

    setEditModalOpen(true);
  };

  // Save workout changes from WorkoutModal (receives camelCase updates)
  const handleModalSave = async (updates) => {
    if (!activePlan || !selectedWorkout?.id) return;

    try {
      const workoutData = {
        target_tss: updates.targetTSS,
        target_duration: updates.targetDuration,
        notes: updates.notes,
      };

      const { error } = await supabase
        .from('planned_workouts')
        .update(workoutData)
        .eq('id', selectedWorkout.id);

      if (error) throw error;

      notifications.show({
        title: 'Workout Saved',
        message: 'Your workout has been updated',
        color: 'terracotta',
      });

      setEditModalOpen(false);
      await loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (error) {
      console.error('Failed to save workout:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save workout',
        color: 'red',
      });
    }
  };

  // Delete workout
  const deleteWorkout = async () => {
    if (!selectedWorkout?.id) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('planned_workouts')
        .delete()
        .eq('id', selectedWorkout.id);

      if (error) throw error;

      notifications.show({
        title: 'Workout Removed',
        message: 'Workout has been removed from your plan',
        color: 'gray',
      });

      setEditModalOpen(false);
      await loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (error) {
      console.error('Failed to delete workout:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to remove workout',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, workout, date) => {
    if (!workout || workout.workout_type === 'rest') {
      e.preventDefault();
      return;
    }
    setDraggedWorkout({ workout, sourceDate: date });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', workout.id);
  };

  const handleDragOver = (e, date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (date && (draggedWorkout || libraryDraggedWorkoutId)) {
      // Use formatLocalDate for consistent date comparison
      setDragOverDate(formatLocalDate(date));
    }
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDragEnd = () => {
    setDraggedWorkout(null);
    setDragOverDate(null);
    setLibraryDraggedWorkoutId(null);
  };

  // Library sidebar handlers
  const handleLibraryDragStart = (workoutId) => {
    setLibraryDraggedWorkoutId(workoutId);
  };

  const handleLibraryWorkoutSelect = async (workoutId) => {
    if (!targetDay || !activePlan) return;
    const workoutDef = getWorkoutById(workoutId);
    if (!workoutDef) return;

    try {
      const { error } = await supabase.from('planned_workouts').insert({
        plan_id: activePlan.id,
        user_id: user.id,
        scheduled_date: targetDay,
        workout_type: workoutDef.category,
        workout_id: workoutDef.id,
        name: workoutDef.name,
        target_tss: workoutDef.targetTSS,
        target_duration: workoutDef.duration,
        duration_minutes: workoutDef.duration,
        week_number: 1,
        day_of_week: new Date(targetDay).getDay(),
      });

      if (error) throw error;

      notifications.show({
        title: 'Workout added',
        message: `${workoutDef.name} added to ${targetDay}`,
        color: 'teal',
      });

      setTargetDay(null);
      setSidebarFilterCategory(null);
      loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to add workout',
        color: 'red',
      });
    }
  };

  // Edit mode: handle move to destination day
  const handleMoveToDay = async (destinationDate) => {
    if (!moveSource || !activePlan) return;
    const sourceDate = new Date(moveSource.date);
    // Reuse existing drag-drop logic
    setDraggedWorkout({ workout: moveSource.workout, sourceDate });
    setMoveSource(null);
    // Trigger the drop handler programmatically by simulating
    const fakeEvent = { preventDefault: () => {}, dataTransfer: { getData: () => '' } };
    await handleDrop(fakeEvent, destinationDate);
  };

  // Edit mode: inline delete with optimistic UI
  const handleInlineDelete = async (workout, date) => {
    if (!workout?.id) return;
    setDeleteConfirmDate(null);
    setPopoverDate(null);

    try {
      const { error } = await supabase
        .from('planned_workouts')
        .delete()
        .eq('id', workout.id);

      if (error) throw error;

      notifications.show({
        title: 'Workout removed',
        message: `${workout.name || 'Workout'} removed`,
        color: 'teal',
      });

      loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to remove workout',
        color: 'red',
      });
    }
  };

  // Edit mode: swap workout (opens sidebar filtered to same type)
  const handleSwapWorkout = (workout, date) => {
    setPopoverDate(null);
    setSidebarFilterCategory(workout.workout_type || null);
    setTargetDay(formatLocalDate(date));
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    setDragOverDate(null);

    // Handle library drag-and-drop
    if (libraryDraggedWorkoutId && targetDate && activePlan) {
      const workoutId = libraryDraggedWorkoutId;
      setLibraryDraggedWorkoutId(null);
      setTargetDay(formatLocalDate(targetDate));
      await handleLibraryWorkoutSelect(workoutId);
      return;
    }

    console.log('handleDrop called:', { draggedWorkout, targetDate, activePlan: activePlan?.id });

    if (!draggedWorkout || !targetDate || !activePlan) {
      console.log('handleDrop early return - missing data');
      setDraggedWorkout(null);
      return;
    }

    const { workout, sourceDate } = draggedWorkout;
    console.log('Moving workout:', workout?.id, workout?.name, 'from', sourceDate, 'to', targetDate);

    // Don't drop on same day
    if (sourceDate.toDateString() === targetDate.toDateString()) {
      setDraggedWorkout(null);
      return;
    }

    try {
      // Use parsePlanStartDate for timezone-safe parsing
      const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
      if (!planStartDate) {
        notifications.show({
          title: 'Error',
          message: 'Unable to parse plan start date',
          color: 'red',
        });
        setDraggedWorkout(null);
        return;
      }

      // Normalize targetDate to midnight for accurate comparison
      const normalizedTargetDate = new Date(targetDate);
      normalizedTargetDate.setHours(0, 0, 0, 0);

      // Calculate new week number and day of week for target date
      const daysSinceStart = Math.floor((normalizedTargetDate - planStartDate) / (24 * 60 * 60 * 1000));
      const newWeekNumber = Math.floor(daysSinceStart / 7) + 1;
      const newDayOfWeek = targetDate.getDay();

      // Check if target date is within plan duration
      if (newWeekNumber < 1 || newWeekNumber > activePlan.duration_weeks) {
        notifications.show({
          title: 'Cannot Move Workout',
          message: 'Target date is outside the plan duration',
          color: 'yellow',
        });
        setDraggedWorkout(null);
        return;
      }

      // Calculate new scheduled_date using formatLocalDate to avoid timezone issues
      const newScheduledDate = formatLocalDate(targetDate);
      const sourceScheduledDate = formatLocalDate(sourceDate);

      // Calculate source date info for potential swap
      const sourceDateObj = new Date(sourceDate);
      sourceDateObj.setHours(0, 0, 0, 0);
      const sourceDaysSinceStart = Math.floor((sourceDateObj - planStartDate) / (24 * 60 * 60 * 1000));
      const sourceWeekNumber = workout.week_number ?? (Math.floor(sourceDaysSinceStart / 7) + 1);
      const sourceDayOfWeek = workout.day_of_week ?? sourceDateObj.getDay();

      // Helper function to perform the swap
      const performSwap = async (existingWorkoutId) => {
        console.log('Performing swap:', workout.id, 'with', existingWorkoutId);

        // First, move existing workout to source date (freeing target date)
        // Use a temp date first to avoid constraint on source if dragged workout is still there
        const tempDate = '1900-01-01';

        // Step 1: Move existing workout to temp
        const { error: tempError } = await supabase
          .from('planned_workouts')
          .update({ scheduled_date: tempDate })
          .eq('id', existingWorkoutId);

        if (tempError) {
          console.error('Swap step 1 failed:', tempError);
          throw tempError;
        }

        // Step 2: Move dragged workout to target date
        const { error: moveError } = await supabase
          .from('planned_workouts')
          .update({
            week_number: newWeekNumber,
            day_of_week: newDayOfWeek,
            scheduled_date: newScheduledDate,
          })
          .eq('id', workout.id);

        if (moveError) {
          console.error('Swap step 2 failed:', moveError);
          // Restore existing workout
          await supabase
            .from('planned_workouts')
            .update({ scheduled_date: newScheduledDate })
            .eq('id', existingWorkoutId);
          throw moveError;
        }

        // Step 3: Move existing workout to source date
        const { error: swapError } = await supabase
          .from('planned_workouts')
          .update({
            week_number: sourceWeekNumber,
            day_of_week: sourceDayOfWeek,
            scheduled_date: sourceScheduledDate,
          })
          .eq('id', existingWorkoutId);

        if (swapError) {
          console.error('Swap step 3 failed:', swapError);
          throw swapError;
        }

        console.log('Swap successful');
        notifications.show({
          title: 'Workouts Swapped',
          message: 'Workouts have been swapped between days',
          color: 'terracotta',
        });
      };

      // Try the simple move first
      console.log('Attempting to move workout:', workout.id, '->', newScheduledDate);
      const { error } = await supabase
        .from('planned_workouts')
        .update({
          week_number: newWeekNumber,
          day_of_week: newDayOfWeek,
          scheduled_date: newScheduledDate,
        })
        .eq('id', workout.id);

      if (error) {
        // Check if it's a unique constraint violation (another workout exists on target date)
        if (error.code === '23505') {
          console.log('Unique constraint violation - need to swap with existing workout');

          // Find the existing workout on the target date
          const { data: existingWorkout, error: findError } = await supabase
            .from('planned_workouts')
            .select('id, workout_type')
            .eq('plan_id', activePlan.id)
            .eq('scheduled_date', newScheduledDate)
            .neq('id', workout.id)
            .limit(1)
            .single();

          if (findError || !existingWorkout) {
            console.error('Could not find existing workout for swap:', findError);
            throw error; // Throw original error
          }

          if (existingWorkout.workout_type === 'rest') {
            // Delete the rest day and retry the move
            await supabase
              .from('planned_workouts')
              .delete()
              .eq('id', existingWorkout.id);

            // Retry the move
            const { error: retryError } = await supabase
              .from('planned_workouts')
              .update({
                week_number: newWeekNumber,
                day_of_week: newDayOfWeek,
                scheduled_date: newScheduledDate,
              })
              .eq('id', workout.id);

            if (retryError) throw retryError;

            notifications.show({
              title: 'Workout Moved',
              message: `Moved to ${targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
              color: 'terracotta',
            });
          } else {
            // Perform the swap
            await performSwap(existingWorkout.id);
          }
        } else {
          console.error('Failed to move workout:', error);
          throw error;
        }
      } else {
        console.log('Move successful');
        notifications.show({
          title: 'Workout Moved',
          message: `Moved to ${targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
          color: 'terracotta',
        });
      }

      await loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    } catch (error) {
      console.error('Failed to move workout:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to move workout',
        color: 'red',
      });
    } finally {
      setDraggedWorkout(null);
    }
  };

  // Format distance - use prop if provided, otherwise use isImperial to format
  const formatDistance = formatDistanceProp || ((km) => {
    if (!km) return isImperial ? '0 mi' : '0 km';
    if (isImperial) {
      return `${(km * 0.621371).toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
  });

  const days = getRolling4Weeks();
  const rangeLabel = `${anchorDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(anchorDate, 27).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const currentWeek = getCurrentWeekNumber();
  const currentPhase = getCurrentPhase();

  return (
    <Stack gap="md">
      {/* Edit mode hover styles */}
      {editMode && (
        <style>{`
          .edit-mode-cell:hover .swap-badge { opacity: 1 !important; }
          .edit-mode-cell:hover .add-workout-btn { opacity: 1 !important; }
        `}</style>
      )}

      {/* Plan Overview Header */}
      {activePlan && (
        <Paper p="md" withBorder>
          <Group justify="space-between" wrap="wrap" gap="md">
            <Group gap="md">
              <Box>
                <Text size="sm" c="dimmed">Active Plan</Text>
                <Text fw={600}>{activePlan.name}</Text>
              </Box>
              {currentPhase && (
                <Badge color={currentPhase.color} variant="light" size="lg">
                  {currentPhase.name} Phase
                </Badge>
              )}
            </Group>
            <Group gap="lg">
              <Box ta="center">
                <Text size="xl" fw={700} c="terracotta">{currentWeek}</Text>
                <Text size="xs" c="dimmed">of {activePlan.duration_weeks} weeks</Text>
              </Box>
              <Box ta="center">
                <Text size="xl" fw={700} c="blue">
                  {activePlan.compliance_percentage ? Math.round(activePlan.compliance_percentage) : 0}%
                </Text>
                <Text size="xs" c="dimmed">compliance</Text>
              </Box>
            </Group>
          </Group>

          {/* Overall Progress */}
          <Progress
            value={(currentWeek / activePlan.duration_weeks) * 100}
            color="teal"
            size="sm"
            radius="xl"
            mt="md"
          />
        </Paper>
      )}

      {/* Weekly Summary */}
      {activePlan && weeklyStats[currentWeek] && (
        <Paper p="md" withBorder>
          <Group justify="space-between" mb="sm">
            <Text fw={600} size="sm">Week {currentWeek} Summary</Text>
            <Badge variant="light" color="gray">Current Week</Badge>
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="orange" variant="light">
                  <Fire size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">TSS</Text>
              </Group>
              <Text fw={600}>
                {Math.round(weeklyStats[currentWeek].actualTSS)} / {weeklyStats[currentWeek].plannedTSS}
              </Text>
            </Box>
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="blue" variant="light">
                  <Clock size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">Duration</Text>
              </Group>
              <Text fw={600}>
                {Math.round(weeklyStats[currentWeek].actualDuration)} / {weeklyStats[currentWeek].plannedDuration} min
              </Text>
            </Box>
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="green" variant="light">
                  <Check size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">Completed</Text>
              </Group>
              <Text fw={600}>
                {weeklyStats[currentWeek].completedCount} / {weeklyStats[currentWeek].totalCount} workouts
              </Text>
            </Box>
            <Box>
              <Group gap="xs">
                <ThemeIcon size="sm" color="grape" variant="light">
                  <TrendUp size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">Compliance</Text>
              </Group>
              <Text fw={600}>
                {weeklyStats[currentWeek].totalCount > 0
                  ? Math.round((weeklyStats[currentWeek].completedCount / weeklyStats[currentWeek].totalCount) * 100)
                  : 0}%
              </Text>
            </Box>
          </SimpleGrid>
        </Paper>
      )}

      {/* Calendar with optional sidebar */}
      <Box style={{ display: 'flex', gap: 0 }}>
        {/* Edit Mode: Workout Library Sidebar */}
        {editMode && (
          <CalendarLibrarySidebar
            visible={editMode}
            targetDay={targetDay}
            filterCategory={sidebarFilterCategory}
            onWorkoutSelect={handleLibraryWorkoutSelect}
            onDragStart={handleLibraryDragStart}
            onDragEnd={handleDragEnd}
            onClose={() => { setTargetDay(null); setSidebarFilterCategory(null); }}
          />
        )}

      <Card style={{ flex: 1, minWidth: 0 }}>
        {/* Calendar Header */}
        <Group justify="space-between" mb="md">
          <Text size="lg" fw={600} style={{ color: 'var(--color-text-primary)' }}>{rangeLabel}</Text>
          <Group gap="xs">
            <Button variant="subtle" size="compact-xs" onClick={goToToday} style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Today
            </Button>
            <ActionIcon variant="subtle" onClick={previousWeek}>
              <CaretLeft size={18} />
            </ActionIcon>
            <ActionIcon variant="subtle" onClick={nextWeek}>
              <CaretRight size={18} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Show info about no active plan */}
        {!activePlan && rides.length === 0 && (
          <Text style={{ color: 'var(--color-text-muted)' }} ta="center" py="xl">
            No rides recorded yet. Connect Strava or upload rides to see them on the calendar.
          </Text>
        )}

        {/* Show calendar if there's a plan OR rides */}
        {(activePlan || rides.length > 0) && (
          <>
            {/* Day Names */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
              marginBottom: '8px'
            }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <Text key={day} size="xs" fw={600} style={{ color: 'var(--color-text-muted)' }} ta="center">
                  {day}
                </Text>
              ))}
            </div>

            {/* Calendar Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px'
            }}>
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} style={{ minHeight: 80 }} />;
                }

                const workout = getWorkoutForDate(date);
                const dayRides = getRidesForDate(date);
                const raceGoal = getRaceGoalForDate(date);
                const isToday = date.toDateString() === new Date().toDateString();
                const isPast = date < new Date() && !isToday;
                const isFuture = date > new Date();

                // Weather for this day
                const dayWeather = weatherForecast?.[formatLocalDate(date)];
                const weatherSev = dayWeather && !isPast ? getWeatherSeverity(dayWeather, undefined, isImperial) : null;

                // Calculate day's TSS (including cycling and cross-training)
                let dayTSS = 0;
                dayRides.forEach(ride => {
                  let rideTSS;
                  if (ride.tss != null && ride.tss > 0) {
                    rideTSS = ride.tss;
                  } else if (ride.average_watts && ftp) {
                    rideTSS = calculateTSS(ride.moving_time, ride.average_watts, ftp);
                  } else {
                    rideTSS = estimateTSS(
                      (ride.moving_time || 0) / 60,
                      (ride.distance || 0) / 1000,
                      ride.total_elevation_gain || 0,
                      'endurance'
                    );
                  }
                  dayTSS += Math.min(rideTSS || 0, 500);
                });

                // Add cross-training TSS
                const dayCrossTraining = getCrossTrainingForDate(date);
                dayCrossTraining.forEach(activity => {
                  dayTSS += activity.estimated_tss || 0;
                });

                // Determine border color based on workout completion and race goals
                let borderColor = isToday ? 'var(--color-teal)' : 'var(--color-bg-secondary)';
                let backgroundColor = isToday ? `${'var(--color-teal)'}15` : isPast ? 'var(--color-bg-secondary)' : 'var(--color-bg-secondary)';

                // Race day gets special styling
                if (raceGoal) {
                  const priorityColors = {
                    'A': { border: '#fa5252', bg: 'rgba(250, 82, 82, 0.15)' },
                    'B': { border: '#fd7e14', bg: 'rgba(253, 126, 20, 0.15)' },
                    'C': { border: '#868e96', bg: 'rgba(134, 142, 150, 0.15)' },
                  };
                  const colors = priorityColors[raceGoal.priority] || priorityColors['B'];
                  borderColor = colors.border;
                  backgroundColor = colors.bg;
                } else if (workout && isPast) {
                  if (workout.completed) {
                    borderColor = '#51cf66';
                    backgroundColor = 'rgba(81, 207, 102, 0.15)';
                  } else if (workout.workout_type !== 'rest') {
                    borderColor = '#ff6b6b';
                    backgroundColor = 'rgba(255, 107, 107, 0.15)';
                  }
                }

                // Check if this date is a drop target (use formatLocalDate for consistent comparison)
                const isDropTarget = dragOverDate === formatLocalDate(date);
                const hasDraggableWorkout = workout && workout.workout_type !== 'rest';

                const dateStr = formatLocalDate(date);
                const isMoveModeActive = moveSource !== null;
                const isMoveTarget = isMoveModeActive && moveSource.date !== dateStr;
                const isPopoverOpen = popoverDate === dateStr;
                const hasWorkout = workout && workout.workout_type !== 'rest';

                return (
                  <Card
                    key={index}
                    withBorder
                    p="xs"
                    draggable={hasDraggableWorkout || (editMode && hasWorkout)}
                    onDragStart={(e) => handleDragStart(e, workout, date)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, date)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date)}
                    style={{
                      minHeight: 110,
                      position: 'relative',
                      backgroundColor: isDropTarget ? 'rgba(132, 216, 99, 0.3)' : isMoveTarget ? 'rgba(42, 140, 130, 0.08)' : backgroundColor,
                      border: isDropTarget ? `2px dashed var(--color-teal)` : isMoveTarget ? `2px dashed #2A8C82` : `2px solid ${borderColor}`,
                      opacity: isPast && !workout?.completed && !dayRides.length ? 0.7 : 1,
                      cursor: isMoveTarget ? 'pointer' : hasDraggableWorkout ? 'grab' : (activePlan ? 'pointer' : 'default'),
                      transition: 'background-color 0.2s, border 0.2s',
                    }}
                    onClick={() => {
                      // Move mode: clicking a destination day moves the workout
                      if (isMoveModeActive && isMoveTarget) {
                        handleMoveToDay(date);
                        return;
                      }
                      // Normal click: open edit modal
                      if (activePlan) openEditModal(workout, date);
                    }}
                    className={editMode ? 'edit-mode-cell' : ''}
                  >
                    {/* Edit mode: SWAP badge on hover for cells with workouts */}
                    {editMode && hasWorkout && (
                      <Badge
                        size="xs"
                        variant="filled"
                        color="teal"
                        className="swap-badge"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPopoverDate(isPopoverOpen ? null : dateStr);
                        }}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          zIndex: 2,
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.15s',
                          fontFamily: "'Barlow Condensed', sans-serif",
                          letterSpacing: '1px',
                        }}
                      >
                        SWAP
                      </Badge>
                    )}

                    {/* Edit mode: action popover */}
                    {editMode && isPopoverOpen && hasWorkout && (
                      <Box
                        style={{
                          position: 'absolute',
                          top: 24,
                          right: 4,
                          zIndex: 10,
                          backgroundColor: '#141410',
                          border: '1px solid #333',
                          padding: '4px',
                          minWidth: 100,
                        }}
                      >
                        <Stack gap={2}>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="teal"
                            fullWidth
                            style={{ justifyContent: 'flex-start', fontFamily: "'Barlow Condensed', sans-serif" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwapWorkout(workout, date);
                            }}
                          >
                            Swap
                          </Button>
                          {deleteConfirmDate === dateStr ? (
                            <Group gap={4}>
                              <Text size="xs" c="dimmed" style={{ flex: 1 }}>Remove?</Text>
                              <Button
                                size="compact-xs"
                                variant="filled"
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInlineDelete(workout, date);
                                }}
                              >
                                Yes
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmDate(null);
                                }}
                              >
                                No
                              </Button>
                            </Group>
                          ) : (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              fullWidth
                              style={{ justifyContent: 'flex-start', fontFamily: "'Barlow Condensed', sans-serif" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmDate(dateStr);
                              }}
                            >
                              Delete
                            </Button>
                          )}
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="orange"
                            fullWidth
                            style={{ justifyContent: 'flex-start', fontFamily: "'Barlow Condensed', sans-serif" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMoveSource({ workout, date: dateStr });
                              setPopoverDate(null);
                              notifications.show({
                                title: 'Move mode',
                                message: 'Click a destination day to move this workout',
                                color: 'teal',
                                autoClose: 3000,
                              });
                            }}
                          >
                            Move
                          </Button>
                        </Stack>
                      </Box>
                    )}

                    <Stack gap={4}>
                      {/* Date and completion checkbox */}
                      <Group justify="space-between" align="center">
                        <Group gap={6} align="center">
                          <Text size="sm" fw={700} style={{ fontFamily: "'DM Mono', monospace", color: isToday ? '#2A8C82' : 'var(--color-text-primary)' }}>
                            {date.getDate()}
                          </Text>
                          {isToday ? (
                            <Text size={10} fw={700} style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '1px', color: '#2A8C82' }}>
                              TODAY
                            </Text>
                          ) : (
                            <Text size={10} fw={400} c="dimmed">
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]}
                            </Text>
                          )}
                        </Group>
                        {workout && workout.workout_type !== 'rest' && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color={workout.completed ? 'green' : 'gray'}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWorkoutCompletion(workout);
                            }}
                          >
                            {workout.completed ? <Check size={14} /> : <Circle size={14} />}
                          </ActionIcon>
                        )}
                      </Group>

                      {/* Weather forecast strip */}
                      {dayWeather && weatherSev && (
                        <Tooltip label={`${dayWeather.description} · Humidity: ${dayWeather.humidity}% · ${weatherSev.message}`}>
                          <Group gap={6} style={{
                            borderRadius: 4,
                            backgroundColor: `color-mix(in srgb, var(--mantine-color-${weatherSev.color}-6) 20%, transparent)`,
                            padding: '3px 6px',
                          }}>
                            {getWeatherIcon(dayWeather.icon, 14)}
                            <Text size="xs" fw={500} c="dimmed" style={{ lineHeight: 1.2 }}>
                              {formatTemperature(dayWeather.temperatureHigh, isImperial).replace(/°[FC]/, '')}/{formatTemperature(dayWeather.temperatureLow, isImperial)}
                            </Text>
                          </Group>
                        </Tooltip>
                      )}

                      {/* Workout card - redesigned with accent border and form bar */}
                      {workout && workout.workout_type !== 'rest' && (() => {
                        const accentColor = WORKOUT_TYPE_ACCENT[workout.workout_type] || '#9A9990';
                        const filledSegments = getFormBarSegments(workout.target_tss);
                        return (
                          <Box
                            style={{
                              borderLeft: `4px solid ${accentColor}`,
                              backgroundColor: '#f0f0ed',
                              padding: '6px 8px',
                              position: 'relative',
                            }}
                          >
                            {/* Workout type badge */}
                            <Badge
                              size="xs"
                              color={WORKOUT_TYPES[workout.workout_type]?.color || 'gray'}
                              variant={workout.completed ? 'filled' : 'light'}
                              mb={4}
                            >
                              {WORKOUT_TYPES[workout.workout_type]?.name || workout.workout_type}
                            </Badge>
                            {/* Workout name */}
                            <Text
                              size="xs"
                              fw={700}
                              lineClamp={1}
                              mb={2}
                              style={{
                                fontFamily: "'Barlow Condensed', sans-serif",
                                color: workout.completed ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                              }}
                            >
                              {getWorkoutById(workout.workout_id)?.name || WORKOUT_TYPES[workout.workout_type]?.name || 'Workout'}
                            </Text>
                            {/* Duration and TSS in DM Mono */}
                            <Group gap={8}>
                              {workout.target_duration > 0 && (
                                <Text size="xs" fw={500} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--color-text-secondary)' }}>
                                  {workout.target_duration}m
                                </Text>
                              )}
                              {workout.target_tss > 0 && (
                                <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: accentColor }}>
                                  {workout.target_tss} TSS
                                </Text>
                              )}
                              <FuelBadge
                                durationMinutes={workout.target_duration}
                                targetTSS={workout.target_tss}
                                workoutCategory={workout.workout_type}
                                size="xs"
                                variant="text"
                              />
                            </Group>
                            {/* Coach adjustment indicator */}
                            {(workout.original_scheduled_date || workout.original_workout_id) && (
                              <Tooltip
                                label={
                                  <Stack gap={2}>
                                    <Text size="xs" fw={600}>Coach adjusted</Text>
                                    {workout.original_scheduled_date && (
                                      <Text size="xs">Originally: {workout.original_scheduled_date}</Text>
                                    )}
                                    {workout.original_workout_id && (
                                      <Text size="xs">
                                        Was: {getWorkoutById(workout.original_workout_id)?.name || workout.original_workout_id}
                                      </Text>
                                    )}
                                  </Stack>
                                }
                                position="bottom"
                                withArrow
                              >
                                <Badge
                                  size="xs"
                                  variant="light"
                                  color="yellow"
                                  leftSection={<ArrowsLeftRight size={10} />}
                                  style={{ cursor: 'help' }}
                                  mt={2}
                                >
                                  Adjusted
                                </Badge>
                              </Tooltip>
                            )}
                            {/* Create Route button */}
                            {!isPast && (
                              <Tooltip label="Create route for this workout" withArrow>
                                <ActionIcon
                                  size="xs"
                                  variant="light"
                                  color="teal"
                                  mt={4}
                                  onClick={(e) => handleCreateRoute(e, workout, date)}
                                >
                                  <Path size={12} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {/* Form bar - 5-segment intensity strip */}
                            <Group gap={1} mt={6} style={{ height: 3 }}>
                              {[1, 2, 3, 4, 5].map((seg) => (
                                <Box
                                  key={seg}
                                  style={{
                                    flex: 1,
                                    height: 3,
                                    backgroundColor: seg <= filledSegments ? accentColor : '#DDDDD8',
                                  }}
                                />
                              ))}
                            </Group>
                          </Box>
                        );
                      })()}

                      {/* Rest day indicator */}
                      {workout && workout.workout_type === 'rest' && !raceGoal && (
                        <Text
                          size="xs"
                          fw={700}
                          style={{
                            fontFamily: "'Barlow Condensed', sans-serif",
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-muted)',
                            marginTop: 8,
                          }}
                        >
                          REST DAY
                        </Text>
                      )}

                      {/* Race Goal indicator */}
                      {raceGoal && (
                        <Tooltip
                          label={`${raceGoal.name}${raceGoal.distance_km ? ` • ${Math.round(raceGoal.distance_km)}km` : ''}${raceGoal.goal_placement ? ` • Goal: ${raceGoal.goal_placement}` : ''}`}
                          multiline
                          w={200}
                        >
                          <Paper
                            p={4}
                            style={{
                              backgroundColor: raceGoal.priority === 'A' ? 'rgba(250, 82, 82, 0.2)' :
                                              raceGoal.priority === 'B' ? 'rgba(253, 126, 20, 0.2)' : 'rgba(134, 142, 150, 0.2)',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openRaceGoalModal(raceGoal, date);
                            }}
                          >
                            <Group gap={4} wrap="nowrap">
                              <Trophy
                                size={14}
                                style={{
                                  color: raceGoal.priority === 'A' ? '#fa5252' :
                                         raceGoal.priority === 'B' ? '#fd7e14' : '#868e96'
                                }}
                              />
                              <Badge
                                size="xs"
                                color={raceGoal.priority === 'A' ? 'red' : raceGoal.priority === 'B' ? 'orange' : 'gray'}
                                variant="filled"
                              >
                                {raceGoal.priority}
                              </Badge>
                            </Group>
                            <Text
                              size="xs"
                              fw={600}
                              lineClamp={1}
                              mt={2}
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {raceGoal.name}
                            </Text>
                            {raceGoal.race_type && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {raceGoal.race_type.replace('_', ' ')}
                              </Text>
                            )}
                          </Paper>
                        </Tooltip>
                      )}

                      {/* Completed activities */}
                      {dayRides.length > 0 && (() => {
                        const RUNNING = ['Run', 'VirtualRun', 'TrailRun'];
                        const CYCLING = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
                        const getSport = (r) => {
                          if (r.sport_type === 'cycling' || r.sport_type === 'running') return r.sport_type;
                          if (RUNNING.includes(r.type)) return 'running';
                          if (CYCLING.includes(r.type)) return 'cycling';
                          return 'other';
                        };
                        const rides = dayRides.filter(r => getSport(r) === 'cycling');
                        const runs = dayRides.filter(r => getSport(r) === 'running');
                        const others = dayRides.filter(r => getSport(r) === 'other');
                        return (
                          <Tooltip label={dayRides.map(r => r.name || 'Activity').join(', ')}>
                            <Group gap={4}>
                              {rides.length > 0 && (
                                <Badge size="xs" color="green" variant="filled" leftSection={<Bicycle size={10} />}>
                                  {rides.length}
                                </Badge>
                              )}
                              {runs.length > 0 && (
                                <Badge size="xs" color="teal" variant="filled" leftSection={<PersonSimpleRun size={10} />}>
                                  {runs.length}
                                </Badge>
                              )}
                              {others.length > 0 && (
                                <Badge size="xs" color="orange" variant="filled" leftSection={<Heartbeat size={10} />}>
                                  {others.length}
                                </Badge>
                              )}
                              {/* Show Strava logo if any activities are from Strava */}
                              {dayRides.some(r => r.provider === 'strava') && (
                                <StravaLogo size={12} />
                              )}
                            </Group>
                          </Tooltip>
                        );
                      })()}

                      {/* Cross-training activities */}
                      {(() => {
                        const dayCrossTraining = getCrossTrainingForDate(date);
                        if (dayCrossTraining.length === 0) return null;

                        const totalDuration = dayCrossTraining.reduce((sum, a) => sum + a.duration_minutes, 0);
                        const totalTSS = dayCrossTraining.reduce((sum, a) => sum + (a.estimated_tss || 0), 0);

                        return (
                          <Tooltip
                            label={dayCrossTraining.map(a =>
                              `${a.activity_type?.name || 'Activity'} - ${a.duration_minutes}min`
                            ).join('\n')}
                            multiline
                          >
                            <Box
                              onClick={(e) => {
                                e.stopPropagation();
                                openCrossTrainingModal(date);
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <Group gap={4}>
                                {dayCrossTraining.slice(0, 3).map((activity, idx) => (
                                  <Badge
                                    key={idx}
                                    size="xs"
                                    variant="light"
                                    color={ACTIVITY_CATEGORIES[activity.activity_type?.category]?.color?.replace('#', '') || 'indigo'}
                                    leftSection={getCrossTrainingIcon(activity.activity_type?.category)}
                                  >
                                    {activity.duration_minutes}m
                                  </Badge>
                                ))}
                                {dayCrossTraining.length > 3 && (
                                  <Text size="xs" c="dimmed">+{dayCrossTraining.length - 3}</Text>
                                )}
                              </Group>
                              {totalTSS > 0 && (
                                <Text size="xs" c="indigo" fw={500}>+{Math.round(totalTSS)} TSS</Text>
                              )}
                            </Box>
                          </Tooltip>
                        );
                      })()}

                      {/* Show actual TSS if rides */}
                      {dayTSS > 0 && (
                        <Text size="xs" c="orange" fw={500}>{Math.round(dayTSS)} TSS</Text>
                      )}

                      {dayRides.length > 0 && (
                        <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDistance(dayRides.reduce((sum, r) => sum + ((r.distance || 0) / 1000), 0))}
                        </Text>
                      )}

                      {/* Edit mode: "+" add button for empty cells */}
                      {editMode && !hasWorkout && !isMoveTarget && (
                        <Box
                          onClick={(e) => {
                            e.stopPropagation();
                            setTargetDay(dateStr);
                            setSidebarFilterCategory(null);
                          }}
                          className="add-workout-btn"
                          style={{
                            border: '1px dashed #DDDDD8',
                            height: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            marginTop: 4,
                            opacity: 0,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          <Plus size={14} color="#9A9990" />
                        </Box>
                      )}
                    </Stack>
                  </Card>
                );
              })}
            </div>

            {/* Legend */}
            <Stack gap="xs" mt="md">
              <Group gap="xs">
                <Text size="xs" style={{ color: 'var(--color-text-muted)' }} fw={600}>Workout Types:</Text>
                {Object.entries(WORKOUT_TYPES).slice(1, 6).map(([key, type]) => (
                  <Group gap={4} key={key}>
                    <Text size="lg">{type.icon}</Text>
                    <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>{type.name}</Text>
                  </Group>
                ))}
              </Group>

              {/* Race goals legend */}
              <Group gap="md">
                <Text size="xs" style={{ color: 'var(--color-text-muted)' }} fw={600}>Race Priority:</Text>
                <Group gap={4}>
                  <Trophy size={14} style={{ color: '#fa5252' }} />
                  <Badge size="xs" color="red" variant="filled">A</Badge>
                  <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Main Goal</Text>
                </Group>
                <Group gap={4}>
                  <Trophy size={14} style={{ color: '#fd7e14' }} />
                  <Badge size="xs" color="orange" variant="filled">B</Badge>
                  <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Important</Text>
                </Group>
                <Group gap={4}>
                  <Trophy size={14} style={{ color: '#868e96' }} />
                  <Badge size="xs" color="gray" variant="filled">C</Badge>
                  <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Training</Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  leftSection={<Trophy size={14} />}
                  ml="auto"
                  onClick={() => openRaceGoalModal(null, null)}
                >
                  Add Race Goal
                </Button>
              </Group>

              {activePlan && (
                <Group gap="md">
                  <Text size="xs" style={{ color: 'var(--color-text-muted)' }} fw={600}>Status:</Text>
                  <Group gap={4}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#51cf66', border: '1px solid #51cf66' }} />
                    <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Completed</Text>
                  </Group>
                  <Group gap={4}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: 'rgba(255, 107, 107, 0.15)', border: '2px solid #ff6b6b' }} />
                    <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Missed</Text>
                  </Group>
                  <Group gap={4}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: `${'var(--color-teal)'}15`, border: `2px solid ${'var(--color-teal)'}` }} />
                    <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>Today</Text>
                  </Group>
                  <Text size="xs" c="dimmed" ml="auto">Drag workouts to move • Click to edit</Text>
                </Group>
              )}
            </Stack>
          </>
        )}
      </Card>
      </Box>

      {/* Workout Detail + Edit Modal (shared with planner) */}
      <WorkoutModal
        workout={modalWorkoutDef}
        plannedWorkout={modalPlannedWorkout}
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleModalSave}
        onDelete={deleteWorkout}
        scheduledDate={selectedDate ? formatLocalDate(selectedDate) : undefined}
      />

      {/* Race Goal Modal */}
      <RaceGoalModal
        opened={raceGoalModalOpen}
        onClose={() => {
          setRaceGoalModalOpen(false);
          setSelectedRaceGoal(null);
        }}
        raceGoal={selectedRaceGoal}
        onSaved={() => {
          loadRaceGoals();
          if (onPlanUpdated) onPlanUpdated();
        }}
        isImperial={isImperial}
      />

      {/* Cross-Training Modal */}
      <CrossTrainingModal
        opened={crossTrainingModalOpen}
        onClose={() => {
          setCrossTrainingModalOpen(false);
          setCrossTrainingDate(null);
        }}
        selectedDate={crossTrainingDate}
        onSave={() => {
          // Refresh cross-training activities for current 4-week view
          fetchActivities(formatLocalDate(anchorDate), formatLocalDate(addDays(anchorDate, 28)));
        }}
      />
    </Stack>
  );
};

export default TrainingCalendar;
