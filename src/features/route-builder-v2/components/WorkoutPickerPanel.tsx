/**
 * WorkoutPickerPanel — RB2 in-builder workout picker.
 *
 * Lets the rider attach a structured workout to the route builder without
 * starting from the training calendar. Three sources: their upcoming planned
 * workouts, the cycling library, and the running library. Selecting one lights
 * up the interval overlay and seeds the generate form (handled by the page).
 *
 * Presentational only — planned workouts are passed in (fetched by the page via
 * useUpcomingPlannedWorkouts); the libraries are enumerated locally. The
 * "Coach" tab is the same: it collects a description and hands it to
 * `onDescribeWorkout`, which the page owns (parse + persist).
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Text,
  TextInput,
  Textarea,
  SegmentedControl,
  ScrollArea,
  UnstyledButton,
} from '@mantine/core';
import { MagnifyingGlass, X, Bicycle, PersonSimpleRun } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { getCyclingWorkouts, getRunningWorkouts } from '../../../data/workoutLookup';
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
  /**
   * Read a workout the rider's coach gave them and attach it. Resolves with a
   * message when the description was too vague to structure — worth showing
   * verbatim rather than a generic failure, since it says what's missing.
   */
  onDescribeWorkout?: (input: {
    description: string;
    name: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  isMobile?: boolean;
}

type Tab = 'planned' | 'bike' | 'run' | 'describe';

// Render order for category groups; anything unlisted falls to the end.
const CATEGORY_ORDER = [
  'recovery',
  'endurance',
  'tempo',
  'sweet_spot',
  'threshold',
  'vo2max',
  'anaerobic',
  'climbing',
  'racing',
  'strength',
  'core',
  'flexibility',
];

const CATEGORY_LABELS: Record<string, string> = {
  recovery: 'Recovery',
  endurance: 'Endurance',
  tempo: 'Tempo',
  sweet_spot: 'Sweet Spot',
  threshold: 'Threshold',
  vo2max: 'VO2 Max',
  anaerobic: 'Anaerobic',
  climbing: 'Climbing',
  racing: 'Racing',
  strength: 'Strength',
  core: 'Core',
  flexibility: 'Flexibility',
};

const CYCLING_LIBRARY = getCyclingWorkouts();
const RUNNING_LIBRARY = getRunningWorkouts();

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

function matches(w: WorkoutDefinition, q: string): boolean {
  if (!q) return true;
  return (
    w.name.toLowerCase().includes(q) ||
    w.category.toLowerCase().includes(q) ||
    (w.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
  );
}

/** Group workouts by category in CATEGORY_ORDER; only non-empty groups. */
function groupByCategory(workouts: WorkoutDefinition[]): Array<[string, WorkoutDefinition[]]> {
  const byCat = new Map<string, WorkoutDefinition[]>();
  for (const w of workouts) {
    const list = byCat.get(w.category) ?? [];
    list.push(w);
    byCat.set(w.category, list);
  }
  const ordered: Array<[string, WorkoutDefinition[]]> = [];
  for (const cat of CATEGORY_ORDER) {
    const list = byCat.get(cat);
    if (list && list.length) {
      ordered.push([cat, list.sort((a, b) => a.name.localeCompare(b.name))]);
      byCat.delete(cat);
    }
  }
  for (const [cat, list] of byCat) {
    ordered.push([cat, list.sort((a, b) => a.name.localeCompare(b.name))]);
  }
  return ordered;
}

function formatShortDate(iso: string): string {
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
  onDescribeWorkout,
  isMobile = false,
}: WorkoutPickerPanelProps) {
  const [tab, setTab] = useState<Tab>(plannedWorkouts.length > 0 ? 'planned' : 'bike');
  const [query, setQuery] = useState('');
  const [describeName, setDescribeName] = useState('');
  const [describeText, setDescribeText] = useState('');
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const handleDescribe = async () => {
    const description = describeText.trim();
    if (!description || !onDescribeWorkout) return;
    setIsReading(true);
    setDescribeError(null);
    try {
      const result = await onDescribeWorkout({
        description,
        name: describeName.trim() || null,
      });
      if (result.ok) {
        setDescribeText('');
        setDescribeName('');
      } else {
        setDescribeError(result.message ?? "That workout couldn't be read.");
      }
    } finally {
      setIsReading(false);
    }
  };

  const library = tab === 'run' ? RUNNING_LIBRARY : CYCLING_LIBRARY;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groupByCategory(library.filter((w) => matches(w, q)));
  }, [library, query]);

  // Desktop lives inside the rail flyout (which already scrolls); only bound the
  // height on mobile where the picker sits in a card with no outer scroll.
  const listBody = (children: React.ReactNode) =>
    isMobile ? (
      <ScrollArea.Autosize mah={280} type="auto">
        {children}
      </ScrollArea.Autosize>
    ) : (
      <Box>{children}</Box>
    );

  return (
    <Box data-testid="rb2-workout-picker" style={{ width: isMobile ? '100%' : undefined }}>
      <SegmentedControl
        fullWidth
        size="xs"
        value={tab}
        onChange={(v) => {
          setTab(v as Tab);
          setQuery('');
        }}
        data={[
          { label: `Planned${plannedWorkouts.length ? ` (${plannedWorkouts.length})` : ''}`, value: 'planned' },
          { label: 'Bike', value: 'bike' },
          { label: 'Run', value: 'run' },
          ...(onDescribeWorkout ? [{ label: 'Coach', value: 'describe' }] : []),
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

      {tab === 'describe' ? (
        <Box style={{ marginTop: 8 }}>
          <Text
            style={{
              fontFamily: RB2_FONT.body,
              fontSize: 12,
              color: RB2.textTertiary,
              marginBottom: 8,
            }}
          >
            Describe the session your coach gave you. It gets saved so you can ride
            it again.
          </Text>
          <TextInput
            data-testid="rb2-describe-name"
            value={describeName}
            onChange={(e) => setDescribeName(e.currentTarget.value)}
            placeholder="Name (optional)"
            size="xs"
            disabled={isReading}
            styles={{ input: { borderRadius: 0 } }}
          />
          <Textarea
            data-testid="rb2-describe-text"
            value={describeText}
            onChange={(e) => {
              setDescribeText(e.currentTarget.value);
              if (describeError) setDescribeError(null);
            }}
            placeholder={'e.g. 15min warmup, 4x8min @ threshold with 5min easy between, 10min cooldown'}
            autosize
            minRows={3}
            maxRows={7}
            size="xs"
            disabled={isReading}
            styles={{ input: { borderRadius: 0, marginTop: 6 } }}
          />
          {describeError && (
            <Text
              data-testid="rb2-describe-error"
              style={{
                fontFamily: RB2_FONT.body,
                fontSize: 11,
                color: RB2.coral,
                marginTop: 6,
              }}
            >
              {describeError}
            </Text>
          )}
          <Button
            data-testid="rb2-describe-submit"
            onClick={() => void handleDescribe()}
            disabled={!describeText.trim() || isReading}
            loading={isReading}
            size="xs"
            fullWidth
            styles={{ root: { borderRadius: 0, marginTop: 8 } }}
          >
            {isReading ? 'Reading…' : 'Use this workout'}
          </Button>
        </Box>
      ) : tab === 'planned' ? (
        <Box style={{ marginTop: 8 }}>
          {plannedWorkouts.length === 0 ? (
            <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textTertiary, padding: '8px 0' }}>
              No upcoming planned workouts. Browse the Bike or Run library, or use
              Coach to describe one you were given.
            </Text>
          ) : (
            listBody(
              plannedWorkouts.map((p) => (
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
              )),
            )
          )}
        </Box>
      ) : (
        <Box style={{ marginTop: 8 }}>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={`Search ${tab === 'run' ? 'running' : 'cycling'} workouts`}
            size="xs"
            leftSection={<MagnifyingGlass size={14} />}
            styles={{ input: { borderRadius: 0 } }}
          />
          <Box style={{ marginTop: 8 }}>
            {groups.length === 0 ? (
              <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textTertiary, padding: '8px 0' }}>
                No workouts match “{query}”.
              </Text>
            ) : (
              listBody(
                groups.map(([category, list]) => (
                  <Box key={category} style={{ marginBottom: 6 }}>
                    <Box
                      data-testid={`rb2-workout-cat-${category}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        padding: '6px 2px 2px',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: RB2_FONT.heading,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: RB2.textSecondary,
                        }}
                      >
                        {categoryLabel(category)}
                      </Text>
                      <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
                        {list.length}
                      </Text>
                    </Box>
                    {list.map((w) => (
                      <WorkoutRow
                        key={w.id}
                        testid={`rb2-workout-library-${w.id}`}
                        workout={w}
                        durationMinutes={w.duration}
                        selected={selectedWorkoutId === w.id}
                        onClick={() => onSelect(w)}
                      />
                    ))}
                  </Box>
                )),
              )
            )}
          </Box>
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
  const isRun = workout.sportType === 'running';
  const SportIcon = isRun ? PersonSimpleRun : Bicycle;
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
      <SportIcon size={14} color={RB2.textTertiary} style={{ flexShrink: 0 }} aria-label={isRun ? 'Running' : 'Cycling'} />
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
          {workout.category} · {durationMinutes}min · {workout.targetTSS} RSS
        </Text>
      </Box>
    </UnstyledButton>
  );
}

export default WorkoutPickerPanel;
