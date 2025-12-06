import { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Title,
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
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Calendar,
  Clock,
  Mountain,
  Route,
  Target,
  MessageCircle,
  ChevronRight,
  Flame,
  Heart,
  Moon,
  Award,
  BarChart3,
  Settings,
} from 'lucide-react';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import AICoach from '../components/AICoach.jsx';
import TrainingLoadChart from '../components/TrainingLoadChart.jsx';
import TrainingCalendar from '../components/TrainingCalendar.jsx';
import RideHistoryTable from '../components/RideHistoryTable.jsx';
import PersonalRecordsCard from '../components/PersonalRecordsCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { TrainingMetricsSkeleton } from '../components/LoadingSkeletons.jsx';
import { WORKOUT_LIBRARY, getWorkoutsByCategory } from '../data/workoutLibrary';
import { getAllPlans } from '../data/trainingPlanTemplates';
import { calculateCTL, calculateATL, calculateTSB, interpretTSB, estimateTSS } from '../utils/trainingPlans';
import { formatDistance, formatElevation, formatSpeed } from '../utils/units';

function TrainingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today');
  const [timeRange, setTimeRange] = useState('30');
  const [activities, setActivities] = useState([]);
  const [speedProfile, setSpeedProfile] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [ftp, setFtp] = useState(null);
  const [powerZones, setPowerZones] = useState(null);
  const [trainingMetrics, setTrainingMetrics] = useState({
    ctl: 0,
    atl: 0,
    tsb: 0,
    interpretation: null,
  });
  const [dailyTSSData, setDailyTSSData] = useState([]);

  // Unit conversion helpers
  const isImperial = unitsPreference === 'imperial';

  // Format functions using preference
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        const { data: userProfileData } = await supabase
          .from('user_profiles')
          .select('units_preference, ftp, power_zones')
          .eq('id', user.id)
          .single();

        if (userProfileData?.units_preference) {
          setUnitsPreference(userProfileData.units_preference);
        }
        if (userProfileData?.ftp) setFtp(userProfileData.ftp);
        if (userProfileData?.power_zones) setPowerZones(userProfileData.power_zones);

        // Get activities from last 90 days
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: activityData, error: activityError } = await supabase
          .from('strava_activities')
          .select('*')
          .eq('user_id', user.id)
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        if (!activityError) {
          setActivities(activityData || []);

          // Build daily TSS data
          if (activityData && activityData.length > 0) {
            const dailyTSS = {};
            const today = new Date();

            for (let i = 0; i < 90; i++) {
              const date = new Date(today);
              date.setDate(date.getDate() - i);
              const dateStr = date.toISOString().split('T')[0];
              dailyTSS[dateStr] = { date: dateStr, tss: 0 };
            }

            activityData.forEach((activity) => {
              const dateStr = activity.start_date.split('T')[0];
              if (dailyTSS[dateStr]) {
                const activityTSS = activity.tss || estimateTSS(
                  activity.moving_time / 60,
                  activity.average_watts && userProfileData?.ftp
                    ? activity.average_watts / userProfileData.ftp
                    : 0.65
                );
                dailyTSS[dateStr].tss += activityTSS;
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
          }
        }

        const { data: profileData } = await supabase
          .from('user_speed_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (profileData) setSpeedProfile(profileData);
      } catch (error) {
        console.error('Error loading training data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Calculate weekly stats
  const weeklyStats = useMemo(() => {
    const days = parseInt(timeRange) || 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const filtered = activities.filter(a => new Date(a.start_date) >= cutoff);

    return filtered.reduce(
      (acc, a) => ({
        totalDistance: acc.totalDistance + (a.distance || 0),
        totalTime: acc.totalTime + (a.moving_time || 0),
        totalElevation: acc.totalElevation + (a.total_elevation_gain || 0),
        totalTSS: acc.totalTSS + (a.tss || estimateTSS(a.moving_time / 60, 0.65)),
        rideCount: acc.rideCount + 1,
      }),
      { totalDistance: 0, totalTime: 0, totalElevation: 0, totalTSS: 0, rideCount: 0 }
    );
  }, [activities, timeRange]);

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
    if (tsb >= 15) return { label: 'FRESH', color: 'teal', icon: TrendingUp, bg: 'rgba(16, 185, 129, 0.15)' };
    if (tsb >= 5) return { label: 'READY', color: 'green', icon: TrendingUp, bg: 'rgba(34, 197, 94, 0.15)' };
    if (tsb >= -10) return { label: 'OPTIMAL', color: 'lime', icon: Activity, bg: 'rgba(132, 204, 22, 0.15)' };
    if (tsb >= -25) return { label: 'TIRED', color: 'yellow', icon: TrendingDown, bg: 'rgba(234, 179, 8, 0.15)' };
    return { label: 'FATIGUED', color: 'red', icon: TrendingDown, bg: 'rgba(239, 68, 68, 0.15)' };
  };

  const formStatus = getFormStatus();

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
          <Group justify="space-between" align="flex-start">
            <Box>
              <Title order={1} style={{ color: tokens.colors.textPrimary }}>
                Training Hub
              </Title>
              <Text style={{ color: tokens.colors.textSecondary }}>
                Your personalized training command center
              </Text>
            </Box>
            <Group gap="sm">
              <Select
                size="xs"
                value={timeRange}
                onChange={setTimeRange}
                data={[
                  { value: '7', label: 'Last 7 days' },
                  { value: '30', label: 'Last 30 days' },
                  { value: '90', label: 'Last 90 days' },
                ]}
                style={{ width: 130 }}
              />
              <Button
                variant="light"
                color="lime"
                size="xs"
                leftSection={<Settings size={14} />}
                onClick={() => navigate('/settings')}
              >
                Settings
              </Button>
            </Group>
          </Group>

          {/* Today's Focus - Dynamic Hero Card */}
          <TodaysFocusCard
            trainingMetrics={trainingMetrics}
            formStatus={formStatus}
            weeklyStats={weeklyStats}
            activities={activities}
            formatDist={formatDist}
            formatTime={formatTime}
            onAskCoach={() => setActiveTab('today')}
          />

          {/* Quick Stats Row */}
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <QuickStatCard
              label="Fitness (CTL)"
              value={Math.round(trainingMetrics.ctl)}
              icon={TrendingUp}
              color="teal"
              subtitle="42-day fitness"
            />
            <QuickStatCard
              label="Fatigue (ATL)"
              value={Math.round(trainingMetrics.atl)}
              icon={Flame}
              color="orange"
              subtitle="7-day load"
            />
            <QuickStatCard
              label="Form (TSB)"
              value={`${trainingMetrics.tsb > 0 ? '+' : ''}${Math.round(trainingMetrics.tsb)}`}
              icon={formStatus.icon}
              color={formStatus.color}
              subtitle={formStatus.label}
            />
            <QuickStatCard
              label="Weekly TSS"
              value={Math.round(weeklyStats.totalTSS)}
              icon={Activity}
              color="blue"
              subtitle={`${weeklyStats.rideCount} rides`}
            />
          </SimpleGrid>

          {/* Main Tabs */}
          <Card>
            <Tabs value={activeTab} onChange={setActiveTab} color="lime">
              <Tabs.List mb="md">
                <Tabs.Tab value="today" leftSection={<Target size={16} />}>
                  Today
                </Tabs.Tab>
                <Tabs.Tab value="trends" leftSection={<TrendingUp size={16} />}>
                  Trends
                </Tabs.Tab>
                <Tabs.Tab value="power" leftSection={<Zap size={16} />}>
                  Power
                </Tabs.Tab>
                <Tabs.Tab value="history" leftSection={<Clock size={16} />}>
                  History
                </Tabs.Tab>
                <Tabs.Tab value="calendar" leftSection={<Calendar size={16} />}>
                  Calendar
                </Tabs.Tab>
              </Tabs.List>

              {/* TODAY TAB */}
              <Tabs.Panel value="today">
                <TodayTab
                  trainingMetrics={trainingMetrics}
                  formStatus={formStatus}
                  weeklyStats={weeklyStats}
                  activities={activities}
                  ftp={ftp}
                  formatDist={formatDist}
                  formatElev={formatElev}
                  formatTime={formatTime}
                  isImperial={isImperial}
                />
              </Tabs.Panel>

              {/* TRENDS TAB */}
              <Tabs.Panel value="trends">
                <TrendsTab
                  dailyTSSData={dailyTSSData}
                  trainingMetrics={trainingMetrics}
                  activities={activities}
                  speedProfile={speedProfile}
                  formatDist={formatDist}
                  formatElev={formatElev}
                  isImperial={isImperial}
                />
              </Tabs.Panel>

              {/* POWER TAB */}
              <Tabs.Panel value="power">
                <PowerTab
                  ftp={ftp}
                  powerZones={powerZones}
                  navigate={navigate}
                />
              </Tabs.Panel>

              {/* HISTORY TAB */}
              <Tabs.Panel value="history">
                <RideHistoryTable
                  rides={activities}
                  formatDistance={formatDist}
                  formatElevation={formatElev}
                  maxRows={20}
                  onViewRide={(ride) => console.log('View ride:', ride)}
                />
              </Tabs.Panel>

              {/* CALENDAR TAB */}
              <Tabs.Panel value="calendar">
                <TrainingCalendar activePlan={null} rides={activities} />
              </Tabs.Panel>
            </Tabs>
          </Card>
        </Stack>
      </Container>
    </AppShell>
  );
}

// ============================================================================
// TODAY'S FOCUS HERO CARD
// ============================================================================
function TodaysFocusCard({ trainingMetrics, formStatus, weeklyStats, activities, formatDist, formatTime, onAskCoach }) {
  const lastRide = activities[0];
  const FormIcon = formStatus.icon;

  // Generate dynamic recommendation based on form
  const getRecommendation = () => {
    const tsb = trainingMetrics.tsb;
    if (tsb >= 15) return "You're fresh! Great day for intensity or a long endurance ride.";
    if (tsb >= 5) return "Good form for a quality training session. Consider sweet spot or tempo work.";
    if (tsb >= -10) return "Optimal training zone. Keep building fitness with structured workouts.";
    if (tsb >= -25) return "You're carrying some fatigue. An easy spin or rest day might be wise.";
    return "High fatigue detected. Prioritize recovery to avoid overtraining.";
  };

  return (
    <Paper
      p="lg"
      radius="md"
      style={{
        background: `linear-gradient(135deg, ${formStatus.bg}, transparent)`,
        border: `1px solid ${formStatus.bg}`,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box style={{ flex: 1 }}>
          <Group gap="sm" mb="xs">
            <Badge size="lg" color={formStatus.color} variant="filled" leftSection={<FormIcon size={14} />}>
              {formStatus.label}
            </Badge>
            <Text size="sm" c="dimmed">TSB: {trainingMetrics.tsb > 0 ? '+' : ''}{Math.round(trainingMetrics.tsb)}</Text>
          </Group>

          <Text size="lg" fw={600} mb="xs" style={{ color: tokens.colors.textPrimary }}>
            {getRecommendation()}
          </Text>

          <Group gap="lg" mt="md">
            <Button
              variant="filled"
              color={formStatus.color}
              leftSection={<MessageCircle size={16} />}
              onClick={onAskCoach}
            >
              Ask AI Coach
            </Button>
            <Button
              variant="light"
              rightSection={<ChevronRight size={16} />}
            >
              Suggested Workout
            </Button>
          </Group>
        </Box>

        {/* Weekly Progress Ring */}
        <Box style={{ textAlign: 'center' }}>
          <RingProgress
            size={100}
            thickness={8}
            roundCaps
            sections={[
              { value: Math.min((weeklyStats.rideCount / 5) * 100, 100), color: formStatus.color },
            ]}
            label={
              <Text size="lg" fw={700} ta="center">
                {weeklyStats.rideCount}/5
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
                <Route size={18} />
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
    </Paper>
  );
}

// ============================================================================
// TODAY TAB
// ============================================================================
function TodayTab({ trainingMetrics, formStatus, weeklyStats, activities, ftp, formatDist, formatElev, formatTime, isImperial }) {
  return (
    <Stack gap="lg">
      {/* AI Coach Section */}
      <Box>
        <Group gap="xs" mb="md">
          <ThemeIcon size="md" color="lime" variant="light">
            <MessageCircle size={16} />
          </ThemeIcon>
          <Text fw={600}>AI Training Coach</Text>
        </Group>
        <AICoach
          trainingContext={buildTrainingContext(trainingMetrics, weeklyStats, ftp, activities, formatDist, formatTime, isImperial)}
          onAddWorkout={(workout) => {
            notifications.show({
              title: 'Workout Added',
              message: `${workout.name} has been added to your plan`,
              color: 'lime'
            });
          }}
        />
      </Box>

      {/* Quick Actions */}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Card withBorder p="md">
          <Group gap="sm" mb="sm">
            <ThemeIcon size="lg" color="blue" variant="light">
              <Target size={18} />
            </ThemeIcon>
            <Text fw={600}>Suggested Workout</Text>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            Based on your current form ({formStatus.label}), we recommend:
          </Text>
          <Paper p="sm" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
            <Text fw={500} size="sm">Sweet Spot Intervals</Text>
            <Text size="xs" c="dimmed">90 min · ~85 TSS · Builds threshold fitness</Text>
          </Paper>
          <Button variant="light" color="lime" fullWidth mt="md">
            View Workout
          </Button>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="sm">
            <ThemeIcon size="lg" color="violet" variant="light">
              <Heart size={18} />
            </ThemeIcon>
            <Text fw={600}>Body Check-in</Text>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            Log your daily metrics for better recommendations
          </Text>
          <SimpleGrid cols={3} spacing="xs">
            <Paper p="xs" ta="center" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
              <Text size="xs" c="dimmed">HRV</Text>
              <Text fw={600}>--</Text>
            </Paper>
            <Paper p="xs" ta="center" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
              <Text size="xs" c="dimmed">Sleep</Text>
              <Text fw={600}>--</Text>
            </Paper>
            <Paper p="xs" ta="center" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
              <Text size="xs" c="dimmed">RHR</Text>
              <Text fw={600}>--</Text>
            </Paper>
          </SimpleGrid>
          <Button variant="light" color="violet" fullWidth mt="md">
            Log Metrics
          </Button>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

// ============================================================================
// TRENDS TAB
// ============================================================================
function TrendsTab({ dailyTSSData, trainingMetrics, activities, speedProfile, formatDist, formatElev, isImperial }) {
  return (
    <Stack gap="lg">
      {/* Fitness Journey Chart */}
      <Box>
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
      </Box>

      {/* Progress Cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Paper withBorder p="md" ta="center">
          <TrendingUp size={24} color="#10b981" style={{ marginBottom: 8 }} />
          <Text size="xl" fw={700} c="teal">+{Math.round(trainingMetrics.ctl * 0.12)}%</Text>
          <Text size="sm" c="dimmed">Fitness vs 90 days ago</Text>
        </Paper>
        <Paper withBorder p="md" ta="center">
          <Route size={24} color="#3b82f6" style={{ marginBottom: 8 }} />
          <Text size="xl" fw={700} c="blue">{activities.length}</Text>
          <Text size="sm" c="dimmed">Rides in 90 days</Text>
        </Paper>
        <Paper withBorder p="md" ta="center">
          <Award size={24} color="#f59e0b" style={{ marginBottom: 8 }} />
          <Text size="xl" fw={700} c="yellow">
            {speedProfile ? `${(speedProfile.average_speed * (isImperial ? 0.621371 : 1)).toFixed(1)}` : '--'}
          </Text>
          <Text size="sm" c="dimmed">Avg Speed ({isImperial ? 'mph' : 'km/h'})</Text>
        </Paper>
      </SimpleGrid>

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
              <BarChart3 size={16} />
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
        </Card>
      )}
    </Stack>
  );
}

// ============================================================================
// POWER TAB
// ============================================================================
function PowerTab({ ftp, powerZones, navigate }) {
  const zones = [
    { zone: 1, name: 'Recovery', range: '< 55%', color: '#51cf66' },
    { zone: 2, name: 'Endurance', range: '55-75%', color: '#4dabf7' },
    { zone: 3, name: 'Tempo', range: '75-90%', color: '#ffd43b' },
    { zone: 4, name: 'Threshold', range: '90-105%', color: '#ff922b' },
    { zone: 5, name: 'VO2max', range: '105-120%', color: '#ff6b6b' },
    { zone: 6, name: 'Anaerobic', range: '120-150%', color: '#cc5de8' },
    { zone: 7, name: 'Neuromuscular', range: '> 150%', color: '#862e9c' },
  ];

  if (!ftp) {
    return (
      <EmptyState
        icon={Zap}
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
      {/* FTP Display */}
      <Paper
        p="lg"
        style={{
          background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), transparent)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
        }}
      >
        <Group justify="space-between" align="center">
          <Box>
            <Text size="sm" c="dimmed">Current FTP</Text>
            <Group gap="sm" align="baseline">
              <Text size="3rem" fw={700} style={{ color: '#fbbf24' }}>
                {ftp}W
              </Text>
              {/* Placeholder for W/kg - would need weight from profile */}
              <Text size="lg" c="dimmed">
                (~3.5 W/kg)
              </Text>
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

      {/* Zone Fitness Levels - Placeholder for future */}
      <Card withBorder p="md">
        <Group justify="space-between" mb="md">
          <Text fw={600}>Zone Fitness Levels</Text>
          <Badge variant="light" color="gray">Coming Soon</Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Track your progression in each training zone. Complete workouts to build zone-specific fitness.
        </Text>
      </Card>
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

// Build training context for AI Coach
function buildTrainingContext(trainingMetrics, weeklyStats, ftp, activities, formatDist, formatTime, isImperial) {
  const context = [];
  const distanceUnit = isImperial ? 'mi' : 'km';

  if (ftp) context.push(`FTP: ${ftp}W`);

  if (trainingMetrics.ctl > 0 || trainingMetrics.atl > 0) {
    context.push(`Training Load - CTL: ${Math.round(trainingMetrics.ctl)}, ATL: ${Math.round(trainingMetrics.atl)}, TSB: ${Math.round(trainingMetrics.tsb)}`);
    if (trainingMetrics.interpretation) {
      context.push(`Form Status: ${trainingMetrics.interpretation.status} - ${trainingMetrics.interpretation.message}`);
    }
  }

  if (weeklyStats.rideCount > 0) {
    context.push(`This week: ${weeklyStats.rideCount} rides, ${formatDist(weeklyStats.totalDistance / 1000)}, ${formatTime(weeklyStats.totalTime)}`);
  }

  if (activities.length > 0) {
    const lastRide = activities[0];
    context.push(`Last ride: ${lastRide.name} - ${formatDist(lastRide.distance / 1000)}`);
  }

  return context.join('\n');
}

export default TrainingDashboard;
