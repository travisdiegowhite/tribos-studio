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
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';

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
          <Box>
            <Title order={1} style={{ color: tokens.colors.textPrimary }}>
              Training
            </Title>
            <Text style={{ color: tokens.colors.textSecondary }}>
              Track your performance and training progress
            </Text>
          </Box>

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
        </Stack>
      </Container>
    </AppShell>
  );
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

export default TrainingDashboard;
