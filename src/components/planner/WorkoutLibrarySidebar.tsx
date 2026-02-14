/**
 * WorkoutLibrarySidebar Component
 * Always-visible sidebar with filterable workout library
 */

import { useState, useMemo } from 'react';
import {
  Box,
  TextInput,
  SegmentedControl,
  Stack,
  ScrollArea,
  Text,
  Group,
  Badge,
  Divider,
  Collapse,
  UnstyledButton,
} from '@mantine/core';
import { IconSearch, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { WorkoutCard } from './WorkoutCard';
import { WORKOUT_LIBRARY, getWorkoutsByCategory } from '../../data/workoutLibrary';
import type { WorkoutCategory, FitnessLevel, WorkoutDefinition } from '../../types/training';
import type { SidebarFilter, DragSource } from '../../types/planner';

interface WorkoutLibrarySidebarProps {
  filter: SidebarFilter;
  onFilterChange: (filter: Partial<SidebarFilter>) => void;
  onDragStart: (workoutId: string, source: DragSource) => void;
  onDragEnd: () => void;
  onWorkoutTap?: (workoutId: string) => void; // For mobile tap-to-assign
  isMobile?: boolean;
}

// Category display order and labels
const CATEGORY_ORDER: WorkoutCategory[] = [
  'recovery',
  'endurance',
  'tempo',
  'sweet_spot',
  'threshold',
  'vo2max',
  'anaerobic',
  'climbing',
  'strength',
  'core',
  'flexibility',
];

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  recovery: 'Recovery',
  endurance: 'Endurance',
  tempo: 'Tempo',
  sweet_spot: 'Sweet Spot',
  threshold: 'Threshold',
  vo2max: 'VO2max',
  anaerobic: 'Anaerobic',
  climbing: 'Climbing',
  racing: 'Racing',
  strength: 'Strength',
  core: 'Core',
  flexibility: 'Flexibility',
  rest: 'Rest',
};

const CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  recovery: 'green',
  endurance: 'blue',
  tempo: 'yellow',
  sweet_spot: 'orange',
  threshold: 'red',
  vo2max: 'grape',
  anaerobic: 'pink',
  climbing: 'teal',
  racing: 'violet',
  strength: 'indigo',
  core: 'cyan',
  flexibility: 'terracotta',
  rest: 'gray',
};

export function WorkoutLibrarySidebar({
  filter,
  onFilterChange,
  onDragStart,
  onDragEnd,
  onWorkoutTap,
  isMobile = false,
}: WorkoutLibrarySidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<WorkoutCategory>>(
    new Set(['endurance', 'threshold', 'vo2max'])
  );

  // Filter workouts based on current filter
  const filteredWorkouts = useMemo(() => {
    const allWorkouts = Object.values(WORKOUT_LIBRARY);

    return allWorkouts.filter((workout) => {
      // Category filter
      if (filter.category && workout.category !== filter.category) {
        return false;
      }

      // Search filter
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        const matchesName = workout.name.toLowerCase().includes(query);
        const matchesDescription = workout.description.toLowerCase().includes(query);
        const matchesTags = workout.tags.some((tag) => tag.toLowerCase().includes(query));
        if (!matchesName && !matchesDescription && !matchesTags) {
          return false;
        }
      }

      // Difficulty filter
      if (filter.difficulty && workout.difficulty !== filter.difficulty) {
        return false;
      }

      return true;
    });
  }, [filter]);

  // Group workouts by category
  const workoutsByCategory = useMemo(() => {
    const grouped: Record<WorkoutCategory, WorkoutDefinition[]> = {} as any;

    for (const category of CATEGORY_ORDER) {
      grouped[category] = filteredWorkouts.filter((w) => w.category === category);
    }

    return grouped;
  }, [filteredWorkouts]);

  const toggleCategory = (category: WorkoutCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleDragStart = (workoutId: string) => {
    onDragStart(workoutId, 'library');
  };

  return (
    <Box
      style={{
        width: isMobile ? '100%' : 280,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: isMobile ? 'none' : '1px solid var(--mantine-color-dark-4)',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      {/* Header */}
      <Box p="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Text size="sm" fw={600} mb="xs">
          Workout Library
        </Text>

        {/* Search */}
        <TextInput
          placeholder="Search workouts..."
          leftSection={<IconSearch size={16} />}
          size="xs"
          value={filter.searchQuery}
          onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
          mb="xs"
        />

        {/* Difficulty filter */}
        <SegmentedControl
          size="xs"
          fullWidth
          value={filter.difficulty || 'all'}
          onChange={(value) =>
            onFilterChange({
              difficulty: value === 'all' ? null : (value as FitnessLevel),
            })
          }
          data={[
            { label: 'All', value: 'all' },
            { label: 'Beginner', value: 'beginner' },
            { label: 'Inter', value: 'intermediate' },
            { label: 'Adv', value: 'advanced' },
          ]}
        />
      </Box>

      {/* Workout List */}
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={0} p="xs">
          {CATEGORY_ORDER.map((category) => {
            const workouts = workoutsByCategory[category];
            if (workouts.length === 0) return null;

            const isExpanded = expandedCategories.has(category);

            return (
              <Box key={category} mb="xs">
                {/* Category Header */}
                <UnstyledButton
                  onClick={() => toggleCategory(category)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 4,
                    backgroundColor: 'var(--mantine-color-dark-6)',
                  }}
                >
                  <Group justify="space-between">
                    <Group gap="xs">
                      {isExpanded ? (
                        <IconChevronDown size={14} />
                      ) : (
                        <IconChevronRight size={14} />
                      )}
                      <Badge size="xs" color={CATEGORY_COLORS[category]} variant="filled">
                        {CATEGORY_LABELS[category]}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {workouts.length}
                    </Text>
                  </Group>
                </UnstyledButton>

                {/* Workout Cards */}
                <Collapse in={isExpanded}>
                  <Stack gap="xs" mt="xs" ml="sm">
                    {workouts.map((workout) => (
                      <Box
                        key={workout.id}
                        onClick={isMobile && onWorkoutTap ? () => onWorkoutTap(workout.id) : undefined}
                        style={isMobile ? { cursor: 'pointer' } : undefined}
                      >
                        <WorkoutCard
                          workout={workout}
                          source="library"
                          onDragStart={isMobile ? undefined : handleDragStart}
                          onDragEnd={isMobile ? undefined : onDragEnd}
                        />
                      </Box>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}

          {filteredWorkouts.length === 0 && (
            <Box py="xl" ta="center">
              <Text size="sm" c="dimmed">
                No workouts match your filters
              </Text>
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Footer with count */}
      <Box
        p="xs"
        style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}
      >
        <Text size="xs" c="dimmed" ta="center">
          {filteredWorkouts.length} workouts available
        </Text>
      </Box>
    </Box>
  );
}

export default WorkoutLibrarySidebar;
