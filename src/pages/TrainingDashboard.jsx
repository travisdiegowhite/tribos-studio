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
} from '@mantine/core';
import { tokens } from '../theme';
import AppShell from '../components/AppShell';

function TrainingDashboard() {
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

          {/* Fitness Overview */}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            <MetricCard
              label="Fitness (CTL)"
              value="--"
              change={null}
              description="Chronic Training Load"
            />
            <MetricCard
              label="Fatigue (ATL)"
              value="--"
              change={null}
              description="Acute Training Load"
            />
            <MetricCard
              label="Form (TSB)"
              value="--"
              change={null}
              description="Training Stress Balance"
            />
            <MetricCard
              label="FTP"
              value="-- W"
              change={null}
              description="Functional Threshold Power"
            />
          </SimpleGrid>

          {/* Power Zones */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Power Zones
              </Title>
              <Text size="sm" style={{ color: tokens.colors.textSecondary }} mb="md">
                Set your FTP in settings to calculate your power zones
              </Text>

              <Stack gap="sm">
                <ZoneBar zone={1} label="Recovery" range="< 55%" color={tokens.colors.zone1} />
                <ZoneBar zone={2} label="Endurance" range="55-75%" color={tokens.colors.zone2} />
                <ZoneBar zone={3} label="Tempo" range="75-90%" color={tokens.colors.zone3} />
                <ZoneBar zone={4} label="Threshold" range="90-105%" color={tokens.colors.zone4} />
                <ZoneBar zone={5} label="VO2max" range="105-120%" color={tokens.colors.zone5} />
                <ZoneBar zone={6} label="Anaerobic" range="120-150%" color={tokens.colors.zone6} />
                <ZoneBar zone={7} label="Neuromuscular" range="> 150%" color={tokens.colors.zone7} />
              </Stack>
            </Stack>
          </Card>

          {/* Recent Workouts */}
          <Card>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                  Recent Workouts
                </Title>
                <Badge variant="light" color="gray">
                  Last 7 days
                </Badge>
              </Group>

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
                <Text style={{ color: tokens.colors.textSecondary }}>
                  No workouts recorded yet. Connect your devices to start tracking!
                </Text>
              </Box>
            </Stack>
          </Card>

          {/* Chart Placeholder */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Training Load
              </Title>
              <Box
                style={{
                  height: 300,
                  backgroundColor: tokens.colors.bgTertiary,
                  borderRadius: tokens.radius.md,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Stack align="center" gap="sm">
                  <Text size="2rem">📈</Text>
                  <Text style={{ color: tokens.colors.textSecondary }}>
                    Training load chart will appear here
                  </Text>
                </Stack>
              </Box>
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
          {change !== null && (
            <Text
              size="sm"
              style={{ color: change >= 0 ? tokens.colors.success : tokens.colors.error }}
            >
              {change >= 0 ? '+' : ''}{change}
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

function ZoneBar({ zone, label, range, color }) {
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
        <Progress value={0} color={color} size="sm" radius="xl" />
      </Box>
      <Box style={{ width: 70, textAlign: 'right' }}>
        <Text size="sm" style={{ color: tokens.colors.textMuted }}>
          -- W
        </Text>
      </Box>
    </Group>
  );
}

export default TrainingDashboard;
