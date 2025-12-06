import { useState, useEffect } from 'react';
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
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { IconRobot, IconBarbell, IconChartLine, IconListCheck, IconCalendarEvent, IconClock, IconFlame } from '@tabler/icons-react';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import AICoach from '../components/AICoach.jsx';
import TrainingLoadChart from '../components/TrainingLoadChart.jsx';
import TrainingCalendar from '../components/TrainingCalendar.jsx';
import { WORKOUT_LIBRARY, getWorkoutsByCategory } from '../data/workoutLibrary';
import { getAllPlans } from '../data/trainingPlanTemplates';
import { calculateCTL, calculateATL, calculateTSB, interpretTSB, estimateTSS } from '../utils/trainingPlans';

function TrainingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [speedProfile, setSpeedProfile] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('metric'); // 'metric' or 'imperial'
  const [ftp, setFtp] = useState(null);
  const [powerZones, setPowerZones] = useState(null);
  const [weeklyStats, setWeeklyStats] = useState({
    totalDistance: 0,
    totalTime: 0,
    totalElevation: 0,
    rideCount: 0,
  });
  const [trainingMetrics, setTrainingMetrics] = useState({
    ctl: 0,
    atl: 0,
    tsb: 0,
    interpretation: null,
  });
  const [dailyTSSData, setDailyTSSData] = useState([]);

  // Unit conversion helpers
  const isImperial = unitsPreference === 'imperial';
  const KM_TO_MILES = 0.621371;
  const M_TO_FEET = 3.28084;

  // Load activities from Supabase
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        // Get user's profile including units preference, FTP, and power zones
        const { data: userProfileData } = await supabase
          .from('user_profiles')
          .select('units_preference, ftp, power_zones')
          .eq('id', user.id)
          .single();

        if (userProfileData?.units_preference) {
          setUnitsPreference(userProfileData.units_preference);
        }
        if (userProfileData?.ftp) {
          setFtp(userProfileData.ftp);
        }
        if (userProfileData?.power_zones) {
          setPowerZones(userProfileData.power_zones);
        }

        // Get activities from last 90 days (to show more history)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: activityData, error: activityError } = await supabase
          .from('strava_activities')
          .select('*')
          .eq('user_id', user.id)
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        if (activityError) {
          console.error('Error loading activities:', activityError);
        } else {
          setActivities(activityData || []);

          // Calculate weekly stats (last 7 days)
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const weeklyActivities = (activityData || []).filter(
            (a) => new Date(a.start_date) >= sevenDaysAgo
          );

          const stats = weeklyActivities.reduce(
            (acc, activity) => ({
              totalDistance: acc.totalDistance + (activity.distance || 0),
              totalTime: acc.totalTime + (activity.moving_time || 0),
              totalElevation: acc.totalElevation + (activity.total_elevation_gain || 0),
              rideCount: acc.rideCount + 1,
            }),
            { totalDistance: 0, totalTime: 0, totalElevation: 0, rideCount: 0 }
          );

          setWeeklyStats(stats);

          // Calculate CTL/ATL/TSB from activities
          if (activityData && activityData.length > 0) {
            // Build daily TSS data for the last 90 days
            const dailyTSS = {};
            const today = new Date();

            // Initialize all days with 0 TSS
            for (let i = 0; i < 90; i++) {
              const date = new Date(today);
              date.setDate(date.getDate() - i);
              const dateStr = date.toISOString().split('T')[0];
              dailyTSS[dateStr] = { date: dateStr, tss: 0 };
            }

            // Add TSS from activities
            activityData.forEach((activity) => {
              const dateStr = activity.start_date.split('T')[0];
              if (dailyTSS[dateStr]) {
                // Use actual TSS if available, otherwise estimate from duration and intensity
                const activityTSS = activity.tss || estimateTSS(
                  activity.moving_time / 60, // duration in minutes
                  activity.average_watts && userProfileData?.ftp
                    ? activity.average_watts / userProfileData.ftp
                    : 0.65 // default IF for endurance ride
                );
                dailyTSS[dateStr].tss += activityTSS;
              }
            });

            // Convert to sorted array (oldest first for calculations)
            const sortedDailyTSS = Object.values(dailyTSS)
              .sort((a, b) => new Date(a.date) - new Date(b.date));

            setDailyTSSData(sortedDailyTSS);

            // Calculate CTL, ATL, TSB using the utility functions
            const tssValues = sortedDailyTSS.map(d => d.tss);
            const ctl = calculateCTL(tssValues);
            const atl = calculateATL(tssValues);
            const tsb = calculateTSB(ctl, atl);
            const interpretation = interpretTSB(tsb);

            setTrainingMetrics({ ctl, atl, tsb, interpretation });
          }
        }

        // Get speed profile
        const { data: profileData, error: profileError } = await supabase
          .from('user_speed_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (!profileError && profileData) {
          setSpeedProfile(profileData);
        }
      } catch (error) {
        console.error('Error loading training data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Format distance (meters to km or miles based on preference)
  const formatDistance = (meters) => {
    const km = meters / 1000;
    if (isImperial) {
      return (km * KM_TO_MILES).toFixed(1);
    }
    return km.toFixed(1);
  };

  // Get distance unit label
  const distanceUnit = isImperial ? 'mi' : 'km';

  // Format elevation (meters to feet based on preference)
  const formatElevation = (meters) => {
    if (isImperial) {
      return Math.round(meters * M_TO_FEET);
    }
    return Math.round(meters);
  };

  // Get elevation unit label
  const elevationUnit = isImperial ? 'ft' : 'm';

  // Format speed (km/h to mph based on preference)
  const formatSpeed = (kmh) => {
    if (isImperial) {
      return (kmh * KM_TO_MILES).toFixed(1);
    }
    return kmh.toFixed(1);
  };

  // Get speed unit label
  const speedUnit = isImperial ? 'mph' : 'km/h';

  // Format time (seconds to hours:minutes)
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  // Get activity type icon
  const getActivityIcon = (type) => {
    switch (type) {
      case 'Ride':
        return '🚴';
      case 'VirtualRide':
        return '🖥️';
      case 'GravelRide':
        return '🌲';
      case 'MountainBikeRide':
        return '⛰️';
      case 'EBikeRide':
        return '⚡';
      default:
        return '🚴';
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Container size="xl" py="xl">
          <Stack align="center" justify="center" style={{ minHeight: 400 }}>
            <Loader color="lime" size="lg" />
            <Text style={{ color: tokens.colors.textSecondary }}>Loading training data...</Text>
          </Stack>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <Group justify="space-between" align="flex-start">
            <Box>
              <Title order={1} style={{ color: tokens.colors.textPrimary }}>
                Training
              </Title>
              <Text style={{ color: tokens.colors.textSecondary }}>
                Track your performance and training progress
              </Text>
            </Box>
          </Group>

          {/* Weekly Overview */}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            <MetricCard
              label="Weekly Distance"
              value={`${formatDistance(weeklyStats.totalDistance)} ${distanceUnit}`}
              description="Last 7 days"
            />
            <MetricCard
              label="Weekly Time"
              value={formatTime(weeklyStats.totalTime)}
              description="Time in saddle"
            />
            <MetricCard
              label="Weekly Elevation"
              value={`${formatElevation(weeklyStats.totalElevation)} ${elevationUnit}`}
              description="Total climbing"
            />
            <MetricCard
              label="Rides This Week"
              value={weeklyStats.rideCount.toString()}
              description={`${activities.length} total (90 days)`}
            />
          </SimpleGrid>

          {/* Training Load Metrics */}
          {(trainingMetrics.ctl > 0 || trainingMetrics.atl > 0) && (
            <Card>
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                    Training Load
                  </Title>
                  {trainingMetrics.interpretation && (
                    <Badge
                      variant="filled"
                      color={trainingMetrics.interpretation.color}
                    >
                      {trainingMetrics.interpretation.status}
                    </Badge>
                  )}
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <Box
                    style={{
                      padding: tokens.spacing.md,
                      backgroundColor: tokens.colors.bgTertiary,
                      borderRadius: tokens.radius.md,
                      textAlign: 'center',
                    }}
                  >
                    <Text size="xs" style={{ color: tokens.colors.textMuted }} mb={4}>
                      CTL (Fitness)
                    </Text>
                    <Text size="xl" fw={700} style={{ color: tokens.colors.electricLime }}>
                      {Math.round(trainingMetrics.ctl)}
                    </Text>
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                      42-day avg TSS
                    </Text>
                  </Box>

                  <Box
                    style={{
                      padding: tokens.spacing.md,
                      backgroundColor: tokens.colors.bgTertiary,
                      borderRadius: tokens.radius.md,
                      textAlign: 'center',
                    }}
                  >
                    <Text size="xs" style={{ color: tokens.colors.textMuted }} mb={4}>
                      ATL (Fatigue)
                    </Text>
                    <Text size="xl" fw={700} style={{ color: tokens.colors.warning }}>
                      {Math.round(trainingMetrics.atl)}
                    </Text>
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                      7-day avg TSS
                    </Text>
                  </Box>

                  <Box
                    style={{
                      padding: tokens.spacing.md,
                      backgroundColor: tokens.colors.bgTertiary,
                      borderRadius: tokens.radius.md,
                      textAlign: 'center',
                    }}
                  >
                    <Text size="xs" style={{ color: tokens.colors.textMuted }} mb={4}>
                      TSB (Form)
                    </Text>
                    <Text
                      size="xl"
                      fw={700}
                      style={{
                        color: trainingMetrics.tsb >= 0
                          ? tokens.colors.success
                          : trainingMetrics.tsb > -20
                            ? tokens.colors.warning
                            : tokens.colors.error,
                      }}
                    >
                      {trainingMetrics.tsb > 0 ? '+' : ''}{Math.round(trainingMetrics.tsb)}
                    </Text>
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                      CTL - ATL
                    </Text>
                  </Box>
                </SimpleGrid>

                {trainingMetrics.interpretation && (
                  <Box
                    style={{
                      padding: tokens.spacing.sm,
                      backgroundColor: tokens.colors.bgSecondary,
                      borderRadius: tokens.radius.sm,
                      borderLeft: `3px solid ${
                        trainingMetrics.interpretation.color === 'green'
                          ? tokens.colors.success
                          : trainingMetrics.interpretation.color === 'yellow'
                            ? tokens.colors.warning
                            : trainingMetrics.interpretation.color === 'red'
                              ? tokens.colors.error
                              : tokens.colors.info
                      }`,
                    }}
                  >
                    <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                      {trainingMetrics.interpretation.message}
                    </Text>
                    <Text size="xs" style={{ color: tokens.colors.textMuted }} mt={4}>
                      {trainingMetrics.interpretation.recommendation}
                    </Text>
                  </Box>
                )}
              </Stack>
            </Card>
          )}

          {/* Training Load Chart */}
          {dailyTSSData.length > 0 && (
            <TrainingLoadChart data={dailyTSSData} />
          )}

          {/* Speed Profile */}
          {speedProfile && (
            <Card>
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                    Your Speed Profile
                  </Title>
                  <Badge variant="light" color="lime">
                    {speedProfile.rides_analyzed} rides analyzed
                  </Badge>
                </Group>

                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                  <Box>
                    <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                      Average Speed
                    </Text>
                    <Text size="xl" fw={700} style={{ color: tokens.colors.electricLime }}>
                      {formatSpeed(speedProfile.average_speed || 0)} {speedUnit}
                    </Text>
                  </Box>
                  {speedProfile.road_speed && (
                    <Box>
                      <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                        Road
                      </Text>
                      <Text size="xl" fw={700} style={{ color: tokens.colors.textPrimary }}>
                        {formatSpeed(speedProfile.road_speed)} {speedUnit}
                      </Text>
                    </Box>
                  )}
                  {speedProfile.gravel_speed && (
                    <Box>
                      <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                        Gravel
                      </Text>
                      <Text size="xl" fw={700} style={{ color: tokens.colors.textPrimary }}>
                        {formatSpeed(speedProfile.gravel_speed)} {speedUnit}
                      </Text>
                    </Box>
                  )}
                  {speedProfile.mtb_speed && (
                    <Box>
                      <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                        MTB
                      </Text>
                      <Text size="xl" fw={700} style={{ color: tokens.colors.textPrimary }}>
                        {formatSpeed(speedProfile.mtb_speed)} {speedUnit}
                      </Text>
                    </Box>
                  )}
                </SimpleGrid>

                <Group gap="lg">
                  <Box>
                    <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                      Avg Ride Duration
                    </Text>
                    <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                      {Math.round(speedProfile.avg_ride_duration || 0)} min
                    </Text>
                  </Box>
                  <Box>
                    <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                      Avg Elevation/{distanceUnit}
                    </Text>
                    <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                      {isImperial
                        ? ((speedProfile.avg_elevation_per_km || 0) * M_TO_FEET / KM_TO_MILES).toFixed(0)
                        : (speedProfile.avg_elevation_per_km || 0).toFixed(1)
                      } {elevationUnit}
                    </Text>
                  </Box>
                </Group>
              </Stack>
            </Card>
          )}

          {/* Recent Workouts */}
          <Card>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                  Recent Workouts
                </Title>
                <Badge variant="light" color="gray">
                  Last 90 days
                </Badge>
              </Group>

              {activities.length === 0 ? (
                <Box
                  style={{
                    padding: tokens.spacing.xl,
                    textAlign: 'center',
                    borderRadius: tokens.radius.md,
                    border: `1px dashed ${tokens.colors.bgTertiary}`,
                  }}
                >
                  <Text size="lg" mb="sm">
                    📊
                  </Text>
                  <Text style={{ color: tokens.colors.textSecondary }} mb="md">
                    No workouts found. Sync your Strava activities to see them here!
                  </Text>
                  <Button
                    variant="light"
                    color="lime"
                    onClick={() => navigate('/settings')}
                  >
                    Go to Settings
                  </Button>
                </Box>
              ) : (
                <Stack gap="xs">
                  {activities.slice(0, 10).map((activity) => (
                    <Box
                      key={activity.id}
                      style={{
                        padding: tokens.spacing.sm,
                        backgroundColor: tokens.colors.bgTertiary,
                        borderRadius: tokens.radius.sm,
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xl">{getActivityIcon(activity.type)}</Text>
                          <Box style={{ minWidth: 0, flex: 1 }}>
                            <Text
                              fw={600}
                              size="sm"
                              style={{
                                color: tokens.colors.textPrimary,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {activity.name}
                            </Text>
                            <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                              {formatDate(activity.start_date)}
                            </Text>
                          </Box>
                        </Group>
                        <Group gap="md" wrap="nowrap">
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
                              {formatDistance(activity.distance)} {distanceUnit}
                            </Text>
                            <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                              {formatTime(activity.moving_time)}
                            </Text>
                          </Box>
                          <Box style={{ textAlign: 'right', minWidth: 70 }}>
                            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                              {formatSpeed((activity.average_speed || 0) * 3.6)} {speedUnit}
                            </Text>
                            {activity.total_elevation_gain > 0 && (
                              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                                {formatElevation(activity.total_elevation_gain)}{elevationUnit} ↗
                              </Text>
                            )}
                          </Box>
                        </Group>
                      </Group>
                    </Box>
                  ))}
                  {activities.length > 10 && (
                    <Text size="sm" style={{ color: tokens.colors.textMuted, textAlign: 'center' }}>
                      + {activities.length - 10} more activities
                    </Text>
                  )}
                </Stack>
              )}
            </Stack>
          </Card>

          {/* Power Zones */}
          <Card>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                  Power Zones
                </Title>
                {ftp && (
                  <Badge variant="light" color="lime">
                    FTP: {ftp}W
                  </Badge>
                )}
              </Group>

              {!ftp ? (
                <Box
                  style={{
                    padding: tokens.spacing.lg,
                    textAlign: 'center',
                    borderRadius: tokens.radius.md,
                    border: `1px dashed ${tokens.colors.bgTertiary}`,
                  }}
                >
                  <Text size="lg" mb="sm">⚡</Text>
                  <Text style={{ color: tokens.colors.textSecondary }} mb="md">
                    Set your FTP in settings to see your personalized power zones
                  </Text>
                  <Button
                    variant="light"
                    color="lime"
                    onClick={() => navigate('/settings')}
                  >
                    Set FTP
                  </Button>
                </Box>
              ) : (
                <Stack gap="sm">
                  <ZoneBar
                    zone={1}
                    label="Recovery"
                    range="< 55%"
                    color={tokens.colors.zone1}
                    watts={powerZones?.z1 ? `0-${powerZones.z1.max}` : null}
                  />
                  <ZoneBar
                    zone={2}
                    label="Endurance"
                    range="55-75%"
                    color={tokens.colors.zone2}
                    watts={powerZones?.z2 ? `${powerZones.z2.min}-${powerZones.z2.max}` : null}
                  />
                  <ZoneBar
                    zone={3}
                    label="Tempo"
                    range="75-90%"
                    color={tokens.colors.zone3}
                    watts={powerZones?.z3 ? `${powerZones.z3.min}-${powerZones.z3.max}` : null}
                  />
                  <ZoneBar
                    zone={4}
                    label="Threshold"
                    range="90-105%"
                    color={tokens.colors.zone4}
                    watts={powerZones?.z4 ? `${powerZones.z4.min}-${powerZones.z4.max}` : null}
                  />
                  <ZoneBar
                    zone={5}
                    label="VO2max"
                    range="105-120%"
                    color={tokens.colors.zone5}
                    watts={powerZones?.z5 ? `${powerZones.z5.min}-${powerZones.z5.max}` : null}
                  />
                  <ZoneBar
                    zone={6}
                    label="Anaerobic"
                    range="120-150%"
                    color={tokens.colors.zone6}
                    watts={powerZones?.z6 ? `${powerZones.z6.min}-${powerZones.z6.max}` : null}
                  />
                  <ZoneBar
                    zone={7}
                    label="Neuromuscular"
                    range="> 150%"
                    color={tokens.colors.zone7}
                    watts={powerZones?.z7 ? `${powerZones.z7.min}+` : null}
                  />
                </Stack>
              )}
            </Stack>
          </Card>

          {/* Training Tools Section */}
          <Card>
            <Tabs defaultValue="coach" color="lime">
              <Tabs.List mb="md">
                <Tabs.Tab value="coach" leftSection={<IconRobot size={16} />}>
                  AI Coach
                </Tabs.Tab>
                <Tabs.Tab value="workouts" leftSection={<IconBarbell size={16} />}>
                  Workout Library
                </Tabs.Tab>
                <Tabs.Tab value="plans" leftSection={<IconCalendarEvent size={16} />}>
                  Training Plans
                </Tabs.Tab>
                <Tabs.Tab value="calendar" leftSection={<IconListCheck size={16} />}>
                  Calendar
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="coach">
                <AICoach
                  trainingContext={buildTrainingContext()}
                  onAddWorkout={(workout) => {
                    notifications.show({
                      title: 'Workout Added',
                      message: `${workout.name} has been added to your training plan`,
                      color: 'lime'
                    });
                  }}
                />
              </Tabs.Panel>

              <Tabs.Panel value="workouts">
                <WorkoutLibraryPanel />
              </Tabs.Panel>

              <Tabs.Panel value="plans">
                <TrainingPlansPanel />
              </Tabs.Panel>

              <Tabs.Panel value="calendar">
                <TrainingCalendar activePlan={null} rides={activities} />
              </Tabs.Panel>
            </Tabs>
          </Card>
        </Stack>
      </Container>
    </AppShell>
  );

  // Build training context for AI Coach
  function buildTrainingContext() {
    const context = [];

    if (ftp) {
      context.push(`FTP: ${ftp}W`);
    }

    // Add training load metrics
    if (trainingMetrics.ctl > 0 || trainingMetrics.atl > 0) {
      context.push(`Training Load - CTL: ${Math.round(trainingMetrics.ctl)}, ATL: ${Math.round(trainingMetrics.atl)}, TSB: ${Math.round(trainingMetrics.tsb)}`);
      if (trainingMetrics.interpretation) {
        context.push(`Form Status: ${trainingMetrics.interpretation.status} - ${trainingMetrics.interpretation.message}`);
      }
    }

    if (weeklyStats.rideCount > 0) {
      context.push(`This week: ${weeklyStats.rideCount} rides, ${formatDistance(weeklyStats.totalDistance)} ${distanceUnit}, ${formatTime(weeklyStats.totalTime)}`);
    }

    if (speedProfile) {
      context.push(`Average speed: ${formatSpeed(speedProfile.average_speed || 0)} ${speedUnit}`);
      context.push(`${speedProfile.rides_analyzed} rides analyzed`);
    }

    if (activities.length > 0) {
      const lastRide = activities[0];
      context.push(`Last ride: ${lastRide.name} on ${formatDate(lastRide.start_date)} - ${formatDistance(lastRide.distance)} ${distanceUnit}`);
    }

    return context.join('\n');
  }
}

function MetricCard({ label, value, change, description }) {
  return (
    <Card>
      <Stack gap="xs">
        <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
          {label}
        </Text>
        <Group gap="sm" align="baseline">
          <Text size="2rem" fw={700} style={{ color: tokens.colors.electricLime }}>
            {value}
          </Text>
          {change !== null && change !== undefined && (
            <Text
              size="sm"
              style={{ color: change >= 0 ? tokens.colors.success : tokens.colors.error }}
            >
              {change >= 0 ? '+' : ''}
              {change}
            </Text>
          )}
        </Group>
        <Text size="xs" style={{ color: tokens.colors.textMuted }}>
          {description}
        </Text>
      </Stack>
    </Card>
  );
}

function ZoneBar({ zone, label, range, color, watts }) {
  // Calculate a visual width based on zone (higher zones = wider bars for visual appeal)
  const zoneWidths = { 1: 40, 2: 55, 3: 70, 4: 85, 5: 95, 6: 100, 7: 100 };

  return (
    <Group gap="md">
      <Box style={{ width: 30, textAlign: 'center' }}>
        <Text fw={700} style={{ color }}>
          Z{zone}
        </Text>
      </Box>
      <Box style={{ flex: 1 }}>
        <Group justify="space-between" mb={4}>
          <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
            {label}
          </Text>
          <Text size="sm" style={{ color: tokens.colors.textMuted }}>
            {range}
          </Text>
        </Group>
        <Progress value={watts ? zoneWidths[zone] : 0} color={color} size="sm" radius="xl" />
      </Box>
      <Box style={{ width: 90, textAlign: 'right' }}>
        <Text size="sm" fw={watts ? 600 : 400} style={{ color: watts ? tokens.colors.textPrimary : tokens.colors.textMuted }}>
          {watts ? `${watts}W` : '-- W'}
        </Text>
      </Box>
    </Group>
  );
}

// Training Plans Panel Component
function TrainingPlansPanel() {
  const [selectedGoal, setSelectedGoal] = useState('all');
  const plans = getAllPlans();

  const goals = [
    { value: 'all', label: 'All Plans' },
    { value: 'general_fitness', label: 'General Fitness' },
    { value: 'century', label: 'Century/Gran Fondo' },
    { value: 'climbing', label: 'Climbing' },
    { value: 'racing', label: 'Racing' },
  ];

  const filteredPlans = selectedGoal === 'all'
    ? plans
    : plans.filter(plan => plan.goal === selectedGoal);

  const getMethodologyColor = (methodology) => {
    const colors = {
      polarized: 'blue',
      sweet_spot: 'lime',
      pyramidal: 'cyan',
      threshold: 'yellow',
      endurance: 'gray',
    };
    return colors[methodology] || 'gray';
  };

  const getFitnessLevelBadge = (level) => {
    const colors = {
      beginner: 'green',
      intermediate: 'yellow',
      advanced: 'red',
    };
    return colors[level] || 'gray';
  };

  return (
    <Stack gap="md">
      {/* Goal Filter */}
      <Group gap="xs" wrap="wrap">
        {goals.map((goal) => (
          <Button
            key={goal.value}
            size="xs"
            variant={selectedGoal === goal.value ? 'filled' : 'light'}
            color={selectedGoal === goal.value ? 'lime' : 'gray'}
            onClick={() => setSelectedGoal(goal.value)}
          >
            {goal.label}
          </Button>
        ))}
      </Group>

      {/* Plans List */}
      <Stack gap="sm">
        {filteredPlans.map((plan) => (
          <Paper
            key={plan.id}
            p="md"
            style={{
              backgroundColor: tokens.colors.bgTertiary,
              border: `1px solid ${tokens.colors.bgTertiary}`,
            }}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box style={{ flex: 1 }}>
                  <Group gap="xs" mb={4}>
                    <Text fw={600} size="md" style={{ color: tokens.colors.textPrimary }}>
                      {plan.name}
                    </Text>
                  </Group>
                  <Group gap="sm" mb="xs">
                    <Badge size="xs" color={getMethodologyColor(plan.methodology)}>
                      {plan.methodology.replace('_', ' ')}
                    </Badge>
                    <Badge size="xs" color={getFitnessLevelBadge(plan.fitnessLevel)}>
                      {plan.fitnessLevel}
                    </Badge>
                  </Group>
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }} mb="xs">
                    {plan.description}
                  </Text>
                </Box>
              </Group>

              {/* Plan Details */}
              <Group gap="lg">
                <Group gap={4}>
                  <IconCalendarEvent size={14} style={{ color: tokens.colors.textMuted }} />
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                    {plan.duration} weeks
                  </Text>
                </Group>
                <Group gap={4}>
                  <IconClock size={14} style={{ color: tokens.colors.textMuted }} />
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                    {plan.hoursPerWeek.min}-{plan.hoursPerWeek.max} hrs/week
                  </Text>
                </Group>
                <Group gap={4}>
                  <IconFlame size={14} style={{ color: tokens.colors.textMuted }} />
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                    {plan.weeklyTSS.min}-{plan.weeklyTSS.max} TSS/week
                  </Text>
                </Group>
              </Group>

              {/* Phases */}
              <Box>
                <Text size="xs" fw={500} style={{ color: tokens.colors.textMuted }} mb={4}>
                  Phases:
                </Text>
                <Group gap="xs" wrap="wrap">
                  {plan.phases.map((phase, index) => (
                    <Badge
                      key={index}
                      size="xs"
                      variant="light"
                      color={
                        phase.phase === 'base' ? 'blue' :
                        phase.phase === 'build' ? 'yellow' :
                        phase.phase === 'peak' ? 'orange' :
                        phase.phase === 'recovery' ? 'green' :
                        phase.phase === 'taper' ? 'gray' : 'gray'
                      }
                    >
                      {phase.phase}: {phase.focus}
                    </Badge>
                  ))}
                </Group>
              </Box>

              {/* Expected Gains */}
              {plan.expectedGains && (
                <Box>
                  <Text size="xs" fw={500} style={{ color: tokens.colors.textMuted }} mb={4}>
                    Expected Gains:
                  </Text>
                  <Group gap="xs" wrap="wrap">
                    {Object.entries(plan.expectedGains).map(([key, value]) => (
                      <Badge key={key} size="xs" variant="outline" color="lime">
                        {key.replace(/_/g, ' ')}: {value}
                      </Badge>
                    ))}
                  </Group>
                </Box>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>

      {filteredPlans.length === 0 && (
        <Box
          style={{
            padding: tokens.spacing.xl,
            textAlign: 'center',
            borderRadius: tokens.radius.md,
            border: `1px dashed ${tokens.colors.bgTertiary}`,
          }}
        >
          <Text style={{ color: tokens.colors.textMuted }}>
            No training plans match this filter
          </Text>
        </Box>
      )}
    </Stack>
  );
}

// Workout Library Panel Component
function WorkoutLibraryPanel() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { value: 'all', label: 'All Workouts' },
    { value: 'recovery', label: 'Recovery' },
    { value: 'endurance', label: 'Endurance' },
    { value: 'tempo', label: 'Tempo' },
    { value: 'sweet_spot', label: 'Sweet Spot' },
    { value: 'threshold', label: 'Threshold' },
    { value: 'vo2max', label: 'VO2max' },
    { value: 'climbing', label: 'Climbing' },
    { value: 'anaerobic', label: 'Anaerobic' },
    { value: 'racing', label: 'Racing' },
  ];

  const filteredWorkouts = selectedCategory === 'all'
    ? Object.values(WORKOUT_LIBRARY)
    : getWorkoutsByCategory(selectedCategory);

  const getCategoryColor = (category) => {
    const colors = {
      recovery: 'gray',
      endurance: 'blue',
      tempo: 'cyan',
      sweet_spot: 'lime',
      threshold: 'yellow',
      vo2max: 'orange',
      climbing: 'grape',
      anaerobic: 'red',
      racing: 'pink',
    };
    return colors[category] || 'gray';
  };

  return (
    <Stack gap="md">
      {/* Category Filter */}
      <Group gap="xs" wrap="wrap">
        {categories.map((cat) => (
          <Button
            key={cat.value}
            size="xs"
            variant={selectedCategory === cat.value ? 'filled' : 'light'}
            color={selectedCategory === cat.value ? 'lime' : 'gray'}
            onClick={() => setSelectedCategory(cat.value)}
          >
            {cat.label}
          </Button>
        ))}
      </Group>

      {/* Workout List */}
      <Stack gap="sm">
        {filteredWorkouts.map((workout) => (
          <Paper
            key={workout.id}
            p="sm"
            style={{
              backgroundColor: tokens.colors.bgTertiary,
              border: `1px solid ${tokens.colors.bgTertiary}`,
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Box style={{ flex: 1 }}>
                <Group gap="xs" mb={4}>
                  <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary }}>
                    {workout.name}
                  </Text>
                  <Badge size="xs" color={getCategoryColor(workout.category)}>
                    {workout.category.replace('_', ' ')}
                  </Badge>
                </Group>
                <Group gap="lg" mb="xs">
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                    {workout.duration} min
                  </Text>
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                    {workout.targetTSS} TSS
                  </Text>
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                    IF: {workout.intensityFactor}
                  </Text>
                </Group>
                {workout.coachNotes && (
                  <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                    {workout.coachNotes}
                  </Text>
                )}
              </Box>
            </Group>
          </Paper>
        ))}
      </Stack>

      {filteredWorkouts.length === 0 && (
        <Box
          style={{
            padding: tokens.spacing.xl,
            textAlign: 'center',
            borderRadius: tokens.radius.md,
            border: `1px dashed ${tokens.colors.bgTertiary}`,
          }}
        >
          <Text style={{ color: tokens.colors.textMuted }}>
            No workouts in this category
          </Text>
        </Box>
      )}
    </Stack>
  );
}

export default TrainingDashboard;
