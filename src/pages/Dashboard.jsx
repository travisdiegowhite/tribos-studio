import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Text,
  Card,
  Stack,
  Group,
  Button,
  Box,
  Badge,
  Skeleton,
  SimpleGrid,
  Progress,
  ThemeIcon,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconChevronRight,
  IconRoute,
  IconRefresh,
  IconUpload,
  IconChartBar,
  IconPlayerPlay,
  IconCalendarEvent,
  IconTrendingUp,
  IconTarget,
} from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { tokens } from '../theme';
import { ViewOnStravaLink } from '../components/StravaBranding';
import AppShell from '../components/AppShell.jsx';
import OnboardingModal from '../components/OnboardingModal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecentRidesMap from '../components/RecentRidesMap.jsx';
import { supabase } from '../lib/supabase';
import { formatDistance, formatElevation } from '../utils/units';
import { stravaService } from '../utils/stravaService';
import { notifications } from '@mantine/notifications';

function Dashboard() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [weekStats, setWeekStats] = useState({ rides: 0, planned: 0, distance: 0, elevation: 0 });
  const [syncing, setSyncing] = useState(false);

  // Check if onboarding is needed and load user profile
  useEffect(() => {
    const checkOnboardingAndLoadProfile = async () => {
      if (!user) return;

      const hasSeenWelcome = localStorage.getItem(`tribos_welcome_seen_${user.id}`);
      if (hasSeenWelcome) {
        try {
          const { data } = await supabase
            .from('user_profiles')
            .select('onboarding_completed, display_name, units_preference')
            .eq('id', user.id)
            .single();
          if (data) {
            setUserProfile(data);
          }
        } catch {
          // Profile load failed
        }
        return;
      }

      localStorage.setItem(`tribos_welcome_seen_${user.id}`, 'true');
      setShowOnboarding(true);

      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('onboarding_completed, display_name, units_preference')
          .eq('id', user.id)
          .single();
        if (data) {
          setUserProfile(data);
        }
      } catch {
        // Profile doesn't exist yet
      }
    };

    checkOnboardingAndLoadProfile();
  }, [user]);

  const displayName = userProfile?.display_name || user?.email?.split('@')[0] || 'Rider';
  const isImperial = userProfile?.units_preference !== 'metric';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);

  // Fetch activities and training plan
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Fetch activities
        const { data: activityData, error } = await supabase
          .from('activities')
          .select('*')
          .eq('user_id', user.id)
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        if (!error) {
          setActivities(activityData || []);

          // Calculate week stats
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const weekActivities = (activityData || []).filter(a =>
            new Date(a.start_date) >= weekAgo
          );

          setWeekStats({
            rides: weekActivities.length,
            planned: 5, // TODO: Get from active plan
            distance: weekActivities.reduce((sum, a) => sum + ((a.distance_meters || a.distance || 0) / 1000), 0),
            elevation: weekActivities.reduce((sum, a) => sum + (a.elevation_gain_meters || a.total_elevation_gain || 0), 0),
          });
        }

        // Fetch active training plan
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

          // Fetch today's workout
          const today = new Date().toISOString().split('T')[0];
          const { data: workoutData } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('plan_id', planData.id)
            .eq('scheduled_date', today)
            .maybeSingle();

          if (workoutData) {
            setTodayWorkout(workoutData);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const status = await stravaService.getConnectionStatus();
      if (status.connected) {
        await stravaService.syncAllActivities();
        notifications.show({
          title: 'Sync Complete',
          message: 'Activities synced from Strava',
          color: 'lime',
        });
        // Reload activities
        window.location.reload();
      } else {
        notifications.show({
          title: 'Not Connected',
          message: 'Connect Strava in Settings to sync',
          color: 'yellow',
        });
      }
    } catch (err) {
      notifications.show({
        title: 'Sync Failed',
        message: err.message || 'Failed to sync activities',
        color: 'red',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell>
      <OnboardingModal
        opened={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
      <Container size="xl" py="lg">
        <Stack gap="lg">
          {/* Header */}
          <PageHeader
            greeting={`${getGreeting()},`}
            title={displayName}
            titleOrder={2}
          />

          {/* Today's Focus Card */}
          <TodayFocusCard
            workout={todayWorkout}
            plan={activePlan}
            loading={loading}
          />

          {/* Main Content: Map + Stats */}
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="lg">
            {/* Map */}
            <Box>
              <RecentRidesMap
                activities={activities}
                loading={loading}
                formatDist={formatDist}
                formatElev={formatElev}
                compact
              />
            </Box>

            {/* Stats Stack */}
            <Stack gap="md">
              {/* This Week */}
              <Card>
                <Group justify="space-between" mb="sm">
                  <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary }}>
                    This Week
                  </Text>
                  <Badge variant="light" color="lime" size="sm">
                    {weekStats.rides}/{weekStats.planned} rides
                  </Badge>
                </Group>
                <Progress
                  value={(weekStats.rides / Math.max(weekStats.planned, 1)) * 100}
                  color="lime"
                  size="sm"
                  radius="xl"
                  mb="sm"
                />
                <Group gap="xl">
                  <Box>
                    <Text size="xs" style={{ color: tokens.colors.textMuted }}>Distance</Text>
                    <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                      {formatDist(weekStats.distance)}
                    </Text>
                  </Box>
                  <Box>
                    <Text size="xs" style={{ color: tokens.colors.textMuted }}>Elevation</Text>
                    <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                      {formatElev(weekStats.elevation)}
                    </Text>
                  </Box>
                </Group>
              </Card>

              {/* Fitness Trend */}
              <Card>
                <Group justify="space-between" mb="xs">
                  <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary }}>
                    Fitness
                  </Text>
                  <Button
                    component={Link}
                    to="/training?tab=trends"
                    variant="subtle"
                    color="gray"
                    size="xs"
                    rightSection={<IconChevronRight size={12} />}
                  >
                    Details
                  </Button>
                </Group>
                <FitnessMetrics activities={activities} loading={loading} />
              </Card>
            </Stack>
          </SimpleGrid>

          {/* Quick Actions */}
          <Card p="sm">
            <Group gap="xs" wrap="wrap">
              <Button
                component={Link}
                to="/routes/new"
                variant="light"
                color="lime"
                size="sm"
                leftSection={<IconRoute size={16} />}
              >
                Plan Route
              </Button>
              <Button
                onClick={handleSync}
                variant="light"
                color="gray"
                size="sm"
                leftSection={<IconRefresh size={16} />}
                loading={syncing}
              >
                Sync
              </Button>
              <Button
                component={Link}
                to="/training?tab=history"
                variant="light"
                color="gray"
                size="sm"
                leftSection={<IconUpload size={16} />}
              >
                Upload
              </Button>
              <Button
                component={Link}
                to="/training"
                variant="light"
                color="gray"
                size="sm"
                leftSection={<IconChartBar size={16} />}
              >
                Analysis
              </Button>
            </Group>
          </Card>

          {/* Recent Activities */}
          <Card>
            <Group justify="space-between" mb="md">
              <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                Recent Activity
              </Text>
              {activities.length > 0 && (
                <Button
                  component={Link}
                  to="/training?tab=history"
                  variant="subtle"
                  color="gray"
                  size="xs"
                  rightSection={<IconChevronRight size={14} />}
                >
                  View all
                </Button>
              )}
            </Group>

            {loading ? (
              <Stack gap="sm">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={60} radius="md" />
                ))}
              </Stack>
            ) : activities.length === 0 ? (
              <EmptyState />
            ) : (
              <Stack gap="xs">
                {activities.slice(0, 3).map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    formatDist={formatDist}
                    formatElev={formatElev}
                  />
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      </Container>
    </AppShell>
  );
}

