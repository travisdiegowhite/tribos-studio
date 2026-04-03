/**
 * WorkoutModal Component
 * Combined workout details + edit modal
 * Shows workout structure, intervals, coach notes at top
 * Editable fields (TSS, duration, notes), fuel plan, and export at bottom
 */

import { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  Box,
  Text,
  Group,
  Stack,
  Badge,
  Paper,
  Divider,
  Timeline,
  ThemeIcon,
  Tooltip,
  NumberInput,
  Textarea,
  Button,
  ScrollArea,
  Collapse,
  ActionIcon,
} from '@mantine/core';
import type {
  WorkoutDefinition,
  WorkoutSegment,
  WorkoutInterval,
  WorkoutStructure,
  WorkoutCategory,
  OffBikeWorkoutStructure,
  StrengthExercise,
  CoreExercise,
  StretchExercise,
} from '../../types/training';
import type { PlannerWorkout } from '../../types/planner';
import {
  Clock,
  Fire,
  Heart,
  Heartbeat,
  Lightning,
  Play,
  Repeat,
  TrendUp,
  FloppyDisk,
  Trash,
  X,
  DownloadSimple,
  Barbell,
  CaretDown,
  CaretUp,
  Timer,
  Drop,
} from '@phosphor-icons/react';
import { calculateFuelPlanFromWorkout } from '../../utils/fueling';
import { exportWorkout, downloadWorkout } from '../../utils/workoutExport';

// ============================================================
// TYPES
// ============================================================

interface WorkoutModalProps {
  workout: WorkoutDefinition | null;
  plannedWorkout: PlannerWorkout | null;
  opened: boolean;
  onClose: () => void;
  onSave?: (updates: Partial<PlannerWorkout>) => void;
  onDelete?: () => void;
  scheduledDate?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const ZONE_COLORS: Record<number | string, string> = {
  1: 'green',
  2: 'blue',
  3: 'yellow',
  3.5: 'orange',
  4: 'red',
  5: 'red.8',
  6: 'grape',
  7: 'pink',
};

const ZONE_NAMES: Record<number | string, string> = {
  1: 'Recovery',
  2: 'Endurance',
  3: 'Tempo',
  3.5: 'Sweet Spot',
  4: 'Threshold',
  5: 'VO2 Max',
  6: 'Anaerobic',
  7: 'Sprint',
};

const CATEGORY_COLORS: Record<string, string> = {
  recovery: 'green',
  endurance: 'blue',
  tempo: 'yellow',
  sweet_spot: 'orange',
  threshold: 'red',
  vo2max: 'grape',
  climbing: 'teal',
  anaerobic: 'pink',
  racing: 'red',
  strength: 'cyan',
  core: 'indigo',
  flexibility: 'violet',
  rest: 'gray',
};

const CATEGORY_ICONS: Record<string, string> = {
  recovery: '🌿',
  endurance: '🚴',
  tempo: '⚡',
  sweet_spot: '🍯',
  threshold: '🔥',
  vo2max: '💨',
  anaerobic: '💥',
  climbing: '⛰️',
  racing: '🏁',
  strength: '💪',
  core: '🎯',
  flexibility: '🧘',
  rest: '😴',
};

const OFF_BIKE_CATEGORIES = ['strength', 'core', 'flexibility'];

// ============================================================
// HELPERS
// ============================================================

function getZoneColor(zone: number | null): string {
  if (zone === null) return 'gray';
  return ZONE_COLORS[zone] || 'gray';
}

function getZoneName(zone: number | null): string {
  if (zone === null) return 'Active';
  return ZONE_NAMES[zone] || `Zone ${zone}`;
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || 'gray';
}

function formatDuration(minutes: number): string {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)}s`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${Math.round(minutes)}m`;
}

