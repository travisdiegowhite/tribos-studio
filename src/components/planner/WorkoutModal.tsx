/**
 * WorkoutModal — the session detail.
 *
 * Draws one session from the shared training core
 * (`src/lib/training/session`): its sport, its steps (the same ones the
 * calendar glyph and Today draw), and — once it is done — how it compared with
 * the plan. It used to rebuild the session itself and was told every calendar
 * entry's sport was null, so runs got a bike icon, %FTP zones, "ride stress"
 * and a Zwift download; VO2 bars were invisible and sweet spot and threshold
 * shared a colour. None of that logic lives here any more.
 *
 * Modes:
 *   - a calendar entry (`entry` + `plannedWorkout`): view, edit plan, change
 *     workout, delete; planned vs actual when done.
 *   - add to an empty day (`isAdd`): pick a library workout, adjust, add.
 *   - a library workout preview (`workout` only).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  Pulse as IconActivity,
  Barbell as IconBarbell,
  Bicycle as IconBike,
  CaretDown as IconChevronDown,
  CaretUp as IconChevronUp,
  Clock as IconClock,
  FloppyDisk as IconDeviceFloppy,
  DownloadSimple as IconDownload,
  Drop as IconDroplet,
  Fire as IconFlame,
  Repeat as IconRepeat,
  PersonSimpleRun as IconRun,
  Trash as IconTrash,
} from '@phosphor-icons/react';
import posthog from 'posthog-js';
import type {
  CoreExercise,
  OffBikeWorkoutStructure,
  StrengthExercise,
  StretchExercise,
  WorkoutCategory,
  WorkoutDefinition,
} from '../../types/training';
import type { PlannerWorkout } from '../../types/planner';
import { calculateFuelPlanFromWorkout } from '../../utils/fueling';
import { exportWorkout, downloadWorkout } from '../../utils/workoutExport';
import { workoutStructureToCycling } from '../../utils/trainingPlanExport';
import { getTodayString } from '../../utils/dateUtils';
import { WORKOUT_LIBRARY } from '../../data/workoutLibrary';
import { RUNNING_WORKOUT_LIBRARY } from '../../data/runningWorkoutLibrary';
import { getAnyWorkoutById } from '../../data/workoutLookup';
import { WORKOUT_CATEGORY_PALETTE as CATEGORY_COLORS } from '../../utils/trainingPlans';
import {
  resolveSession,
  summarizeSteps,
  intervalSummary,
  formatMinutes,
  formatTarget,
  stepsLoad,
  sportNoun,
  sportIconName,
  usesPower,
  thresholdName,
  zonesFor,
  zoneColor,
  LOAD_LABEL,
  type SessionRow,
  type TargetAnchors,
} from '../../lib/training/session';
import { SessionProfile, ZoneLegend, ComplianceBadge } from '../training/session';
import { formatCadence } from './runningTargets';

// ============================================================
// TYPES
// ============================================================

interface WorkoutModalProps {
  workout: WorkoutDefinition | null;
  plannedWorkout: PlannerWorkout | null;
  /** The calendar row behind `plannedWorkout` — the session is resolved from it. */
  entry?: SessionRow | null;
  /** The athlete's FTP and threshold pace, for watts and paces. */
  anchors?: TargetAnchors;
  opened: boolean;
  onClose: () => void;
  onSave?: (updates: Partial<PlannerWorkout>) => void;
  onDelete?: () => void;
  scheduledDate?: string;
  /** Swap the existing planned workout to a different library workout. */
  onChangeWorkout?: (workoutId: string) => void;
  /** Add a new workout to an empty day (add mode). */
  onAddWorkout?: (
    workoutId: string,
    overrides: { targetTSS: number; targetDuration: number; notes: string }
  ) => void;
  /** Render in "add to an empty day" mode: pick a workout, then add it. */
  isAdd?: boolean;
  /** Kept for callers that still pass it; the session carries its own note. */
  structureNote?: string | null;
}

const OFF_BIKE_CATEGORIES = ['strength', 'core', 'flexibility'];

const SPORT_ICONS = {
  bike: IconBike,
  run: IconRun,
  barbell: IconBarbell,
  activity: IconActivity,
} as const;

