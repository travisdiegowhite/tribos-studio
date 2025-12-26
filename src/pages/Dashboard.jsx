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
  Skeleton,
} from '@mantine/core';
import { IconChevronRight, IconRoute, IconChartLine, IconSettings, IconPlus } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import OnboardingModal from '../components/OnboardingModal.jsx';
import RecentRidesMap from '../components/RecentRidesMap.jsx';
import FormWidget from '../components/FormWidget.jsx';
import WeekSummary from '../components/WeekSummary.jsx';
import { supabase } from '../lib/supabase';
import { formatDistance, formatElevation } from '../utils/units';

function Dashboard() {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  // Check if onboarding is needed and load user profile
  useEffect(() => {
    const checkOnboardingAndLoadProfile = async () => {
      if (!user) return;

      // Simple check: if user has seen the popup before, don't show it again
      const hasSeenWelcome = localStorage.getItem(`tribos_welcome_seen_${user.id}`);
      if (hasSeenWelcome) {
        // Still load profile for display name/units, but don't show onboarding
        try {
          const { data } = await supabase
            .from('user_profiles')
            .select('onboarding_completed, full_name, units_preference')
            .eq('id', user.id)
            .single();
          if (data) {
            setUserProfile(data);
          }
        } catch {
          // Profile load failed, that's ok
        }
        return;
      }

      // First time user - show onboarding and mark as seen
      localStorage.setItem(`tribos_welcome_seen_${user.id}`, 'true');
      setShowOnboarding(true);

      // Try to load profile data
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('onboarding_completed, full_name, units_preference')
          .eq('id', user.id)
          .single();
        if (data) {
          setUserProfile(data);
        }
      } catch {
        // Profile doesn't exist yet, that's expected for new users
      }
    };

    checkOnboardingAndLoadProfile();
  }, [user]);

  // Get display name from loaded profile
  const displayName = userProfile?.full_name || user?.email?.split('@')[0] || 'Rider';

  // Get user's unit preference from loaded profile (default to imperial if not set)
  const isImperial = userProfile?.units_preference !== 'metric';
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
        // Get activities from last 90 days for CTL/ATL calculation
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
        }
      } catch (err) {
        console.error('Error fetching activities:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [user]);

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <AppShell>
      <OnboardingModal
        opened={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <Box>
            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
              {getGreeting()},
            </Text>
            <Title order={1} style={{ color: tokens.colors.textPrimary }}>
              {displayName}
            </Title>
          </Box>

          {/* Main Content - Two Column Layout */}
          <Box className="dashboard-grid">
            {/* Left Column - Map & Actions */}
            <Stack gap="lg">
              <RecentRidesMap
                activities={activities}
                loading={loading}
                formatDist={formatDist}
                formatElev={formatElev}
              />

              {/* Quick Actions */}
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                <QuickActionButton
                  icon={IconRoute}
                  label="Plan Route"
                  to="/routes"
                  color={tokens.colors.electricLime}
                />
                <QuickActionButton
                  icon={IconChartLine}
                  label="Training"
                  to="/training"
                  color={tokens.colors.zone4}
                />
                <QuickActionButton
                  icon={IconPlus}
                  label="Upload Ride"
                  to="/training?tab=history"
                  color={tokens.colors.info}
                />
                <QuickActionButton
                  icon={IconSettings}
                  label="Settings"
                  to="/settings"
                  color={tokens.colors.textSecondary}
                />
              </SimpleGrid>
            </Stack>

            {/* Right Column - Stats */}
            <Stack gap="lg">
              <FormWidget activities={activities} loading={loading} />
              <WeekSummary
                activities={activities}
                loading={loading}
                formatDist={formatDist}
                formatElev={formatElev}
              />
            </Stack>
          </Box>

          {/* Recent Activities List */}
          <Card>
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  Recent Activity
                </Text>
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
                    <Skeleton key={i} height={70} radius="md" />
                  ))}
                </Stack>
              ) : activities.length === 0 ? (
                <EmptyState />
              ) : (
                <Stack gap="sm">
                  {activities.slice(0, 5).map((activity) => (
                    <ActivityRow
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
        </Stack>
      </Container>
    </AppShell>
  );
}

function QuickActionButton({ icon: Icon, label, to, color }) {
  return (
    <Card
      component={Link}
      to={to}
      p="md"
      style={{
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'transform 0.2s, border-color 0.2s',
        borderColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      <Stack gap="xs" align="center">
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: tokens.radius.md,
            backgroundColor: `${color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} color={color} />
        </Box>
        <Text size="sm" fw={500} style={{ color: tokens.colors.textPrimary }}>
          {label}
        </Text>
      </Stack>
    </Card>
  );
}

function EmptyState() {
  return (
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
        No recent activities yet
      </Text>
      <Text size="sm" style={{ color: tokens.colors.textMuted }} mb="md">
        Connect your devices or upload a FIT file to get started
      </Text>
      <Group justify="center" gap="sm">
        <Button component={Link} to="/settings" variant="subtle" color="lime" size="sm">
          Connect Strava
        </Button>
        <Button component={Link} to="/training?tab=history" variant="outline" color="gray" size="sm">
          Upload FIT file
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
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return date.toLocaleDateString('en-US', {
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

  const distanceKm = activity.distance_meters
    ? activity.distance_meters / 1000
    : activity.distance
    ? activity.distance / 1000
    : 0;
  const elevation = activity.elevation_gain_meters || activity.total_elevation_gain || 0;
  const duration = activity.duration_seconds || activity.moving_time || activity.elapsed_time || 0;
  const power = activity.average_power_watts || activity.average_watts || 0;
  const tss = activity.tss || 0;

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
          <Group gap="sm" wrap="nowrap">
            <Text fw={600} size="sm" lineClamp={1} style={{ color: tokens.colors.textPrimary }}>
              {activity.name || 'Untitled Ride'}
            </Text>
            {tss > 0 && (
              <Badge size="xs" variant="light" color="blue">
                TSS {Math.round(tss)}
              </Badge>
            )}
          </Group>
          <Text size="xs" style={{ color: tokens.colors.textMuted }}>
            {formatDate(activity.start_date)}
          </Text>
        </Box>
        <Group gap="lg" wrap="nowrap">
          <StatCell label="Distance" value={formatDist(distanceKm)} />
          <StatCell label="Elevation" value={`+${formatElev(elevation)}`} />
          <StatCell label="Time" value={formatDuration(duration)} />
          {power > 0 && (
            <Badge color="yellow" variant="light" size="sm">
              {Math.round(power)}W
            </Badge>
          )}
        </Group>
      </Group>
    </Card>
  );
}

function StatCell({ label, value }) {
  return (
    <Box style={{ textAlign: 'right' }}>
      <Text size="xs" style={{ color: tokens.colors.textMuted }}>
        {label}
      </Text>
      <Text fw={500} size="sm" style={{ color: tokens.colors.textPrimary }}>
        {value}
      </Text>
    </Box>
  );
}

export default Dashboard;
