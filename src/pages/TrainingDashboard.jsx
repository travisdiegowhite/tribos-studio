// Training Dashboard - Updated Dec 2024
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Container,
  Text,
  Card,
  SimpleGrid,
  Stack,
  Group,
  Box,
  Progress,
  Badge,
  Loader,
  Button,
  Tabs,
  Paper,
  ThemeIcon,
  RingProgress,
  Select,
  Divider,
  Alert,
  Modal,
  List,
  Menu,
  ActionIcon,
  Tooltip,
  Grid,
  Collapse,
  SegmentedControl,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  IconActivity,
  IconTrendingUp,
  IconTrendingDown,
  IconBolt,
  IconCalendar,
  IconClock,
  IconMountain,
  IconRoute,
  IconTarget,
  IconMessageCircle,
  IconChevronRight,
  IconChevronDown,
  IconFlame,
  IconHeart,
  IconMoon,
  IconAward,
  IconChartBar,
  IconSettings,
  IconUpload,
  IconList,
  IconBarbell,
  IconDownload,
  IconBrandZwift,
  IconFileExport,
  IconDeviceWatch,
  IconBrandStrava,
  IconFileImport,
  IconCalendarStats,
  IconCalendarEvent,
  IconTrophy,
} from '@tabler/icons-react';
import { tokens, depth } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { parsePlanStartDate } from '../utils/dateUtils';
import { supabase } from '../lib/supabase';
import { CoachCard } from '../components/coach';
import TrainingLoadChart from '../components/TrainingLoadChart.jsx';
import TrainingCalendar from '../components/TrainingCalendar.jsx';
// TrainingPlanBrowser moved to PlannerPage
import RideHistoryTable from '../components/RideHistoryTable.jsx';
import PersonalRecordsCard from '../components/PersonalRecordsCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import HealthCheckInModal from '../components/HealthCheckInModal.jsx';
import FitUploadModal from '../components/FitUploadModal.jsx';
import BulkGpxUploadModal from '../components/BulkGpxUploadModal.jsx';
import { TrainingMetricsSkeleton } from '../components/LoadingSkeletons.jsx';
import { SupplementWorkoutModal, RouteAnalysisPanel } from '../components/training';
import RaceGoalsPanel from '../components/RaceGoalsPanel.jsx';
import PowerDurationCurve from '../components/PowerDurationCurve.jsx';
import ZoneDistributionChart from '../components/ZoneDistributionChart.jsx';
import RampRateAlert, { RampRateBadge } from '../components/RampRateAlert.jsx';
import { ActivityMetricsBadges } from '../components/ActivityMetrics.jsx';
import RideAnalysisModal from '../components/RideAnalysisModal.jsx';
import { WorkoutDifficultyBadge, getQuickDifficultyEstimate } from '../components/WorkoutDifficultyBadge.jsx';
import CriticalPowerModel from '../components/CriticalPowerModel.jsx';
import TrainNow from '../components/TrainNow.jsx';
import AerobicDecoupling from '../components/AerobicDecoupling.jsx';
import AthleteBenchmarking from '../components/AthleteBenchmarking.jsx';
import HealthTrendsChart from '../components/HealthTrendsChart.jsx';
import HistoricalInsights from '../components/HistoricalInsights.jsx';
import { WORKOUT_LIBRARY, getWorkoutsByCategory, getWorkoutById } from '../data/workoutLibrary';
import { getWorkoutRecommendation } from '../services/workoutRecommendation';
import { getAllPlans } from '../data/trainingPlanTemplates';
import { calculateCTL, calculateATL, calculateTSB, interpretTSB, estimateTSS, calculateTSS, findOptimalSupplementDays } from '../utils/trainingPlans';
import { exportWorkout, downloadWorkout } from '../utils/workoutExport';
import { formatDistance, formatElevation, formatSpeed } from '../utils/units';
import { PoweredByStrava } from '../components/StravaBranding';
import { garminService } from '../utils/garminService.js';
import PageHeader from '../components/PageHeader.jsx';
import { useCrossTraining } from '../hooks/useCrossTraining';

function TrainingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [loading, setLoading] = useState(true);

  // Read tab from URL query parameter, default to 'today'
  // Note: 'plans' tab moved to /planner page
  const urlTab = searchParams.get('tab');
  const validTabs = ['today', 'trends', 'power', 'routes', 'history', 'insights', 'calendar'];
  const initialTab = validTabs.includes(urlTab) ? urlTab : 'today';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [timeRange, setTimeRange] = useState('30');
  const [activities, setActivities] = useState([]);
  const [speedProfile, setSpeedProfile] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [ftp, setFtp] = useState(null);
  const [powerZones, setPowerZones] = useState(null);
  const [userWeight, setUserWeight] = useState(null);
  const [trainingMetrics, setTrainingMetrics] = useState({
    ctl: 0,
    atl: 0,
    tsb: 0,
    interpretation: null,
  });
  const [dailyTSSData, setDailyTSSData] = useState([]);
  const [healthCheckInOpen, setHealthCheckInOpen] = useState(false);
  const [fitUploadOpen, setFitUploadOpen] = useState(false);
  const [gpxUploadOpen, setGpxUploadOpen] = useState(false);
  const [todayHealthMetrics, setTodayHealthMetrics] = useState(null);
  const [healthHistory, setHealthHistory] = useState([]);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [raceGoals, setRaceGoals] = useState([]);
  const [trainNowExpanded, setTrainNowExpanded] = useState(false);
  const [rideAnalysisModalOpen, setRideAnalysisModalOpen] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // Cross-training activities
  const { getRecentActivitiesForContext, getDailyTSSRange } = useCrossTraining();
  const [crossTrainingContext, setCrossTrainingContext] = useState([]);

  // Unit conversion helpers
  const isImperial = unitsPreference === 'imperial';

  // Format functions using preference
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);
  const formatSpd = (kmh) => formatSpeed(kmh, isImperial);

  // Filter out hidden activities for stats/calculations
  const visibleActivities = useMemo(() =>
    activities.filter(a => !a.is_hidden),
    [activities]
  );

  // Recalculate training metrics when visible activities change
  useEffect(() => {
    if (visibleActivities.length === 0) {
      setDailyTSSData([]);
      setTrainingMetrics({ ctl: 0, atl: 0, tsb: 0, interpretation: null });
      return;
    }

    const dailyTSS = {};
    const today = new Date();

    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyTSS[dateStr] = { date: dateStr, tss: 0 };
    }

    visibleActivities.forEach((activity) => {
      const dateStr = activity.start_date?.split('T')[0];
      if (dateStr && dailyTSS[dateStr]) {
        let activityTSS;
        if (activity.average_watts && ftp) {
          activityTSS = calculateTSS(
            activity.moving_time,
            activity.average_watts,
            ftp
          );
        } else {
          activityTSS = estimateTSS(
            (activity.moving_time || 0) / 60,
            (activity.distance || 0) / 1000,
            activity.total_elevation_gain || 0,
            'endurance'
          );
        }
        dailyTSS[dateStr].tss += activityTSS || 0;
      }
    });

    const sortedDailyTSS = Object.values(dailyTSS)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    setDailyTSSData(sortedDailyTSS);

    const tssValues = sortedDailyTSS.map(d => d.tss);
    const ctl = calculateCTL(tssValues);
    const atl = calculateATL(tssValues);
    const tsb = calculateTSB(ctl, atl);
    const interpretation = interpretTSB(tsb);

    setTrainingMetrics({ ctl, atl, tsb, interpretation });
  }, [visibleActivities, ftp]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        const { data: userProfileData } = await supabase
          .from('user_profiles')
          .select('units_preference, ftp, power_zones, weight_kg')
          .eq('id', user.id)
          .single();

        if (userProfileData?.units_preference) {
          setUnitsPreference(userProfileData.units_preference);
        }
        if (userProfileData?.ftp) setFtp(userProfileData.ftp);
        if (userProfileData?.power_zones) setPowerZones(userProfileData.power_zones);
        if (userProfileData?.weight_kg) setUserWeight(userProfileData.weight_kg);

        // Get all activities using pagination (Supabase caps at 1000 per request)
        let allActivities = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: activityData, error: activityError } = await supabase
            .from('activities')
            .select('*')
            .eq('user_id', user.id)
            .order('start_date', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (activityError) {
            console.error('Error loading activities:', activityError);
            break;
          }

          if (activityData && activityData.length > 0) {
            allActivities = [...allActivities, ...activityData];
            hasMore = activityData.length === pageSize;
            page++;
          } else {
            hasMore = false;
          }
        }

        console.log(`Loaded ${allActivities.length} activities from database (${page} pages)`);
        if (allActivities.length > 0) {
          const dates = allActivities.map(a => a.start_date).filter(Boolean).sort();
          console.log(`Activity date range: ${dates[0]} to ${dates[dates.length - 1]}`);
        }
        setActivities(allActivities);

        const { data: profileData } = await supabase
          .from('user_speed_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (profileData) setSpeedProfile(profileData);

        // Load today's health metrics
        const today = new Date().toISOString().split('T')[0];
        const { data: healthData, error: healthError } = await supabase
          .from('health_metrics')
          .select('*')
          .eq('user_id', user.id)
          .eq('metric_date', today)
          .maybeSingle();

        if (healthError) {
          console.warn('Health metrics query failed:', healthError.message);
        } else if (healthData) {
          // Map production column names to what the app expects
          setTodayHealthMetrics({
            ...healthData,
            recorded_date: healthData.metric_date,
            resting_heart_rate: healthData.resting_hr,
            hrv_score: healthData.hrv_ms
          });
        }

        // Load health history for trends visualization (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const { data: healthHistoryData, error: healthHistoryError } = await supabase
          .from('health_metrics')
          .select('*')
          .eq('user_id', user.id)
          .gte('metric_date', ninetyDaysAgo.toISOString().split('T')[0])
          .order('metric_date', { ascending: true });

        if (healthHistoryError) {
          console.warn('Health history query failed:', healthHistoryError.message);
        } else if (healthHistoryData) {
          setHealthHistory(healthHistoryData);
          console.log(`Loaded ${healthHistoryData.length} days of health history`);
        }

        // Load active training plan (use maybeSingle to handle 0 or 1 result gracefully)
        const { data: planData, error: planError } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planError) {
          console.error('Error loading active plan:', planError);
        }

        if (planData) {
          setActivePlan(planData);
          console.log('Active training plan loaded:', planData.name);

          // Load planned workouts for the active plan
          const { data: workoutsData } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('plan_id', planData.id)
            .order('scheduled_date', { ascending: true });

          if (workoutsData) {
            setPlannedWorkouts(workoutsData);
            console.log(`Loaded ${workoutsData.length} planned workouts`);
          }
        } else {
          console.log('No active training plan found');
        }
      } catch (error) {
        console.error('Error loading training data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Listen for plan activation events from coach UIs
  useEffect(() => {
    const handlePlanActivated = async () => {
      if (!user?.id) return;
      try {
        const { data: planData } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planData) {
          setActivePlan(planData);
          const { data: workoutsData } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('plan_id', planData.id)
            .order('scheduled_date', { ascending: true });
          if (workoutsData) setPlannedWorkouts(workoutsData);
        }
        setCalendarRefreshKey((prev) => prev + 1);
      } catch (err) {
        console.error('Error refreshing after plan activation:', err);
      }
    };

    window.addEventListener('training-plan-activated', handlePlanActivated);
    return () => window.removeEventListener('training-plan-activated', handlePlanActivated);
  }, [user]);

  // Automatic Garmin sync - recover failed events and backfill GPS on load
  useEffect(() => {
    const runGarminAutoSync = async () => {
      if (!user) return;

      try {
        // Check if user has Garmin connected
        const status = await garminService.getConnectionStatus();
        if (!status.connected || status.tokenExpired) {
          return; // Not connected or token expired
        }

        console.log('🔄 Running automatic Garmin sync...');

        // Run reprocessFailedEvents to recover any failed webhook imports
        // This is what the user had to click "Recover Failed Events" for
        try {
          const recoverResult = await garminService.reprocessFailedEvents();
          if (recoverResult.reprocessed > 0) {
            console.log(`✅ Auto-recovered ${recoverResult.reprocessed} Garmin activities`);
            // Reload activities to show the newly recovered ones
            const { data: activityData } = await supabase
              .from('activities')
              .select('*')
              .eq('user_id', user.id)
              .order('start_date', { ascending: false })
              .limit(2000);
            if (activityData) {
              setActivities(activityData);
            }
          }
        } catch (err) {
          // Silent fail - this is a background optimization
          console.log('ℹ️ Garmin recover check:', err.message);
        }

        // Run GPS backfill for activities missing GPS data
        try {
          const gpsResult = await garminService.backfillGps(20); // Limit to 20 for faster completion
          if (gpsResult.stats?.success > 0) {
            console.log(`✅ Auto-backfilled GPS for ${gpsResult.stats.success} activities`);
            // Reload activities to show updated GPS data
            const { data: activityData } = await supabase
              .from('activities')
              .select('*')
              .eq('user_id', user.id)
              .order('start_date', { ascending: false })
              .limit(2000);
            if (activityData) {
              setActivities(activityData);
            }
          }
        } catch (err) {
          // Silent fail - this is a background optimization
          console.log('ℹ️ Garmin GPS backfill check:', err.message);
        }
      } catch (err) {
        // Silent fail - Garmin might not be set up
        console.log('ℹ️ Garmin auto-sync not available:', err.message);
      }
    };

    // Run after a short delay to not block initial load
    const timer = setTimeout(runGarminAutoSync, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  // Load race goals for AI coach context
  useEffect(() => {
    const loadRaceGoals = async () => {
      if (!user) return;

      try {
        // Load upcoming race goals (next 6 months)
        const { data, error } = await supabase
          .from('race_goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'upcoming')
          .gte('race_date', new Date().toISOString().split('T')[0])
          .order('race_date', { ascending: true })
          .limit(10);

        if (error) {
          // Table might not exist yet - fail silently
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.log('race_goals table not yet available');
            return;
          }
          throw error;
        }

        if (data) {
          setRaceGoals(data);
          console.log(`Loaded ${data.length} upcoming race goals`);
        }
      } catch (error) {
        console.error('Error loading race goals:', error);
      }
    };

    loadRaceGoals();
  }, [user]);

  // Load cross-training activities for AI context
  useEffect(() => {
    const loadCrossTrainingContext = async () => {
      if (!user) return;

      try {
        const recentActivities = await getRecentActivitiesForContext(14);
        setCrossTrainingContext(recentActivities);
        if (recentActivities.length > 0) {
          console.log(`Loaded ${recentActivities.length} cross-training activities for AI context`);
        }
      } catch (error) {
        // Cross-training table might not exist yet
        console.log('Cross-training context not available:', error.message);
      }
    };

    loadCrossTrainingContext();
  }, [user, getRecentActivitiesForContext]);

  // Calculate weekly stats (uses visibleActivities to exclude hidden)
  const weeklyStats = useMemo(() => {
    const days = parseInt(timeRange) || 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const filtered = visibleActivities.filter(a => new Date(a.start_date) >= cutoff);

    return filtered.reduce(
      (acc, a) => {
        // Calculate TSS for this activity
        let activityTSS;
        if (a.average_watts && ftp) {
          activityTSS = calculateTSS(a.moving_time, a.average_watts, ftp);
        } else {
          activityTSS = estimateTSS(
            (a.moving_time || 0) / 60,
            (a.distance || 0) / 1000,
            a.total_elevation_gain || 0,
            'endurance'
          );
        }

        return {
          totalDistance: acc.totalDistance + (a.distance || 0),
          totalTime: acc.totalTime + (a.moving_time || 0),
          totalElevation: acc.totalElevation + (a.total_elevation_gain || 0),
          totalTSS: acc.totalTSS + (activityTSS || 0),
          rideCount: acc.rideCount + 1,
        };
      },
      { totalDistance: 0, totalTime: 0, totalElevation: 0, totalTSS: 0, rideCount: 0 }
    );
  }, [visibleActivities, timeRange, ftp]);

  // Calculate true weekly stats (always 7 days, independent of timeRange)
  const actualWeeklyStats = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyActivities = visibleActivities.filter(a => new Date(a.start_date) >= weekAgo);

    return weeklyActivities.reduce(
      (acc, a) => ({
        totalDistance: acc.totalDistance + (a.distance || 0),
        totalTime: acc.totalTime + (a.moving_time || 0),
        rideCount: acc.rideCount + 1,
      }),
      { totalDistance: 0, totalTime: 0, rideCount: 0 }
    );
  }, [visibleActivities]);

  // Format helpers
  const formatTime = (seconds) => {
    if (!seconds) return '0h';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Get form status styling
  const getFormStatus = () => {
    const tsb = trainingMetrics.tsb;
    if (tsb >= 15) return { label: 'FRESH', color: 'teal', icon: IconTrendingUp, bg: 'rgba(168, 191, 168, 0.15)' };
    if (tsb >= 5) return { label: 'READY', color: 'green', icon: IconTrendingUp, bg: 'rgba(168, 191, 168, 0.15)' };
    if (tsb >= -10) return { label: 'OPTIMAL', color: 'lime', icon: IconActivity, bg: 'rgba(168, 191, 168, 0.15)' };
    if (tsb >= -25) return { label: 'TIRED', color: 'yellow', icon: IconTrendingDown, bg: 'rgba(212, 168, 67, 0.15)' };
    return { label: 'FATIGUED', color: 'red', icon: IconTrendingDown, bg: 'rgba(196, 120, 92, 0.15)' };
  };

  const formStatus = getFormStatus();

  // Unified workout recommendation — single source of truth
  const [focusTimeAvailable, setFocusTimeAvailable] = useState(null);

  const recommendation = useMemo(() => getWorkoutRecommendation({
    trainingMetrics,
    activities: visibleActivities,
    raceGoals,
    plannedWorkouts: activePlan?.workouts || [],
    ftp,
    timeAvailable: focusTimeAvailable ? parseInt(focusTimeAvailable) : null,
  }), [trainingMetrics, visibleActivities, raceGoals, activePlan, ftp, focusTimeAvailable]);

  const suggestedWorkout = recommendation.primary?.workout || null;

  const handleViewWorkout = (workout) => {
    setSelectedWorkout(workout);
    setWorkoutModalOpen(true);
  };

  // Handle viewing ride details
  const handleViewRide = (ride) => {
    setSelectedRide(ride);
    setRideAnalysisModalOpen(true);
  };

  // Handle hiding/showing a ride
  const handleHideRide = async (ride) => {
    if (!user) return;

    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          action: 'toggle_hide',
          activityId: ride.id,
          userId: user.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update activity');
      }

      // Update local state
      setActivities(prev => prev.map(a =>
        a.id === ride.id ? { ...a, is_hidden: result.isHidden } : a
      ));

      notifications.show({
        title: result.isHidden ? 'Ride hidden' : 'Ride restored',
        message: result.isHidden
          ? `"${ride.name}" has been hidden from your history`
          : `"${ride.name}" is now visible in your history`,
        color: result.isHidden ? 'gray' : 'green'
      });
    } catch (error) {
      console.error('Error hiding ride:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update ride visibility',
        color: 'red'
      });
    }
  };

  // Handle adding supplement workout to plan
  const handleAddSupplementWorkout = async (workoutId, scheduledDate) => {
    if (!activePlan || !user) return false;

    try {
      const workout = getWorkoutById(workoutId);
      if (!workout) return false;

      // Calculate week number based on plan start date
      const startDate = new Date(activePlan.started_at);
      const diffTime = scheduledDate.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(diffDays / 7) + 1;
      const dayOfWeek = scheduledDate.getDay();

      // Insert the supplement workout
      const { error: insertError } = await supabase
        .from('planned_workouts')
        .insert({
          plan_id: activePlan.id,
          user_id: user.id,
          week_number: weekNumber,
          day_of_week: dayOfWeek,
          scheduled_date: scheduledDate.toISOString().split('T')[0],
          workout_type: workout.category,
          workout_id: workoutId,
          name: workout.name || `${workout.category} Workout`,
          duration_minutes: workout.duration || 0,
          target_tss: workout.targetTSS || 0,
          target_duration: workout.duration,
          completed: false,
          notes: `Supplement: ${workout.name}`,
        });

      if (insertError) throw insertError;

      // Update workout total in the plan
      await supabase
        .from('training_plans')
        .update({
          workouts_total: (activePlan.workouts_total || 0) + 1,
        })
        .eq('id', activePlan.id);

      // Reload planned workouts
      const { data: workoutsData } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('plan_id', activePlan.id)
        .order('scheduled_date', { ascending: true });

      if (workoutsData) {
        setPlannedWorkouts(workoutsData);
      }

      // Update active plan state
      setActivePlan(prev => ({
        ...prev,
        workouts_total: (prev.workouts_total || 0) + 1,
      }));

      return true;
    } catch (error) {
      console.error('Error adding supplement workout:', error);
      return false;
    }
  };

  // Get suggested supplement days based on existing plan
  const getSuggestedSupplementDays = (workoutId, weeksAhead = 4) => {
    if (!activePlan) return [];

    const workoutInfos = plannedWorkouts.map(w => ({
      date: w.scheduled_date,
      workoutType: w.workout_type,
      workoutId: w.workout_id,
    }));

    const today = new Date();
    return findOptimalSupplementDays(workoutId, workoutInfos, today, weeksAhead);
  };

  if (loading) {
    return (
      <AppShell>
        <Container size="xl" py="xl">
          <TrainingMetricsSkeleton />
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          {/* Header */}
          <PageHeader
            title="Training Hub"
            subtitle="Your personalized training command center"
            actions={
              <>
                <Button
                  variant="filled"
                  color="terracotta"
                  size="xs"
                  leftSection={<IconCalendarEvent size={14} />}
                  onClick={() => navigate('/planner')}
                >
                  Plan
                </Button>
                <Select
                  size="xs"
                  value={timeRange}
                  onChange={setTimeRange}
                  data={[
                    { value: '7', label: 'Last 7 days' },
                    { value: '30', label: 'Last 30 days' },
                    { value: '90', label: 'Last 90 days' },
                  ]}
                  w={{ base: 'auto', sm: 130 }}
                />
                {activePlan && (
                  <Button
                    variant="light"
                    color="pink"
                    size="xs"
                    leftSection={<IconBarbell size={14} />}
                    onClick={() => setSupplementModalOpen(true)}
                  >
                    Add Supplement
                  </Button>
                )}
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <Button
                      variant="light"
                      color="orange"
                      size="xs"
                      leftSection={<IconFileImport size={14} />}
                    >
                      Import
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Import Activities</Menu.Label>
                    <Menu.Item
                      leftSection={<IconBrandStrava size={16} />}
                      onClick={() => setGpxUploadOpen(true)}
                    >
                      Strava Export (GPX)
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconDeviceWatch size={16} />}
                      onClick={() => setFitUploadOpen(true)}
                    >
                      FIT Files (Garmin/Wahoo)
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <Button
                  variant={todayHealthMetrics ? 'light' : 'filled'}
                  color="violet"
                  size="xs"
                  leftSection={<IconHeart size={14} />}
                  onClick={() => setHealthCheckInOpen(true)}
                >
                  {todayHealthMetrics ? 'Check-in ✓' : 'Body Check-in'}
                </Button>
                <Button
                  variant="light"
                  color="terracotta"
                  size="xs"
                  leftSection={<IconSettings size={14} />}
                  onClick={() => navigate('/settings')}
                >
                  Settings
                </Button>
              </>
            }
          />

          {/* Main Tabs - Pill Style for clear visual distinction */}
          <Tabs value={activeTab} onChange={setActiveTab} color="terracotta" variant="pills">
            <Paper
              withBorder
              radius="xl"
              p="xs"
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: depth.panel.background,
                boxShadow: depth.panel.boxShadow,
                border: '1px solid var(--tribos-border-default)',
              }}
            >
              <Tabs.List grow={!isMobile} justify={isMobile ? 'center' : undefined}>
                <Tabs.Tab
                  value="today"
                  leftSection={<IconTarget size={isMobile ? 20 : 18} />}
                >
                  {!isMobile && 'Today'}
                </Tabs.Tab>
                <Tabs.Tab
                  value="trends"
                  leftSection={<IconTrendingUp size={isMobile ? 20 : 18} />}
                >
                  {!isMobile && 'Trends'}
                </Tabs.Tab>
                <Tabs.Tab
                  value="power"
                  leftSection={<IconBolt size={isMobile ? 20 : 18} />}
                >
                  {!isMobile && 'Power'}
                </Tabs.Tab>
                <Tabs.Tab
                  value="routes"
                  leftSection={<IconRoute size={isMobile ? 20 : 18} />}
                >
                  {!isMobile && 'Routes'}
                </Tabs.Tab>
                <Tabs.Tab
                  value="history"
                  leftSection={<IconClock size={isMobile ? 20 : 18} />}
                >
                  {!isMobile && 'History'}
                </Tabs.Tab>
                <Tabs.Tab
                  value="insights"
                  leftSection={<IconCalendarStats size={isMobile ? 20 : 18} />}
                >
                  {!isMobile && 'Insights'}
                </Tabs.Tab>
                <Tabs.Tab
                  value="calendar"
                  leftSection={<IconCalendar size={isMobile ? 20 : 18} />}
                >
                  {!isMobile && 'Calendar'}
                </Tabs.Tab>
              </Tabs.List>
            </Paper>

            {/* Tab Panels */}
            <Box mt="md">
              {/* TODAY TAB - Streamlined Layout */}
              <Tabs.Panel value="today">
                <Stack gap="md">
                  {/* Fitness Metrics Bar - Now inside Today tab */}
                  <FitnessMetricsBar
                    trainingMetrics={trainingMetrics}
                    formStatus={formStatus}
                    weeklyStats={weeklyStats}
                    previousMetrics={null}
                  />

                  {/* Row 1: Today's Focus + AI Coach */}
                  <Grid gutter="md">
                    <Grid.Col span={{ base: 12, md: 7 }}>
                      <TodaysFocusCard
                        trainingMetrics={trainingMetrics}
                        formStatus={formStatus}
                        weeklyStats={weeklyStats}
                        actualWeeklyStats={actualWeeklyStats}
                        activities={visibleActivities}
                        formatDist={formatDist}
                        formatTime={formatTime}
                        raceGoals={raceGoals}
                        suggestedWorkout={suggestedWorkout}
                        recommendationReason={recommendation.primary?.reason}
                        focusTimeAvailable={focusTimeAvailable}
                        onFocusTimeChange={setFocusTimeAvailable}
                        onViewWorkout={handleViewWorkout}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 5 }}>
                      <CoachCard
                        trainingContext={buildTrainingContext(trainingMetrics, weeklyStats, actualWeeklyStats, ftp, visibleActivities, formatDist, formatTime, isImperial, activePlan, raceGoals, crossTrainingContext, recommendation, plannedWorkouts)}
                        workoutRecommendation={recommendation}
                        onAddWorkout={async (workout) => {
                          notifications.show({
                            title: 'Workout Added',
                            message: `${workout.name || workout.workout_id} scheduled`,
                            color: 'lime'
                          });
                          setCalendarRefreshKey(prev => prev + 1);
                        }}
                      />
                    </Grid.Col>
                  </Grid>

                  {/* Row 2: TrainNow - Collapsible */}
                  <Paper withBorder radius="md" p="sm">
                    <Group
                      justify="space-between"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setTrainNowExpanded(!trainNowExpanded)}
                    >
                      <Group gap="xs">
                        <ThemeIcon size="sm" color="terracotta" variant="light">
                          <IconTarget size={14} />
                        </ThemeIcon>
                        <Text fw={600} size="sm">TrainNow Recommendations</Text>
                        <Badge size="xs" color="gray" variant="light">
                          TSB: {Math.round(trainingMetrics.tsb)}
                        </Badge>
                      </Group>
                      <ActionIcon variant="subtle" color="gray">
                        <IconChevronDown
                          size={18}
                          style={{
                            transform: trainNowExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 200ms ease',
                          }}
                        />
                      </ActionIcon>
                    </Group>
                    <Collapse in={trainNowExpanded}>
                      <Box mt="md">
                        <TrainNow
                          activities={visibleActivities}
                          trainingMetrics={trainingMetrics}
                          plannedWorkouts={activePlan?.workouts || []}
                          ftp={ftp}
                          raceGoals={raceGoals}
                          onSelectWorkout={(workout) => {
                            console.log('Selected workout:', workout);
                          }}
                        />
                      </Box>
                    </Collapse>
                  </Paper>

                </Stack>
              </Tabs.Panel>

              {/* TRENDS TAB */}
              <Tabs.Panel value="trends">
                <TrendsTab
                  dailyTSSData={dailyTSSData}
                  trainingMetrics={trainingMetrics}
                  activities={visibleActivities}
                  speedProfile={speedProfile}
                  formatDist={formatDist}
                  formatElev={formatElev}
                  isImperial={isImperial}
                  ftp={ftp}
                  weight={userWeight}
                  healthHistory={healthHistory}
                  onOpenCheckIn={() => setHealthCheckInOpen(true)}
                />
              </Tabs.Panel>

              {/* POWER TAB */}
              <Tabs.Panel value="power">
                <PowerTab
                  ftp={ftp}
                  powerZones={powerZones}
                  navigate={navigate}
                  activities={visibleActivities}
                  weight={userWeight}
                />
              </Tabs.Panel>

              {/* ROUTES TAB - Activity Route Analysis */}
              <Tabs.Panel value="routes">
                <RouteAnalysisPanel
                  plannedWorkouts={plannedWorkouts}
                  formatDist={formatDist}
                  formatElev={formatElev}
                />
              </Tabs.Panel>

              {/* HISTORY TAB */}
              <Tabs.Panel value="history">
                <RideHistoryTable
                  rides={activities}
                  formatDistance={formatDist}
                  formatElevation={formatElev}
                  maxRows={Infinity}
                  onViewRide={handleViewRide}
                  onHideRide={handleHideRide}
                />
              </Tabs.Panel>

              {/* HISTORICAL INSIGHTS TAB */}
              <Tabs.Panel value="insights">
                <HistoricalInsights userId={user?.id} activities={visibleActivities} />
              </Tabs.Panel>

              {/* CALENDAR TAB */}
              <Tabs.Panel value="calendar" keepMounted>
                <TrainingCalendar
                  activePlan={activePlan}
                  rides={visibleActivities}
                  formatDistance={formatDist}
                  ftp={ftp}
                  isImperial={isImperial}
                  refreshKey={calendarRefreshKey}
                  onPlanUpdated={async () => {
                    // Reload the active plan to get updated compliance stats
                    if (user?.id) {
                      const { data: planData } = await supabase
                        .from('training_plans')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('status', 'active')
                        .order('started_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (planData) {
                        setActivePlan(planData);
                        // Also reload planned workouts to keep dashboard state in sync
                        const { data: workoutsData } = await supabase
                          .from('planned_workouts')
                          .select('*')
                          .eq('plan_id', planData.id)
                          .order('scheduled_date', { ascending: true });
                        if (workoutsData) {
                          setPlannedWorkouts(workoutsData);
                        }
                      }
                    }
                  }}
                />
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Stack>
      </Container>

      {/* Health Check-in Modal */}
      <HealthCheckInModal
        opened={healthCheckInOpen}
        onClose={() => setHealthCheckInOpen(false)}
        onSave={(data) => {
          setTodayHealthMetrics(data);
          // Also update health history for immediate chart refresh
          setHealthHistory(prev => {
            const dateStr = data.metric_date || data.recorded_date;
            const filtered = prev.filter(h => (h.metric_date || h.recorded_date) !== dateStr);
            return [...filtered, data].sort((a, b) =>
              new Date(a.metric_date || a.recorded_date) - new Date(b.metric_date || b.recorded_date)
            );
          });
        }}
        existingData={todayHealthMetrics}
      />

      {/* FIT File Upload Modal */}
      <FitUploadModal
        opened={fitUploadOpen}
        onClose={() => setFitUploadOpen(false)}
        onUploadComplete={(results) => {
          // Refresh activities after upload
          if (results.success.length > 0) {
            window.location.reload();
          }
        }}
        formatDistance={formatDist}
        formatElevation={formatElev}
      />

      {/* Bulk GPX Upload Modal (Strava Export) */}
      <BulkGpxUploadModal
        opened={gpxUploadOpen}
        onClose={() => setGpxUploadOpen(false)}
        onUploadComplete={(results) => {
          // Refresh activities after upload
          if (results.success.length > 0) {
            window.location.reload();
          }
        }}
      />

      {/* Workout Detail Modal */}
      <WorkoutDetailModal
        opened={workoutModalOpen}
        onClose={() => setWorkoutModalOpen(false)}
        workout={selectedWorkout}
        ftp={ftp}
      />

      {/* Supplement Workout Modal */}
      <SupplementWorkoutModal
        opened={supplementModalOpen}
        onClose={() => setSupplementModalOpen(false)}
        onAddWorkout={handleAddSupplementWorkout}
        getSuggestedDays={getSuggestedSupplementDays}
        activePlan={activePlan}
      />

      {/* Ride Analysis Modal */}
      <RideAnalysisModal
        opened={rideAnalysisModalOpen}
        onClose={() => {
          setRideAnalysisModalOpen(false);
          setSelectedRide(null);
        }}
        ride={selectedRide}
        ftp={ftp}
        weight={userWeight}
        formatDistance={formatDist}
        formatElevation={formatElev}
        formatSpeed={formatSpd}
      />
    </AppShell>
  );
}