function formatDateBadge(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// ============================================================
// FLATTEN WORKOUT STRUCTURE
// ============================================================

interface FlattenedSegment {
  type: 'warmup' | 'main' | 'rest' | 'cooldown';
  duration: number;
  zone: number | null;
  powerPctFTP?: number;
  cadence?: string;
  description: string;
  setNumber?: number;
  totalSets?: number;
  isRepeat?: boolean;
}

function flattenStructure(structure: WorkoutStructure): FlattenedSegment[] {
  const segments: FlattenedSegment[] = [];

  if (structure.warmup) {
    segments.push({
      type: 'warmup',
      duration: structure.warmup.duration,
      zone: structure.warmup.zone,
      powerPctFTP: structure.warmup.powerPctFTP,
      description: 'Warmup',
    });
  }

  function processSegmentOrInterval(
    item: WorkoutSegment | WorkoutInterval,
    parentSetInfo?: { setNumber: number; totalSets: number }
  ) {
    if ('type' in item && item.type === 'repeat') {
      const interval = item as WorkoutInterval;
      for (let set = 1; set <= interval.sets; set++) {
        const workItems = Array.isArray(interval.work) ? interval.work : [interval.work];
        for (const workItem of workItems) {
          if ('type' in workItem && workItem.type === 'repeat') {
            processSegmentOrInterval(workItem, { setNumber: set, totalSets: interval.sets });
          } else {
            const workSeg = workItem as WorkoutSegment;
            segments.push({
              type: 'main',
              duration: workSeg.duration,
              zone: workSeg.zone,
              powerPctFTP: workSeg.powerPctFTP,
              cadence: workSeg.cadence,
              description: workSeg.description || 'Work',
              setNumber: set,
              totalSets: interval.sets,
              isRepeat: true,
            });
          }
        }

        if (set < interval.sets && interval.rest && interval.rest.duration > 0) {
          const restSeg = interval.rest as WorkoutSegment;
          segments.push({
            type: 'rest',
            duration: restSeg.duration,
            zone: restSeg.zone,
            description: restSeg.description || 'Recovery',
            setNumber: set,
            totalSets: interval.sets,
            isRepeat: true,
          });
        }
      }
    } else {
      const seg = item as WorkoutSegment;
      segments.push({
        type: 'main',
        duration: seg.duration,
        zone: seg.zone,
        powerPctFTP: seg.powerPctFTP,
        cadence: seg.cadence,
        description: seg.description,
        ...(parentSetInfo && {
          setNumber: parentSetInfo.setNumber,
          totalSets: parentSetInfo.totalSets,
          isRepeat: true,
        }),
      });
    }
  }

  for (const item of structure.main) {
    processSegmentOrInterval(item);
  }

  if (structure.cooldown) {
    segments.push({
      type: 'cooldown',
      duration: structure.cooldown.duration,
      zone: structure.cooldown.zone,
      powerPctFTP: structure.cooldown.powerPctFTP,
      description: 'Cooldown',
    });
  }

  return segments;
}

function calculateTotalTime(segments: FlattenedSegment[]): number {
  return segments.reduce((sum, seg) => sum + seg.duration, 0);
}

function summarizeIntervals(structure: WorkoutStructure): string {
  const parts: string[] = [];
  for (const item of structure.main) {
    if ('type' in item && item.type === 'repeat') {
      const interval = item as WorkoutInterval;
      const workItems = Array.isArray(interval.work) ? interval.work : [interval.work];
      const firstWork = workItems[0] as WorkoutSegment;
      if (firstWork && 'duration' in firstWork) {
        const duration = firstWork.duration;
        const durationStr = duration < 1 ? `${Math.round(duration * 60)}s` : `${Math.round(duration)}min`;
        parts.push(`${interval.sets}x${durationStr}`);
      }
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'Steady effort';
}

function getSegmentIcon(segment: FlattenedSegment) {
  if (segment.type === 'warmup' || segment.type === 'cooldown') return <Heart size={14} />;
  if (segment.type === 'rest') return <Heartbeat size={14} />;
  if (segment.zone && segment.zone >= 5) return <Lightning size={14} />;
  if (segment.isRepeat) return <Repeat size={14} />;
  return <TrendUp size={14} />;
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Visual power chart */
function IntervalChart({ segments }: { segments: FlattenedSegment[] }) {
  const totalTime = calculateTotalTime(segments);
  if (totalTime === 0) return null;

  const getBarHeight = (zone: number | null) => {
    if (zone === null) return 30;
    return 20 + ((zone / 7) * 80);
  };

  return (
    <Box
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        height: 120,
        backgroundColor: 'var(--mantine-color-dark-6)',
        borderRadius: 8,
        padding: 8,
        paddingBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {[2, 4, 6].map((zone) => (
        <Box
          key={zone}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 24 + (getBarHeight(zone) / 100 * 88),
            height: 1,
            borderTop: '1px dashed var(--mantine-color-dark-4)',
          }}
        />
      ))}

      {segments.map((segment, index) => {
        const widthPercent = (segment.duration / totalTime) * 100;
        const height = getBarHeight(segment.zone);
        const color = getZoneColor(segment.zone);

        return (
          <Tooltip
            key={index}
            label={
              <Stack gap={2}>
                <Text size="xs" fw={500}>{segment.description}</Text>
                <Text size="xs">{formatDuration(segment.duration)} @ {getZoneName(segment.zone)}</Text>
                {segment.powerPctFTP && <Text size="xs">{segment.powerPctFTP}% FTP</Text>}
              </Stack>
            }
          >
            <Box
              style={{
                width: `${widthPercent}%`,
                minWidth: 4,
                height: `${height}%`,
                backgroundColor: `var(--mantine-color-${color}-6)`,
                marginRight: 1,
                borderRadius: '2px 2px 0 0',
                transition: 'height 0.2s ease',
                cursor: 'pointer',
                opacity: segment.type === 'rest' ? 0.6 : 1,
              }}
            />
          </Tooltip>
        );
      })}

      <Box
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 4,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Text size="xs" c="dimmed">0</Text>
        <Text size="xs" c="dimmed">{formatDuration(totalTime / 2)}</Text>
        <Text size="xs" c="dimmed">{formatDuration(totalTime)}</Text>
      </Box>
    </Box>
  );
}

/** Exercise list for strength/core/flexibility workouts */
function ExerciseList({ exercises }: { exercises: OffBikeWorkoutStructure }) {
  return (
    <Stack gap="sm">
      {/* Warmup */}
      {exercises.warmup && (
        <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
          <Group gap="xs" mb={4}>
            <ThemeIcon size={20} color="green" variant="light" radius="xl">
              <Heart size={12} />
            </ThemeIcon>
            <Text size="sm" fw={600}>Warmup</Text>
            <Text size="xs" c="dimmed">{exercises.warmup.duration}min</Text>
          </Group>
          <Text size="xs" c="dimmed" ml={28}>{exercises.warmup.description}</Text>
        </Paper>
      )}

      {/* Main exercises */}
      {exercises.main.map((exercise, index) => {
        const ex = exercise as StrengthExercise & CoreExercise & StretchExercise;
        return (
          <Paper key={index} p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
            <Group justify="space-between" wrap="wrap" gap={4}>
              <Group gap="xs">
                <ThemeIcon size={20} color="orange" variant="light" radius="xl">
                  <Barbell size={12} />
                </ThemeIcon>
                <Text size="sm" fw={600}>{ex.name}</Text>
              </Group>
              <Group gap="xs">
                {ex.sets && ex.reps && (
                  <Badge size="xs" color="orange" variant="light">
                    {ex.sets} x {ex.reps}
                  </Badge>
                )}
                {ex.duration && !ex.reps && (
                  <Badge size="xs" color="blue" variant="light">
                    {ex.duration}s hold
                  </Badge>
                )}
                {ex.weight && (
                  <Badge size="xs" color="gray" variant="light">
                    {ex.weight}
                  </Badge>
                )}
              </Group>
            </Group>
            {ex.instructions && (
              <Text size="xs" c="dimmed" mt={6} ml={28}>
                {ex.instructions}
              </Text>
            )}
            {ex.restSeconds > 0 && (
              <Text size="xs" c="dimmed" mt={2} ml={28}>
                Rest: {ex.restSeconds}s between sets
              </Text>
            )}
            {ex.muscleGroups && ex.muscleGroups.length > 0 && (
              <Group gap={4} mt={4} ml={28}>
                {ex.muscleGroups.map((mg: string) => (
                  <Badge key={mg} size="xs" variant="dot" color="gray">
                    {mg.replace('_', ' ')}
                  </Badge>
                ))}
              </Group>
            )}
            {ex.alternatives && ex.alternatives.length > 0 && (
              <Text size="xs" c="dimmed" mt={2} ml={28} fs="italic">
                Alt: {ex.alternatives.join(', ')}
              </Text>
            )}
          </Paper>
        );
      })}

      {/* Cooldown */}
      {exercises.cooldown && (
        <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
          <Group gap="xs" mb={4}>
            <ThemeIcon size={20} color="blue" variant="light" radius="xl">
              <Heart size={12} />
            </ThemeIcon>
            <Text size="sm" fw={600}>Cooldown</Text>
            <Text size="xs" c="dimmed">{exercises.cooldown.duration}min</Text>
          </Group>
          <Text size="xs" c="dimmed" ml={28}>{exercises.cooldown.description}</Text>
        </Paper>
      )}
    </Stack>
  );
}

/** Fuel plan summary */
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
    <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
      <Group gap="xs" mb="xs">
        <Drop size={16} weight="fill" color="var(--mantine-color-yellow-5)" />
        <Text size="sm" fw={600}>Fuel Plan</Text>
        <Text size="xs" c="dimmed">{formatDuration(duration)}</Text>
      </Group>
      <Group gap="lg">
        <Box>
          <Text size="xs" c="dimmed">Carbs</Text>
          <Text size="sm" fw={500}>{fuelPlan.carbs.gramsPerHourMin}-{fuelPlan.carbs.gramsPerHourMax}g/hr</Text>
        </Box>
        <Box>
          <Text size="xs" c="dimmed">Hydration</Text>
          <Text size="sm" fw={500}>{fuelPlan.hydration.mlPerHour}ml/hr</Text>
        </Box>
        <Box>
          <Text size="xs" c="dimmed">Gels</Text>
          <Text size="sm" fw={500}>{fuelPlan.gelsEquivalent.min}-{fuelPlan.gelsEquivalent.max}</Text>
        </Box>
        <Box>
          <Text size="xs" c="dimmed">Bottles</Text>
          <Text size="sm" fw={500}>{fuelPlan.bottlesNeeded}</Text>
        </Box>
      </Group>
    </Paper>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function WorkoutModal({
  workout,
  plannedWorkout,
  opened,
  onClose,
  onSave,
  onDelete,
  scheduledDate,
}: WorkoutModalProps) {
  // Local edit state
  const [editTSS, setEditTSS] = useState<number>(0);
  const [editDuration, setEditDuration] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [showIntervalDetails, setShowIntervalDetails] = useState(true);

  // Sync local state when modal opens or workout changes
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
  }, [plannedWorkout, workout, opened]);

  // Flatten workout structure for display
  const segments = useMemo(() => {
    if (!workout?.structure) return [];
    return flattenStructure(workout.structure);
  }, [workout]);

  const intervalSummary = useMemo(() => {
    if (!workout?.structure) return '';
    return summarizeIntervals(workout.structure);
  }, [workout]);

  if (!workout) return null;

  const isOffBike = OFF_BIKE_CATEGORIES.includes(workout.category);
  const hasStructure = !isOffBike && workout.structure;
  const hasExercises = isOffBike && workout.exercises;
  const categoryColor = getCategoryColor(workout.category);
  const categoryIcon = CATEGORY_ICONS[workout.category] || '🚴';
  const hasChanges = plannedWorkout && (
    editTSS !== plannedWorkout.targetTSS ||
    editDuration !== plannedWorkout.targetDuration ||
    editNotes !== (plannedWorkout.notes || '')
  );

  const handleSave = () => {
    if (onSave && hasChanges) {
      onSave({
        targetTSS: editTSS,
        targetDuration: editDuration,
        notes: editNotes,
      });
    }
    onClose();
  };

  const handleExport = (format: 'fit' | 'zwo' | 'tcx') => {
    if (!workout.cyclingStructure) return;
    try {
      const result = exportWorkout(workout.cyclingStructure, {
        format,
        workoutName: workout.name,
        description: workout.description,
      });
      downloadWorkout(result);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text size="lg">{categoryIcon}</Text>
          <Text fw={600} size="lg">{workout.name}</Text>
          {scheduledDate && (
            <Badge variant="light" color="gray" size="sm">
              {formatDateBadge(scheduledDate)}
            </Badge>
          )}
        </Group>
      }
      size="lg"
      styles={{
        content: { backgroundColor: 'var(--mantine-color-dark-7)' },
        header: { backgroundColor: 'var(--mantine-color-dark-7)' },
        body: { padding: 0 },
      }}
    >
      <ScrollArea.Autosize mah="70vh" offsetScrollbars>
        <Stack gap="md" p="md">
          {/* Overview bar */}
          <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Group gap="xs">
                <Badge color={categoryColor} variant="light">
                  {workout.category.replace('_', ' ')}
                </Badge>
                <Badge color="gray" variant="light">
                  {workout.difficulty}
                </Badge>
                {workout.focusArea && (
                  <Badge color="gray" variant="outline" size="xs">
                    {workout.focusArea.replace('_', ' ')}
                  </Badge>
                )}
              </Group>
              <Group gap="md">
                <Group gap={4}>
                  <Clock size={16} color="var(--mantine-color-dimmed)" />
                  <Text size="sm" c="dimmed">{workout.duration}min</Text>
                </Group>
                {workout.targetTSS > 0 && (
                  <Group gap={4}>
                    <Fire size={16} color="var(--mantine-color-orange-5)" />
                    <Text size="sm" fw={500}>{workout.targetTSS} TSS</Text>
                  </Group>
                )}
                {workout.intensityFactor > 0 && (
                  <Tooltip label="Intensity Factor">
                    <Text size="sm" c="dimmed">IF {workout.intensityFactor.toFixed(2)}</Text>
                  </Tooltip>
                )}
              </Group>
            </Group>

            {/* Description */}
            <Text size="sm" mt="xs" c="dimmed">
              {workout.description}
            </Text>

            {/* Interval summary */}
            {intervalSummary && intervalSummary !== 'Steady effort' && (
              <Group gap="xs" mt="xs">
                <Repeat size={14} color="var(--mantine-color-terracotta-5)" />
                <Text size="sm" c="terracotta" fw={500}>
                  {intervalSummary}
                </Text>
              </Group>
            )}
          </Paper>

          {/* Workout Structure - Cycling */}
          {hasStructure && segments.length > 0 && (
            <>
              {/* Visual interval chart */}
              <Box>
                <Text size="sm" fw={600} mb="xs">Workout Profile</Text>
                <IntervalChart segments={segments} />
                <Group gap="xs" mt="xs" justify="center">
                  {[1, 2, 3, 4, 5].map((zone) => (
                    <Group key={zone} gap={4}>
                      <Box
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor: `var(--mantine-color-${getZoneColor(zone)}-6)`,
                        }}
                      />
                      <Text size="xs" c="dimmed">Z{zone}</Text>
                    </Group>
                  ))}
                </Group>
              </Box>

              {/* Interval details (collapsible) */}
              <Box>
                <Group
                  gap="xs"
                  mb="xs"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowIntervalDetails(!showIntervalDetails)}
                >
                  <Text size="sm" fw={600}>Interval Details</Text>
                  <ActionIcon size="xs" variant="subtle" color="gray">
                    {showIntervalDetails ? <CaretUp size={14} /> : <CaretDown size={14} />}
                  </ActionIcon>
                </Group>

                <Collapse in={showIntervalDetails}>
                  <Timeline active={segments.length} bulletSize={24} lineWidth={2}>
                    {segments.map((segment, index) => (
                      <Timeline.Item
                        key={index}
                        bullet={
                          <ThemeIcon
                            size={24}
                            variant="filled"
                            color={getZoneColor(segment.zone)}
                            radius="xl"
                          >
                            {getSegmentIcon(segment)}
                          </ThemeIcon>
                        }
                        title={
                          <Group gap="xs">
                            <Text size="sm" fw={500}>
                              {segment.description}
                              {segment.isRepeat && segment.setNumber && (
                                <Text span c="dimmed" size="xs">
                                  {' '}(Set {segment.setNumber}/{segment.totalSets})
                                </Text>
                              )}
                            </Text>
                            <Badge size="xs" color={getZoneColor(segment.zone)} variant="filled">
                              {getZoneName(segment.zone)}
                            </Badge>
                          </Group>
                        }
                      >
                        <Group gap="md" mt={4}>
                          <Text size="xs" c="dimmed">{formatDuration(segment.duration)}</Text>
                          {segment.powerPctFTP && (
                            <Text size="xs" c="dimmed">{segment.powerPctFTP}% FTP</Text>
                          )}
                          {segment.cadence && (
                            <Text size="xs" c="dimmed">{segment.cadence} rpm</Text>
                          )}
                        </Group>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                </Collapse>
              </Box>
            </>
          )}

          {/* Exercise list - Strength/Core/Flexibility */}
          {hasExercises && workout.exercises && (
            <Box>
              <Text size="sm" fw={600} mb="xs">Exercises</Text>
              <ExerciseList exercises={workout.exercises} />
            </Box>
          )}

          {/* Coach Notes */}
          {workout.coachNotes && (
            <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
              <Text size="sm" fw={600} mb={4}>Coach Notes</Text>
              <Text size="sm" c="dimmed" fs="italic">
                {workout.coachNotes}
              </Text>
            </Paper>
          )}

          <Divider label="Settings" labelPosition="center" />

          {/* Editable fields */}
          {plannedWorkout && (
            <Group grow>
              <NumberInput
                label="Target TSS"
                value={editTSS}
                onChange={(val) => setEditTSS(typeof val === 'number' ? val : 0)}
                min={0}
                max={500}
                styles={{
                  input: { backgroundColor: 'var(--mantine-color-dark-6)' },
                }}
              />
              <NumberInput
                label="Duration (min)"
                value={editDuration}
                onChange={(val) => setEditDuration(typeof val === 'number' ? val : 0)}
                min={0}
                max={600}
                styles={{
                  input: { backgroundColor: 'var(--mantine-color-dark-6)' },
                }}
              />
            </Group>
          )}

          {/* Fuel plan */}
          {!isOffBike && (
            <FuelPlanSummary
              duration={plannedWorkout ? editDuration : workout.duration}
              category={workout.category}
            />
          )}

          {/* Notes */}
          {plannedWorkout && (
            <Textarea
              label="Notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.currentTarget.value)}
              placeholder="Add workout notes..."
              minRows={2}
              maxRows={4}
              autosize
              styles={{
                input: { backgroundColor: 'var(--mantine-color-dark-6)' },
              }}
            />
          )}

          {/* Export buttons */}
          {workout.cyclingStructure && (
            <Box>
              <Text size="xs" c="dimmed" ta="center" mb="xs">Download for Device</Text>
              <Group justify="center" gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  color="terracotta"
                  leftSection={<DownloadSimple size={14} />}
                  onClick={() => handleExport('fit')}
                >
                  FIT (Garmin/Wahoo)
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  leftSection={<DownloadSimple size={14} />}
                  onClick={() => handleExport('zwo')}
                >
                  ZWO (Zwift)
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  leftSection={<DownloadSimple size={14} />}
                  onClick={() => handleExport('tcx')}
                >
                  TCX
                </Button>
              </Group>
            </Box>
          )}
        </Stack>
      </ScrollArea.Autosize>

      {/* Footer with action buttons */}
      {plannedWorkout && (
        <Group justify="space-between" p="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
          <Button
            variant="subtle"
            color="red"
            size="sm"
            leftSection={<Trash size={16} />}
            onClick={() => {
              onDelete?.();
              onClose();
            }}
          >
            Delete
          </Button>
          <Group gap="xs">
            <Button variant="subtle" color="gray" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              color="terracotta"
              size="sm"
              leftSection={<FloppyDisk size={16} />}
              onClick={handleSave}
              disabled={!hasChanges}
            >
              Save
            </Button>
          </Group>
        </Group>
      )}
    </Modal>
  );
}

export default WorkoutModal;
