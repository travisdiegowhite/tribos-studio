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
  Flex,
  Drawer,
  Collapse,
  UnstyledButton,
  Modal,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { WORKOUT_TYPES, TRAINING_PHASES, calculateTSS, estimateTSS } from '../utils/trainingPlans';
import { isPowerSport } from '../utils/sportType';
import { getWorkoutById } from '../data/workoutLibrary';
import { tokens } from '../theme';
import { formatLocalDate, addDays, parsePlanStartDate } from '../utils/dateUtils';
import RaceGoalModal from './RaceGoalModal';
import { StravaLogo, STRAVA_ORANGE } from './StravaBranding';
import { FuelBadge } from './fueling';
import { useCrossTraining, ACTIVITY_CATEGORIES } from '../hooks/useCrossTraining';
import CrossTrainingModal from './CrossTrainingModal';
import { WorkoutModal } from './planner/WorkoutModal';
import { WorkoutLibrarySidebar } from './planner/WorkoutLibrarySidebar';
import { ArrowsLeftRight, Barbell, Bicycle, CalendarBlank, CalendarX, CaretDown, CaretLeft, CaretRight, Check, Circle, Clock, Cloud, CloudLightning, CloudRain, CloudSun, DotsSixVertical, Fire, Heartbeat, Moon, Path, PencilSimple, PersonSimpleRun, PersonSimpleWalk, Plus, Snowflake, Sun, Trash, TrendUp, Trophy, Wind, X } from '@phosphor-icons/react';
import { useWeatherForecast } from '../hooks/useWeatherForecast';
import { useRouteBuilderStore } from '../stores/routeBuilderStore';
import { getWeatherSeverity, formatTemperature } from '../utils/weather';
import { buildWorkoutRouteHref } from '../utils/workoutRouteHref';
import { buildLibraryWorkoutRow, computeWeekNumber } from '../utils/plannedWorkoutFromLibrary';
import { useActivityAutoLink } from '../hooks/useActivityAutoLink';
import { useUserAvailability } from '../hooks/useUserAvailability';
import { useTrainingPlan } from '../hooks/useTrainingPlan';
import { AvailabilitySettings } from './settings/AvailabilitySettings';
import { useWorkoutAdaptations } from '../hooks/useWorkoutAdaptations';
import { AdaptationInsightsPanel } from './planner/AdaptationInsightsPanel';
import { AdaptationFeedbackModal } from './planner/AdaptationFeedbackModal';
import { shouldPromptForFeedback } from '../utils/adaptationTrigger';

/**
 * Enhanced Training Calendar Component
 * Displays monthly calendar with planned workouts, completed rides,
 * weekly summaries, race goals, and workout editing capabilities
 */
