/**
 * PlanFilters Component
 * Filter controls for training plan selection
 */

import {
  Paper,
  Group,
  SegmentedControl,
  Select,
  Text,
  ActionIcon,
  Collapse,
  Stack,
  Button,
  Badge,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconFilter,
  IconX,
  IconAdjustments,
} from '@tabler/icons-react';
import { FITNESS_LEVELS, GOAL_TYPES } from '../../utils/trainingPlans';

export default function PlanFilters({
  filters,
  onChange,
  onClear,
  planCount,
  totalCount,
}) {
  const [expanded, { toggle }] = useDisclosure(false);

  const fitnessOptions = [
    { value: '', label: 'All Levels' },
    ...Object.entries(FITNESS_LEVELS).map(([key, level]) => ({
      value: key,
      label: level.name,
    })),
  ];

  const goalOptions = [
    { value: '', label: 'All Goals' },
    ...Object.entries(GOAL_TYPES).map(([key, goal]) => ({
      value: key,
      label: `${goal.icon || ''} ${goal.name}`,
    })),
  ];

  const methodologyOptions = [
    { value: '', label: 'All Methodologies' },
    { value: 'polarized', label: 'Polarized' },
    { value: 'sweet_spot', label: 'Sweet Spot' },
    { value: 'threshold', label: 'Threshold' },
    { value: 'pyramidal', label: 'Pyramidal' },
    { value: 'endurance', label: 'Endurance' },
  ];

  const durationOptions = [
    { value: '', label: 'Any Duration' },
    { value: '6', label: '6 weeks' },
    { value: '8', label: '8 weeks' },
    { value: '12', label: '12 weeks' },
    { value: '16', label: '16 weeks' },
  ];

  const hasFilters = filters.fitnessLevel || filters.goal || filters.methodology || filters.duration;
  const activeFilterCount = [filters.fitnessLevel, filters.goal, filters.methodology, filters.duration].filter(Boolean).length;

  return (
    <Paper p="md" radius="md" withBorder>
      {/* Quick Filters */}
      <Group position="apart" mb={expanded ? 'md' : 0}>
        <Group>
          <Text fw={500} size="sm">Fitness Level:</Text>
          <SegmentedControl
            size="xs"
            value={filters.fitnessLevel || ''}
            onChange={(val) => onChange({ ...filters, fitnessLevel: val || undefined })}
            data={[
              { value: '', label: 'All' },
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'advanced', label: 'Advanced' },
            ]}
          />
        </Group>

        <Group spacing="sm">
          {hasFilters && (
            <Button
              variant="subtle"
              size="xs"
              color="gray"
              leftIcon={<IconX size={14} />}
              onClick={onClear}
            >
              Clear
            </Button>
          )}
          <ActionIcon
            variant={expanded ? 'filled' : 'light'}
            onClick={toggle}
            size="md"
          >
            <IconAdjustments size={18} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Advanced Filters */}
      <Collapse in={expanded}>
        <Stack spacing="sm" mt="md">
          <Group grow>
            <Select
              label="Goal"
              placeholder="Select goal"
              data={goalOptions}
              value={filters.goal || ''}
              onChange={(val) => onChange({ ...filters, goal: val || undefined })}
              clearable
              size="sm"
            />
            <Select
              label="Methodology"
              placeholder="Select methodology"
              data={methodologyOptions}
              value={filters.methodology || ''}
              onChange={(val) => onChange({ ...filters, methodology: val || undefined })}
              clearable
              size="sm"
            />
            <Select
              label="Duration"
              placeholder="Select duration"
              data={durationOptions}
              value={filters.duration?.toString() || ''}
              onChange={(val) => onChange({ ...filters, duration: val ? parseInt(val) : undefined })}
              clearable
              size="sm"
            />
          </Group>
        </Stack>
      </Collapse>

      {/* Results Count */}
      <Group position="apart" mt="md">
        <Text size="sm" c="dimmed">
          Showing {planCount} of {totalCount} plans
        </Text>
        {activeFilterCount > 0 && (
          <Badge size="sm" variant="light">
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
          </Badge>
        )}
      </Group>
    </Paper>
  );
}
