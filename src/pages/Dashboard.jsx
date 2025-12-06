import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  Card,
  SimpleGrid,
  Stack,
  Group,
  Button,
  Box,
  Badge,
  Loader,
  Skeleton,
} from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { supabase } from '../lib/supabase';
import { formatDistance, formatElevation } from '../utils/units';

function Dashboard() {
  const { profile, user } = useAuth();
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Rider';
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    weekDistance: 0,
    monthTime: 0,
    totalActivities: 0,
  });

  // Get user's unit preference
  const isImperial = profile?.units_preference === 'imperial';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);

  // Fetch activities on mount
  useEffect(() => {
    const fetchActivities = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Get activities from last 90 days
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: activityData, error } = await supabase
          .from('activities')
          .select('*')
          .eq('user_id', user.id)
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        if (error) {
          console.error('Error loading activities:', error);
        } else {
          setActivities(activityData || []);

          // Calculate stats
          const now = new Date();
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          const monthAgo = new Date(now);
          monthAgo.setDate(monthAgo.getDate() - 30);

          let weekDistance = 0;
          let monthTime = 0;

          (activityData || []).forEach((activity) => {
            const activityDate = new Date(activity.start_date);
            const distanceKm = activity.distance ? activity.distance / 1000 : 0;
            const duration = activity.moving_time || 0;

            if (activityDate >= weekAgo) {
              weekDistance += distanceKm;
            }
            if (activityDate >= monthAgo) {
              monthTime += duration;
            }
          });

          setStats({
            weekDistance,
            monthTime: monthTime / 3600, // Convert to hours
            totalActivities: activityData?.length || 0,
          });
        }
      } catch (err) {
        console.error('Error fetching activities:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [user]);

  return (
    <AppShell>
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <Box>
            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
              Welcome back,
            </Text>
            <Title order={1} style={{ color: tokens.colors.textPrimary }}>
              {displayName}
            </Title>
          </Box>

          {/* Quick Actions */}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            <QuickActionCard
              title="Plan a Route"
              description="Create a new cycling route with our map builder"
              icon="🗺️"
              to="/routes"
              color={tokens.colors.electricLime}
            />
            <QuickActionCard
              title="Training"
              description="View your training stats and progress"
              icon="📊"
              to="/training"
              color={tokens.colors.zone4}
            />
            <QuickActionCard
              title="Connect Devices"
              description="Sync with Strava, Garmin, or Wahoo"
              icon="🔗"
              to="/settings"
              color={tokens.colors.info}
            />
            <QuickActionCard
              title="Settings"
              description="Manage your profile and preferences"
              icon="⚙️"
              to="/settings"
              color={tokens.colors.textSecondary}
            />
          </SimpleGrid>

          {/* Recent Activity */}
          <Card>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                  Recent Activity
                </Title>
                {activities.length > 0 && (
                  <Button
                    component={Link}
                    to="/training?tab=history"
                    variant="subtle"
                    color="lime"
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
                    <Skeleton key={i} height={80} radius="md" />
                  ))}
                </Stack>
              ) : activities.length === 0 ? (
                <Box
                  style={{
                    padding: tokens.spacing.xl,
                    textAlign: 'center',
                    borderRadius: tokens.radius.md,
                    border: `1px dashed ${tokens.colors.bgTertiary}`,
                  }}
                >
                  <Text size="lg" mb="sm">
                    🚴
                  </Text>
                  <Text style={{ color: tokens.colors.textSecondary }}>
                    No recent activities yet. Connect your devices to start syncing!
                  </Text>
                  <Button component={Link} to="/settings" variant="subtle" color="lime" mt="md">
                    Connect a device
                  </Button>
                </Box>
              ) : (
                <Stack gap="sm">
                  {activities.slice(0, 5).map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      formatDist={formatDist}
                      formatElev={formatElev}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          {/* Stats Overview */}
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            {loading ? (
              <>
                <Skeleton height={100} radius="md" />
                <Skeleton height={100} radius="md" />
                <Skeleton height={100} radius="md" />
              </>
            ) : (
              <>
                <StatCard
                  label="This Week"
                  value={formatDist(stats.weekDistance)}
                  subtext="Total Distance"
                />
                <StatCard
                  label="This Month"
                  value={`${stats.monthTime.toFixed(1)} hrs`}
                  subtext="Time on Bike"
                />
                <StatCard
                  label="Last 90 Days"
                  value={stats.totalActivities.toString()}
                  subtext="Activities"
                />
              </>
            )}
          </SimpleGrid>
        </Stack>
      </Container>
    </AppShell>
  );
}

function QuickActionCard({ title, description, icon, to, color }) {
  return (
    <Card
      component={Link}
      to={to}
      style={{
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 4px 20px ${color}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Stack gap="sm">
        <Text size="2rem">{icon}</Text>
        <Box>
          <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
            {title}
          </Text>
          <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
            {description}
          </Text>
        </Box>
      </Stack>
    </Card>
  );
}

function StatCard({ label, value, subtext }) {
  return (
    <Card>
      <Stack gap="xs">
        <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
          {label}
        </Text>
        <Text size="2rem" fw={700} style={{ color: tokens.colors.electricLime }}>
          {value}
        </Text>
        <Text size="sm" style={{ color: tokens.colors.textMuted }}>
          {subtext}
        </Text>
      </Stack>
    </Card>
  );
}

function ActivityCard({ activity, formatDist, formatElev }) {
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const distanceKm = activity.distance ? activity.distance / 1000 : 0;
  const elevation = activity.total_elevation_gain || 0;
  const duration = activity.moving_time || activity.elapsed_time || 0;

  return (
    <Card
      withBorder
      p="sm"
      style={{
        backgroundColor: tokens.colors.bgSecondary,
        borderColor: tokens.colors.bgTertiary,
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm" lineClamp={1} style={{ color: tokens.colors.textPrimary }}>
            {activity.name || 'Untitled Ride'}
          </Text>
          <Text size="xs" style={{ color: tokens.colors.textMuted }}>
            {formatDate(activity.start_date)}
          </Text>
        </Box>
        <Group gap="lg" wrap="nowrap">
          <Box style={{ textAlign: 'right' }}>
            <Text size="xs" style={{ color: tokens.colors.textMuted }}>Distance</Text>
            <Text fw={500} size="sm" style={{ color: tokens.colors.textPrimary }}>
              {formatDist(distanceKm)}
            </Text>
          </Box>
          <Box style={{ textAlign: 'right' }}>
            <Text size="xs" style={{ color: tokens.colors.textMuted }}>Elevation</Text>
            <Text fw={500} size="sm" style={{ color: tokens.colors.textPrimary }}>
              +{formatElev(elevation)}
            </Text>
          </Box>
          <Box style={{ textAlign: 'right' }}>
            <Text size="xs" style={{ color: tokens.colors.textMuted }}>Time</Text>
            <Text fw={500} size="sm" style={{ color: tokens.colors.textPrimary }}>
              {formatDuration(duration)}
            </Text>
          </Box>
          {activity.average_watts > 0 && (
            <Badge color="yellow" variant="light" size="sm">
              {Math.round(activity.average_watts)}W
            </Badge>
          )}
        </Group>
      </Group>
    </Card>
  );
}

export default Dashboard;