const TrainingCalendar = ({ activePlan, rides = [], formatDistance: formatDistanceProp, ftp, onPlanUpdated, isImperial = false, refreshKey = 0 }) => {
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
  // True when the detail modal is open in "add to an empty day" mode.
  const [isAddMode, setIsAddMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // "Clear planned sessions" state. clearCount is the number of upcoming
  // incomplete planned workouts the action will delete (fetched on open so the
  // confirm dialog shows an accurate total, not just the visible 4-week window).
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearCount, setClearCount] = useState(null);
  const [clearing, setClearing] = useState(false);

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
  // True while a workout is being dragged out of the library sidebar (so the
  // calendar can highlight drop targets even though `draggedWorkout` — which
  // only tracks reschedule drags — is null).
  const [libraryDragActive, setLibraryDragActive] = useState(false);

  // Workout library sidebar (drag-to-add) state
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState({
    category: null,
    searchQuery: '',
    difficulty: null,
  });
  // Mobile tap-to-assign: the library workout the user picked to drop on a day.
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);

  // Helper to get plan start date (supports both old and new schema)
  const getPlanStartDate = (plan) => plan?.started_at || plan?.start_date;

  // Load planned workouts for current 4-week view.
  // User-scoped (not plan-scoped): the calendar shows ALL of the athlete's planned
  // workouts in range regardless of which plan they belong to, so coach adds, manual
  // adds, and any plan's workouts are always visible. refreshKey lets the parent force
  // a reload when workouts are added externally; activePlan?.id stays in deps so the
  // view also reloads when the active plan switches.
  useEffect(() => {
    if (!user?.id) return;
    loadPlannedWorkouts();
  }, [user?.id, activePlan?.id, anchorDate, refreshKey]);

  // Auto-link completed cycling rides to planned workouts on the same day.
  useActivityAutoLink({
    userId: user?.id,
    activities: rides,
    plannedWorkouts,
    ftp,
    onLinked: () => {
      loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
    },
  });

  // Availability + reshuffle (ported from the planner)
  const [availabilitySettingsOpen, setAvailabilitySettingsOpen] = useState(false);
  const [reshufflePromptOpen, setReshufflePromptOpen] = useState(false);
  const [isReshuffling, setIsReshuffling] = useState(false);
  const {
    weeklyAvailability,
    dateOverrides,
    preferences: availabilityPreferences,
  } = useUserAvailability({ userId: user?.id, autoLoad: true });
  // autoLoad so the hook holds its own active plan + workouts, which
  // reshufflePlan reads from internally.
  const { reshufflePlan } = useTrainingPlan({ userId: user?.id, autoLoad: true });

  // Adaptation insights + feedback (ported from the planner)
  const [adaptationsOpen, setAdaptationsOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedAdaptation, setSelectedAdaptation] = useState(null);
  const [weekSummary, setWeekSummary] = useState(null);
  const {
    adaptations,
    insights,
    loading: adaptationsLoading,
    fetchAdaptations,
    getWeekSummary,
    updateAdaptationFeedback,
    dismissInsight,
    applyInsight,
  } = useWorkoutAdaptations({ userId: user?.id });

  // The insights panel summarizes the *current* week (Monday of this week),
  // independent of the 4-week scroll anchor.
  const currentWeekStart = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=Sun, 1=Mon...
    const daysBack = dow === 0 ? 6 : dow - 1; // back to this week's Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysBack);
    return formatLocalDate(monday);
  }, []);

  // Fetch adaptations + week summary for the current week
  useEffect(() => {
    if (!user?.id) return;
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 14); // fetch 2 weeks
    fetchAdaptations({ weekStart: currentWeekStart, weekEnd: weekEnd.toISOString().split('T')[0] });
    getWeekSummary(currentWeekStart).then(setWeekSummary);
  }, [user?.id, currentWeekStart, fetchAdaptations, getWeekSummary]);

  // Auto-prompt for feedback on the first adaptation that needs it (but not
  // while the edit modal is open, so the two modals don't fight).
  useEffect(() => {
    if (adaptations.length === 0 || editModalOpen) return;
    const needsFeedback = adaptations.find(
      (a) => !a.userFeedback?.reason && shouldPromptForFeedback(a)
    );
    if (needsFeedback && !feedbackModalOpen) {
      setSelectedAdaptation(needsFeedback);
      setFeedbackModalOpen(true);
    }
  }, [adaptations, feedbackModalOpen, editModalOpen]);

  const adaptationsNeedingFeedback = useMemo(
    () => adaptations.filter((a) => !a.userFeedback?.reason && shouldPromptForFeedback(a)).length,
    [adaptations]
  );

  const handleAdaptationFeedback = async (reason, notes) => {
    if (!selectedAdaptation) return;
    await updateAdaptationFeedback(selectedAdaptation.id, { reason, notes });
    setFeedbackModalOpen(false);
    setSelectedAdaptation(null);
  };

  const handleViewAdaptation = (adaptation) => {
    setSelectedAdaptation(adaptation);
    setFeedbackModalOpen(true);
  };

  const handleDismissInsight = (insightId) => dismissInsight(insightId);

  const handleApplyInsight = async (insightId) => {
    const insight = insights.find((i) => i.id === insightId);
    if (!insight?.suggestedAction) return;
    await applyInsight(insightId);
  };

  const loadPlannedWorkouts = async () => {
    if (!user?.id) return;

    try {
      // Calculate date range for the 4-week rolling view
      const startDateStr = formatLocalDate(anchorDate);
      const endDateStr = formatLocalDate(addDays(anchorDate, 28));

      // User-scoped read: every planned workout in range, across all of the athlete's
      // plans. The grid places each by scheduled_date, so plan membership doesn't affect
      // rendering. (RLS still restricts to the athlete's own rows via user_id.)
      const { data } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user.id)
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
      // Degrade gracefully (calendar still renders) but log the real error
      console.error('Error loading cross-training activities:', err);
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

  // Navigate to the route builder with workout context. Opens RB2 (with the
  // interval overlay) when the user is in the v2 cohort, else the v1 builder.
  const handleCreateRoute = (e, workout, date) => {
    e.stopPropagation(); // Prevent opening edit modal
    const href = buildWorkoutRouteHref(workout, formatLocalDate(date));
    navigate(href);
  };

  // Get 28 days for the rolling 4-week view (always starts on a Monday)
  const getRolling4Weeks = () => {
    const days = [];
    for (let i = 0; i < 28; i++) {
      days.push(addDays(anchorDate, i));
    }
    return days;
  };

  // Get workout for a specific date. User-scoped: match by scheduled_date across all
  // loaded workouts (no activePlan requirement). If two plans somehow share a date, the
  // first loaded wins — acceptable until plan membership is fully demoted to metadata.
  const getWorkoutForDate = (date) => {
    if (!date) return null;
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
        // Prefer stored canonical load (rss, fallback to legacy tss). For
        // runs we never apply the cycling power→TSS formula because watts
        // from a footpod would be misread against cycling FTP. Phase 2 will
        // replace the duration-based fallback with HR-TRIMP / rTSS.
        const storedLoad = ride.rss ?? ride.tss;
        let rideTSS;
        if (storedLoad != null && storedLoad > 0) {
          rideTSS = storedLoad;
        } else if (isPowerSport(ride) && ride.average_watts && ftp) {
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
    const libraryDef = raw.workout_id ? getWorkoutById(raw.workout_id) : undefined;
    // Fall back to a minimal definition synthesized from the row so the modal
    // still opens (and stays editable) for rest days / coach / custom workouts
    // whose workout_id doesn't resolve to the library. WorkoutModal returns null
    // without a `workout`, and its definition-only sections (profile, intervals,
    // exercises, export) self-skip when their fields are absent.
    const workoutDef = libraryDef || {
      id: raw.workout_id || 'custom',
      name: raw.name || (raw.workout_type ? `${raw.workout_type} workout` : 'Workout'),
      category: raw.workout_type || 'endurance',
      duration: raw.target_duration || 0,
      targetTSS: (raw.target_tss ?? raw.target_rss) || 0,
      intensityFactor: 0,
      description: '',
    };
    return {
      id: raw.id || '',
      planId: raw.plan_id || '',
      sportType: null,
      planPriority: 'primary',
      scheduledDate: raw.scheduled_date || '',
      workoutId: raw.workout_id || null,
      workoutType: raw.workout_type || null,
      name: raw.name || '',
      targetTSS: raw.target_tss || 0,
      targetDuration: raw.target_duration || 0,
      notes: raw.notes || '',
      completed: raw.completed || false,
      completedAt: raw.completed_at || null,
      activityId: raw.activity_id || null,
      actualTSS: raw.actual_tss || null,
      actualDuration: raw.actual_duration || null,
      workout: workoutDef,
    };
  };

  // Open edit modal for a workout or date
  const openEditModal = (workout, date) => {
    setIsAddMode(false);
    setSelectedWorkout(workout);
    setSelectedDate(date);

    const mappedWorkout = mapToModalWorkout(workout);
    setModalPlannedWorkout(mappedWorkout);
    setModalWorkoutDef(mappedWorkout?.workout || null);

    setEditModalOpen(true);
  };

  // Open the detail modal in "add" mode for an empty day (pick a workout to add).
  const openAddModal = (date) => {
    setIsAddMode(true);
    setSelectedWorkout(null);
    setSelectedDate(date);
    setModalPlannedWorkout(null);
    setModalWorkoutDef(null);
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

  // Open the "clear planned sessions" confirm dialog, fetching the exact count of
  // upcoming incomplete planned workouts (today onward) so the user sees what the
  // action will remove before confirming.
  const openClearModal = async () => {
    if (!user?.id) return;
    setClearCount(null);
    setClearModalOpen(true);
    try {
      const todayStr = formatLocalDate(new Date());
      const { count } = await supabase
        .from('planned_workouts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', false)
        .gte('scheduled_date', todayStr);
      setClearCount(count ?? 0);
    } catch (error) {
      console.error('Failed to count planned workouts:', error);
      setClearCount(0);
    }
  };

  // Delete all upcoming incomplete planned workouts (today onward) for the user.
  // Completed sessions and past history are preserved, as are logged activities.
  const handleClearPlanned = async () => {
    if (!user?.id) return;
    setClearing(true);
    try {
      const todayStr = formatLocalDate(new Date());
      const { error } = await supabase
        .from('planned_workouts')
        .delete()
        .eq('user_id', user.id)
        .eq('completed', false)
        .gte('scheduled_date', todayStr);

      if (error) throw error;

      notifications.show({
        title: 'Calendar cleared',
        message: 'Upcoming planned sessions have been removed.',
        color: 'gray',
      });

      setClearModalOpen(false);
      await loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();
      // Let other surfaces (dashboard, Today) refresh.
      window.dispatchEvent(new CustomEvent('training-plan-updated'));
    } catch (error) {
      console.error('Failed to clear planned workouts:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to clear the calendar. Please try again.',
        color: 'red',
      });
    } finally {
      setClearing(false);
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
    // Highlight for both reschedule drags (draggedWorkout) and library drags.
    if (date && (draggedWorkout || libraryDragActive)) {
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
  };

  // Add a workout from the library onto a day (drag-drop or mobile tap).
  // Replaces any existing workout on that day (matches prior planner behavior).
  const handleAddFromLibrary = async (workoutId, targetDate, overrides = null) => {
    if (!activePlan || !user || !targetDate) return;

    try {
      const workout = getWorkoutById(workoutId);
      if (!workout) return;

      const planStartDate = parsePlanStartDate(getPlanStartDate(activePlan));
      if (!planStartDate) {
        notifications.show({ title: 'Error', message: 'Unable to parse plan start date', color: 'red' });
        return;
      }

      const weekNumber = computeWeekNumber(planStartDate, targetDate);
      if (activePlan.duration_weeks && (weekNumber < 1 || weekNumber > activePlan.duration_weeks)) {
        notifications.show({
          title: 'Cannot Add Workout',
          message: 'That date is outside the plan duration',
          color: 'yellow',
        });
        return;
      }

      const scheduledDate = formatLocalDate(targetDate);

      // Replace any existing workout on that day (the table has a unique
      // (plan_id, scheduled_date) constraint, so an insert would otherwise fail).
      const existing = plannedWorkouts.find((w) => w.scheduled_date === scheduledDate);
      let replacedName = null;
      if (existing) {
        replacedName = getWorkoutById(existing.workout_id)?.name || existing.name || 'workout';
        const { error: delError } = await supabase
          .from('planned_workouts')
          .delete()
          .eq('id', existing.id);
        if (delError) throw delError;
      }

      const { error: insertError } = await supabase
        .from('planned_workouts')
        .insert(buildLibraryWorkoutRow({
          workout,
          workoutId,
          planId: activePlan.id,
          userId: user.id,
          planStartDate,
          targetDate,
          overrides: overrides || undefined,
        }));

      if (insertError) throw insertError;

      await loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();

      notifications.show({
        title: replacedName ? 'Workout Replaced' : 'Workout Added',
        message: replacedName
          ? `Replaced ${replacedName} with ${workout.name}`
          : `Added ${workout.name} to ${targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
        color: 'terracotta',
      });
    } catch (error) {
      console.error('Failed to add workout from library:', error);
      notifications.show({ title: 'Error', message: 'Failed to add workout', color: 'red' });
    }
  };

  // Add the workout chosen in the modal (empty-day add mode).
  const handleAddWorkoutFromModal = async (workoutId, overrides) => {
    if (!selectedDate) return;
    await handleAddFromLibrary(workoutId, selectedDate, overrides);
    setIsAddMode(false);
    setEditModalOpen(false);
  };

  // Swap an existing planned workout to a different library workout.
  const handleChangeWorkout = async (workoutId) => {
    if (!selectedWorkout?.id) return;
    const def = getWorkoutById(workoutId);
    if (!def) return;

    try {
      const targetRss = def.targetTSS || 0;
      const { error } = await supabase
        .from('planned_workouts')
        .update({
          workout_id: workoutId,
          workout_type: def.category,
          name: def.name,
          duration_minutes: def.duration || 0,
          target_duration: def.duration || 0,
          // Dual-write canonical + legacy per CLAUDE.md.
          target_rss: targetRss,
          target_tss: targetRss,
        })
        .eq('id', selectedWorkout.id);

      if (error) throw error;

      // Reflect the swap in the open modal so the profile/timeline update in place.
      const updatedRow = { ...selectedWorkout, workout_id: workoutId, workout_type: def.category, name: def.name, target_duration: def.duration || 0, target_tss: targetRss, target_rss: targetRss };
      setSelectedWorkout(updatedRow);
      const mapped = mapToModalWorkout(updatedRow);
      setModalPlannedWorkout(mapped);
      setModalWorkoutDef(mapped?.workout || null);

      await loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();

      notifications.show({ title: 'Workout Changed', message: `Changed to ${def.name}`, color: 'terracotta' });
    } catch (error) {
      console.error('Failed to change workout:', error);
      notifications.show({ title: 'Error', message: 'Failed to change workout', color: 'red' });
    }
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    setDragOverDate(null);

    // Library drag-to-add: the library WorkoutCard tags its payload with
    // application/json {source:'library'}; reschedule drags set only text/plain.
    let libraryPayload = null;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) libraryPayload = JSON.parse(raw);
    } catch {
      libraryPayload = null;
    }
    if (libraryPayload?.source === 'library' && libraryPayload.workoutId) {
      setLibraryDragActive(false);
      await handleAddFromLibrary(libraryPayload.workoutId, targetDate);
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

  // Workout library sidebar (shared by the desktop rail and the mobile drawer).
  const librarySidebar = (
    <WorkoutLibrarySidebar
      filter={sidebarFilter}
      onFilterChange={(partial) => setSidebarFilter((prev) => ({ ...prev, ...partial }))}
      onDragStart={() => setLibraryDragActive(true)}
      onDragEnd={() => setLibraryDragActive(false)}
      onWorkoutTap={(workoutId) => {
        setSelectedWorkoutId(workoutId);
        setMobileLibraryOpen(false);
      }}
      isMobile={isMobile}
    />
  );

  return (
    <Stack gap="md">
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

      {/* Training Insights — collapsible, directly under the weekly summary */}
      {activePlan && (weekSummary || adaptations.length > 0 || insights.length > 0) && (
        <Paper p="md" withBorder>
          <UnstyledButton onClick={() => setAdaptationsOpen((o) => !o)} style={{ width: '100%' }}>
            <Group justify="space-between">
              <Group gap="xs">
                {adaptationsOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
                <Text fw={600} size="sm">Training Insights</Text>
                {adaptationsNeedingFeedback > 0 && (
                  <Badge color="terracotta" size="sm" variant="filled">
                    {adaptationsNeedingFeedback}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">{adaptationsOpen ? 'Hide' : 'Show'}</Text>
            </Group>
          </UnstyledButton>
          <Collapse in={adaptationsOpen}>
            <Box mt="sm">
              <AdaptationInsightsPanel
                weekStart={currentWeekStart}
                adaptations={adaptations}
                insights={insights}
                weekSummary={weekSummary}
                onDismissInsight={handleDismissInsight}
                onApplyInsight={handleApplyInsight}
                onViewAdaptation={handleViewAdaptation}
                isLoading={adaptationsLoading}
              />
            </Box>
          </Collapse>
        </Paper>
      )}

      {/* Mobile tap-to-assign banner */}
      {isMobile && selectedWorkoutId && (
        <Paper p="xs" withBorder style={{ borderLeft: '3px solid var(--color-teal)' }}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={500}>
              Tap a day to add {getWorkoutById(selectedWorkoutId)?.name || 'workout'}
            </Text>
            <ActionIcon variant="subtle" color="gray" onClick={() => setSelectedWorkoutId(null)}>
              <X size={16} />
            </ActionIcon>
          </Group>
        </Paper>
      )}

      {/* Calendar + workout library */}
      <Flex gap="md" align="flex-start">
        {/* Desktop library rail */}
        {!isMobile && sidebarOpen && (
          <Box
            style={{
              width: 280,
              flexShrink: 0,
              alignSelf: 'stretch',
              position: 'sticky',
              top: 80,
              height: 'calc(100vh - 120px)',
            }}
          >
            {librarySidebar}
          </Box>
        )}

        <Card style={{ flex: 1, minWidth: 0 }}>
        {/* Calendar Header */}
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            {!isMobile && (
              <Tooltip label={sidebarOpen ? 'Hide workout library' : 'Show workout library'}>
                <Button
                  variant="subtle"
                  size="compact-xs"
                  leftSection={sidebarOpen ? <CaretLeft size={14} /> : <CaretRight size={14} />}
                  onClick={() => setSidebarOpen((o) => !o)}
                  style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                >
                  Library
                </Button>
              </Tooltip>
            )}
            {isMobile && (
              <Button
                variant="light"
                color="teal"
                size="compact-xs"
                leftSection={<Plus size={14} />}
                onClick={() => setMobileLibraryOpen(true)}
              >
                Add workout
              </Button>
            )}
            <Text size="lg" fw={600} style={{ color: 'var(--color-text-primary)' }}>{rangeLabel}</Text>
          </Group>
          <Group gap="xs">
            <Tooltip label="Set training availability">
              <Button
                variant="subtle"
                size="compact-xs"
                leftSection={<CalendarX size={14} />}
                onClick={() => setAvailabilitySettingsOpen(true)}
                style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                Availability
              </Button>
            </Tooltip>
            <Tooltip label="Remove upcoming planned sessions">
              <Button
                variant="subtle"
                color="red"
                size="compact-xs"
                leftSection={<Trash size={14} />}
                onClick={openClearModal}
                style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                Clear
              </Button>
            </Tooltip>
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

        {/* Show info about no content yet */}
        {!activePlan && rides.length === 0 && plannedWorkouts.length === 0 && (
          <Text style={{ color: 'var(--color-text-muted)' }} ta="center" py="xl">
            No rides recorded yet. Connect Strava or upload rides to see them on the calendar.
          </Text>
        )}

        {/* Show calendar if there's a plan, any planned workouts, OR rides */}
        {(activePlan || rides.length > 0 || plannedWorkouts.length > 0) && (
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
                  // See note in weekly stats: read canonical rss first, gate
                  // power-derived TSS on sport so footpod watts on runs
                  // can't poison the daily total.
                  const storedLoad = ride.rss ?? ride.tss;
                  let rideTSS;
                  if (storedLoad != null && storedLoad > 0) {
                    rideTSS = storedLoad;
                  } else if (isPowerSport(ride) && ride.average_watts && ftp) {
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

                return (
                  <Card
                    key={index}
                    withBorder
                    p="xs"
                    draggable={hasDraggableWorkout}
                    onDragStart={(e) => handleDragStart(e, workout, date)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, date)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date)}
                    style={{
                      minHeight: 110,
                      backgroundColor: isDropTarget ? 'rgba(132, 216, 99, 0.3)' : backgroundColor,
                      border: isDropTarget ? `2px dashed ${'var(--color-teal)'}` : `2px solid ${borderColor}`,
                      opacity: isPast && !workout?.completed && !dayRides.length ? 0.7 : 1,
                      cursor: hasDraggableWorkout ? 'grab' : (activePlan ? 'pointer' : 'default'),
                      transition: 'background-color 0.2s, border 0.2s',
                    }}
                    onClick={() => {
                      // Mobile tap-to-assign: a library workout is selected → drop it here.
                      if (selectedWorkoutId) {
                        handleAddFromLibrary(selectedWorkoutId, date);
                        setSelectedWorkoutId(null);
                        return;
                      }
                      if (!activePlan) return;
                      if (workout) {
                        openEditModal(workout, date);
                      } else {
                        // Empty day → open the detail modal in "add" mode.
                        openAddModal(date);
                      }
                    }}
                  >
                    <Stack gap={4}>
                      {/* Date and completion checkbox */}
                      <Group justify="space-between" align="center">
                        <Text size="sm" fw={700} style={{ color: 'var(--color-text-primary)' }}>
                          {date.getDate()}
                          <Text span size="xs" fw={400} c="dimmed" ml={4}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]}
                          </Text>
                        </Text>
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

                      {/* Workout info - visible at a glance */}
                      {workout && workout.workout_type !== 'rest' && (
                        <Box>
                          {/* Workout type with icon */}
                          <Group gap={4} mb={4}>
                            <Text size="lg">{WORKOUT_TYPES[workout.workout_type]?.icon || '🚴'}</Text>
                            <Badge
                              size="sm"
                              color={WORKOUT_TYPES[workout.workout_type]?.color || 'gray'}
                              variant={workout.completed ? 'filled' : 'light'}
                            >
                              {WORKOUT_TYPES[workout.workout_type]?.name || workout.workout_type}
                            </Badge>
                          </Group>
                          {/* Workout name */}
                          <Text
                            size="xs"
                            fw={600}
                            lineClamp={1}
                            mb={2}
                            style={{ color: workout.completed ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}
                          >
                            {getWorkoutById(workout.workout_id)?.name || WORKOUT_TYPES[workout.workout_type]?.name || 'Workout'}
                          </Text>
                          {/* Duration and TSS - prominent */}
                          <Group gap={8}>
                            {workout.target_duration > 0 && (
                              <Text size="xs" fw={500} style={{ color: 'var(--color-text-secondary)' }}>
                                {workout.target_duration} min
                              </Text>
                            )}
                            {workout.target_tss > 0 && (
                              <Text size="xs" fw={600} c="orange">
                                {workout.target_tss} TSS
                              </Text>
                            )}
                            {/* Fuel indicator for longer workouts */}
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
                              >
                                Adjusted
                              </Badge>
                            </Tooltip>
                          )}

                          {/* Readiness-gated easing indicator (adaptive arc refill) */}
                          {workout.adjustment_reason && (
                            <Tooltip
                              label={
                                <Stack gap={2}>
                                  <Text size="xs" fw={600}>Eased for readiness</Text>
                                  <Text size="xs">{workout.adjustment_reason}</Text>
                                </Stack>
                              }
                              position="bottom"
                              withArrow
                            >
                              <Badge
                                size="xs"
                                variant="light"
                                color="teal"
                                leftSection={<Heartbeat size={10} />}
                                style={{ cursor: 'help' }}
                              >
                                Eased
                              </Badge>
                            </Tooltip>
                          )}
                          {/* Create Route button - only for today or future workouts */}
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
                        </Box>
                      )}

                      {/* Rest day indicator */}
                      {workout && workout.workout_type === 'rest' && !raceGoal && (
                        <Group gap={4}>
                          <Text size="lg">😴</Text>
                          <Text size="xs" c="dimmed" fw={500}>Rest Day</Text>
                        </Group>
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
      </Flex>

      {/* Mobile workout library drawer */}
      <Drawer
        opened={isMobile && mobileLibraryOpen}
        onClose={() => setMobileLibraryOpen(false)}
        position="bottom"
        size="80%"
        title="Workout Library"
        padding={0}
      >
        <Box style={{ height: '70vh' }}>{librarySidebar}</Box>
      </Drawer>

      {/* Availability Settings Drawer */}
      <Drawer
        opened={availabilitySettingsOpen}
        onClose={() => setAvailabilitySettingsOpen(false)}
        title="Training Availability"
        position={isMobile ? 'bottom' : 'right'}
        size={isMobile ? '90%' : 'lg'}
      >
        <AvailabilitySettings
          userId={user?.id}
          onAvailabilityChange={() => {
            // Prompt to reshuffle if there's an active plan
            if (activePlan?.id) {
              setReshufflePromptOpen(true);
            }
          }}
        />
      </Drawer>

      {/* Reshuffle prompt — appears when availability changes with an active plan */}
      {reshufflePromptOpen && activePlan?.id && (
        <Box
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            maxWidth: 420,
            width: '90%',
          }}
        >
          <Paper p="md" radius="md" shadow="lg" withBorder style={{ borderColor: 'var(--mantine-color-terracotta-7)' }}>
            <Stack gap="xs">
              <Group gap="xs" wrap="nowrap">
                <CalendarX size={18} color="var(--mantine-color-terracotta-5)" />
                <Text size="sm" fw={500}>Your availability changed</Text>
              </Group>
              <Text size="xs" c="dimmed">
                Would you like to reshuffle your active plan to fit your updated schedule?
                Workouts on blocked days will be moved to available days.
              </Text>
              <Group gap="xs" justify="flex-end">
                <Button variant="subtle" size="xs" color="gray" onClick={() => setReshufflePromptOpen(false)}>
                  Not now
                </Button>
                <Button
                  variant="filled"
                  size="xs"
                  color="teal"
                  loading={isReshuffling}
                  onClick={async () => {
                    setIsReshuffling(true);
                    try {
                      const result = await reshufflePlan({
                        weeklyAvailability,
                        dateOverrides,
                        preferences: {
                          maxWorkoutsPerWeek: availabilityPreferences?.maxWorkoutsPerWeek ?? null,
                          preferWeekendLongRides: availabilityPreferences?.preferWeekendLongRides ?? true,
                        },
                      });

                      setReshufflePromptOpen(false);

                      if (result.success && result.redistributions.length > 0) {
                        notifications.show({
                          title: 'Plan Updated',
                          message: `${result.redistributions.length} workout${result.redistributions.length > 1 ? 's' : ''} moved to fit your schedule`,
                          color: 'terracotta',
                        });
                        await loadPlannedWorkouts();
                        if (onPlanUpdated) onPlanUpdated();
                      } else if (result.success) {
                        notifications.show({
                          title: 'No Changes Needed',
                          message: 'All your workouts already fit your schedule',
                          color: 'blue',
                        });
                      } else {
                        notifications.show({
                          title: 'Reshuffle Failed',
                          message: 'Could not update your plan. Please try again.',
                          color: 'red',
                        });
                      }
                    } finally {
                      setIsReshuffling(false);
                    }
                  }}
                >
                  Reshuffle Plan
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Box>
      )}

      {/* Adaptation Feedback Modal (shared with planner) */}
      <AdaptationFeedbackModal
        adaptation={selectedAdaptation}
        opened={feedbackModalOpen}
        onClose={() => {
          setFeedbackModalOpen(false);
          setSelectedAdaptation(null);
        }}
        onSubmit={handleAdaptationFeedback}
      />

      {/* Workout Detail + Edit Modal (shared with planner) */}
      <WorkoutModal
        workout={modalWorkoutDef}
        plannedWorkout={modalPlannedWorkout}
        opened={editModalOpen}
        onClose={() => { setEditModalOpen(false); setIsAddMode(false); }}
        onSave={handleModalSave}
        onDelete={deleteWorkout}
        onChangeWorkout={handleChangeWorkout}
        onAddWorkout={handleAddWorkoutFromModal}
        isAdd={isAddMode}
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

      {/* Clear planned sessions confirm */}
      <Modal
        opened={clearModalOpen}
        onClose={() => setClearModalOpen(false)}
        title="Clear planned sessions?"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {clearCount === null
              ? 'Checking your calendar…'
              : clearCount === 0
                ? 'There are no upcoming planned sessions to clear.'
                : `This removes ${clearCount} upcoming planned session${clearCount === 1 ? '' : 's'} from today onward. Completed sessions and past history are kept, and your logged rides are not affected.`}
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={() => setClearModalOpen(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<Trash size={16} />}
              onClick={handleClearPlanned}
              loading={clearing}
              disabled={clearCount === 0}
            >
              Clear {clearCount ? `${clearCount} session${clearCount === 1 ? '' : 's'}` : 'sessions'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default TrainingCalendar;
