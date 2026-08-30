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
import { formatLocalDate, addDays, parsePlanStartDate, parseLocalDate, getTodayString, toDateKey, weekStartKey, activityDateKey } from '../utils/dateUtils';
import { getCalendarRange } from '../lib/calendar/getCalendarRange';
import {
  moveEntry, swapEntries, createEntry, deleteEntry, updateEntry, setEntryStatus,
  countUpcomingClearable, clearUpcomingEntries,
} from '../lib/calendar/calendarMutations';
import { toPlannedWorkoutShapes } from '../lib/calendar/plannedWorkoutAdapter';
import {
  listPendingProposals, acceptProposal, rejectProposal, describeOp, explainReason,
} from '../lib/calendar/calendarProposals';
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
  // Tap-to-lift / tap-to-place. This is the primary gesture, not an alternative
  // to drag: HTML5 drag-and-drop does not fire on touch at all, so on a phone
  // or iPad dragging a session has never once worked.
  const [heldEntryId, setHeldEntryId] = useState(null);
  // Set when a placement lands on an occupied day — swap, or stack both?
  const [placePrompt, setPlacePrompt] = useState(null);
  // Coach changes the server withheld for the athlete to accept. Without this
  // the coach says "I've put that up for you to accept" and there is nothing
  // to accept it with — which is where the weekend swap went.
  const [proposals, setProposals] = useState([]);
  const [reviewing, setReviewing] = useState(null);
  const [deciding, setDeciding] = useState(false);
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

  // Pending coach proposals. Polled on the same triggers as the calendar
  // rather than subscribed to: Realtime costs ~13 Postgres connections just
  // for being active (see CLAUDE.md), and a proposal appears in response to a
  // coach turn the athlete just took, not out of nowhere.
  const loadProposals = async () => {
    if (!user?.id) return;
    setProposals(await listPendingProposals(user.id));
  };

  useEffect(() => {
    if (!user?.id) return;
    loadProposals();
    // A coach turn on another surface (the command bar, Today) can create one,
    // and both already fire this event when they change the calendar.
    const onUpdate = () => loadProposals();
    window.addEventListener('training-plan-updated', onUpdate);
    return () => window.removeEventListener('training-plan-updated', onUpdate);
  }, [user?.id, refreshKey]);

  /** Accept a proposal, then say exactly what landed and what did not. */
  const decideProposal = async (proposal, accept) => {
    if (!user?.id) return;
    setDeciding(true);
    try {
      if (!accept) {
        const ok = await rejectProposal(user.id, proposal.id);
        notifications.show({
          title: ok ? 'Dismissed' : 'Could not dismiss that',
          message: ok ? 'Nothing on your calendar changed.' : 'Try again in a moment.',
          color: ok ? 'gray' : 'red',
        });
      } else {
        const result = await acceptProposal(user.id, proposal);
        const parts = [];
        if (result.applied > 0) parts.push(`${result.applied} change${result.applied === 1 ? '' : 's'} made`);
        // A skip is not a failure and not a success — the session was gone.
        if (result.skipped > 0) parts.push(`${result.skipped} skipped (no longer on your calendar)`);
        if (result.failed > 0) parts.push(`${result.failed} didn't go through`);
        notifications.show({
          title: result.failed > 0 ? 'Partly applied' : 'Applied',
          message: parts.join(' · ') || 'Nothing needed changing.',
          color: result.failed > 0 ? 'yellow' : 'teal',
          autoClose: 8000,
        });
        await loadPlannedWorkouts();
        if (onPlanUpdated) onPlanUpdated();
      }
      setReviewing(null);
      await loadProposals();
    } finally {
      setDeciding(false);
    }
  };

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

      // Reads come from calendar_entries now, translated into the field names
      // this component already renders (see plannedWorkoutAdapter).
      //
      // WHY: a row in planned_workouts belongs to a PLAN, so anything outside
      // the plan's duration_weeks window cannot exist there. This athlete's
      // plan ends 2026-10-01 and their cyclocross season runs to 2026-12-05 —
      // eight of nine races, and all 32 sessions the coach generated around
      // them, fall outside it. In calendar_entries a row belongs to the
      // ATHLETE, keyed (user_id, date, slot), so a December race is just a row.
      //
      // This also un-splits the writers: the coach already writes
      // calendar_entries, so what it schedules now appears here rather than
      // succeeding invisibly in a table this surface never read.
      const range = await getCalendarRange(user.id, startDateStr, endDateStr);
      setPlannedWorkouts(toPlannedWorkoutShapes(range.entries, getPlanStartDate(activePlan)));
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

  // Races for a date, from calendar_entries first.
  //
  // Migration 115 copied every race_goals row into calendar_entries, so a
  // calendar reading BOTH tables renders each race twice — The Rad is in both
  // under different ids. calendar_entries is the calendar's source because it
  // is the only one that holds the nine cyclocross races the coach created;
  // race_goals is consulted only for a date calendar_entries doesn't cover, so
  // nothing that used to show up disappears.
  //
  // race_goals itself stays: the Race tab still owns priority, goal time,
  // target TFI and results. It just isn't a second calendar.
  const getRaceGoalForDate = (date) => {
    if (!date) return null;
    const dateStr = formatLocalDate(date);
    const entryRace = plannedWorkouts.find(
      (w) => w.entry_type === 'race' && w.scheduled_date === dateStr
    );
    if (entryRace) {
      return { id: entryRace.id, name: entryRace.name, race_date: dateStr,
               race_type: entryRace.workout_type };
    }
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
    // Races render through getRaceGoalForDate, so exclude them here or a race
    // day draws twice — once as the race banner and once as a session chip.
    return plannedWorkouts.find(
      (w) => w.scheduled_date === dateStr && w.entry_type !== 'race'
    );
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

  // Calculate weekly summary stats, keyed by the MONDAY DATE of each week.
  //
  // Previously this bucketed planned workouts by `workout.week_number` while
  // bucketing rides by weeks-since-activePlan-start — two different axes in one
  // map. `plannedWorkouts` is user-scoped (loaded across all of the athlete's
  // plans), and `week_number` is measured from each row's OWN plan start, so
  // three plans' "Week 4" all landed in bucket 4 and summed together. A date key
  // is the only axis every row actually shares.
  const weeklyStats = useMemo(() => {
    const stats = {};
    const bucket = (key) => {
      if (!key) return null;
      if (!stats[key]) {
        stats[key] = {
          plannedTSS: 0,
          actualTSS: 0,
          completedCount: 0,
          totalCount: 0,
          plannedDuration: 0,
          actualDuration: 0,
        };
      }
      return stats[key];
    };

    // Group planned workouts by the Monday of their scheduled week.
    plannedWorkouts.forEach(workout => {
      if (workout.workout_type === 'rest') return;
      const week = bucket(weekStartKey(toDateKey(workout.scheduled_date)));
      if (!week) return;
      week.totalCount++;
      // Canonical target_rss first, legacy target_tss fallback (CLAUDE.md).
      week.plannedTSS += workout.target_rss ?? workout.target_tss ?? 0;
      week.plannedDuration += workout.target_duration || 0;
      if (workout.completed) {
        week.completedCount++;
        week.actualTSS +=
          workout.actual_rss ?? workout.actual_tss ?? workout.target_rss ?? workout.target_tss ?? 0;
        week.actualDuration += workout.actual_duration || workout.target_duration || 0;
      }
    });

    // Add actual ride TSS from activities, keyed by the athlete's local day.
    rides.forEach(ride => {
      const week = bucket(weekStartKey(activityDateKey(ride)));
      if (!week) return;
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
      week.actualTSS += rideTSS;
      week.actualDuration += (ride.moving_time || 0) / 60;
    });

    return stats;
  }, [plannedWorkouts, rides, ftp]);

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
    if (!user?.id || !workout?.id) return;
    const next = workout.completed ? 'planned' : 'done';
    await runCalendarChange(
      () => setEntryStatus(user.id, workout.id, next),
      next === 'done' ? `Marked ${workout.name} done` : `${workout.name} is planned again`,
      () => setEntryStatus(user.id, workout.id, workout.completed ? 'done' : 'planned'),
    );
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

  // Save workout changes from WorkoutModal (receives camelCase updates).
  // No activePlan guard: an entry belongs to the athlete, not to a plan, so a
  // December session with no plan around it is as editable as tomorrow's.
  const handleModalSave = async (updates) => {
    if (!user?.id || !selectedWorkout?.id) return;

    const before = {
      target_load: selectedWorkout.target_rss ?? selectedWorkout.target_tss ?? null,
      target_duration_min: selectedWorkout.target_duration ?? null,
      notes: selectedWorkout.notes ?? null,
    };
    const patch = {
      target_load: updates.targetTSS ?? null,
      target_duration_min: updates.targetDuration ?? null,
      notes: updates.notes ?? null,
    };

    const ok = await runCalendarChange(
      () => updateEntry(user.id, selectedWorkout.id, patch),
      `Saved ${selectedWorkout.name}`,
      () => updateEntry(user.id, selectedWorkout.id, before),
    );
    if (ok) setEditModalOpen(false);
  };

  // Delete workout. This is the one destructive gesture on the calendar, so it
  // is also the one that most needs an undo — recreated on the same day from
  // the row as it was. The new row gets a new id; nothing on the calendar
  // addresses an entry by id across a delete, so that is invisible.
  const deleteWorkout = async () => {
    if (!user?.id || !selectedWorkout?.id) return;
    const gone = selectedWorkout;
    setSaving(true);
    try {
      const ok = await runCalendarChange(
        () => deleteEntry(user.id, gone.id),
        `Removed ${gone.name}`,
        () => createEntry(user.id, gone.scheduled_date, {
          type: gone.entry_type || 'workout',
          title: gone.name,
          workout_id: gone.workout_id,
          workout_type: gone.workout_type,
          target_load: gone.target_rss ?? gone.target_tss ?? null,
          target_duration_min: gone.target_duration ?? null,
          notes: gone.notes ?? null,
        }),
      );
      if (ok) setEditModalOpen(false);
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
      setClearCount(await countUpcomingClearable(user.id, formatLocalDate(new Date())));
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
      // No undo offered here, and deliberately: this is a bulk delete behind a
      // confirmation modal that names the count, and an undo toast that can
      // only restore rows it captured would be a worse promise than none.
      const ok = await runCalendarChange(
        () => clearUpcomingEntries(user.id, formatLocalDate(new Date())),
        'Calendar cleared',
      );
      if (ok) {
        setClearModalOpen(false);
        // Let other surfaces (dashboard, Today) refresh.
        window.dispatchEvent(new CustomEvent('training-plan-updated'));
      }
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
    // No plan required and no window to fall outside of. The two guards that
    // used to be here — `!activePlan` and the `duration_weeks` clamp — are why
    // a race in December could not be added: the athlete's plan ends
    // 2026-10-01 and their cyclocross season runs to 2026-12-05.
    if (!user || !targetDate) return;

    try {
      const workout = getWorkoutById(workoutId);
      if (!workout) return;

      const scheduledDate = formatLocalDate(targetDate);

      // ADDS, never REPLACES. The old code deleted whatever was on that day
      // first, because `UNIQUE (plan_id, scheduled_date)` made a second row
      // impossible — so adding a session silently destroyed the one already
      // there. Slots make a double day legitimate, so a second entry just
      // takes the next slot.
      const created = await createEntry(user.id, scheduledDate, {
        title: workout.name,
        workout_id: workoutId,
        workout_type: workout.category || null,
        target_load: overrides?.targetTSS ?? workout.targetTSS ?? null,
        target_duration_min: overrides?.duration ?? workout.duration ?? null,
        source: 'manual',
      });

      if (!created.success) {
        notifications.show({
          title: 'Could not add that workout',
          message: created.error || 'The change did not go through.',
          color: 'red',
        });
        return;
      }

      await loadPlannedWorkouts();
      if (onPlanUpdated) onPlanUpdated();

      notifications.show({
        title: `Added ${workout.name}`,
        message: `${formatDayLabel(scheduledDate)} · tap to undo`,
        color: 'teal',
        autoClose: 6000,
        onClick: async () => {
          const back = await deleteEntry(user.id, created.data.id);
          if (back?.success) {
            await loadPlannedWorkouts();
            if (onPlanUpdated) onPlanUpdated();
          }
        },
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

    if (!user?.id) return;
    const targetRss = def.targetTSS || 0;
    const before = {
      workout_id: selectedWorkout.workout_id,
      workout_type: selectedWorkout.workout_type,
      title: selectedWorkout.name,
      target_load: selectedWorkout.target_rss ?? selectedWorkout.target_tss ?? null,
      target_duration_min: selectedWorkout.target_duration ?? null,
    };

    const ok = await runCalendarChange(
      () => updateEntry(user.id, selectedWorkout.id, {
        workout_id: workoutId,
        workout_type: def.category,
        title: def.name,
        target_load: targetRss,
        target_duration_min: def.duration || 0,
      }),
      `Changed to ${def.name}`,
      () => updateEntry(user.id, selectedWorkout.id, before),
    );
    if (!ok) return;

    // Reflect the swap in the open modal so the profile/timeline update in place.
    const updatedRow = { ...selectedWorkout, workout_id: workoutId, workout_type: def.category, name: def.name, target_duration: def.duration || 0, target_tss: targetRss, target_rss: targetRss };
    setSelectedWorkout(updatedRow);
    const mapped = mapToModalWorkout(updatedRow);
    setModalPlannedWorkout(mapped);
    setModalWorkoutDef(mapped?.workout || null);
  };

  /**
   * Place the held (or dragged) entry on a day.
   *
   * This replaces 227 lines, most of which were the three-write
   * park/move/restore dance with rollback that `UNIQUE (plan_id,
   * scheduled_date)` forced on the old table: park the occupant on 1900-01-01,
   * move the dragged row in, move the occupant to the source date, and unwind
   * by hand if any step failed. On `calendar_entries` the key is
   * `(user_id, date, slot)`, so a swap is two plain updates and lives in
   * `swapEntries`.
   *
   * Also gone: the `!activePlan` return and the `duration_weeks` clamp. Those
   * are why a December race could not be placed — the athlete's plan ends
   * 2026-10-01 and their cyclocross season runs to 2026-12-05, so the calendar
   * refused every date past the plan's edge, silently for a tap and with a
   * "outside the plan duration" warning for a drag.
   */
  const placeEntry = async (entryId, targetDate, { sourceDate } = {}) => {
    if (!user?.id || !entryId || !targetDate) return;

    const targetKey = formatLocalDate(targetDate);
    const moving = plannedWorkouts.find((w) => w.id === entryId);
    if (!moving) return;
    if (moving.scheduled_date === targetKey) {
      setHeldEntryId(null);
      setDraggedWorkout(null);
      return;
    }

    // A day that already holds something is a question, not an error: did they
    // mean to swap the two, or to stack both on that day? Guessing either way
    // is how a weekend ends up wrong.
    const occupant = plannedWorkouts.find(
      (w) => w.scheduled_date === targetKey && w.entry_type !== 'race' && w.id !== entryId
    );
    if (occupant) {
      setPlacePrompt({ moving, occupant, targetKey, sourceDate });
      return;
    }

    await runCalendarChange(
      () => moveEntry(user.id, entryId, targetKey),
      `Moved ${moving.name} to ${formatDayLabel(targetKey)}`,
      () => moveEntry(user.id, entryId, moving.scheduled_date),
    );
    setHeldEntryId(null);
    setDraggedWorkout(null);
  };

  /** Run a mutation, report it, and offer an undo. Never silent either way. */
  const runCalendarChange = async (apply, successMessage, undo) => {
    const result = await apply();
    if (!result?.success) {
      notifications.show({
        title: 'Could not update the calendar',
        message: result?.error || 'The change did not go through.',
        color: 'red',
      });
      return false;
    }
    await loadPlannedWorkouts();
    if (onPlanUpdated) onPlanUpdated();
    notifications.show({
      title: successMessage,
      message: undo ? 'Tap to undo' : undefined,
      color: 'teal',
      autoClose: 6000,
      onClick: undo
        ? async () => {
            const back = await undo();
            if (back?.success) {
              await loadPlannedWorkouts();
              if (onPlanUpdated) onPlanUpdated();
            }
          }
        : undefined,
    });
    return true;
  };

  const formatDayLabel = (dateKey) => {
    const d = parseLocalDate(dateKey);
    return d
      ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : dateKey;
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    setDragOverDate(null);

    // Library drag-to-add tags its payload; a reschedule drag sets only text/plain.
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

    if (!draggedWorkout || !targetDate) {
      setDraggedWorkout(null);
      return;
    }
    await placeEntry(draggedWorkout.workout.id, targetDate, {
      sourceDate: draggedWorkout.sourceDate,
    });
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
  // weeklyStats is keyed by Monday date; the plan-relative number is label only.
  const currentWeekStats = weeklyStats[weekStartKey(getTodayString())];

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
      {activePlan && currentWeekStats && (
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
                <Text size="xs" c="dimmed">RSS</Text>
              </Group>
              <Text fw={600}>
                {Math.round(currentWeekStats.actualTSS)} / {currentWeekStats.plannedTSS}
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
                {Math.round(currentWeekStats.actualDuration)} / {currentWeekStats.plannedDuration} min
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
                {currentWeekStats.completedCount} / {currentWeekStats.totalCount} workouts
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
                {currentWeekStats.totalCount > 0
                  ? Math.round((currentWeekStats.completedCount / currentWeekStats.totalCount) * 100)
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

        {/* Coach changes waiting on the athlete.
            The server withholds a coach change when it touches more than one
            session, one the athlete already adjusted, or one already done —
            and the coach then tells them "I've put that up for you to accept".
            Until this banner existed that sentence was false: the proposal
            went into a table nothing read. */}
        {proposals.length > 0 && (
          <Group
            justify="space-between"
            wrap="nowrap"
            p="xs"
            mb="xs"
            style={{
              border: '1.5px solid var(--color-accent, #2F6F62)',
              backgroundColor: 'rgba(47, 111, 98, 0.08)',
            }}
          >
            <Text size="sm" style={{ minWidth: 0 }}>
              <Text span fw={700} tt="uppercase" size="xs"
                style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em' }}>
                Coach{' '}
              </Text>
              <Text span fw={600}>
                {proposals.length === 1
                  ? '1 change is waiting for you'
                  : `${proposals.length} changes are waiting for you`}
              </Text>
              {proposals[0].summary && (
                <Text span c="dimmed"> — {proposals[0].summary}</Text>
              )}
            </Text>
            <Button
              variant="light"
              color="teal"
              size="compact-xs"
              onClick={() => setReviewing(proposals[0])}
            >
              Review
            </Button>
          </Group>
        )}

        {/* Held bar — the whole tap-to-place model is invisible without it.
            Nothing else on screen tells the athlete a session is "picked up". */}
        {heldEntryId && (() => {
          const heldWorkout = plannedWorkouts.find((w) => w.id === heldEntryId);
          if (!heldWorkout) return null;
          return (
            <Group
              justify="space-between"
              wrap="nowrap"
              p="xs"
              mb="xs"
              style={{
                border: '1.5px solid var(--color-warning, #D4600A)',
                backgroundColor: 'rgba(212, 96, 10, 0.08)',
              }}
            >
              <Text size="sm" style={{ minWidth: 0 }}>
                <Text span fw={700} tt="uppercase" size="xs"
                  style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em' }}>
                  Moving{' '}
                </Text>
                <Text span fw={600}>{heldWorkout.name}</Text>
                <Text span c="dimmed"> — tap any day to place it</Text>
              </Text>
              <Button variant="subtle" size="compact-xs" onClick={() => setHeldEntryId(null)}>
                Cancel
              </Button>
            </Group>
          );
        })()}

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
                      // Tap-to-assign from the library.
                      if (selectedWorkoutId) {
                        handleAddFromLibrary(selectedWorkoutId, date);
                        setSelectedWorkoutId(null);
                        return;
                      }
                      // TAP TO LIFT, TAP TO PLACE — the primary gesture, and
                      // the only one that works on touch. HTML5 drag-and-drop
                      // does not fire there, so on a phone or iPad dragging a
                      // session has never once worked. Drag still works on
                      // desktop for anyone who prefers it.
                      if (heldEntryId) {
                        // Tapping the held session again opens it instead of
                        // placing it on itself.
                        if (workout && workout.id === heldEntryId) {
                          setHeldEntryId(null);
                          openEditModal(workout, date);
                        } else {
                          placeEntry(heldEntryId, date);
                        }
                        return;
                      }
                      // `if (!activePlan) return` used to sit here. It made a
                      // tap do NOTHING — no modal, no error, no explanation —
                      // whenever no plan was active, which is indistinguishable
                      // from a broken app.
                      if (workout) {
                        setHeldEntryId(workout.id);
                      } else {
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
                                {workout.target_tss} RSS
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
                                <Text size="xs" c="indigo" fw={500}>+{Math.round(totalTSS)} RSS</Text>
                              )}
                            </Box>
                          </Tooltip>
                        );
                      })()}

                      {/* Show actual TSS if rides */}
                      {dayTSS > 0 && (
                        <Text size="xs" c="orange" fw={500}>{Math.round(dayTSS)} RSS</Text>
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

      {/* Review a coach proposal.
          Shows the change BEFORE → AFTER per operation, because "accept" is
          only a real decision if the athlete can see what they are accepting.
          Accepting pins every session it touches: an accepted change is a
          decision they made, so the coach's next edit to the same session has
          to ask again. */}
      <Modal
        opened={!!reviewing}
        onClose={() => setReviewing(null)}
        title="Your coach suggests"
        centered
        radius={0}
        size="lg"
      >
        {reviewing && (
          <Stack gap="sm">
            {reviewing.summary && <Text size="sm">{reviewing.summary}</Text>}
            <Text size="xs" c="dimmed">
              Waiting on you because it {explainReason(reviewing.reason_code)}.
            </Text>

            <Stack gap={6}>
              {(reviewing.ops ?? []).map((op, i) => (
                <Group
                  key={op.entry_id ? `${op.entry_id}-${i}` : `new-${i}`}
                  align="flex-start"
                  wrap="nowrap"
                  gap="sm"
                  p="xs"
                  style={{ border: '1px solid var(--color-border, #D9D2C5)' }}
                >
                  <Text
                    size="xs"
                    fw={700}
                    tt="uppercase"
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      letterSpacing: '0.08em',
                      minWidth: 64,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {op.op === 'set_status' ? 'status' : op.op}
                  </Text>
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600}>{describeOp(op)}</Text>
                    {op.reason && <Text size="xs" c="dimmed">{op.reason}</Text>}
                  </Stack>
                </Group>
              ))}
            </Stack>

            <Group justify="flex-end" gap="xs" mt="xs">
              <Button
                variant="subtle"
                color="gray"
                radius={0}
                disabled={deciding}
                onClick={() => decideProposal(reviewing, false)}
              >
                Dismiss
              </Button>
              <Button
                color="teal"
                radius={0}
                loading={deciding}
                onClick={() => decideProposal(reviewing, true)}
              >
                Apply {(reviewing.ops ?? []).length === 1 ? 'it' : `all ${(reviewing.ops ?? []).length}`}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

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
      {/* Placing onto an occupied day is a QUESTION, not an error.
          This is the case that broke the athlete's weekend: through the coach
          a swap counted as two edits, tripped the multi-entry rule, and landed
          in an approval queue with no accept button. Asked directly, it is one
          tap. */}
      <Modal
        opened={!!placePrompt}
        onClose={() => { setPlacePrompt(null); setHeldEntryId(null); setDraggedWorkout(null); }}
        title={placePrompt ? `${formatDayLabel(placePrompt.targetKey)} already has something` : ''}
        centered
        radius={0}
      >
        {placePrompt && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {placePrompt.occupant.name} is on that day. What did you mean?
            </Text>

            <Button
              variant="default"
              radius={0}
              onClick={async () => {
                const { moving, occupant } = placePrompt;
                setPlacePrompt(null);
                await runCalendarChange(
                  () => swapEntries(user.id, moving.id, occupant.id),
                  `Swapped ${moving.name} and ${occupant.name}`,
                  () => swapEntries(user.id, moving.id, occupant.id),
                );
                setHeldEntryId(null);
                setDraggedWorkout(null);
              }}
              styles={{ inner: { justifyContent: 'flex-start' }, root: { height: 'auto', padding: 12 } }}
            >
              <Stack gap={2} align="flex-start">
                <Text fw={600} size="sm">Swap them</Text>
                <Text size="xs" c="dimmed">
                  {placePrompt.moving.name} to {formatDayLabel(placePrompt.targetKey)}, and{' '}
                  {placePrompt.occupant.name} to {formatDayLabel(placePrompt.moving.scheduled_date)}
                </Text>
              </Stack>
            </Button>

            <Button
              variant="default"
              radius={0}
              onClick={async () => {
                const { moving, targetKey } = placePrompt;
                const from = moving.scheduled_date;
                setPlacePrompt(null);
                await runCalendarChange(
                  () => moveEntry(user.id, moving.id, targetKey),
                  `Moved ${moving.name} to ${formatDayLabel(targetKey)}`,
                  () => moveEntry(user.id, moving.id, from),
                );
                setHeldEntryId(null);
                setDraggedWorkout(null);
              }}
              styles={{ inner: { justifyContent: 'flex-start' }, root: { height: 'auto', padding: 12 } }}
            >
              <Stack gap={2} align="flex-start">
                <Text fw={600} size="sm">
                  Put both on {formatDayLabel(placePrompt.targetKey)}
                </Text>
                <Text size="xs" c="dimmed">
                  A double day — {formatDayLabel(placePrompt.moving.scheduled_date)} becomes empty
                </Text>
              </Stack>
            </Button>

            <Button
              variant="subtle"
              color="gray"
              radius={0}
              onClick={() => { setPlacePrompt(null); setHeldEntryId(null); setDraggedWorkout(null); }}
            >
              Cancel
            </Button>
          </Stack>
        )}
      </Modal>


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
