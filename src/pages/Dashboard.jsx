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
} from '@mantine/core';
import { useAuth } from '../contexts/AuthContext.jsx';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';

function Dashboard() {
  const { profile, user } = useAuth();
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Rider';

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

          {/* Recent Activity Placeholder */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Recent Activity
              </Title>
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
            </Stack>
          </Card>

          {/* Stats Overview Placeholder */}
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            <StatCard label="This Week" value="0 km" subtext="Total Distance" />
            <StatCard label="This Month" value="0 hrs" subtext="Time on Bike" />
            <StatCard label="All Time" value="0" subtext="Activities" />
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

export default Dashboard;
