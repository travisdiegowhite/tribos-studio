/**
 * PodSummaryWidget
 * Shows a compact summary of the user's active pod on the Dashboard
 */

import { Link } from 'react-router-dom';
import {
  Card,
  Text,
  Group,
  Stack,
  Avatar,
  Badge,
  Progress,
  Button,
  Box,
  Skeleton,
} from '@mantine/core';
import {
  IconUsers,
  IconMessageCircle,
  IconChevronRight,
  IconPlus,
} from '@tabler/icons-react';
import { tokens } from '../../theme';

function PodSummaryWidget({
  pod,
  memberCount,
  checkInCount,
  totalMembers,
  loading = false,
  onFindPod,
}) {
  if (loading) {
    return (
      <Card
        padding="md"
        radius="md"
        style={{
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.bgTertiary}`,
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

  // No pod - show prompt to find/create one
  if (!pod) {
    return (
      <Card
        padding="md"
        radius="md"
        style={{
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.bgTertiary}`,
        }}
      >
        <Stack gap="sm">
          <Group gap="xs">
            <IconUsers size={18} color={tokens.colors.textSecondary} />
            <Text size="sm" fw={500} c="dimmed">
              Accountability Pod
            </Text>
          </Group>

          <Text size="sm" c="dimmed">
            Join a small group of cyclists with similar goals for weekly check-ins and accountability.
          </Text>

          <Button
            variant="light"
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={onFindPod}
            style={{
              backgroundColor: tokens.colors.bgTertiary,
              color: tokens.colors.textPrimary,
            }}
          >
            Find a Pod
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
        backgroundColor: tokens.colors.bgSecondary,
        border: `1px solid ${tokens.colors.bgTertiary}`,
      }}
    >
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <IconUsers size={18} color={tokens.colors.electricLime} />
            <Text size="sm" fw={500}>
              {pod.name}
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
            color={tokens.colors.electricLime}
            style={{
              backgroundColor: tokens.colors.bgTertiary,
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
            color: tokens.colors.textSecondary,
          }}
          styles={{
            root: {
              '&:hover': {
                backgroundColor: tokens.colors.bgTertiary,
              },
            },
          }}
        >
          View pod activity
        </Button>
      </Stack>
    </Card>
  );
}

export default PodSummaryWidget;