// Today's Focus Card
function TodayFocusCard({ workout, plan, loading }) {
  if (loading) {
    return (
      <Card>
        <Skeleton height={80} radius="md" />
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card
        style={{
          background: `linear-gradient(135deg, ${tokens.colors.bgSecondary} 0%, ${tokens.colors.bgTertiary} 100%)`,
          border: `1px solid ${tokens.colors.border}`,
        }}
      >
        <Group justify="space-between" align="center">
          <Box>
            <Text size="xs" tt="uppercase" fw={500} style={{ color: tokens.colors.textMuted }} mb={4}>
              Today's Focus
            </Text>
            <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
              No active training plan
            </Text>
            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
              Start a plan to get personalized workout recommendations
            </Text>
          </Box>
          <Button
            component={Link}
            to="/planner?tab=browse"
            variant="filled"
            color="lime"
            leftSection={<IconCalendarEvent size={16} />}
          >
            Browse Plans
          </Button>
        </Group>
      </Card>
    );
  }

  if (!workout) {
    return (
      <Card
        style={{
          background: `linear-gradient(135deg, ${tokens.colors.bgSecondary} 0%, ${tokens.colors.bgTertiary} 100%)`,
          border: `1px solid ${tokens.colors.border}`,
        }}
      >
        <Group justify="space-between" align="center">
          <Box>
            <Text size="xs" tt="uppercase" fw={500} style={{ color: tokens.colors.textMuted }} mb={4}>
              Today's Focus
            </Text>
            <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
              Rest Day
            </Text>
            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
              Recovery is part of the plan. Take it easy today.
            </Text>
          </Box>
          <ThemeIcon size={48} radius="xl" variant="light" color="lime">
            <IconTarget size={24} />
          </ThemeIcon>
        </Group>
      </Card>
    );
  }

  return (
    <Card
      style={{
        background: `linear-gradient(135deg, ${tokens.colors.bgSecondary} 0%, ${tokens.colors.bgTertiary} 100%)`,
        border: `1px solid ${tokens.colors.electricLime}30`,
      }}
    >
      <Group justify="space-between" align="center">
        <Box>
          <Text size="xs" tt="uppercase" fw={500} style={{ color: tokens.colors.electricLime }} mb={4}>
            Today's Focus
          </Text>
          <Text fw={600} size="lg" style={{ color: tokens.colors.textPrimary }}>
            {workout.title || workout.workout_type || 'Workout'}
          </Text>
          <Group gap="md" mt={4}>
            {workout.duration_minutes && (
              <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                {workout.duration_minutes} min
              </Text>
            )}
            {workout.tss && (
              <Badge variant="light" color="blue" size="sm">
                TSS {workout.tss}
              </Badge>
            )}
          </Group>
        </Box>
        <Group gap="sm">
          <Button
            component={Link}
            to="/planner"
            variant="light"
            color="gray"
            size="sm"
          >
            View Plan
          </Button>
          <Button
            component={Link}
            to="/planner"
            variant="filled"
            color="lime"
            leftSection={<IconPlayerPlay size={16} />}
          >
            Start
          </Button>
        </Group>
      </Group>
    </Card>
  );
}

