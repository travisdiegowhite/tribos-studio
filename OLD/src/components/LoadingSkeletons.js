import React from 'react';
import {
  Skeleton,
  Paper,
  Stack,
  Group,
  SimpleGrid,
  Container,
  Grid,
  Card,
} from '@mantine/core';

/**
 * LoadingSkeletons - Reusable loading skeleton components
 * Provides visual placeholders that match the actual content layout
 */

// Dashboard skeleton for the main dashboard
export const DashboardSkeleton = () => (
  <Container size="xl" py="xl">
    <Stack gap="lg">
      {/* Header skeleton */}
      <Group gap="md">
        <Skeleton height={32} circle />
        <Skeleton height={30} width={250} />
      </Group>

      {/* Stats row skeleton */}
      <Grid>
        {[1, 2, 3].map((i) => (
          <Grid.Col key={i} span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md">
              <Skeleton height={12} width="40%" mb="xs" />
              <Skeleton height={24} width="60%" />
            </Card>
          </Grid.Col>
        ))}
      </Grid>

      {/* Cards row skeleton */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {[1, 2, 3].map((i) => (
          <Card key={i} withBorder p="md">
            <Stack gap="sm">
              <Group>
                <Skeleton height={40} width={40} radius="md" />
                <div style={{ flex: 1 }}>
                  <Skeleton height={14} width="70%" mb={4} />
                  <Skeleton height={10} width="50%" />
                </div>
              </Group>
              <Skeleton height={60} />
              <Skeleton height={36} />
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  </Container>
);

// Route list skeleton
export const RouteListSkeleton = ({ count = 5 }) => (
  <Stack gap="sm">
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} withBorder p="sm">
        <Group justify="space-between">
          <div style={{ flex: 1 }}>
            <Skeleton height={14} width="60%" mb={6} />
            <Group gap="xs">
              <Skeleton height={18} width={60} radius="xl" />
              <Skeleton height={18} width={80} radius="xl" />
            </Group>
          </div>
          <Skeleton height={24} width={24} radius="sm" />
        </Group>
      </Card>
    ))}
  </Stack>
);

// Training metrics skeleton
export const TrainingMetricsSkeleton = () => (
  <Stack gap="lg">
    {/* Header */}
    <Group justify="space-between">
      <div>
        <Skeleton height={28} width={200} mb={8} />
        <Skeleton height={14} width={350} />
      </div>
      <Group>
        <Skeleton height={36} width={120} />
        <Skeleton height={36} width={140} />
      </Group>
    </Group>

    {/* Tabs */}
    <Skeleton height={42} />

    {/* Main content */}
    <Grid>
      <Grid.Col span={{ base: 12, md: 8 }}>
        <Card withBorder p="md">
          <Skeleton height={18} width="30%" mb="md" />
          <Skeleton height={200} />
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Stack gap="md">
          <Card withBorder p="md">
            <Skeleton height={18} width="50%" mb="sm" />
            <Skeleton height={80} />
          </Card>
          <Card withBorder p="md">
            <Skeleton height={18} width="40%" mb="sm" />
            <Skeleton height={60} />
          </Card>
        </Stack>
      </Grid.Col>
    </Grid>
  </Stack>
);

// Route generator skeleton
export const RouteGeneratorSkeleton = () => (
  <Paper p="lg" radius="md" withBorder>
    <Stack gap="lg">
      {/* Header */}
      <Group gap="sm">
        <Skeleton height={40} width={40} radius="md" />
        <div>
          <Skeleton height={18} width={120} mb={4} />
          <Skeleton height={12} width={160} />
        </div>
      </Group>

      {/* Location input */}
      <div>
        <Skeleton height={14} width={180} mb="xs" />
        <Skeleton height={36} />
        <Skeleton height={24} width={120} mt="xs" />
      </div>

      {/* Duration selector */}
      <div>
        <Skeleton height={14} width={160} mb="xs" />
        <Skeleton height={36} />
      </div>

      {/* Button */}
      <Skeleton height={48} radius="md" />
    </Stack>
  </Paper>
);

// Map sidebar skeleton
export const MapSidebarSkeleton = () => (
  <Paper p="md" style={{ width: '100%' }}>
    <Stack gap="md">
      <Group justify="space-between">
        <Skeleton height={20} width={100} />
      </Group>
      <Skeleton height={36} />
      <Skeleton height={16} width={80} />
      <RouteListSkeleton count={4} />
    </Stack>
  </Paper>
);

// Profile/Stats card skeleton
export const StatsCardSkeleton = () => (
  <Card withBorder p="md">
    <Stack gap="sm">
      <Group>
        <Skeleton height={48} width={48} radius="xl" />
        <div style={{ flex: 1 }}>
          <Skeleton height={18} width="60%" mb={6} />
          <Skeleton height={12} width="40%" />
        </div>
      </Group>
      <SimpleGrid cols={2} spacing="xs">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <Skeleton height={10} width="60%" mb={4} />
            <Skeleton height={16} width="80%" />
          </div>
        ))}
      </SimpleGrid>
    </Stack>
  </Card>
);

// Insights modal skeleton
export const InsightsSkeleton = () => (
  <Stack gap="lg">
    {/* Header */}
    <Stack align="center">
      <Skeleton height={60} width={60} radius="xl" />
      <Skeleton height={24} width={280} />
      <Skeleton height={16} width={350} />
    </Stack>

    {/* Stats grid */}
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
      {[1, 2, 3, 4].map((i) => (
        <Paper key={i} p="md" radius="md" withBorder>
          <Skeleton height={10} width="60%" mx="auto" mb={8} />
          <Skeleton height={24} width="50%" mx="auto" />
        </Paper>
      ))}
    </SimpleGrid>

    {/* Form status */}
    <Paper p="lg" radius="md" withBorder>
      <Group>
        <Skeleton height={40} width={40} radius="md" />
        <div style={{ flex: 1 }}>
          <Skeleton height={16} width="40%" mb={8} />
          <Skeleton height={12} width="70%" />
        </div>
      </Group>
    </Paper>
  </Stack>
);

export default {
  DashboardSkeleton,
  RouteListSkeleton,
  TrainingMetricsSkeleton,
  RouteGeneratorSkeleton,
  MapSidebarSkeleton,
  StatsCardSkeleton,
  InsightsSkeleton,
};