function formatDateBadge(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatKm(km: number | null | undefined): string {
  return km && km > 0 ? `${Math.round(km * 10) / 10} km` : '—';
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Exercise list for strength/core/flexibility workouts. */
function ExerciseList({ exercises }: { exercises: OffBikeWorkoutStructure }) {
  return (
    <Stack gap="sm">
      {exercises.warmup && (
        <Paper p="sm" withBorder>
          <Group gap="xs" mb={4}>
            <Text size="sm" fw={600}>Warmup</Text>
            <Text size="xs" c="dimmed">{exercises.warmup.duration}min</Text>
          </Group>
          <Text size="xs" c="dimmed">{exercises.warmup.description}</Text>
        </Paper>
      )}
      {exercises.main.map((exercise, index) => {
        const ex = exercise as StrengthExercise & CoreExercise & StretchExercise;
        return (
          <Paper key={index} p="sm" withBorder>
            <Group justify="space-between" wrap="wrap" gap={4}>
              <Group gap="xs">
                <IconBarbell size={14} />
                <Text size="sm" fw={600}>{ex.name}</Text>
              </Group>
              <Group gap="xs">
                {ex.sets && ex.reps && <Badge size="xs" variant="light">{ex.sets} x {ex.reps}</Badge>}
                {ex.duration && !ex.reps && <Badge size="xs" variant="light">{ex.duration}s hold</Badge>}
                {ex.weight && <Badge size="xs" color="gray" variant="light">{ex.weight}</Badge>}
              </Group>
            </Group>
            {ex.instructions && <Text size="xs" c="dimmed" mt={6}>{ex.instructions}</Text>}
            {ex.restSeconds > 0 && <Text size="xs" c="dimmed" mt={2}>Rest: {ex.restSeconds}s between sets</Text>}
            {ex.muscleGroups && ex.muscleGroups.length > 0 && (
              <Group gap={4} mt={4}>
                {ex.muscleGroups.map((mg: string) => (
                  <Badge key={mg} size="xs" variant="dot" color="gray">{mg.replace('_', ' ')}</Badge>
                ))}
              </Group>
            )}
            {ex.alternatives && ex.alternatives.length > 0 && (
              <Text size="xs" c="dimmed" mt={2} fs="italic">Alt: {ex.alternatives.join(', ')}</Text>
            )}
          </Paper>
        );
      })}
      {exercises.cooldown && (
        <Paper p="sm" withBorder>
          <Group gap="xs" mb={4}>
            <Text size="sm" fw={600}>Cooldown</Text>
            <Text size="xs" c="dimmed">{exercises.cooldown.duration}min</Text>
          </Group>
          <Text size="xs" c="dimmed">{exercises.cooldown.description}</Text>
        </Paper>
      )}
    </Stack>
  );
}

/** Fuel plan for a ride long enough to need one. */
function FuelPlanSummary({ duration, category }: { duration: number; category: WorkoutCategory }) {
  const fuelPlan = useMemo(() => {
    try {
      return calculateFuelPlanFromWorkout({ duration, category });
    } catch {
      return null;
    }
  }, [duration, category]);
  if (!fuelPlan || duration < 45) return null;
  return (
    <Paper p="sm" withBorder>
      <Group gap="xs" mb="xs">
        <IconDroplet size={16} color="var(--color-easy)" />
        <Text size="sm" fw={600}>Fuel plan</Text>
        <Text size="xs" c="dimmed">{formatMinutes(duration)}</Text>
      </Group>
      <Group gap="lg">
        <Box><Text size="xs" c="dimmed">Carbs</Text><Text size="sm" fw={500}>{fuelPlan.carbs.gramsPerHourMin}-{fuelPlan.carbs.gramsPerHourMax}g/hr</Text></Box>
        <Box><Text size="xs" c="dimmed">Hydration</Text><Text size="sm" fw={500}>{fuelPlan.hydration.mlPerHour}ml/hr</Text></Box>
        <Box><Text size="xs" c="dimmed">Gels</Text><Text size="sm" fw={500}>{fuelPlan.gelsEquivalent.min}-{fuelPlan.gelsEquivalent.max}</Text></Box>
        <Box><Text size="xs" c="dimmed">Bottles</Text><Text size="sm" fw={500}>{fuelPlan.bottlesNeeded}</Text></Box>
      </Group>
    </Paper>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function WorkoutModal({
  workout: workoutProp,
  plannedWorkout,
  entry = null,
  anchors = {},
  opened,
  onClose,
  onSave,
  onDelete,
  scheduledDate,
  onChangeWorkout,
  onAddWorkout,
  isAdd = false,
}: WorkoutModalProps) {
  const [editTSS, setEditTSS] = useState<number>(0);
  const [editDuration, setEditDuration] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [showSteps, setShowSteps] = useState(true);
  const [editingDone, setEditingDone] = useState(false);
  const [chosenWorkoutId, setChosenWorkoutId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Add mode: the picked library workout; otherwise what the caller passed.
  const workout = workoutProp ?? (chosenWorkoutId ? getAnyWorkoutById(chosenWorkoutId) : null);

  const workoutOptions = useMemo(() => {
    const byCategory: Record<string, { value: string; label: string }[]> = {};
    for (const w of Object.values(WORKOUT_LIBRARY)) {
      (byCategory[`ride · ${w.category}`] ||= []).push({ value: w.id, label: w.name });
    }
    for (const w of Object.values(RUNNING_WORKOUT_LIBRARY)) {
      (byCategory[`run · ${w.category}`] ||= []).push({ value: w.id, label: w.name });
    }
    return Object.entries(byCategory)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, items]) => ({
        group: group.replace('_', ' '),
        items: items.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, []);

  useEffect(() => {
    if (opened) {
      setChosenWorkoutId(null);
      setPickerOpen(false);
      setEditingDone(false);
    }
  }, [opened]);

  useEffect(() => {
    if (plannedWorkout) {
      setEditTSS(plannedWorkout.targetTSS);
      setEditDuration(plannedWorkout.targetDuration);
      setEditNotes(plannedWorkout.notes || '');
    } else if (workout) {
      setEditTSS(workout.targetTSS);
      setEditDuration(workout.duration);
      setEditNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedWorkout, workout?.id, opened]);

  const editable = !!plannedWorkout || isAdd;
  const today = getTodayString();

  // The row the session is resolved from: the calendar entry, or (add mode /
  // preview) the library workout itself. The edited length re-fits the shape
  // live, so the profile tracks the number in the field.
  const baseRow: SessionRow | null = useMemo(() => {
    if (entry) return entry;
    if (!workout) return null;
    return {
      name: workout.name,
      workout_id: workout.id,
      workout_type: workout.category,
      sport: workout.sportType === 'running' ? 'running' : OFF_BIKE_CATEGORIES.includes(workout.category) ? 'other' : 'cycling',
      target_duration: workout.duration,
      target_rss: workout.targetTSS,
    };
  }, [entry, workout]);

  const session = useMemo(() => {
    if (!baseRow) return null;
    const row = editable && editDuration > 0
      ? { ...baseRow, target_duration: editDuration, target_duration_min: editDuration }
      : baseRow;
    return resolveSession(row, { today, thresholdPaceSec: anchors.thresholdPaceSec });
  }, [baseRow, editable, editDuration, today, anchors.thresholdPaceSec]);

  if (!workout && !session) {
    if (!isAdd) return null;
    return (
      <Modal
        opened={opened}
        onClose={onClose}
        title={
          <Group gap="xs">
            <Text fw={600} size="lg">Add workout</Text>
            {scheduledDate && <Badge variant="light" color="gray" size="sm">{formatDateBadge(scheduledDate)}</Badge>}
          </Group>
        }
        size="lg"
      >
        <Stack gap="md" p="md">
          <Text size="sm" c="dimmed">Choose a workout to add to this day.</Text>
          <Select
            data={workoutOptions}
            value={chosenWorkoutId}
            onChange={setChosenWorkoutId}
            placeholder="Search workouts…"
            searchable
            nothingFoundMessage="No workouts found"
            maxDropdownHeight={320}
          />
        </Stack>
      </Modal>
    );
  }
  if (!session) return null;

  const sport = session.sport;
  const SportIcon = SPORT_ICONS[sportIconName(sport)];
  const category = (session.workout?.category ?? workout?.category ?? 'endurance') as WorkoutCategory;
  const isOffBike = OFF_BIKE_CATEGORIES.includes(category) || sport === 'other';
  const exercises = session.workout?.exercises ?? workout?.exercises;
  const steps = session.steps;
  const hasSteps = steps.length > 0;
  const blocks = summarizeSteps(steps);
  const summary = intervalSummary(steps);
  const zones = zonesFor(sport);
  const isDone = !!session.actual || session.status === 'done';
  const showComparison = !!plannedWorkout && (isDone || session.compliance.band === 'missed');
  const fieldsLocked = isDone && !editingDone;
  const intensity = session.planned.load && session.planned.durationMin
    ? Math.sqrt(session.planned.load / ((session.planned.durationMin / 60) * 100))
    : null;

  // Device files are ride files today: a run exported this way became a bike
  // workout at ~50% FTP. Runs get their own export separately.
  const exportStructure = hasSteps && usesPower(sport) && session.workout?.structure
    ? (session.source === 'library' && session.workout.cyclingStructure
        ? session.workout.cyclingStructure
        : workoutStructureToCycling(session.workout.structure))
    : null;

  const hasChanges = !!plannedWorkout && (
    editTSS !== plannedWorkout.targetTSS ||
    editDuration !== plannedWorkout.targetDuration ||
    editNotes !== (plannedWorkout.notes || '')
  );

  // Changing the length changes the session, so its planned load follows:
  // re-fitted steps scored with the actual-load formula (rides and runs alike).
  const loadForDuration = (minutes: number): number => {
    if (minutes <= 0) return 0;
    if (baseRow && hasSteps) {
      const refit = resolveSession({ ...baseRow, target_duration: minutes, target_duration_min: minutes }, {
        today,
        thresholdPaceSec: anchors.thresholdPaceSec,
      });
      if (refit.steps.length > 0) return stepsLoad(refit.steps);
    }
    return editDuration > 0 ? Math.round((editTSS * minutes) / editDuration) : editTSS;
  };

  const handleSave = () => {
    if (onSave && hasChanges) {
      onSave({ targetTSS: editTSS, targetDuration: editDuration, notes: editNotes });
    }
    onClose();
  };

  const handleExport = (format: 'fit' | 'zwo' | 'tcx') => {
    if (!exportStructure) return;
    try {
      const result = exportWorkout(exportStructure, {
        format,
        workoutName: scheduledDate ? `${session.title} ${scheduledDate}` : session.title,
        description: [session.description, summary !== 'Steady' ? summary : ''].filter(Boolean).join(' — '),
      });
      downloadWorkout(result);
      try {
        posthog.capture('workout_exported', {
          format,
          shape: session.sourceNote ? 'stand_in' : 'prescribed_or_library',
          planned: !!plannedWorkout,
          category,
          sport,
        });
      } catch {
        // telemetry never breaks an export
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap">
          <SportIcon size={20} aria-label={sportNoun(sport)} />
          <Text fw={600} size="lg">{session.title}</Text>
          {scheduledDate && <Badge variant="light" color="gray" size="sm">{formatDateBadge(scheduledDate)}</Badge>}
        </Group>
      }
      size="lg"
      styles={{ body: { padding: 0 } }}
    >
      <ScrollArea.Autosize mah="70vh" offsetScrollbars>
        <Stack gap="md" p="md">
          {/* Overview */}
          <Paper p="sm" withBorder>
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Group gap="xs">
                <Badge color={CATEGORY_COLORS[category] || 'gray'} variant="light">{category.replace('_', ' ')}</Badge>
                <Badge color="gray" variant="outline" size="xs">{sportNoun(sport)}</Badge>
              </Group>
              <Group gap="md">
                {session.planned.durationMin != null && (
                  <Group gap={4}>
                    <IconClock size={16} color="var(--color-text-muted)" />
                    <Text size="sm" c="dimmed">{formatMinutes(session.planned.durationMin)}</Text>
                  </Group>
                )}
                {session.planned.load != null && (
                  <Group gap={4}>
                    <IconFlame size={16} color="var(--color-signal-text)" />
                    <Text size="sm" fw={500}>{Math.round(session.planned.load)} {LOAD_LABEL.toLowerCase()}</Text>
                  </Group>
                )}
                {intensity != null && !isOffBike && (
                  <Tooltip label={`Intensity — effort as a share of your ${thresholdName(sport)}`}>
                    <Text size="sm" c="dimmed">{usesPower(sport) ? 'RI' : 'Intensity'} {intensity.toFixed(2)}</Text>
                  </Tooltip>
                )}
              </Group>
            </Group>

            {session.description && <Text size="sm" mt="xs" c="dimmed">{session.description}</Text>}

            {hasSteps && summary !== 'Steady' && (
              <Group gap="xs" mt="xs">
                <IconRepeat size={14} />
                <Text size="sm" fw={500}>{summary}</Text>
              </Group>
            )}

            {(onChangeWorkout || isAdd) && (
              <Box mt="sm">
                {pickerOpen ? (
                  <Select
                    data={workoutOptions}
                    value={isAdd ? chosenWorkoutId : null}
                    onChange={(value) => {
                      if (!value) return;
                      if (isAdd) setChosenWorkoutId(value);
                      else onChangeWorkout?.(value);
                      setPickerOpen(false);
                    }}
                    placeholder="Search workouts…"
                    searchable
                    nothingFoundMessage="No workouts found"
                    maxDropdownHeight={320}
                  />
                ) : (
                  <Button variant="subtle" size="compact-xs" leftSection={<IconRepeat size={14} />} onClick={() => setPickerOpen(true)}>
                    {isAdd ? 'Pick a different workout' : 'Change workout'}
                  </Button>
                )}
              </Box>
            )}
          </Paper>

          {/* Planned vs actual */}
          {showComparison && (
            <Paper p="sm" withBorder data-testid="planned-vs-actual">
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600}>Planned vs actual</Text>
                <ComplianceBadge compliance={session.compliance} size="xs" />
              </Group>
              <Table withRowBorders={false} verticalSpacing={2} fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th />
                    <Table.Th ta="right">Planned</Table.Th>
                    <Table.Th ta="right">Actual</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td c="dimmed">Time</Table.Td>
                    <Table.Td ta="right" ff="monospace">{session.planned.durationMin ? formatMinutes(session.planned.durationMin) : '—'}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{session.actual?.durationMin ? formatMinutes(session.actual.durationMin) : '—'}</Table.Td>
                  </Table.Tr>
                  {(session.planned.distanceKm || session.actual?.distanceKm) && (
                    <Table.Tr>
                      <Table.Td c="dimmed">Distance</Table.Td>
                      <Table.Td ta="right" ff="monospace">{formatKm(session.planned.distanceKm)}</Table.Td>
                      <Table.Td ta="right" ff="monospace">{formatKm(session.actual?.distanceKm)}</Table.Td>
                    </Table.Tr>
                  )}
                  <Table.Tr>
                    <Table.Td c="dimmed">{LOAD_LABEL}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{session.planned.load != null ? Math.round(session.planned.load) : '—'}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{session.actual?.load != null ? Math.round(session.actual.load) : '—'}</Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {/* Profile + steps */}
          {hasSteps && !isOffBike && (
            <>
              <Box>
                <Text size="sm" fw={600} mb="xs">Workout profile</Text>
                <SessionProfile steps={steps} sport={sport} anchors={anchors} />
                {session.sourceNote && (
                  <Text size="xs" c="dimmed" mt={6} data-testid="structure-note">{session.sourceNote}</Text>
                )}
                <Box mt="xs"><ZoneLegend steps={steps} sport={sport} /></Box>
              </Box>

              <Box>
                <Group gap="xs" mb="xs" style={{ cursor: 'pointer' }} onClick={() => setShowSteps(!showSteps)}>
                  <Text size="sm" fw={600}>Interval details</Text>
                  <ActionIcon size="xs" variant="subtle" color="gray" aria-label={showSteps ? 'Hide interval details' : 'Show interval details'}>
                    {showSteps ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                  </ActionIcon>
                </Group>
                <Collapse in={showSteps}>
                  <Stack gap={4} data-testid="step-list">
                    {blocks.map((b, i) => {
                      const step = b.kind === 'repeat' ? b.work : b.step;
                      const zone = step.zone != null ? zones[step.zone] : null;
                      return (
                        <Group key={i} gap="sm" wrap="nowrap" align="flex-start">
                          <Box style={{ width: 4, alignSelf: 'stretch', background: zoneColor(step.zone) }} />
                          <Box style={{ flex: 1 }}>
                            <Text size="sm" fw={500}>
                              {b.kind === 'repeat' ? `${b.count} × ${formatMinutes(step.durationMin)}` : `${step.label} · ${formatMinutes(step.durationMin)}`}
                              {zone && <Text span size="xs" c="dimmed">{'  '}{zone.short} {zone.label}</Text>}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {[
                                formatTarget(step.target, anchors),
                                step.cadence ? formatCadence(step.cadence, sport) : null,
                                b.kind === 'repeat' && b.rest ? `${formatMinutes(b.rest.durationMin)} easy between` : null,
                                // The set's own note, when it says more than its length and band.
                                b.kind === 'repeat' && step.label && !/^(work|rep|effort)$/i.test(step.label) && !/^\d/.test(step.label)
                                  ? step.label.replace(/^.*?·\s*/, '')
                                  : null,
                              ].filter(Boolean).join(' · ')}
                            </Text>
                          </Box>
                        </Group>
                      );
                    })}
                  </Stack>
                </Collapse>
              </Box>
            </>
          )}

          {isOffBike && exercises && (
            <Box>
              <Text size="sm" fw={600} mb="xs">Exercises</Text>
              <ExerciseList exercises={exercises} />
            </Box>
          )}

          {session.coachNotes && (
            <Paper p="sm" withBorder>
              <Text size="sm" fw={600} mb={4}>Coach notes</Text>
              <Text size="sm" c="dimmed" fs="italic">{session.coachNotes}</Text>
            </Paper>
          )}

          {session.timing && (
            <Text size="sm" c="dimmed">When: {session.timing}</Text>
          )}

          {editable && (
            <>
              <Divider label="Plan" labelPosition="center" />
              {fieldsLocked ? (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">This {sportNoun(sport)} is done; its plan is shown above.</Text>
                  <Button variant="subtle" size="compact-xs" onClick={() => setEditingDone(true)}>Edit plan</Button>
                </Group>
              ) : (
                <Group grow>
                  <NumberInput
                    label={`Planned ${LOAD_LABEL.toLowerCase()}`}
                    value={editTSS}
                    onChange={(val) => setEditTSS(typeof val === 'number' ? val : 0)}
                    min={0}
                    max={500}
                  />
                  <NumberInput
                    label="Duration (min)"
                    value={editDuration}
                    onChange={(val) => {
                      const minutes = typeof val === 'number' ? val : 0;
                      setEditTSS(loadForDuration(minutes));
                      setEditDuration(minutes);
                    }}
                    min={0}
                    max={600}
                  />
                </Group>
              )}
            </>
          )}

          {usesPower(sport) && !isOffBike && (
            <FuelPlanSummary duration={editable ? editDuration : session.planned.durationMin ?? 0} category={category} />
          )}

          {editable && !fieldsLocked && (
            <Textarea
              label="Notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.currentTarget.value)}
              placeholder="Add workout notes..."
              minRows={2}
              maxRows={4}
              autosize
            />
          )}
          {editable && fieldsLocked && editNotes && <Text size="sm" c="dimmed">{editNotes}</Text>}

          {exportStructure && (
            <Box data-testid="workout-export">
              <Text size="xs" c="dimmed" ta="center" mb="xs">Download for device</Text>
              <Group justify="center" gap="xs">
                <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={() => handleExport('fit')}>
                  FIT (Garmin/Wahoo)
                </Button>
                <Button size="xs" variant="light" color="gray" leftSection={<IconDownload size={14} />} onClick={() => handleExport('zwo')}>
                  ZWO (Zwift)
                </Button>
                <Button size="xs" variant="light" color="gray" leftSection={<IconDownload size={14} />} onClick={() => handleExport('tcx')}>
                  TCX
                </Button>
              </Group>
            </Box>
          )}
        </Stack>
      </ScrollArea.Autosize>

      {plannedWorkout && !isAdd && (
        <Group justify="space-between" p="md" pt="sm" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Button
            variant="subtle"
            color="red"
            size="sm"
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              onDelete?.();
              onClose();
            }}
          >
            Delete
          </Button>
          <Group gap="xs">
            <Button variant="subtle" color="gray" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" leftSection={<IconDeviceFloppy size={16} />} onClick={handleSave} disabled={!hasChanges}>
              Save
            </Button>
          </Group>
        </Group>
      )}

      {isAdd && (
        <Group justify="flex-end" p="md" pt="sm" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Button variant="subtle" color="gray" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={() => {
              if (!workout) return;
              onAddWorkout?.(workout.id, { targetTSS: editTSS, targetDuration: editDuration, notes: editNotes });
              onClose();
            }}
          >
            Add to day
          </Button>
        </Group>
      )}
    </Modal>
  );
}

export default WorkoutModal;