// Fitness Metrics Component - uses same calculation as FormWidget
function FitnessMetrics({ activities, loading }) {
  if (loading) {
    return <Skeleton height={40} radius="md" />;
  }

  // Estimate TSS from activity if not provided
  const estimateTSS = (activity) => {
    if (activity.tss) return activity.tss;

    const hours = (activity.duration_seconds || activity.moving_time || 0) / 3600;
    const avgPower = activity.average_power_watts || activity.average_watts;

    if (avgPower && activity.normalized_power_watts) {
      const ftp = 200; // Default FTP estimate
      const intensityFactor = activity.normalized_power_watts / ftp;
      return Math.round(hours * intensityFactor * intensityFactor * 100);
    }

    const avgHR = activity.average_heart_rate || activity.average_hr;
    if (avgHR) {
      const intensity = avgHR / 180;
      return Math.round(hours * intensity * 100);
    }

    // Fallback: ~50 TSS per hour
    return Math.round(hours * 50);
  };

  // Calculate CTL/ATL using exponentially weighted averages
  const calculateMetrics = () => {
    if (!activities || activities.length === 0) {
      return { ctl: 0, atl: 0, form: 0 };
    }

    // Build daily TSS map for the last 60 days
    const now = new Date();
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const dailyTSS = {};
    for (let d = new Date(sixtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      dailyTSS[key] = 0;
    }

    // Sum TSS per day
    activities.forEach((activity) => {
      const date = new Date(activity.start_date).toISOString().split('T')[0];
      const tss = estimateTSS(activity);
      if (dailyTSS[date] !== undefined) {
        dailyTSS[date] += tss;
      }
    });

    const days = Object.keys(dailyTSS).sort();
    const tssValues = days.map((d) => dailyTSS[d]);

    // CTL: 42-day exponentially weighted average
    const ctlDecay = 1 / 42;
    let ctl = 0;
    tssValues.forEach((tss, index) => {
      const weight = Math.exp(-ctlDecay * (tssValues.length - index - 1));
      ctl += tss * weight;
    });
    ctl = Math.round(ctl * ctlDecay);

    // ATL: 7-day exponentially weighted average
    const recentTSS = tssValues.slice(-7);
    const atlDecay = 1 / 7;
    let atl = 0;
    recentTSS.forEach((tss, index) => {
      const weight = Math.exp(-atlDecay * (recentTSS.length - index - 1));
      atl += tss * weight;
    });
    atl = Math.round(atl * atlDecay);

    const form = ctl - atl;

    return { ctl, atl, form };
  };

  const { ctl, atl, form } = calculateMetrics();

  return (
    <Group gap="xl">
      <Box>
        <Text size="xs" style={{ color: tokens.colors.textMuted }}>CTL</Text>
        <Group gap={4} align="baseline">
          <Text fw={600} size="lg" style={{ color: tokens.colors.textPrimary }}>
            {ctl}
          </Text>
          {ctl > 0 && <IconTrendingUp size={14} color={tokens.colors.electricLime} />}
        </Group>
      </Box>
      <Box>
        <Text size="xs" style={{ color: tokens.colors.textMuted }}>ATL</Text>
        <Text fw={600} size="lg" style={{ color: tokens.colors.textPrimary }}>
          {atl}
        </Text>
      </Box>
      <Box>
        <Text size="xs" style={{ color: tokens.colors.textMuted }}>Form</Text>
        <Text fw={600} size="lg" style={{ color: form >= 0 ? tokens.colors.success : tokens.colors.warning }}>
          {form > 0 ? '+' : ''}{form}
        </Text>
      </Box>
    </Group>
  );
}

function EmptyState() {
  return (
    <Box
      style={{
        padding: tokens.spacing.xl,
        textAlign: 'center',
        borderRadius: tokens.radius.md,
        border: `1px dashed ${tokens.colors.border}`,
      }}
    >
      <Text size="lg" mb="sm">
        🚴
      </Text>
      <Text style={{ color: tokens.colors.textSecondary }}>
        No recent activities yet
      </Text>
      <Text size="sm" style={{ color: tokens.colors.textMuted }} mb="md">
        Connect your devices or upload a file to get started
      </Text>
      <Group justify="center" gap="sm">
        <Button component={Link} to="/settings" variant="light" color="lime" size="sm">
          Connect Strava
        </Button>
        <Button component={Link} to="/training?tab=history" variant="outline" color="gray" size="sm">
          Upload File
        </Button>
      </Group>
    </Box>
  );
}

function ActivityRow({ activity, formatDist, formatElev }) {
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const distanceKm = (activity.distance_meters || activity.distance || 0) / 1000;
  const duration = activity.duration_seconds || activity.moving_time || 0;
  const power = activity.average_power_watts || activity.average_watts || 0;
  const stravaActivityId = activity.provider === 'strava' ? activity.provider_activity_id : null;

  return (
    <Box
      p="sm"
      style={{
        backgroundColor: tokens.colors.bgTertiary,
        borderRadius: tokens.radius.md,
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="sm" wrap="nowrap">
            <Text fw={500} size="sm" lineClamp={1} style={{ color: tokens.colors.textPrimary }}>
              {activity.name || 'Ride'}
            </Text>
            {power > 0 && (
              <Badge size="xs" variant="light" color="yellow">
                {Math.round(power)}W
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            <Text size="xs" style={{ color: tokens.colors.textMuted }}>
              {formatDate(activity.start_date)}
            </Text>
            {stravaActivityId && <ViewOnStravaLink activityId={stravaActivityId} />}
          </Group>
        </Box>
        <Group gap="md" wrap="nowrap">
          <Text size="sm" fw={500} style={{ color: tokens.colors.textSecondary }}>
            {formatDist(distanceKm)}
          </Text>
          <Text size="sm" style={{ color: tokens.colors.textMuted }}>
            {formatDuration(duration)}
          </Text>
        </Group>
      </Group>
    </Box>
  );
}

export default Dashboard;
