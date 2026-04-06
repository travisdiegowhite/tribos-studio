/**
 * CalendarLibrarySidebar - Workout library sidebar for Training Hub Edit Mode
 * Wraps the existing WorkoutLibrarySidebar with Training Hub-specific styling
 */

import { useState, useCallback } from 'react';
import { Box, Text, Drawer } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { WorkoutLibrarySidebar } from '../planner/WorkoutLibrarySidebar';
import type { SidebarFilter } from '../../types/planner';
import type { WorkoutCategory } from '../../types/training';

interface CalendarLibrarySidebarProps {
  visible: boolean;
  targetDay: string | null;
  filterCategory?: WorkoutCategory | null;
  onWorkoutSelect: (workoutId: string) => void;
  onDragStart: (workoutId: string) => void;
  onDragEnd: () => void;
  onClose?: () => void;
}

export function CalendarLibrarySidebar({
  visible,
  targetDay,
  filterCategory = null,
  onWorkoutSelect,
  onDragStart,
  onDragEnd,
  onClose,
}: CalendarLibrarySidebarProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [filter, setFilter] = useState<SidebarFilter>({
    category: filterCategory,
    searchQuery: '',
    difficulty: null,
  });

  const handleFilterChange = useCallback((partial: Partial<SidebarFilter>) => {
    setFilter((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleDragStart = useCallback(
    (workoutId: string) => {
      onDragStart(workoutId);
    },
    [onDragStart]
  );

  const handleWorkoutTap = useCallback(
    (workoutId: string) => {
      onWorkoutSelect(workoutId);
    },
    [onWorkoutSelect]
  );

  // Mobile: render as bottom sheet drawer
  if (isMobile) {
    return (
      <Drawer
        opened={visible}
        onClose={onClose || (() => {})}
        position="bottom"
        size="60vh"
        title={
          <Text size="sm" fw={700} style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '1px', textTransform: 'uppercase' }}>
            {targetDay ? `Add workout — ${targetDay}` : 'Workout Library'}
          </Text>
        }
        styles={{
          content: { backgroundColor: '#141410' },
          header: { backgroundColor: '#141410', borderBottom: '1px solid #333' },
          title: { color: '#fff' },
          close: { color: '#fff' },
        }}
      >
        <WorkoutLibrarySidebar
          filter={filter}
          onFilterChange={handleFilterChange}
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}
          onWorkoutTap={handleWorkoutTap}
          isMobile
        />
      </Drawer>
    );
  }

  // Desktop: slide-in sidebar
  return (
    <Box
      style={{
        width: visible ? 220 : 0,
        overflow: 'hidden',
        transition: 'width 0.25s ease',
        flexShrink: 0,
        backgroundColor: '#141410',
        borderRight: visible ? '1px solid #333' : 'none',
      }}
    >
      {visible && (
        <Box style={{ width: 220, height: '100%' }}>
          {/* Target day header */}
          {targetDay && (
            <Box p="xs" style={{ borderBottom: '1px solid #333' }}>
              <Text size="xs" fw={700} c="teal" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '1px', textTransform: 'uppercase' }}>
                Assign to {targetDay}
              </Text>
            </Box>
          )}
          <WorkoutLibrarySidebar
            filter={filter}
            onFilterChange={handleFilterChange}
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
            onWorkoutTap={handleWorkoutTap}
          />
        </Box>
      )}
    </Box>
  );
}

export default CalendarLibrarySidebar;
