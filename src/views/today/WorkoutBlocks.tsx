/**
 * WorkoutBlocks — interval bar visualization for today's workout
 *
 * Reads the workout's `structure` (warmup / main[] / cooldown) — the
 * shape defined in src/types/training.ts that the audit confirms is
 * already enriched on PlannedWorkoutWithDetails by useTrainingPlan.
 *
 * Each segment renders as a flex bar with width proportional to its
 * duration; color comes from src/utils/todayVocabulary.ts colorForZone.
 *
 * Below the bars, a one-line plain-English summary like:
 *   "Warm up 20 min · 3 × 8 min @ threshold (4 min easy) · Cool 10 min"
 */

import { Box, Stack, Text } from '@mantine/core';
import type {
  PlannedWorkoutWithDetails,
  WorkoutInterval,
  WorkoutSegment,
  WorkoutWarmupCooldown,
} from '../../types/training';
import { isWorkoutInterval } from '../../types/training';
import { colorForZone } from '../../utils/todayVocabulary';

interface WorkoutBlocksProps {
  workout: PlannedWorkoutWithDetails | null;
}

interface FlatBlock {
  duration: number;
  zone: number | null;
  label: string;
}

function flattenStructure(structure: PlannedWorkoutWithDetails['workout']): FlatBlock[] {
  const def = structure;
  if (!def?.structure) return [];

  const out: FlatBlock[] = [];
  const { warmup, main, cooldown } = def.structure;

  if (warmup) {
    out.push(flattenWarmup(warmup, 'warmup'));
  }
  for (const seg of main) {
    if (isWorkoutInterval(seg)) {
      // Render a repeat interval as alternating work/rest blocks.
      const interval = seg as WorkoutInterval;
      for (let i = 0; i < interval.sets; i++) {
        if (Array.isArray(interval.work)) {
          for (const inner of interval.work) {
            if (isWorkoutInterval(inner)) continue;
            out.push(flattenSegment(inner as WorkoutSegment, 'work'));
          }
        } else if ('zone' in (interval.work as object)) {
          out.push(flattenSegment(interval.work as WorkoutSegment, 'work'));
        }
        if (interval.rest) {
          const rest = interval.rest as WorkoutSegment | { duration: number; zone: null };
          if ('zone' in rest && rest.zone != null) {
            out.push(flattenSegment(rest as WorkoutSegment, 'rest'));
          } else {
            out.push({ duration: rest.duration, zone: null, label: 'rest' });
          }
        }
      }
    } else {
      out.push(flattenSegment(seg as WorkoutSegment, 'main'));
    }
  }
  if (cooldown) {
    out.push(flattenWarmup(cooldown, 'cooldown'));
  }

  return out.filter((b) => b.duration > 0);
}

function flattenWarmup(seg: WorkoutWarmupCooldown, kind: 'warmup' | 'cooldown'): FlatBlock {
  return {
    duration: seg.duration,
    zone: typeof seg.zone === 'number' ? seg.zone : null,
    label: kind,
  };
}

function flattenSegment(seg: WorkoutSegment, kind: 'work' | 'main' | 'rest'): FlatBlock {
  return {
    duration: seg.duration,
    zone: typeof seg.zone === 'number' ? seg.zone : null,
    label: kind,
  };
}

/**
 * Build a one-line plain-English summary. Recognizes a single repeating
 * interval ("3 × 8 min @ threshold") if the structure has one.
 */
function buildSummary(workout: PlannedWorkoutWithDetails): string {
  const def = workout.workout;
  if (!def?.structure) return '';

  const parts: string[] = [];
  const { warmup, main, cooldown } = def.structure;

  if (warmup) parts.push(`Warm up ${warmup.duration} min`);

  const interval = main.find(isWorkoutInterval) as WorkoutInterval | undefined;
  if (interval && main.length === 1) {
    let workDuration: number | null = null;
    if (Array.isArray(interval.work)) {
      const total = interval.work.reduce((s, x) => s + ('duration' in x ? x.duration : 0), 0);
      workDuration = total;
    } else if ('duration' in interval.work) {
      workDuration = (interval.work as WorkoutSegment).duration;
    }
    const restDuration = interval.rest && 'duration' in interval.rest ? interval.rest.duration : null;
    if (workDuration && restDuration) {
      parts.push(`${interval.sets} × ${workDuration} min @ ${describeWorkout(workout)} (${restDuration} min easy)`);
    } else if (workDuration) {
      parts.push(`${interval.sets} × ${workDuration} min @ ${describeWorkout(workout)}`);
    }
  } else {
    const totalMain = main.reduce((s, m) => s + (isWorkoutInterval(m) ? 0 : (m as WorkoutSegment).duration || 0), 0);
    if (totalMain > 0) parts.push(`${describeWorkout(workout)} ${totalMain} min`);
  }

  if (cooldown) parts.push(`Cool ${cooldown.duration} min`);
  return parts.join(' · ');
}

function describeWorkout(workout: PlannedWorkoutWithDetails): string {
  const t = workout.workout?.category || workout.workout_type || '';
  const map: Record<string, string> = {
    threshold: 'threshold',
    tempo: 'tempo',
    sweet_spot: 'sweet spot',
    vo2max: 'VO₂ max',
    endurance: 'endurance',
    recovery: 'recovery',
    anaerobic: 'anaerobic',
    climbing: 'climbing',
  };
  return map[t] || t || 'work';
}

function WorkoutBlocks({ workout }: WorkoutBlocksProps) {
  if (!workout) {
    return (
      <Box
        style={{
          background: 'var(--tribos-card)',
          border: '1.5px solid var(--tribos-border-default)',
          padding: 16,
          borderRadius: 0,
        }}
      >
        <Stack gap={6}>
          <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
            Today's Workout
          </Text>
          <Text size="sm" c="dimmed">No workout planned for today.</Text>
        </Stack>
      </Box>
    );
  }

  const blocks = flattenStructure(workout.workout);
  const totalDuration = blocks.reduce((s, b) => s + b.duration, 0);
  const summary = buildSummary(workout);

  return (
    <Box
      component="section"
      style={{
        background: 'var(--tribos-card)',
        border: '1.5px solid var(--tribos-border-default)',
        padding: 16,
        borderRadius: 0,
      }}
    >
      <Stack gap={10}>
        <Stack gap={2}>
          <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
            Today's Workout
          </Text>
          <Text size="lg" fw={600}>
            {(workout as typeof workout & { name?: string }).name || workout.workout?.name || 'Workout'}
          </Text>
          {totalDuration > 0 && (
            <Text size="xs" ff="monospace" c="dimmed">
              {totalDuration} min total
            </Text>
          )}
        </Stack>

        {blocks.length > 0 && (
          <Box style={{ display: 'flex', height: 38, gap: 1 }}>
            {blocks.map((b, i) => (
              <Box
                key={i}
                style={{
                  flex: b.duration,
                  background: colorForZone(b.zone),
                  height: '100%',
                  position: 'relative',
                }}
                title={`${b.label} ${b.duration} min · zone ${b.zone ?? '?'}`}
              />
            ))}
          </Box>
        )}

        {summary && (
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
            {summary}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

export default WorkoutBlocks;
