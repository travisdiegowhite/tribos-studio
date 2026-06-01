/**
 * WorkoutPickerPanel — RB2 in-builder workout picker.
 *
 * Lets the rider attach a structured workout to the route builder without
 * starting from the training calendar. Two sources: their upcoming planned
 * workouts and the full cycling workout library. Selecting one lights up the
 * interval overlay and seeds the generate form (handled by the page).
 *
 * Presentational only — planned workouts are passed in (fetched by the page
 * via useUpcomingPlannedWorkouts); the library is enumerated locally.
 */

import { useMemo, useState } from 'react';
import { Box, Text, TextInput, SegmentedControl, ScrollArea, UnstyledButton } from '@mantine/core';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { WORKOUT_LIBRARY } from '../../../data/workoutLibrary';
import { cueColor, categoryToZone } from '../overlay/intervalOverlay';
import type { WorkoutDefinition } from '../../../types/training';
import type { UpcomingPlannedWorkout } from '../../../hooks/useUpcomingPlannedWorkouts';

export interface WorkoutPickerPanelProps {
  plannedWorkouts: UpcomingPlannedWorkout[];
  selectedWorkoutId: string | null;
  onSelect: (
    workout: WorkoutDefinition,
    planned?: { targetDurationMinutes: number | null; targetDistanceKm: number | null },
  ) => void;
  onClear: () => void;
  isMobile?: boolean;
}

const CYCLING_LIBRARY: WorkoutDefinition[] = Object.values(WORKOUT_LIBRARY)
  .filter((w) => w.sportType !== 'running')
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

function formatShortDate(iso: string): string {
  // iso is YYYY-MM-DD (local plan date) — render as e.g. "Mon Jun 8".
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function WorkoutPickerPanel({
  plannedWorkouts,
  selectedWorkoutId,
  onSelect,
  onClear,
  isMobile = false,
}: WorkoutPickerPanelProps) {
  const [tab, setTab] = useState<'planned' | 'library'>(
    plannedWorkouts.length > 0 ? 'planned' : 'library',
  );
  const [query, setQuery] = useState('');

  const filteredLibrary = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CYCLING_LIBRARY;
    return CYCLING_LIBRARY.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.category.toLowerCase().includes(q) ||
        w.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <Box data-testid="rb2-workout-picker" style={{ width: isMobile ? '100%' : undefined }}>
      <SegmentedControl
        fullWidth
        size="xs"
        value={tab}
        onChange={(v) => setTab(v as 'planned' | 'library')}
        data={[
          { label: `Planned${plannedWorkouts.length ? ` (${plannedWorkouts.length})` : ''}`, value: 'planned' },
          { label: 'Library', value: 'library' },
        ]}
        styles={{ root: { borderRadius: 0 }, indicator: { borderRadius: 0 } }}
      />

      {selectedWorkoutId && (
        <UnstyledButton
          data-testid="rb2-workout-picker-clear"
          onClick={onClear}
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: RB2.coral,
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <X size={12} /> Remove workout
        </UnstyledButton>
      )}

      {tab === 'planned' ? (
        <Box style={{ marginTop: 8 }}>
          {plannedWorkouts.length === 0 ? (
            <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textTertiary, padding: '8px 0' }}>
              No upcoming planned workouts. Browse the Library to ride any workout.
            </Text>
          ) : (
            <ScrollArea.Autosize mah={isMobile ? 240 : 360} type="auto">
              {plannedWorkouts.map((p) => (
                <WorkoutRow
                  key={p.id}
                  testid={`rb2-workout-planned-${p.workout.id}`}
                  workout={p.workout}
                  prefix={formatShortDate(p.scheduledDate)}
                  durationMinutes={p.targetDurationMinutes ?? p.workout.duration}
                  selected={selectedWorkoutId === p.workout.id}
                  onClick={() =>
                    onSelect(p.workout, {
                      targetDurationMinutes: p.targetDurationMinutes,
                      targetDistanceKm: p.targetDistanceKm,
                    })
                  }
                />
              ))}
            </ScrollArea.Autosize>
          )}
        </Box>
      ) : (
        <Box style={{ marginTop: 8 }}>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search workouts"
            size="xs"
            leftSection={<MagnifyingGlass size={14} />}
            styles={{ input: { borderRadius: 0 } }}
          />
          <ScrollArea.Autosize mah={isMobile ? 240 : 360} type="auto" style={{ marginTop: 8 }}>
            {filteredLibrary.map((w) => (
              <WorkoutRow
                key={w.id}
                testid={`rb2-workout-library-${w.id}`}
                workout={w}
                durationMinutes={w.duration}
                selected={selectedWorkoutId === w.id}
                onClick={() => onSelect(w)}
              />
            ))}
            {filteredLibrary.length === 0 && (
              <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textTertiary, padding: '8px 0' }}>
                No workouts match “{query}”.
              </Text>
            )}
          </ScrollArea.Autosize>
        </Box>
      )}
    </Box>
  );
}

function WorkoutRow({
  workout,
  durationMinutes,
  prefix,
  selected,
  onClick,
  testid,
}: {
  workout: WorkoutDefinition;
  durationMinutes: number;
  prefix?: string;
  selected: boolean;
  onClick: () => void;
  testid: string;
}) {
  return (
    <UnstyledButton
      data-testid={testid}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 8px',
        borderBottom: `1px solid ${RB2.border}`,
        backgroundColor: selected ? RB2.bgSecondary : 'transparent',
      }}
    >
      <Box
        style={{
          width: 4,
          alignSelf: 'stretch',
          backgroundColor: cueColor(categoryToZone(workout.category)),
          flexShrink: 0,
        }}
      />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: RB2_FONT.body,
            fontSize: 13,
            fontWeight: selected ? 700 : 500,
            color: RB2.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {workout.name}
        </Text>
        <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
          {prefix ? `${prefix} · ` : ''}
          {workout.category} · {durationMinutes}min · {workout.targetTSS} TSS
        </Text>
      </Box>
    </UnstyledButton>
  );
}

export default WorkoutPickerPanel;
