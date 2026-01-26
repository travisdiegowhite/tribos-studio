/**
 * CafeSummaryWidget
 * Shows a compact summary of the user's active cafe on the Dashboard
 * "The Cafe" - where cyclists gather to share stories and support each other
 */

import { Link } from 'react-router-dom';
import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Progress,
  Button,
  Box,
  Skeleton,
} from '@mantine/core';
import {
  IconCoffee,
  IconChevronRight,
  IconPlus,
} from '@tabler/icons-react';
import { tokens } from '../../theme';

function CafeSummaryWidget({
  cafe,
  memberCount,
  checkInCount,
  totalMembers,
  loading = false,
  onFindCafe,
}) {
  if (loading) {
    return (
      <Card
        padding="md"
        radius="md"
        style={{
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
        }}
      >
        <Stack gap="sm">
          <Skeleton height={20} width="60%" />
          <Skeleton height={40} />
          <Skeleton height={20} width="80%" />
        </Stack>
      </Card>
    );
  }

  // No cafe - show prompt to find/create one
  if (!cafe) {
    return (
      <Card
        padding="md"
        radius="md"
        style={{
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
        }}
      >
        <Stack gap="sm">
          <Group gap="xs">
            <IconCoffee size={18} color={'var(--tribos-text-secondary)'} />
            <Text size="sm" fw={500} c="dimmed">
              The Cafe
            </Text>
          </Group>

          <Text size="sm" c="dimmed">
            Join a small group of cyclists with similar goals for weekly check-ins and accountability.
          </Text>

          <Button
            variant="light"
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={onFindCafe}
            style={{
              backgroundColor: 'var(--tribos-bg-tertiary)',
              color: 'var(--tribos-text-primary)',
            }}
          >
            Find a Cafe
          </Button>
        </Stack>
      </Card>
    );
  }

  const checkInPercent = totalMembers > 0 ? (checkInCount / totalMembers) * 100 : 0;

  return (
    <Card
      padding="md"
      radius="md"
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
      }}
    >
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <IconCoffee size={18} color={'var(--tribos-lime)'} />
            <Text size="sm" fw={500}>
              {cafe.name}
            </Text>
          </Group>
          <Badge
            size="xs"
            variant="light"
            color="gray"
          >
            {memberCount} members
          </Badge>
        </Group>

        {/* This week's check-ins */}
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">
              This week's check-ins
            </Text>
            <Text size="xs" c="dimmed">
              {checkInCount} of {totalMembers}
            </Text>
          </Group>
          <Progress
            value={checkInPercent}
            size="sm"
            radius="xl"
            color={'var(--tribos-lime)'}
            style={{
              backgroundColor: 'var(--tribos-bg-tertiary)',
            }}
          />
        </Box>

        {/* Quick action */}
        <Button
          component={Link}
          to="/community"
          variant="subtle"
          size="xs"
          rightSection={<IconChevronRight size={14} />}
          style={{
            color: 'var(--tribos-text-secondary)',
          }}
          styles={{
            root: {
              '&:hover': {
                backgroundColor: 'var(--tribos-bg-tertiary)',
              },
            },
          }}
        >
          View cafe activity
        </Button>
      </Stack>
    </Card>
  );
}

export default CafeSummaryWidget;