// ============================================================================
// TODAY'S FOCUS HERO CARD - Story-Driven Narrative
// ============================================================================
function TodaysFocusCard({ trainingMetrics, formStatus, weeklyStats, actualWeeklyStats, activities, formatDist, formatTime, raceGoals, suggestedWorkout, recommendationReason, focusTimeAvailable, onFocusTimeChange, onViewWorkout }) {
  const lastRide = activities[0];
  const FormIcon = formStatus.icon;

  // Find next upcoming race
  const nextRace = raceGoals?.[0];
  const daysUntilRace = nextRace ? Math.ceil((new Date(nextRace.race_date + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24)) : null;

  // Generate story-driven narrative based on context
  const getStory = () => {
    const tsb = trainingMetrics.tsb;
    const rideCount = actualWeeklyStats.rideCount;

    // Build context phrases
    const weekContext = rideCount > 0
      ? `after ${rideCount} ride${rideCount > 1 ? 's' : ''} this week`
      : 'with fresh legs this week';

    const raceContext = daysUntilRace && nextRace
      ? `With ${nextRace.name} in ${daysUntilRace} day${daysUntilRace === 1 ? '' : 's'}, `
      : '';

    // RACE PROXIMITY TAKES PRIORITY OVER TSB
    // Race week (0-2 days): Rest and mental prep
    if (daysUntilRace !== null && daysUntilRace <= 2) {
      return `${raceContext}race day is almost here! Focus on rest and mental preparation. A short easy spin or complete rest is best today.`;
    }
    // Race week (3-7 days): Easy spins and openers
    if (daysUntilRace !== null && daysUntilRace <= 7) {
      return `${raceContext}it's race week! Keep your legs fresh with easy spins or rest. Short openers can help you stay sharp without adding fatigue.`;
    }
    // Taper period (8-14 days): Reduced volume
    if (daysUntilRace !== null && daysUntilRace <= 14) {
      return `${raceContext}you're in the taper zone ${weekContext}. Reduce volume but keep some intensity. Focus on feeling fresh and sharp for race day.`;
    }

    // Normal TSB-based recommendations when not in taper/race week
    if (tsb >= 15) {
      return `${raceContext}You're feeling fresh ${weekContext}. Today is perfect for a hard effort or long ride to build fitness.`;
    }
    if (tsb >= 5) {
      return `${raceContext}Good energy ${weekContext}. A quality session like sweet spot or tempo would be ideal today.`;
    }
    if (tsb >= -10) {
      return `${raceContext}You're in the optimal training zone ${weekContext}. Keep the momentum with a structured workout.`;
    }
    if (tsb >= -25) {
      return `${raceContext}You're carrying some fatigue ${weekContext}. Consider an easy spin or rest day to absorb your training.`;
    }
    return `${raceContext}High fatigue detected ${weekContext}. Prioritize recovery today to avoid overtraining.`;
  };

  return (
    <Paper
      p="lg"
      radius="xl"
      className="tribos-depth-card no-hover"
      style={{
        background: `linear-gradient(135deg, ${formStatus.bg}, transparent), ${depth.card.background}`,
        border: depth.card.border,
        borderTop: depth.card.borderTop,
        boxShadow: depth.card.boxShadow,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Box style={{ flex: 1 }}>
          <Group gap="sm" mb="xs">
            <Badge size="lg" color={formStatus.color} variant="filled" leftSection={<FormIcon size={14} />}>
              {formStatus.label}
            </Badge>
            <Text size="sm" c="dimmed">TSB: {trainingMetrics.tsb > 0 ? '+' : ''}{Math.round(trainingMetrics.tsb)}</Text>
          </Group>

          <Text size="lg" fw={600} mb="xs" style={{ color: 'var(--tribos-text-primary)' }}>
            {getStory()}
          </Text>

          {suggestedWorkout && (
            <Box mt="md">
              {recommendationReason && (
                <Text size="xs" c="dimmed" mb="xs" fs="italic">{recommendationReason}</Text>
              )}
              <Group gap="sm" wrap="wrap">
                <Button
                  variant="light"
                  color="terracotta"
                  rightSection={<IconChevronRight size={16} />}
                  onClick={() => onViewWorkout(suggestedWorkout)}
                >
                  {suggestedWorkout.name || 'View Suggested Workout'}
                </Button>
                {suggestedWorkout.duration && (
                  <Badge size="lg" variant="light" color="gray">{suggestedWorkout.duration}m</Badge>
                )}
              </Group>
            </Box>
          )}

          {/* Time Available Selector */}
          <Group gap="xs" mt="md">
            <Text size="xs" c="dimmed">Time available:</Text>
            <SegmentedControl
              size="xs"
              value={focusTimeAvailable || ''}
              onChange={(val) => onFocusTimeChange?.(val || null)}
              data={[
                { label: 'Any', value: '' },
                { label: '30m', value: '30' },
                { label: '60m', value: '60' },
                { label: '90m', value: '90' },
                { label: '2h+', value: '120' },
              ]}
            />
          </Group>
        </Box>

        {/* Weekly Progress Ring - Neutral to avoid competing with status badge */}
        <Box style={{ textAlign: 'center' }}>
          <RingProgress
            size={100}
            thickness={8}
            roundCaps
            sections={[
              { value: Math.min((actualWeeklyStats.rideCount / 7) * 100, 100), color: 'gray.6' },
            ]}
            label={
              <Text size="lg" fw={700} ta="center">
                {actualWeeklyStats.rideCount}
              </Text>
            }
          />
          <Text size="xs" c="dimmed" mt={4}>rides this week</Text>
        </Box>
      </Group>

      {/* Last Ride Preview */}
      {lastRide && (
        <>
          <Divider my="md" />
          <Group justify="space-between">
            <Group gap="sm">
              <ThemeIcon size="lg" variant="light" color="gray">
                <IconRoute size={18} />
              </ThemeIcon>
              <Box>
                <Text size="sm" fw={500}>{lastRide.name}</Text>
                <Text size="xs" c="dimmed">
                  {new Date(lastRide.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </Box>
            </Group>
            <Group gap="lg">
              <Box ta="right">
                <Text size="sm" fw={600}>{formatDist(lastRide.distance / 1000)}</Text>
                <Text size="xs" c="dimmed">{formatTime(lastRide.moving_time)}</Text>
              </Box>
              {lastRide.average_watts && (
                <Box ta="right">
                  <Text size="sm" fw={600}>{Math.round(lastRide.average_watts)}W</Text>
                  <Text size="xs" c="dimmed">avg power</Text>
                </Box>
              )}
            </Group>
          </Group>
        </>
      )}

      {/* Race Goals - Compact Countdown */}
      {raceGoals && raceGoals.length > 0 && (
        <>
          <Divider my="md" />
          <Group gap="md">
            <ThemeIcon size="lg" variant="light" color="orange">
              <IconTrophy size={18} />
            </ThemeIcon>
            <Group gap="lg" style={{ flex: 1 }}>
              {raceGoals.slice(0, 3).map((race) => {
                const daysUntil = Math.ceil((new Date(race.race_date + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <Group key={race.id} gap="xs">
                    <Badge size="sm" color={daysUntil <= 14 ? 'red' : daysUntil <= 30 ? 'yellow' : 'gray'} variant="light">
                      {race.priority || 'A'}
                    </Badge>
                    <Box>
                      <Text size="sm" fw={500} lineClamp={1}>{race.name}</Text>
                      <Text size="xs" c="dimmed">in {daysUntil} days</Text>
                    </Box>
                  </Group>
                );
              })}
            </Group>
          </Group>
        </>
      )}
    </Paper>
  );
}

// ============================================================================
// TODAY TAB
// ============================================================================
function TodayTab({ trainingMetrics, weeklyStats, actualWeeklyStats, activities, ftp, formatDist, formatTime, isImperial, todayHealthMetrics, onOpenHealthCheckIn, activePlan, raceGoals }) {
  const hasCheckedIn = !!todayHealthMetrics;

  return (
    <Stack gap="lg">
      {/* Race Goals Panel */}
      <RaceGoalsPanel isImperial={isImperial} />

      {/* TrainNow - Smart Workout Recommendations */}
      <TrainNow
        activities={activities}
        trainingMetrics={trainingMetrics}
        plannedWorkouts={[]}
        ftp={ftp}
        onSelectWorkout={(workout) => {
          // Could open workout detail modal or navigate to workout
          console.log('Selected workout:', workout);
        }}
      />

      {/* Body Check-in Card */}
      <Card withBorder p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box style={{ flex: 1, minWidth: 200 }}>
            <Group gap="sm" mb="sm">
              <ThemeIcon size="lg" color="violet" variant="light">
                <IconHeart size={18} />
              </ThemeIcon>
              <Text fw={600}>Body Check-in</Text>
              {hasCheckedIn && (
                <Badge color="sage" variant="light" size="xs">Done</Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {hasCheckedIn ? 'Today\'s metrics recorded' : 'Log your daily metrics for better AI coaching recommendations'}
            </Text>
          </Box>
          <Group gap="md" wrap="wrap">
            <SimpleGrid cols={3} spacing="xs">
              <Paper p="xs" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)', minWidth: 60 }}>
                <Text size="xs" c="dimmed">HRV</Text>
                <Text fw={600}>{todayHealthMetrics?.hrv_score ? `${todayHealthMetrics.hrv_score}ms` : '--'}</Text>
              </Paper>
              <Paper p="xs" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)', minWidth: 60 }}>
                <Text size="xs" c="dimmed">Sleep</Text>
                <Text fw={600}>{todayHealthMetrics?.sleep_hours ? `${todayHealthMetrics.sleep_hours}h` : '--'}</Text>
              </Paper>
              <Paper p="xs" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)', minWidth: 60 }}>
                <Text size="xs" c="dimmed">Readiness</Text>
                <Text fw={600} c={todayHealthMetrics?.readiness_score >= 60 ? 'green' : todayHealthMetrics?.readiness_score >= 40 ? 'yellow' : 'red'}>
                  {todayHealthMetrics?.readiness_score ? `${todayHealthMetrics.readiness_score}%` : '--'}
                </Text>
              </Paper>
            </SimpleGrid>
            <Button variant="light" color="violet" onClick={onOpenHealthCheckIn}>
              {hasCheckedIn ? 'Update' : 'Log Metrics'}
            </Button>
          </Group>
        </Group>
      </Card>
    </Stack>
  );
}

// ============================================================================
// TRENDS TAB
// ============================================================================
function TrendsTab({ dailyTSSData, trainingMetrics, activities, speedProfile, formatDist, formatElev, isImperial, ftp, weight, healthHistory, onOpenCheckIn }) {
  // Check if any activities are from Strava for attribution
  const hasStravaActivities = activities?.some(a => a.provider === 'strava');

  return (
    <Stack gap="lg">
      {/* Ramp Rate Alert */}
      {dailyTSSData.length > 14 && (
        <RampRateAlert
          dailyTSSData={dailyTSSData}
          currentCTL={trainingMetrics.ctl}
          showDetails={true}
        />
      )}

      {/* Fitness Journey Chart */}
      <Card withBorder p="md">
        <Group justify="space-between" mb="md">
          <Text fw={600}>Fitness Journey</Text>
          <Group gap="md">
            <Group gap={4}>
              <Box w={12} h={3} bg="blue" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">Fitness (CTL)</Text>
            </Group>
            <Group gap={4}>
              <Box w={12} h={3} bg="orange" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">Fatigue (ATL)</Text>
            </Group>
            <Group gap={4}>
              <Box w={12} h={3} bg="teal" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">Form (TSB)</Text>
            </Group>
          </Group>
        </Group>
        {dailyTSSData.length > 0 ? (
          <TrainingLoadChart data={dailyTSSData} />
        ) : (
          <EmptyState type="noTrainingData" size="sm" />
        )}
        {hasStravaActivities && (
          <Box mt="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
            <PoweredByStrava variant="light" size="sm" />
          </Box>
        )}
      </Card>

      {/* Zone Distribution */}
      <ZoneDistributionChart
        activities={activities}
        ftp={ftp}
        timeRange="7"
      />

      {/* Aerobic Decoupling */}
      <AerobicDecoupling
        activities={activities}
        timeRange={90}
      />

      {/* Health Trends */}
      <HealthTrendsChart
        data={healthHistory}
        onOpenCheckIn={onOpenCheckIn}
      />

      {/* Progress Cards */}
      <Card withBorder p="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Paper p="md" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
            <IconTrendingUp size={24} color="#A8BFA8" style={{ marginBottom: 8 }} />
            <Text size="xl" fw={700} c="teal">+{Math.round(trainingMetrics.ctl * 0.12)}%</Text>
            <Text size="sm" c="dimmed">Fitness vs 90 days ago</Text>
          </Paper>
          <Paper p="md" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
            <IconRoute size={24} color="#7BA9A0" style={{ marginBottom: 8 }} />
            <Text size="xl" fw={700} c="blue">{activities.length}</Text>
            <Text size="sm" c="dimmed">Rides in 90 days</Text>
          </Paper>
          <Paper p="md" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
            <IconAward size={24} color="#D4A843" style={{ marginBottom: 8 }} />
            <Text size="xl" fw={700} c="yellow">
              {speedProfile ? `${(speedProfile.average_speed * (isImperial ? 0.621371 : 1)).toFixed(1)}` : '--'}
            </Text>
            <Text size="sm" c="dimmed">Avg Speed ({isImperial ? 'mph' : 'km/h'})</Text>
          </Paper>
        </SimpleGrid>
        {hasStravaActivities && (
          <Box mt="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
            <PoweredByStrava variant="light" size="sm" />
          </Box>
        )}
      </Card>

      {/* Personal Records */}
      <PersonalRecordsCard
        rides={activities}
        formatDistance={formatDist}
        formatElevation={formatElev}
      />

      {/* Riding Patterns */}
      {activities.length > 5 && (
        <Card withBorder p="md">
          <Group gap="xs" mb="md">
            <ThemeIcon size="md" color="grape" variant="light">
              <IconChartBar size={16} />
            </ThemeIcon>
            <Text fw={600}>Riding Patterns</Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <Box>
              <Text size="xs" c="dimmed">Most Active Days</Text>
              <Text size="sm" fw={500}>Tue, Thu, Sat</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Preferred Duration</Text>
              <Text size="sm" fw={500}>
                {speedProfile ? `${Math.round(speedProfile.avg_ride_duration)} min` : '60-90 min'}
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Avg Climbing</Text>
              <Text size="sm" fw={500}>
                {speedProfile ? formatElev(speedProfile.avg_elevation_per_km * 20) : '-- '}/ride
              </Text>
            </Box>
          </SimpleGrid>
          {hasStravaActivities && (
            <Box mt="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
              <PoweredByStrava variant="light" size="sm" />
            </Box>
          )}
        </Card>
      )}
    </Stack>
  );
}

// ============================================================================
// POWER TAB
// ============================================================================
function PowerTab({ ftp, powerZones, navigate, activities, weight }) {
  const zones = [
    { zone: 1, name: 'Recovery', range: '< 55%', color: '#51cf66' },
    { zone: 2, name: 'Endurance', range: '55-75%', color: '#4dabf7' },
    { zone: 3, name: 'Tempo', range: '75-90%', color: '#ffd43b' },
    { zone: 4, name: 'Threshold', range: '90-105%', color: '#ff922b' },
    { zone: 5, name: 'VO2max', range: '105-120%', color: '#ff6b6b' },
    { zone: 6, name: 'Anaerobic', range: '120-150%', color: '#cc5de8' },
    { zone: 7, name: 'Neuromuscular', range: '> 150%', color: '#862e9c' },
  ];

  // Check if we have any power data
  const hasPowerData = activities?.some(a => a.average_watts > 0);

  if (!ftp) {
    return (
      <EmptyState
        icon={IconBolt}
        iconColor="yellow"
        title="Set Your FTP"
        description="Enter your Functional Threshold Power to see personalized power zones and training recommendations."
        primaryAction={{
          label: 'Set FTP in Settings',
          onClick: () => navigate('/settings'),
        }}
      />
    );
  }

  return (
    <Stack gap="lg">
      {/* Power Duration Curve */}
      {hasPowerData && (
        <PowerDurationCurve
          activities={activities}
          ftp={ftp}
          weight={weight}
        />
      )}

      {/* FTP Display */}
      <Paper
        p="lg"
        style={{
          background: 'linear-gradient(135deg, rgba(212, 168, 67, 0.15), transparent)',
          border: '1px solid rgba(212, 168, 67, 0.3)',
        }}
      >
        <Group justify="space-between" align="center">
          <Box>
            <Text size="sm" c="dimmed">Current FTP</Text>
            <Group gap="sm" align="baseline">
              <Text size="3rem" fw={700} style={{ color: '#D4A843' }}>
                {ftp}W
              </Text>
              {weight && (
                <Text size="lg" c="dimmed">
                  ({(ftp / weight).toFixed(2)} W/kg)
                </Text>
              )}
            </Group>
            <Text size="xs" c="dimmed" mt="xs">
              Last updated: Manual entry
            </Text>
          </Box>
          <Button variant="light" color="yellow" onClick={() => navigate('/settings')}>
            Update FTP
          </Button>
        </Group>
      </Paper>

      {/* Power Zones */}
      <Card withBorder p="md">
        <Text fw={600} mb="md">Power Zones</Text>
        <Stack gap="sm">
          {zones.map((z) => {
            const zoneData = powerZones?.[`z${z.zone}`];
            const watts = zoneData
              ? z.zone === 7
                ? `${zoneData.min}+`
                : z.zone === 1
                  ? `0-${zoneData.max}`
                  : `${zoneData.min}-${zoneData.max}`
              : null;

            return (
              <Group key={z.zone} gap="md">
                <Box w={30} ta="center">
                  <Text fw={700} style={{ color: z.color }}>Z{z.zone}</Text>
                </Box>
                <Box style={{ flex: 1 }}>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm">{z.name}</Text>
                    <Text size="sm" c="dimmed">{z.range}</Text>
                  </Group>
                  <Progress
                    value={watts ? (z.zone / 7) * 100 : 0}
                    color={z.color}
                    size="sm"
                    radius="xl"
                  />
                </Box>
                <Box w={90} ta="right">
                  <Text size="sm" fw={watts ? 600 : 400} c={watts ? undefined : 'dimmed'}>
                    {watts ? `${watts}W` : '-- W'}
                  </Text>
                </Box>
              </Group>
            );
          })}
        </Stack>
      </Card>

      {/* Critical Power Model */}
      <CriticalPowerModel
        activities={activities}
        ftp={ftp}
        weight={weight}
      />

      {/* Athlete Benchmarking */}
      <AthleteBenchmarking
        activities={activities}
        ftp={ftp}
        weight={weight}
      />
    </Stack>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================
function QuickStatCard({ label, value, icon: Icon, color, subtitle }) {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Text size="xs" c="dimmed" mb={4}>{label}</Text>
          <Text size="xl" fw={700} style={{ color: `var(--mantine-color-${color}-5)` }}>
            {value}
          </Text>
          <Text size="xs" c="dimmed">{subtitle}</Text>
        </Box>
        <ThemeIcon size="lg" variant="light" color={color}>
          <Icon size={18} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

// ============================================================================
// BODY CHECK-IN CARD
// ============================================================================
function BodyCheckInCard({ todayHealthMetrics, onOpenHealthCheckIn }) {
  const hasCheckedIn = !!todayHealthMetrics;

  return (
    <Card withBorder p="md" h="100%">
      <Stack gap="sm" h="100%" justify="space-between">
        <Box>
          <Group gap="sm" mb="sm">
            <ThemeIcon size="lg" color="violet" variant="light">
              <IconHeart size={18} />
            </ThemeIcon>
            <Text fw={600}>Body Check-in</Text>
            {hasCheckedIn && (
              <Badge color="sage" variant="light" size="xs">Done</Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {hasCheckedIn ? 'Today\'s metrics recorded' : 'Log daily metrics for better coaching'}
          </Text>
        </Box>
        <Box>
          <SimpleGrid cols={3} spacing="xs" mb="sm">
            <Paper p="xs" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
              <Text size="xs" c="dimmed">HRV</Text>
              <Text fw={600} size="sm">{todayHealthMetrics?.hrv_score ? `${todayHealthMetrics.hrv_score}ms` : '--'}</Text>
            </Paper>
            <Paper p="xs" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
              <Text size="xs" c="dimmed">Sleep</Text>
              <Text fw={600} size="sm">{todayHealthMetrics?.sleep_hours ? `${todayHealthMetrics.sleep_hours}h` : '--'}</Text>
            </Paper>
            <Paper p="xs" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
              <Text size="xs" c="dimmed">Ready</Text>
              <Text fw={600} size="sm" c={todayHealthMetrics?.readiness_score >= 60 ? 'green' : todayHealthMetrics?.readiness_score >= 40 ? 'yellow' : 'red'}>
                {todayHealthMetrics?.readiness_score ? `${todayHealthMetrics.readiness_score}%` : '--'}
              </Text>
            </Paper>
          </SimpleGrid>
          <Button variant="light" color="violet" fullWidth onClick={onOpenHealthCheckIn}>
            {hasCheckedIn ? 'Update' : 'Log Metrics'}
          </Button>
        </Box>
      </Stack>
    </Card>
  );
}

// ============================================================================
// COMPACT FITNESS METRICS BAR
// Visual Hierarchy: Only Form badge uses color (Tier 1), all else is muted (Tier 3)
// ============================================================================
function FitnessMetricsBar({ trainingMetrics, formStatus, weeklyStats, previousMetrics }) {
  // Calculate trends (compare to 7 days ago if available)
  const ctlTrend = previousMetrics ? trainingMetrics.ctl - previousMetrics.ctl : 0;
  const atlTrend = previousMetrics ? trainingMetrics.atl - previousMetrics.atl : 0;
  const tsb = trainingMetrics.tsb;

  const getTrendIcon = (trend) => {
    if (trend > 2) return IconTrendingUp;
    if (trend < -2) return IconTrendingDown;
    return null;
  };

  const CtlTrendIcon = getTrendIcon(ctlTrend);
  const AtlTrendIcon = getTrendIcon(atlTrend);

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="wrap" gap="xs">
        {/* Form Badge - Only Tier 1 colored element */}
        <Tooltip label={
          formStatus.label === 'FRESH' ? 'Ready for hard training' :
          formStatus.label === 'READY' ? 'Quality session day' :
          formStatus.label === 'OPTIMAL' ? 'Sweet spot training' :
          formStatus.label === 'TIRED' ? 'Consider recovery' : 'Recovery needed'
        } position="bottom">
          <Badge size="sm" color={formStatus.color} variant="filled">
            {formStatus.label}
          </Badge>
        </Tooltip>

        <Divider orientation="vertical" size="sm" style={{ height: 16, opacity: 0.3 }} />

        {/* TSB - Tier 2 supporting context */}
        <Tooltip label={`Training Stress Balance: ${formStatus.label}`} position="bottom">
          <Text size="sm" c="dimmed" style={{ cursor: 'default' }}>
            TSB: <Text span fw={600} c="dimmed">{tsb > 0 ? '+' : ''}{Math.round(tsb)}</Text>
          </Text>
        </Tooltip>

        <Divider orientation="vertical" size="sm" style={{ height: 16, opacity: 0.3 }} />

        {/* Weekly Summary - Tier 3 background info */}
        <Tooltip label={`${weeklyStats.rideCount} rides this week`} position="bottom">
          <Text size="xs" c="dimmed" style={{ cursor: 'default' }}>
            Week: {Math.round(weeklyStats.totalTSS)} TSS ({weeklyStats.rideCount})
          </Text>
        </Tooltip>

        <Divider orientation="vertical" size="sm" style={{ height: 16, opacity: 0.3 }} />

        {/* CTL/ATL - Tier 3 reference data */}
        <Group gap="md">
          <Tooltip label="Fitness (42-day load)" position="bottom">
            <Group gap={4} style={{ cursor: 'default' }}>
              <Text size="xs" c="dimmed">CTL: {Math.round(trainingMetrics.ctl)}</Text>
              {CtlTrendIcon && (
                <CtlTrendIcon
                  size={12}
                  style={{ color: ctlTrend > 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)' }}
                />
              )}
            </Group>
          </Tooltip>
          <Tooltip label="Fatigue (7-day load)" position="bottom">
            <Group gap={4} style={{ cursor: 'default' }}>
              <Text size="xs" c="dimmed">ATL: {Math.round(trainingMetrics.atl)}</Text>
              {AtlTrendIcon && (
                <AtlTrendIcon
                  size={12}
                  style={{ color: atlTrend > 0 ? 'var(--mantine-color-orange-6)' : 'var(--mantine-color-green-6)' }}
                />
              )}
            </Group>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  );
}

// ============================================================================
// WORKOUT DETAIL MODAL
// ============================================================================
function WorkoutDetailModal({ opened, onClose, workout, ftp }) {
  if (!workout) return null;

  // Format workout structure for display
  const formatWorkoutStructure = () => {
    const parts = [];

    if (workout.structure?.warmup) {
      parts.push({
        name: 'Warm-up',
        duration: workout.structure.warmup.duration,
        power: workout.structure.warmup.powerPctFTP,
        zone: workout.structure.warmup.zone
      });
    }

    if (workout.structure?.main) {
      workout.structure.main.forEach((item, idx) => {
        if (item.type === 'repeat') {
          parts.push({
            name: `Main Set: ${item.sets}x`,
            duration: item.work.duration,
            power: item.work.powerPctFTP,
            zone: item.work.zone,
            description: item.work.description,
            rest: item.rest?.duration
          });
        } else {
          parts.push({
            name: item.description || `Interval ${idx + 1}`,
            duration: item.duration,
            power: item.powerPctFTP,
            zone: item.zone
          });
        }
      });
    }

    if (workout.structure?.cooldown) {
      parts.push({
        name: 'Cool-down',
        duration: workout.structure.cooldown.duration,
        power: workout.structure.cooldown.powerPctFTP,
        zone: workout.structure.cooldown.zone
      });
    }

    return parts;
  };

  const structureParts = formatWorkoutStructure();

  const getCategoryColor = (category) => {
    const colors = {
      recovery: 'green',
      endurance: 'blue',
      tempo: 'yellow',
      sweet_spot: 'orange',
      threshold: 'red',
      vo2max: 'pink',
      climbing: 'grape',
      anaerobic: 'violet',
      racing: 'cyan'
    };
    return colors[category] || 'gray';
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <ThemeIcon size="lg" color={getCategoryColor(workout.category)} variant="light">
            <IconTarget size={18} />
          </ThemeIcon>
          <Text fw={600} size="lg">{workout.name}</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        {/* Workout Overview */}
        <Group gap="xs">
          <Badge color={getCategoryColor(workout.category)} variant="light">
            {workout.category?.replace('_', ' ')}
          </Badge>
          <Badge color="gray" variant="light">{workout.difficulty}</Badge>
          <Badge color="blue" variant="light">{workout.duration} min</Badge>
          <Badge color="orange" variant="light">~{workout.targetTSS} TSS</Badge>
        </Group>

        {/* Description */}
        <Box>
          <Text fw={500} size="sm" mb="xs">Description</Text>
          <Text size="sm" c="dimmed">{workout.description}</Text>
        </Box>

        {/* Coach Notes */}
        {workout.coachNotes && (
          <Paper p="sm" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
            <Text fw={500} size="sm" mb="xs" c="lime">Coach Notes</Text>
            <Text size="sm" c="dimmed">{workout.coachNotes}</Text>
          </Paper>
        )}

        {/* Workout Structure */}
        <Box>
          <Text fw={500} size="sm" mb="sm">Workout Structure</Text>
          <Stack gap="xs">
            {structureParts.map((part, idx) => (
              <Paper key={idx} p="sm" withBorder>
                <Group justify="space-between">
                  <Box>
                    <Text fw={500} size="sm">{part.name}</Text>
                    {part.description && (
                      <Text size="xs" c="dimmed">{part.description}</Text>
                    )}
                  </Box>
                  <Group gap="md">
                    <Box ta="right">
                      <Text size="sm" fw={500}>{part.duration} min</Text>
                      <Text size="xs" c="dimmed">Zone {part.zone}</Text>
                    </Box>
                    {ftp && (
                      <Box ta="right">
                        <Text size="sm" fw={500}>{Math.round(ftp * (part.power / 100))}W</Text>
                        <Text size="xs" c="dimmed">{part.power}% FTP</Text>
                      </Box>
                    )}
                    {part.rest && (
                      <Box ta="right">
                        <Text size="xs" c="dimmed">{part.rest}min rest</Text>
                      </Box>
                    )}
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Box>

        {/* Tags */}
        {workout.tags && workout.tags.length > 0 && (
          <Box>
            <Text fw={500} size="sm" mb="xs">Tags</Text>
            <Group gap="xs">
              {workout.tags.map((tag, idx) => (
                <Badge key={idx} size="sm" variant="outline" color="gray">
                  {tag}
                </Badge>
              ))}
            </Group>
          </Box>
        )}

        {/* Export to Bike Computer */}
        {workout.exportable && workout.cyclingStructure && (
          <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}>
            <Group justify="space-between" align="center">
              <Box>
                <Group gap="xs" mb={4}>
                  <IconFileExport size={16} />
                  <Text fw={500} size="sm">Export to Bike Computer</Text>
                </Group>
                <Text size="xs" c="dimmed">Download this workout for Zwift, TrainerRoad, or other apps</Text>
              </Box>
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Button variant="light" color="cyan" leftSection={<IconDownload size={16} />}>
                    Export
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Choose Format</Menu.Label>
                  <Menu.Item
                    leftSection={<IconBrandZwift size={16} />}
                    onClick={() => {
                      try {
                        const result = exportWorkout(workout.cyclingStructure, {
                          format: 'zwo',
                          workoutName: workout.name,
                          description: workout.description
                        });
                        downloadWorkout(result);
                        notifications.show({
                          title: 'Workout Exported',
                          message: `${workout.name}.zwo downloaded for Zwift`,
                          color: 'green'
                        });
                      } catch (err) {
                        notifications.show({
                          title: 'Export Failed',
                          message: err.message,
                          color: 'red'
                        });
                      }
                    }}
                  >
                    Zwift (.zwo)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconDeviceWatch size={16} />}
                    onClick={() => {
                      try {
                        const result = exportWorkout(workout.cyclingStructure, {
                          format: 'tcx',
                          workoutName: workout.name,
                          description: workout.description
                        });
                        downloadWorkout(result);
                        notifications.show({
                          title: 'Workout Exported',
                          message: `${workout.name}.tcx downloaded - Import to Garmin Connect`,
                          color: 'green'
                        });
                      } catch (err) {
                        notifications.show({
                          title: 'Export Failed',
                          message: err.message,
                          color: 'red'
                        });
                      }
                    }}
                  >
                    Garmin (.tcx)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconFileExport size={16} />}
                    onClick={() => {
                      try {
                        const result = exportWorkout(workout.cyclingStructure, {
                          format: 'mrc',
                          workoutName: workout.name,
                          description: workout.description
                        });
                        downloadWorkout(result);
                        notifications.show({
                          title: 'Workout Exported',
                          message: `${workout.name}.mrc downloaded for TrainerRoad`,
                          color: 'green'
                        });
                      } catch (err) {
                        notifications.show({
                          title: 'Export Failed',
                          message: err.message,
                          color: 'red'
                        });
                      }
                    }}
                  >
                    TrainerRoad (.mrc)
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<IconDownload size={16} />}
                    onClick={() => {
                      try {
                        const result = exportWorkout(workout.cyclingStructure, {
                          format: 'json',
                          workoutName: workout.name,
                          description: workout.description
                        });
                        downloadWorkout(result);
                        notifications.show({
                          title: 'Workout Exported',
                          message: `${workout.name}.json downloaded`,
                          color: 'green'
                        });
                      } catch (err) {
                        notifications.show({
                          title: 'Export Failed',
                          message: err.message,
                          color: 'red'
                        });
                      }
                    }}
                  >
                    JSON (developer)
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
            {workout.cyclingStructure.terrain?.suggestedRoute && (
              <Alert mt="xs" variant="light" color="blue" p="xs" icon={null}>
                <Text size="xs"><strong>Suggested terrain:</strong> {workout.cyclingStructure.terrain.suggestedRoute}</Text>
              </Alert>
            )}
          </Paper>
        )}

        {/* Find Matching Routes */}
        <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}>
          <Group justify="space-between" align="center">
            <Box>
              <Group gap="xs" mb={4}>
                <IconRoute size={16} />
                <Text fw={500} size="sm">Find Matching Routes</Text>
              </Group>
              <Text size="xs" c="dimmed">
                Find routes from your history that are ideal for this {workout.category?.replace('_', ' ')} workout
              </Text>
            </Box>
            <Button
              variant="light"
              color="terracotta"
              leftSection={<IconRoute size={16} />}
              onClick={() => {
                onClose();
                // Navigate to Routes tab - setActiveTab will be called via props
                window.location.href = `/training?tab=routes`;
              }}
            >
              View Routes
            </Button>
          </Group>
        </Paper>

        {/* Close Button */}
        <Button variant="light" color="terracotta" fullWidth onClick={onClose}>
          Close
        </Button>
      </Stack>
    </Modal>
  );
}

// Build training context for AI Coach
function buildTrainingContext(trainingMetrics, weeklyStats, actualWeeklyStats, ftp, activities, formatDist, formatTime, isImperial, activePlan = null, raceGoals = [], crossTrainingActivities = [], workoutRecommendation = null, plannedWorkouts = []) {
  const context = [];
  const distanceUnit = isImperial ? 'mi' : 'km';

  // Add current date context - critical for time-aware recommendations
  const today = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  context.push(`TODAY'S DATE: ${dayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`);
  context.push(`(Any references to days of the week in conversation history may be outdated - always use today's date above as the reference point)`);

  if (ftp) context.push(`FTP: ${ftp}W`);

  if (trainingMetrics.ctl > 0 || trainingMetrics.atl > 0) {
    context.push(`Training Load - CTL: ${Math.round(trainingMetrics.ctl)}, ATL: ${Math.round(trainingMetrics.atl)}, TSB: ${Math.round(trainingMetrics.tsb)}`);
    if (trainingMetrics.interpretation) {
      context.push(`Form Status: ${trainingMetrics.interpretation.status} - ${trainingMetrics.interpretation.message}`);
    }
  }

  if (actualWeeklyStats.rideCount > 0) {
    context.push(`This week: ${actualWeeklyStats.rideCount} rides, ${formatDist(actualWeeklyStats.totalDistance / 1000)}, ${formatTime(actualWeeklyStats.totalTime)}`);
  }

  if (activities.length > 0) {
    const lastRide = activities[0];
    context.push(`Last ride: ${lastRide.name} - ${formatDist(lastRide.distance / 1000)}`);
    context.push(`Activity history available for analysis (use query_fitness_history tool for historical comparisons)`);
  }

  // Add upcoming race goals context
  if (raceGoals && raceGoals.length > 0) {
    context.push(`\n--- Upcoming Race Goals ---`);
    context.push(`IMPORTANT: The athlete has ${raceGoals.length} upcoming race(s). Training should be periodized around these events.`);

    raceGoals.forEach((race, index) => {
      const raceDate = new Date(race.race_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24));
      const weeksUntil = Math.ceil(daysUntil / 7);

      const priorityLabel = race.priority === 'A' ? 'A-RACE (MAIN GOAL)' :
                           race.priority === 'B' ? 'B-Race (Important)' : 'C-Race (Training)';

      context.push(`\n${index + 1}. ${race.name} - ${priorityLabel}`);
      context.push(`   Date: ${raceDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
      context.push(`   Time Until: ${daysUntil} days (${weeksUntil} weeks)`);
      context.push(`   Type: ${race.race_type?.replace('_', ' ') || 'race'}`);

      if (race.distance_km) {
        const distance = isImperial ? Math.round(race.distance_km * 0.621371) : Math.round(race.distance_km);
        context.push(`   Distance: ${distance} ${distanceUnit}`);
      }
      if (race.elevation_gain_m) {
        const elevation = isImperial ? Math.round(race.elevation_gain_m * 3.28084) : Math.round(race.elevation_gain_m);
        context.push(`   Elevation: ${elevation} ${isImperial ? 'ft' : 'm'}`);
      }
      if (race.goal_time_minutes) {
        const hours = Math.floor(race.goal_time_minutes / 60);
        const mins = race.goal_time_minutes % 60;
        context.push(`   Goal Time: ${hours}h ${mins}m`);
      }
      if (race.goal_power_watts) {
        context.push(`   Goal Power: ${race.goal_power_watts}W`);
      }
      if (race.goal_placement) {
        context.push(`   Goal: ${race.goal_placement}`);
      }
      if (race.course_description) {
        context.push(`   Course: ${race.course_description}`);
      }
    });

    // Add race-specific coaching guidance
    const nextARace = raceGoals.find(r => r.priority === 'A');
    if (nextARace) {
      const raceDate = new Date(nextARace.race_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24));

      context.push(`\n--- Race Preparation Guidance ---`);
      if (daysUntil <= 7) {
        context.push(`RACE WEEK: Focus on rest, openers, and mental preparation. Keep TSS very low.`);
      } else if (daysUntil <= 14) {
        context.push(`TAPER PERIOD: Reduce volume by 40-60%, maintain some intensity. Focus on feeling fresh.`);
      } else if (daysUntil <= 28) {
        context.push(`FINAL BUILD: Last chance for hard training blocks. After this, begin tapering.`);
      } else if (daysUntil <= 56) {
        context.push(`BUILD PHASE: Focus on race-specific intensity. Include race-pace efforts.`);
      } else {
        context.push(`BASE/EARLY BUILD: Good time to build aerobic base and address limiters.`);
      }
    }
  }

  // Add cross-training activities context
  if (crossTrainingActivities && crossTrainingActivities.length > 0) {
    context.push(`\n--- Recent Cross-Training Activities ---`);
    context.push(`IMPORTANT: The athlete does cross-training beyond cycling. Consider this when recommending workouts and recovery.`);

    // Group by category
    const byCategory = {};
    let totalCrossTrainingTSS = 0;

    crossTrainingActivities.forEach(activity => {
      const category = activity.category || 'other';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(activity);
      totalCrossTrainingTSS += activity.tss || 0;
    });

    context.push(`Total cross-training TSS (last 14 days): ${Math.round(totalCrossTrainingTSS)}`);
    context.push(`Activities breakdown:`);

    Object.entries(byCategory).forEach(([category, activities]) => {
      const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
      const totalDuration = activities.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);
      context.push(`- ${categoryLabel}: ${activities.length} session${activities.length !== 1 ? 's' : ''}, ${totalDuration} minutes total`);
    });

    // List recent activities
    context.push(`\nRecent activities:`);
    crossTrainingActivities.slice(0, 5).forEach(activity => {
      context.push(`- ${activity.date}: ${activity.type} (${activity.durationMinutes}min, intensity ${activity.intensity}/10, ~${activity.tss || 0} TSS)`);
    });

    // Add coaching guidance for cross-training
    const hasStrength = byCategory.strength && byCategory.strength.length > 0;
    const hasCardio = byCategory.cardio && byCategory.cardio.length > 0;

    if (hasStrength) {
      const recentStrength = crossTrainingActivities.find(a => a.category === 'strength');
      if (recentStrength) {
        const daysSince = Math.floor((new Date() - new Date(recentStrength.date)) / (1000 * 60 * 60 * 24));
        if (daysSince <= 1) {
          context.push(`\nNOTE: Athlete did strength training ${daysSince === 0 ? 'today' : 'yesterday'}. Consider leg fatigue when prescribing cycling intensity.`);
        }
      }
    }

    if (hasCardio) {
      context.push(`\nNOTE: Athlete does other cardio activities. Factor this into total weekly training load calculations.`);
    }
  }

  // Add active training plan context
  if (activePlan) {
    // Use parsePlanStartDate for timezone-safe parsing
    const planStart = parsePlanStartDate(activePlan.started_at || activePlan.start_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare at midnight
    const daysSinceStart = planStart ? Math.floor((now - planStart) / (24 * 60 * 60 * 1000)) : 0;
    const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
    const totalWeeks = activePlan.duration_weeks || 8;
    const progress = currentWeek / totalWeeks;

    // Determine phase
    let phase = 'Base';
    if (progress > 0.3 && progress <= 0.6) phase = 'Build';
    else if (progress > 0.6 && progress <= 0.85) phase = 'Peak';
    else if (progress > 0.85) phase = 'Taper';

    context.push(`\n--- Active Training Plan ---`);
    context.push(`Plan: ${activePlan.name}`);
    context.push(`Methodology: ${activePlan.methodology || 'mixed'}`);
    context.push(`Goal: ${activePlan.goal || 'general fitness'}`);
    context.push(`Current Week: ${currentWeek} of ${totalWeeks} (${phase} Phase)`);
    context.push(`Compliance: ${Math.round(activePlan.compliance_percentage || 0)}%`);
    context.push(`Workouts Completed: ${activePlan.workouts_completed || 0} of ${activePlan.workouts_total || 0}`);

    if (activePlan.status === 'paused') {
      context.push(`Status: PAUSED - Plan is currently on hold`);
    }

    // Add plan adjustment capability info
    context.push(`\nYou can suggest plan adjustments based on the athlete's current form, compliance, and feedback. Consider:`);
    context.push(`- If compliance is low, suggest reducing volume or intensity`);
    context.push(`- If TSB is very negative (fatigued), recommend recovery`);
    context.push(`- If TSB is very positive (fresh), suggest adding intensity`);
    context.push(`- Consider the current training phase when making recommendations`);
    if (raceGoals && raceGoals.length > 0) {
      context.push(`- PRIORITIZE upcoming race goals when planning workouts and recovery`);
    }
  }

  // Add planned workout schedule from the training calendar
  if (plannedWorkouts && plannedWorkouts.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Calculate this week's Monday
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(today);
    thisMonday.setDate(thisMonday.getDate() + mondayOffset);

    // Next Sunday end of this week
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisSunday.getDate() + 6);

    // Next week's Sunday
    const nextSunday = new Date(thisSunday);
    nextSunday.setDate(nextSunday.getDate() + 7);

    // Filter workouts for this week and next week
    const thisWeekWorkouts = plannedWorkouts.filter(w => {
      const d = new Date(w.scheduled_date + 'T12:00:00');
      return d >= thisMonday && d <= thisSunday;
    });

    const nextWeekWorkouts = plannedWorkouts.filter(w => {
      const d = new Date(w.scheduled_date + 'T12:00:00');
      return d > thisSunday && d <= nextSunday;
    });

    if (thisWeekWorkouts.length > 0 || nextWeekWorkouts.length > 0) {
      context.push(`\n--- TRAINING CALENDAR (PLANNED WORKOUTS) ---`);
      context.push(`IMPORTANT: These are the workouts currently scheduled on the athlete's training calendar. Reference this when discussing their schedule, suggesting changes, or advising on load management.`);

      const formatWorkoutLine = (w) => {
        const wDate = new Date(w.scheduled_date + 'T12:00:00');
        const dayLabel = dayNames[wDate.getDay()];
        const dateLabel = wDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const isToday = wDate.getTime() === today.getTime();
        const todayTag = isToday ? ' ** TODAY **' : '';
        const status = w.completed ? 'DONE' : w.skipped_reason ? 'SKIPPED' : 'planned';
        const typeParts = [];
        if (w.name) typeParts.push(w.name);
        else if (w.workout_type) typeParts.push(w.workout_type);
        if (w.duration_minutes || w.target_duration) typeParts.push(`${w.duration_minutes || w.target_duration} min`);
        if (w.target_tss) typeParts.push(`~${w.target_tss} TSS`);
        return `  ${dayLabel} ${dateLabel}${todayTag}: [${status}] ${typeParts.join(', ')}`;
      };

      if (thisWeekWorkouts.length > 0) {
        context.push(`\nThis Week:`);
        // Sort by date
        thisWeekWorkouts
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
          .forEach(w => context.push(formatWorkoutLine(w)));

        // Summary: how many done vs remaining
        const completed = thisWeekWorkouts.filter(w => w.completed).length;
        const remaining = thisWeekWorkouts.filter(w => !w.completed && !w.skipped_reason && w.workout_type !== 'rest').length;
        const totalTSS = thisWeekWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0);
        context.push(`  Summary: ${completed} completed, ${remaining} remaining, ~${totalTSS} total planned TSS`);
      }

      if (nextWeekWorkouts.length > 0) {
        context.push(`\nNext Week:`);
        nextWeekWorkouts
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
          .forEach(w => context.push(formatWorkoutLine(w)));
      }
    }
  }

  // Add today's workout recommendation from unified service
  if (workoutRecommendation?.primary) {
    const rec = workoutRecommendation.primary;
    const analysis = workoutRecommendation.analysis;
    context.push(`\n--- TODAY'S WORKOUT RECOMMENDATION ---`);
    context.push(`IMPORTANT: The dashboard is currently showing the following recommendation to the athlete. Your workout advice should be consistent with this unless the athlete asks you to override it.`);
    context.push(`Primary: ${rec.workout?.name || 'None'} (${rec.workout?.id || 'unknown'})`);
    context.push(`Category: ${rec.category}`);
    context.push(`Reason: ${rec.reason}`);
    if (analysis?.formStatus) {
      context.push(`Form Status: ${analysis.formStatus}`);
    }
    if (analysis?.raceProximity?.phase) {
      context.push(`Race Proximity: ${analysis.raceProximity.phase} (${analysis.raceProximity.daysUntilRace} days to ${analysis.raceProximity.nextRace?.name})`);
    }
    if (analysis?.gaps) {
      const gapNotes = [];
      if (analysis.gaps.missingZ2) gapNotes.push('no Z2 ride this week');
      if (analysis.gaps.missingIntensity) gapNotes.push('no intensity this week');
      if (gapNotes.length > 0) context.push(`Training Gaps: ${gapNotes.join(', ')}`);
    }
    if (workoutRecommendation.alternatives?.length > 0) {
      context.push(`Alternatives: ${workoutRecommendation.alternatives.map(a => a.workout?.name).join(', ')}`);
    }
  }

  return context.join('\n');
}

export default TrainingDashboard;
