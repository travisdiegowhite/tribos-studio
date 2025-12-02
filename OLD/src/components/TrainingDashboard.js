import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Grid,
  Card,
  Text,
  Group,
  Stack,
  Badge,
  RingProgress,
  Title,
  Tabs,
  Select,
  Button,
  ThemeIcon,
  Divider,
  Alert,
  Paper,
  SimpleGrid,
  ActionIcon,
  Tooltip,
  Center,
  Progress,
  Anchor,
} from '@mantine/core';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  Award,
  Target,
  Clock,
  Zap,
  Plus,
  Info,
  BarChart3,
  LineChart,
  Brain,
  Route as RouteIcon,
  MapPin,
  BookOpen,
  Mountain,
  Heart,
  Moon,
  Bell,
  Map,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  calculateCTL,
  calculateATL,
  calculateTSB,
  interpretTSB,
  TRAINING_ZONES,
  WORKOUT_TYPES,
} from '../utils/trainingPlans';
import TrainingLoadChart from './TrainingLoadChart';
import RideHistoryTable from './RideHistoryTable';
import TrainingCalendar from './TrainingCalendar';
import { analyzeRidingPatterns } from '../utils/rideAnalysis';
import { useUnits } from '../utils/units';
import { getCurrentFTP } from '../services/ftp';
import AICoachChat from './AICoachChat';
import HealthMetricsForm from './HealthMetricsForm';
import PostWorkoutSurvey from './PostWorkoutSurvey';
import { useRideSyncActions } from '../hooks/useRideSyncActions';
import FTPSettingsModal from './FTPSettingsModal';
import ProgressionLevelsCard from './ProgressionLevelsCard';
import AdaptiveTrainingCard from './AdaptiveTrainingCard';
// import PerformanceTrendsCard from './PerformanceTrendsCard'; // DEFERRED: Requires progression data from workout completion
import TrainingPatternCard from './TrainingPatternCard';
import RideAnalysisModal from './RideAnalysisModal';
import WeeklyStatsCard from './WeeklyStatsCard';
import UpcomingWorkoutCard from './UpcomingWorkoutCard';
import ReminderSettingsModal from './ReminderSettingsModal';
import LastWorkoutCard from './LastWorkoutCard';
import WeekAtAGlanceCard from './WeekAtAGlanceCard';
import PersonalRecordsCard from './PersonalRecordsCard';
import MonthlyStatsCard from './MonthlyStatsCard';
import CoachInvitations from './coach/CoachInvitations';
import BreadcrumbNav from './BreadcrumbNav';
import EmptyState from './EmptyState';
import { TrainingMetricsSkeleton } from './LoadingSkeletons';

/**
 * Training Dashboard - Comprehensive Training Hub
 * Combines training metrics, smart insights, performance analysis, and ride history
 */
const TrainingDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatDistance, formatElevation, formatSpeed } = useUnits();

  // Ride sync actions (for RPE prompts and workout linking)
  const { rideToSurvey, linkedWorkout, clearSurveyPrompt, checkPendingFeedback } = useRideSyncActions(user?.id);

  // State
  const [loading, setLoading] = useState(true);
  const [trainingMetrics, setTrainingMetrics] = useState(null);
  const [recentRides, setRecentRides] = useState([]);
  const [dailyTSS, setDailyTSS] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [timeRange, setTimeRange] = useState('30'); // days

  // Smart Analysis State
  const [ridingPatterns, setRidingPatterns] = useState(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [allRoutes, setAllRoutes] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [trendsTimeRange, setTrendsTimeRange] = useState('all'); // all, 12, 18 months

  // AI Coach State
  const [coachMessage, setCoachMessage] = useState(null);

  // Health Metrics State
  const [showHealthMetricsForm, setShowHealthMetricsForm] = useState(false);
  const [healthMetrics, setHealthMetrics] = useState(null);

  // Phase 2: FTP & Adaptive Training State
  const [showFTPSettings, setShowFTPSettings] = useState(false);

  // Phase 2.5: Ride Intelligence State
  const [showRideAnalysis, setShowRideAnalysis] = useState(false);
  const [selectedRideForAnalysis, setSelectedRideForAnalysis] = useState(null);

  // Reminder Settings State
  const [showReminderSettings, setShowReminderSettings] = useState(false);

  // FTP State
  const [currentFTP, setCurrentFTP] = useState(null);

  // Filter rides based on selected timeRange
  const filteredRides = useMemo(() => {
    const daysBack = parseInt(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    return allRoutes.filter(r => {
      const rideDate = new Date(r.recorded_at || r.created_at);
      return rideDate >= cutoffDate;
    });
  }, [allRoutes, timeRange]);

  // Calculate comprehensive stats from filtered routes
  const stats = useMemo(() => {
    const stravaRoutes = filteredRides.filter(r => r.imported_from === 'strava');
    const garminRoutes = filteredRides.filter(r => r.imported_from === 'garmin');
    const routesWithSpeed = stravaRoutes.filter(r => r.average_speed && r.average_speed > 0);
    const routesWithHR = stravaRoutes.filter(r => r.average_heartrate && r.average_heartrate > 0);
    const routesWithPower = stravaRoutes.filter(r => r.average_watts && r.average_watts > 0);

    // Track data sources for Garmin brand compliance attribution
    const dataSources = [];
    if (stravaRoutes.length > 0) dataSources.push('Strava');
    if (garminRoutes.length > 0) dataSources.push('Garmin');

    // Calculate actual time span for accurate weekly/monthly averages
    let actualWeeks = 1;
    let actualDays = 1;
    if (filteredRides.length > 0) {
      const dates = filteredRides
        .map(r => new Date(r.recorded_at || r.created_at))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a - b);

      if (dates.length > 1) {
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        actualDays = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
        actualWeeks = Math.max(1, actualDays / 7);
      }
    }

    return {
      totalRoutes: filteredRides.length,
      stravaRoutes: stravaRoutes.length,
      garminRoutes: garminRoutes.length,
      dataSources, // For brand compliance attribution
      totalDistance: filteredRides.reduce((sum, r) => sum + (r.distance_km || 0), 0),
      totalElevation: filteredRides.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0),
      totalTime: filteredRides.reduce((sum, r) => sum + (r.duration_seconds || 0), 0),
      longestRide: Math.max(...filteredRides.map(r => r.distance_km || 0), 0),
      highestElevation: Math.max(...filteredRides.map(r => r.elevation_gain_m || 0), 0),
      avgDistance: filteredRides.length > 0 ? filteredRides.reduce((sum, r) => sum + (r.distance_km || 0), 0) / filteredRides.length : 0,
      avgSpeed: routesWithSpeed.length > 0
        ? routesWithSpeed.reduce((sum, r) => sum + (r.average_speed || 0), 0) / routesWithSpeed.length
        : null,
      avgHeartRate: routesWithHR.length > 0
        ? routesWithHR.reduce((sum, r) => sum + (r.average_heartrate || 0), 0) / routesWithHR.length
        : null,
      avgPower: routesWithPower.length > 0
        ? routesWithPower.reduce((sum, r) => sum + (r.average_watts || 0), 0) / routesWithPower.length
        : null,
      maxPower: Math.max(...stravaRoutes.map(r => r.max_watts || 0), 0) || null,
      // Time-based metrics
      actualWeeks,
      actualDays,
      weeklyDistance: filteredRides.reduce((sum, r) => sum + (r.distance_km || 0), 0) / actualWeeks,
      monthlyDistance: filteredRides.reduce((sum, r) => sum + (r.distance_km || 0), 0) / (actualDays / 30),
      ridesPerWeek: filteredRides.length / actualWeeks,
    };
  }, [filteredRides]);

  // Calculate filtered stats for trends tab based on time range
  const trendsStats = useMemo(() => {
    let filteredRoutes = allRoutes;

    // Filter by time range if not "all"
    if (trendsTimeRange !== 'all') {
      const monthsBack = parseInt(trendsTimeRange);
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);

      filteredRoutes = allRoutes.filter(r => {
        const rideDate = new Date(r.recorded_at || r.created_at);
        return rideDate >= cutoffDate;
      });
    }

    // Calculate actual time span for filtered routes
    let actualWeeks = 1;
    let actualDays = 1;
    if (filteredRoutes.length > 0) {
      const dates = filteredRoutes
        .map(r => new Date(r.recorded_at || r.created_at))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a - b);

      if (dates.length > 1) {
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        actualDays = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
        actualWeeks = Math.max(1, actualDays / 7);
      }
    }

    const totalDistance = filteredRoutes.reduce((sum, r) => sum + (r.distance_km || 0), 0);
    const totalElevation = filteredRoutes.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0);
    const totalTime = filteredRoutes.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);

    return {
      totalRoutes: filteredRoutes.length,
      totalDistance,
      totalElevation,
      totalTime,
      actualWeeks,
      actualDays,
      weeklyDistance: totalDistance / actualWeeks,
      monthlyDistance: totalDistance / (actualDays / 30),
      ridesPerWeek: filteredRoutes.length / actualWeeks,
    };
  }, [allRoutes, trendsTimeRange]);

  // Load training data
  useEffect(() => {
    if (!user?.id) return;
    loadTrainingData();
    loadHealthMetrics();
  }, [user?.id, timeRange]);

  // Check for rides needing feedback on mount
  useEffect(() => {
    const checkFeedback = async () => {
      if (!user?.id) return;

      const pendingRides = await checkPendingFeedback();
      // Note: We don't auto-prompt on dashboard load to avoid being intrusive
      // RPE prompts will come from actual sync events or user can manually review in History tab
      console.log(`📊 ${pendingRides.length} rides need feedback`);
    };

    checkFeedback();
  }, [user?.id, checkPendingFeedback]);

  // Handle URL tab parameter (e.g., /training?tab=calendar)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');

    if (tabParam && ['overview', 'insights', 'performance', 'history', 'calendar'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  const loadTrainingData = async () => {
    try {
      setLoading(true);

      // Check for demo mode
      const { isDemoMode } = await import('../utils/demoData');
      const inDemoMode = isDemoMode();

      // Load active training plan (skip in demo mode)
      if (!inDemoMode) {
        const { data: plans } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1);

        if (plans && plans.length > 0) {
          setActivePlan(plans[0]);

          // Load planned workouts for the active plan
          const { data: workouts } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('plan_id', plans[0].id)
            .order('week_number', { ascending: true })
            .order('day_of_week', { ascending: true });

          if (workouts) {
            setPlannedWorkouts(workouts);
          }
        }
      } else {
        console.log('✅ Demo mode: skipping training plans fetch');
      }

      // Load current FTP
      try {
        const ftp = await getCurrentFTP(user.id);
        setCurrentFTP(ftp);
      } catch (error) {
        console.error('Error loading FTP:', error);
        // Don't throw - FTP is optional
      }

      // Load recent rides based on selected timeRange
      const daysAgo = new Date();
      const daysToLoad = Math.max(parseInt(timeRange), 90); // Load at least 90 days for CTL calculation
      daysAgo.setDate(daysAgo.getDate() - daysToLoad);

      // Load essential fields including GPS data flags for map display
      const { data: rides } = await supabase
        .from('routes')
        .select('id, name, distance_km, elevation_gain_m, duration_seconds, recorded_at, created_at, route_type, training_stress_score, has_power_data, has_gps_data, has_heart_rate_data, track_points_count, start_latitude, start_longitude, average_speed, average_heartrate, average_watts, max_watts, imported_from')
        .eq('user_id', user.id)
        .gte('recorded_at', daysAgo.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(1000); // Limit to recent 1000 rides for performance

      if (rides) {
        console.log('📊 Training Dashboard loaded', rides.length, 'rides');
        setRecentRides(rides);
        setAllRoutes(rides); // Store for analysis tabs

        // Calculate daily TSS
        const tssMap = {};
        rides.forEach(ride => {
          // Use recorded_at (actual activity date) instead of created_at (import date)
          const activityDate = ride.recorded_at || ride.created_at;
          const date = new Date(activityDate).toISOString().split('T')[0];
          if (!tssMap[date]) {
            tssMap[date] = 0;
          }
          // Estimate TSS from ride data (you may have actual TSS stored)
          const estimatedTSS = estimateTSSFromRide(ride);
          tssMap[date] += estimatedTSS;
        });

        // Convert to array format for last 90 days
        const tssArray = [];
        for (let i = 89; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateKey = date.toISOString().split('T')[0];
          tssArray.push({
            date: dateKey,
            tss: tssMap[dateKey] || 0
          });
        }
        setDailyTSS(tssArray);

        // Calculate current training metrics
        const tssValues = tssArray.map(d => d.tss);
        const ctl = calculateCTL(tssValues);
        const atl = calculateATL(tssValues.slice(-7)); // Last 7 days
        const tsb = calculateTSB(ctl, atl);
        const tsbInterpretation = interpretTSB(tsb);

        setTrainingMetrics({
          ctl,
          atl,
          tsb,
          interpretation: tsbInterpretation,
          weeklyTSS: tssValues.slice(-7).reduce((a, b) => a + b, 0),
          monthlyTSS: tssValues.slice(-30).reduce((a, b) => a + b, 0),
        });
      }

    } catch (error) {
      console.error('Failed to load training data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load health metrics
  const loadHealthMetrics = async () => {
    try {
      const { data, error } = await supabase
        .from('health_metrics')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(7);

      if (error) {
        console.error('Error loading health metrics:', error);
        return;
      }

      if (data && data.length > 0) {
        // Calculate 7-day averages
        const avgHrv = data.filter(m => m.hrv).length > 0
          ? Math.round(data.filter(m => m.hrv).reduce((sum, m) => sum + m.hrv, 0) / data.filter(m => m.hrv).length)
          : null;

        const avgSleep = data.filter(m => m.sleep_hours).length > 0
          ? (data.filter(m => m.sleep_hours).reduce((sum, m) => sum + m.sleep_hours, 0) / data.filter(m => m.sleep_hours).length).toFixed(1)
          : null;

        const avgRestingHR = data.filter(m => m.resting_hr).length > 0
          ? Math.round(data.filter(m => m.resting_hr).reduce((sum, m) => sum + m.resting_hr, 0) / data.filter(m => m.resting_hr).length)
          : null;

        setHealthMetrics({
          recent: data[0], // Most recent entry
          avgHrv,
          avgSleep,
          avgRestingHR,
        });
      }
    } catch (err) {
      console.error('Failed to load health metrics:', err);
    }
  };

  // Load riding patterns for Insights tab
  const loadRidingPatterns = async () => {
    if (ridingPatterns || patternsLoading || allRoutes.length === 0) return;

    try {
      setPatternsLoading(true);
      const patterns = await analyzeRidingPatterns(allRoutes);
      setRidingPatterns(patterns);
    } catch (error) {
      console.error('Failed to analyze riding patterns:', error);
    } finally {
      setPatternsLoading(false);
    }
  };

  // Trigger pattern analysis when switching to Insights tab
  useEffect(() => {
    if (activeTab === 'insights' && !ridingPatterns && allRoutes.length > 0) {
      console.log('Loading riding patterns for', allRoutes.length, 'routes');
      loadRidingPatterns();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, allRoutes.length]);

  // Helper: Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '0h';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Helper: Estimate TSS from ride data
  const estimateTSSFromRide = (ride) => {
    // If we have actual training_stress_score, use it
    if (ride.training_stress_score && ride.training_stress_score > 0) {
      return ride.training_stress_score;
    }

    // Otherwise estimate from ride metrics using correct field names
    const distanceKm = ride.distance_km || 0;
    const elevationM = ride.elevation_gain_m || 0;
    const durationSeconds = ride.duration_seconds || 3600; // Default 1 hour if not available

    // Simple estimation: 50 TSS/hour base + elevation factor
    const baseTSS = (durationSeconds / 3600) * 50;
    const elevationFactor = (elevationM / 300) * 10;
    return Math.round(baseTSS + elevationFactor);
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <TrainingMetricsSkeleton />
      </Container>
    );
  }

  // Show empty state for users with no rides
  if (allRoutes.length === 0) {
    return (
      <Container size="xl" py="xl">
        <BreadcrumbNav
          items={[
            { label: 'Dashboard', path: '/' },
            { label: 'Training Hub' }
          ]}
        />
        <Title order={2} mb="lg">Training Hub</Title>
        <EmptyState type="noTrainingData" size="lg" />
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      {/* Breadcrumb Navigation */}
      <BreadcrumbNav
        items={[
          { label: 'Dashboard', path: '/' },
          { label: 'Training Hub' }
        ]}
      />

      {/* Header */}
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={2}>Training Hub</Title>
          <Text size="sm" c="dimmed">
            Fitness tracking, smart insights, performance analysis & training planning
          </Text>
        </div>
        <Group>
          <Select
            value={timeRange}
            onChange={setTimeRange}
            data={[
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
            size="sm"
          />
          <Button
            leftSection={<Plus size={16} />}
            onClick={() => navigate('/training/plans/new')}
          >
            New Training Plan
          </Button>
        </Group>
      </Group>

      {/* Coach Invitations */}
      <CoachInvitations />

      {/* Active Plan Alert */}
      {activePlan && (
        <Alert
          icon={<Award size={16} />}
          title={`Active Plan: ${activePlan.name}`}
          color="blue"
          mb="lg"
        >
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm">
                Week {activePlan.current_week} of {activePlan.duration_weeks} • {activePlan.current_phase} phase
              </Text>
              <Button size="xs" variant="light" onClick={() => navigate(`/training/plans/${activePlan.id}`)}>
                View Plan
              </Button>
            </Group>
            <div>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">Plan Progress</Text>
                <Text size="xs" fw={600}>{Math.round((activePlan.current_week / activePlan.duration_weeks) * 100)}%</Text>
              </Group>
              <Progress
                value={(activePlan.current_week / activePlan.duration_weeks) * 100}
                size="md"
                color="blue"
                striped
                animated
              />
            </div>
          </Stack>
        </Alert>
      )}

      {/* Action Buttons */}
      <Group justify="flex-end" mb="md">
        <Button
          leftSection={<Bell size={16} />}
          onClick={() => setShowReminderSettings(true)}
          variant="light"
          size="sm"
        >
          Reminders
        </Button>
        <Button
          leftSection={<Zap size={16} />}
          onClick={() => setShowFTPSettings(true)}
          variant="light"
          size="sm"
        >
          FTP Settings
        </Button>
        <Button
          leftSection={<Activity size={16} />}
          onClick={() => setShowHealthMetricsForm(true)}
          variant="light"
          size="sm"
        >
          Log Health Metrics
        </Button>
      </Group>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab} mb="xl">
        <Tabs.List mb="md">
          <Tabs.Tab value="overview" leftSection={<BarChart3 size={16} />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="insights" leftSection={<Brain size={16} />}>
            Insights
          </Tabs.Tab>
          <Tabs.Tab value="performance" leftSection={<Zap size={16} />}>
            Performance
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<Activity size={16} />}>
            Ride History
          </Tabs.Tab>
          <Tabs.Tab value="calendar" leftSection={<Calendar size={16} />}>
            Calendar
          </Tabs.Tab>
        </Tabs.List>

        {/* Overview Tab - Comprehensive Dashboard */}
        <Tabs.Panel value="overview">
      {/* Section: Key Metrics */}
      <Text size="lg" fw={600} mb="sm">Key Metrics</Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: healthMetrics ? 6 : 4 }} mb="xl">
        {/* FTP */}
        {currentFTP && (
          <Card withBorder p="md" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="white" fw={600}>FTP</Text>
              <Tooltip label="Functional Threshold Power - Your 1-hour maximum sustainable power">
                <ActionIcon size="xs" variant="subtle" color="white">
                  <Info size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Group align="flex-end" gap="xs">
              <Text size="xl" fw={700} c="white">{currentFTP.ftp}</Text>
              <Text size="sm" c="white" mb={2}>watts</Text>
            </Group>
            <Text size="xs" c="white" mt="xs" opacity={0.9}>
              {currentFTP.testType ? `${currentFTP.testType} test` : 'Power threshold'}
            </Text>
          </Card>
        )}

        {/* CTL - Chronic Training Load (Fitness) */}
        <Card withBorder p="md">
          <Group justify="space-between" mb="xs">
            <Text size="sm">Fitness (CTL)</Text>
            <Tooltip label="42-day exponentially weighted average TSS">
              <ActionIcon size="xs" variant="subtle">
                <Info size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Group align="flex-end" gap="xs">
            <Text size="xl" fw={700}>{trainingMetrics?.ctl || 0}</Text>
            <TrendingUp size={16} color="#22c55e" />
          </Group>
          <Text size="xs" mt="xs" opacity={0.7}>
            Long-term training stress
          </Text>
        </Card>

        {/* ATL - Acute Training Load (Fatigue) */}
        <Card withBorder p="md">
          <Group justify="space-between" mb="xs">
            <Text size="sm">Fatigue (ATL)</Text>
            <Tooltip label="7-day exponentially weighted average TSS">
              <ActionIcon size="xs" variant="subtle">
                <Info size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Group align="flex-end" gap="xs">
            <Text size="xl" fw={700}>{trainingMetrics?.atl || 0}</Text>
            <Activity size={16} color="#f59e0b" />
          </Group>
          <Text size="xs" mt="xs" opacity={0.7}>
            Recent training stress
          </Text>
        </Card>

        {/* TSB - Training Stress Balance (Form) */}
        <Card withBorder p="md">
          <Group justify="space-between" mb="xs">
            <Text size="sm">Form (TSB)</Text>
            <Tooltip label="Chronic Training Load minus Acute Training Load">
              <ActionIcon size="xs" variant="subtle">
                <Info size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Group align="flex-end" gap="xs">
            <Text size="xl" fw={700}>{trainingMetrics?.tsb || 0}</Text>
            <Badge color={trainingMetrics?.interpretation?.color || 'gray'} variant="light">
              {trainingMetrics?.interpretation?.status || 'neutral'}
            </Badge>
          </Group>
          <Text size="xs" mt="xs" opacity={0.7}>
            {trainingMetrics?.interpretation?.message || 'Balanced training state'}
          </Text>
        </Card>

        {/* Weekly TSS */}
        <Card withBorder p="md">
          <Group justify="space-between" mb="xs">
            <Text size="sm">Weekly TSS</Text>
            <Tooltip label="Total Training Stress Score this week">
              <ActionIcon size="xs" variant="subtle">
                <Info size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Group align="flex-end" gap="xs">
            <Text size="xl" fw={700}>{trainingMetrics?.weeklyTSS || 0}</Text>
            <Zap size={16} color="#3b82f6" />
          </Group>
          <Text size="xs" mt="xs" opacity={0.7}>
            Last 7 days
          </Text>
        </Card>

        {/* HRV (if available) */}
        {healthMetrics?.avgHrv && (
          <Card withBorder p="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm">HRV</Text>
              <Tooltip label="Heart Rate Variability - 7-day average">
                <ActionIcon size="xs" variant="subtle">
                  <Info size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Group align="flex-end" gap="xs">
              <Text size="xl" fw={700}>{healthMetrics.avgHrv}</Text>
              <Heart size={16} color="#ec4899" />
            </Group>
            <Text size="xs" mt="xs" opacity={0.7}>
              ms (7-day avg)
            </Text>
          </Card>
        )}

        {/* Sleep (if available) */}
        {healthMetrics?.avgSleep && (
          <Card withBorder p="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm">Sleep</Text>
              <Tooltip label="Average sleep duration - 7-day average">
                <ActionIcon size="xs" variant="subtle">
                  <Info size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Group align="flex-end" gap="xs">
              <Text size="xl" fw={700}>{healthMetrics.avgSleep}</Text>
              <Moon size={16} color="#8b5cf6" />
            </Group>
            <Text size="xs" mt="xs" opacity={0.7}>
              hours (7-day avg)
            </Text>
          </Card>
        )}
      </SimpleGrid>

      {/* Form Interpretation */}
      {trainingMetrics?.interpretation && (
        <Alert
          color={trainingMetrics.interpretation.color}
          title={`You are ${trainingMetrics.interpretation.status}`}
          icon={<Activity size={16} />}
          mb="lg"
        >
          <Stack gap="sm">
            <Text size="sm">{trainingMetrics.interpretation.recommendation}</Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                leftSection={<Map size={14} />}
                onClick={() => navigate('/ai-planner')}
              >
                Build Route
              </Button>
              <Button
                size="xs"
                variant="light"
                leftSection={<Brain size={14} />}
                onClick={() => setCoachMessage('Explain my current form status and what it means for my training today')}
              >
                Ask Coach
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}

      {/* Section: This Week */}
      {activePlan && (
        <>
          <Text size="lg" fw={600} mb="sm" mt="xl">This Week</Text>
          <Grid mb="xl">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <WeeklyStatsCard
                activePlan={activePlan}
                rides={allRoutes}
                plannedWorkouts={plannedWorkouts}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3.5 }}>
              <UpcomingWorkoutCard
                activePlan={activePlan}
                plannedWorkouts={plannedWorkouts}
                onWorkoutComplete={loadTrainingData}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3.5 }}>
              <LastWorkoutCard
                rides={allRoutes}
                formatDistance={formatDistance}
                formatElevation={formatElevation}
              />
            </Grid.Col>
          </Grid>
        </>
      )}

      {/* Section: Planning & Progress */}
      {activePlan && (
        <>
          <Text size="lg" fw={600} mb="sm" mt="xl">Planning & Progress</Text>
          <Grid mb="xl">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <WeekAtAGlanceCard
                activePlan={activePlan}
                plannedWorkouts={plannedWorkouts}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <MonthlyStatsCard
                rides={allRoutes}
                formatDistance={formatDistance}
                formatElevation={formatElevation}
              />
            </Grid.Col>
          </Grid>
        </>
      )}

      {/* Section: Performance & Insights */}
      <Text size="lg" fw={600} mb="sm" mt="xl">Performance & Insights</Text>
      <Grid mb="xl">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <TrainingPatternCard user={user} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <PersonalRecordsCard
            rides={allRoutes}
            formatDistance={formatDistance}
            formatElevation={formatElevation}
          />
        </Grid.Col>
      </Grid>

      {/* Section: Training Intelligence */}
      <Text size="lg" fw={600} mb="sm" mt="xl">Training Intelligence</Text>
      <Grid mb="xl">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ProgressionLevelsCard user={user} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AdaptiveTrainingCard user={user} />
        </Grid.Col>
      </Grid>

      {/* Training Load Chart */}
      <Text size="lg" fw={600} mb="sm" mt="xl">Training Load</Text>
      <TrainingLoadChart data={dailyTSS} metrics={trainingMetrics} />
        </Tabs.Panel>

        {/* Insights Tab - Smart Patterns & Recommendations */}
        <Tabs.Panel value="insights" pt="md">
          {allRoutes.length === 0 ? (
            <Card withBorder p="xl">
              <Stack align="center">
                <Brain size={48} color="gray" />
                <Title order={4}>No Ride Data</Title>
                <Text c="dimmed" ta="center">Complete rides to unlock smart insights and pattern analysis</Text>
              </Stack>
            </Card>
          ) : patternsLoading ? (
            <Center py="xl">
              <Stack align="center">
                <Text c="dimmed">Analyzing your riding patterns...</Text>
              </Stack>
            </Center>
          ) : ridingPatterns ? (
            <Stack gap="lg">
              {/* Key Metrics Grid */}
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                <Card withBorder>
                  <Stack gap="xs">
                    <ThemeIcon size={38} variant="light" color="blue">
                      <RouteIcon size={20} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Rides</Text>
                    <Text fw={700} size="xl">{stats.totalRoutes}</Text>
                    {stats.dataSources && stats.dataSources.length > 0 ? (
                      <Text size="xs" c="dimmed">
                        {stats.dataSources.join(' • ')}
                      </Text>
                    ) : (
                      <Text size="xs" c="blue">{stats.stravaRoutes} from Strava</Text>
                    )}
                  </Stack>
                </Card>

                <Card withBorder>
                  <Stack gap="xs">
                    <ThemeIcon size={38} variant="light" color="green">
                      <MapPin size={20} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Distance</Text>
                    <Text fw={700} size="xl">{formatDistance(stats.totalDistance)}</Text>
                    <Text size="xs" c="green">Avg: {formatDistance(stats.avgDistance)}</Text>
                  </Stack>
                </Card>

                <Card withBorder>
                  <Stack gap="xs">
                    <ThemeIcon size={38} variant="light" color="orange">
                      <Mountain size={20} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Elevation</Text>
                    <Text fw={700} size="xl">{formatElevation(stats.totalElevation)}</Text>
                    <Text size="xs" c="orange">Max: {formatElevation(stats.highestElevation)}</Text>
                  </Stack>
                </Card>

                <Card withBorder>
                  <Stack gap="xs">
                    <ThemeIcon size={38} variant="light" color="violet">
                      <Clock size={20} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Time</Text>
                    <Text fw={700} size="xl">{formatDuration(stats.totalTime)}</Text>
                    <Text size="xs" c="violet">Longest: {formatDistance(stats.longestRide)}</Text>
                  </Stack>
                </Card>
              </SimpleGrid>

              {/* Garmin Brand Compliance Attribution */}
              {stats.dataSources && stats.dataSources.includes('Garmin') && (
                <Alert variant="light" color="cyan" icon={<Info size={16} />}>
                  <Text size="sm">
                    Insights derived in part from Garmin device-sourced data.
                  </Text>
                </Alert>
              )}

              {/* Riding Intelligence Card */}
              <Card withBorder>
                <Group justify="space-between" mb="md">
                  <Title order={3}>Riding Intelligence</Title>
                  <Badge color="blue" variant="light">Data-Driven</Badge>
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <Stack gap="xs">
                    <Text size="sm" fw={600} c="dimmed">RIDING STYLE</Text>
                    <Text size="lg" fw={700}>{ridingPatterns.ridingStyle?.style || 'Balanced'}</Text>
                    <Text size="sm" c="dimmed">{ridingPatterns.ridingStyle?.description}</Text>
                  </Stack>

                  <Stack gap="xs">
                    <Text size="sm" fw={600} c="dimmed">FAVORITE TERRAIN</Text>
                    <Text size="lg" fw={700}>{ridingPatterns.terrainPreference?.type || 'Mixed'}</Text>
                    <Text size="sm" c="dimmed">{ridingPatterns.terrainPreference?.description}</Text>
                  </Stack>
                </SimpleGrid>

                {ridingPatterns.recommendations && ridingPatterns.recommendations.length > 0 && (
                  <>
                    <Divider my="md" />
                    <Stack gap="xs">
                      <Text size="sm" fw={600} c="dimmed">RECOMMENDATIONS</Text>
                      {ridingPatterns.recommendations.slice(0, 3).map((rec, idx) => (
                        <Alert key={idx} color="blue" variant="light">
                          {rec}
                        </Alert>
                      ))}
                    </Stack>
                  </>
                )}
              </Card>
            </Stack>
          ) : (
            <Card withBorder p="xl">
              <Stack align="center" gap="md">
                <Brain size={48} color="gray" />
                <Title order={4}>Smart Insights</Title>
                <Text c="dimmed" ta="center">Click below to analyze your riding patterns</Text>
                <Button onClick={loadRidingPatterns} disabled={allRoutes.length === 0}>
                  Analyze Patterns
                </Button>
                {allRoutes.length > 0 && (
                  <Text size="xs" c="dimmed">{allRoutes.length} rides available for analysis</Text>
                )}
              </Stack>
            </Card>
          )}
        </Tabs.Panel>

        {/* Performance Tab */}
        <Tabs.Panel value="performance" pt="md">
          {stats.stravaRoutes === 0 ? (
            <Card withBorder p="xl">
              <Stack align="center">
                <Zap size={48} color="gray" />
                <Title order={4}>Enhanced Performance Data Unavailable</Title>
                <Text c="dimmed" ta="center">
                  Import rides from Strava with performance data (heart rate, power, speed) to unlock detailed analysis and advanced metrics.
                </Text>
              </Stack>
            </Card>
          ) : (
            <Stack gap="lg">
              {/* Performance Overview Cards */}
              <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md">
                {stats.avgSpeed && (
                  <Card withBorder>
                    <Stack gap="xs">
                      <ThemeIcon size={38} variant="light" color="blue">
                        <TrendingUp size={20} />
                      </ThemeIcon>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Avg Speed</Text>
                      <Text fw={700} size="xl">{formatSpeed(stats.avgSpeed)}</Text>
                      <Text size="xs" c="blue">{stats.stravaRoutes} rides</Text>
                    </Stack>
                  </Card>
                )}

                {stats.avgHeartRate && (
                  <Card withBorder>
                    <Stack gap="xs">
                      <ThemeIcon size={38} variant="light" color="red">
                        <Heart size={20} />
                      </ThemeIcon>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Avg Heart Rate</Text>
                      <Text fw={700} size="xl">{Math.round(stats.avgHeartRate)} bpm</Text>
                      <Text size="xs" c="red">Cardiovascular data</Text>
                    </Stack>
                  </Card>
                )}

                {stats.avgPower && (
                  <Card withBorder>
                    <Stack gap="xs">
                      <ThemeIcon size={38} variant="light" color="orange">
                        <Zap size={20} />
                      </ThemeIcon>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Avg Power</Text>
                      <Text fw={700} size="xl">{Math.round(stats.avgPower)} W</Text>
                      {stats.maxPower && (
                        <Text size="xs" c="orange">Max: {Math.round(stats.maxPower)} W</Text>
                      )}
                    </Stack>
                  </Card>
                )}

                <Card withBorder>
                  <Stack gap="xs">
                    <ThemeIcon size={38} variant="light" color="green">
                      <Activity size={20} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Avg Distance</Text>
                    <Text fw={700} size="xl">{formatDistance(stats.avgDistance)}</Text>
                    <Text size="xs" c="green">Per ride</Text>
                  </Stack>
                </Card>
              </SimpleGrid>

              {/* Detailed Metrics Card */}
              <Card withBorder>
                <Title order={4} mb="md">Performance Details</Title>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm">Total Routes</Text>
                      <Text fw={600}>{stats.totalRoutes}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">With Strava Data</Text>
                      <Text fw={600}>{stats.stravaRoutes}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Longest Ride</Text>
                      <Text fw={600}>{formatDistance(stats.longestRide)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Highest Climb</Text>
                      <Text fw={600}>{formatElevation(stats.highestElevation)}</Text>
                    </Group>
                  </Stack>

                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm">Total Distance</Text>
                      <Text fw={600}>{formatDistance(stats.totalDistance)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Total Elevation</Text>
                      <Text fw={600}>{formatElevation(stats.totalElevation)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Total Time</Text>
                      <Text fw={600}>{formatDuration(stats.totalTime)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Avg Elevation/Ride</Text>
                      <Text fw={600}>{formatElevation(stats.totalElevation / stats.totalRoutes)}</Text>
                    </Group>
                  </Stack>
                </SimpleGrid>
              </Card>
            </Stack>
          )}
        </Tabs.Panel>

        {/* Ride History Tab */}
        <Tabs.Panel value="history">
          <RideHistoryTable
            rides={filteredRides}
            onAnalyzeRide={(ride) => {
              setSelectedRideForAnalysis(ride);
              setShowRideAnalysis(true);
            }}
          />
        </Tabs.Panel>

        {/* Calendar Tab */}
        <Tabs.Panel value="calendar">
          <TrainingCalendar activePlan={activePlan} rides={filteredRides} />
        </Tabs.Panel>
      </Tabs>

      {/* AI Coach Chat - Floating */}
      <AICoachChat compact={true} initialMessage={coachMessage} />

      {/* Health Metrics Form */}
      <HealthMetricsForm
        opened={showHealthMetricsForm}
        onClose={() => setShowHealthMetricsForm(false)}
        selectedDate={new Date()}
        onSaved={loadHealthMetrics}
      />

      {/* Post-Workout Survey */}
      {rideToSurvey && (
        <PostWorkoutSurvey
          opened={true}
          onClose={() => {
            clearSurveyPrompt();
            loadTrainingData(); // Reload to reflect any changes
          }}
          route={rideToSurvey}
          plannedWorkout={linkedWorkout}
        />
      )}

      {/* Phase 2: FTP Settings Modal */}
      <FTPSettingsModal
        opened={showFTPSettings}
        onClose={() => setShowFTPSettings(false)}
        user={user}
        onSaved={() => {
          // Reload training data to reflect new zones
          loadTrainingData();
        }}
      />

      {/* Phase 2.5: Ride Analysis Modal */}
      <RideAnalysisModal
        opened={showRideAnalysis}
        onClose={() => {
          setShowRideAnalysis(false);
          setSelectedRideForAnalysis(null);
        }}
        rideId={selectedRideForAnalysis?.id}
        userId={user?.id}
        rideName={selectedRideForAnalysis?.route_name}
      />

      {/* Reminder Settings Modal */}
      <ReminderSettingsModal
        opened={showReminderSettings}
        onClose={() => setShowReminderSettings(false)}
        user={user}
      />

      {/* TODO: Add FTP breakthrough detection after ride imports */}

      {/* Research Link */}
      <Card withBorder p="md" mt="xl" style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <BookOpen size={24} style={{ color: 'var(--mantine-color-blue-6)' }} />
            <div>
              <Text size="sm" fw={600}>Want to learn about the science behind our training?</Text>
              <Text size="xs" c="dimmed">Read about our research-backed methodologies</Text>
            </div>
          </Group>
          <Anchor href="/training-research" size="sm" fw={600}>
            View Research →
          </Anchor>
        </Group>
      </Card>
    </Container>
  );
};

export default TrainingDashboard;
