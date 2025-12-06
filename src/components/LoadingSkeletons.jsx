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

export const DashboardSkeleton = () => (
  <Container size="xl" py="xl">
    <Stack gap="lg">
      <Group gap="md">
        <Skeleton height={32} circle />
        <Skeleton height={30} width={250} />
      </Group>

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

export const TrainingMetricsSkeleton = () => (
  <Stack gap="lg">
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

    <Skeleton height={42} />

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

export default {
  DashboardSkeleton,
  RouteListSkeleton,
  TrainingMetricsSkeleton,
  StatsCardSkeleton,
};
