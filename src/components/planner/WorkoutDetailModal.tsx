/**
 * WorkoutDetailModal Component
 * Displays detailed workout information including interval structure
 * with both written description and visual chart
 */

import { useMemo } from 'react';
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
} from '@mantine/core';
import {
  IconFlame,
  IconClock,
  IconActivity,
  IconHeart,
  IconBolt,
  IconTrendingUp,
  IconPlayerPlay,
  IconRepeat,
} from '@tabler/icons-react';
import type { WorkoutDefinition, WorkoutSegment, WorkoutInterval, WorkoutStructure } from '../../types/training';

interface WorkoutDetailModalProps {
  workout: WorkoutDefinition | null;
  opened: boolean;
  onClose: () => void;
}

// Zone color mapping
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

// Zone names
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

// Get zone color
function getZoneColor(zone: number | null): string {
  if (zone === null) return 'gray';
  return ZONE_COLORS[zone] || 'gray';
}

// Get zone name
function getZoneName(zone: number | null): string {
  if (zone === null) return 'Active';
  return ZONE_NAMES[zone] || `Zone ${zone}`;
}

// Flatten workout structure into sequential segments for display
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

  // Warmup
  if (structure.warmup) {
    segments.push({
      type: 'warmup',
      duration: structure.warmup.duration,
      zone: structure.warmup.zone,
      powerPctFTP: structure.warmup.powerPctFTP,
      description: 'Warmup',
    });
  }

  // Main workout - process each segment
  function processSegmentOrInterval(
    item: WorkoutSegment | WorkoutInterval,
    parentSetInfo?: { setNumber: number; totalSets: number }
  ) {
    if ('type' in item && item.type === 'repeat') {
      // It's an interval (repeat block)
      const interval = item as WorkoutInterval;
      for (let set = 1; set <= interval.sets; set++) {
        // Process work segment(s)
        const workItems = Array.isArray(interval.work) ? interval.work : [interval.work];
        for (const workItem of workItems) {
          if ('type' in workItem && workItem.type === 'repeat') {
            // Nested repeat
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

        // Process rest segment (between sets, not after last)
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
      // It's a simple segment
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

  // Cooldown
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

// Calculate total workout time from segments
function calculateTotalTime(segments: FlattenedSegment[]): number {
  return segments.reduce((sum, seg) => sum + seg.duration, 0);
}

// Format duration
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

// Get icon for segment type
function getSegmentIcon(segment: FlattenedSegment) {
  if (segment.type === 'warmup' || segment.type === 'cooldown') {
    return <IconHeart size={14} />;
  }
  if (segment.type === 'rest') {
    return <IconActivity size={14} />;
  }
  if (segment.zone && segment.zone >= 5) {
    return <IconBolt size={14} />;
  }
  if (segment.isRepeat) {
    return <IconRepeat size={14} />;
  }
  return <IconTrendingUp size={14} />;
}

// Visual power chart component
function IntervalChart({ segments }: { segments: FlattenedSegment[] }) {
  const totalTime = calculateTotalTime(segments);

  if (totalTime === 0) return null;

  // Calculate bar heights based on zone (higher zone = taller bar)
  const getBarHeight = (zone: number | null) => {
    if (zone === null) return 30;
    // Map zone 1-7 to height 20-100%
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
      {/* Zone reference lines */}
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

      {/* Segment bars */}
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
                {segment.powerPctFTP && (
                  <Text size="xs">{segment.powerPctFTP}% FTP</Text>
                )}
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

      {/* Time axis */}
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

// Summarize interval structure for header
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

export function WorkoutDetailModal({ workout, opened, onClose }: WorkoutDetailModalProps) {
  // Flatten the workout structure for display
  const segments = useMemo(() => {
    if (!workout?.structure) return [];
    return flattenStructure(workout.structure);
  }, [workout]);

  const intervalSummary = useMemo(() => {
    if (!workout?.structure) return '';
    return summarizeIntervals(workout.structure);
  }, [workout]);

  if (!workout) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconPlayerPlay size={18} />
          <Text fw={600}>{workout.name}</Text>
        </Group>
      }
      size="lg"
      styles={{
        content: { backgroundColor: 'var(--mantine-color-dark-7)' },
        header: { backgroundColor: 'var(--mantine-color-dark-7)' },
      }}
    >
      <Stack gap="md">
        {/* Workout overview */}
        <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <Badge color={getCategoryColor(workout.category)} variant="light">
                {workout.category.replace('_', ' ')}
              </Badge>
              <Badge color="gray" variant="light">
                {workout.difficulty}
              </Badge>
            </Group>
            <Group gap="md">
              <Group gap={4}>
                <IconClock size={16} color="var(--mantine-color-dimmed)" />
                <Text size="sm" c="dimmed">{workout.duration}min</Text>
              </Group>
              <Group gap={4}>
                <IconFlame size={16} color="var(--mantine-color-orange-5)" />
                <Text size="sm" fw={500}>{workout.targetTSS} TSS</Text>
              </Group>
            </Group>
          </Group>

          <Text size="sm" mt="xs" c="dimmed">
            {workout.description}
          </Text>

          {intervalSummary && intervalSummary !== 'Steady effort' && (
            <Group gap="xs" mt="xs">
              <IconRepeat size={14} color="var(--mantine-color-terracotta-5)" />
              <Text size="sm" c="terracotta" fw={500}>
                {intervalSummary}
              </Text>
            </Group>
          )}
        </Paper>

        {/* Visual interval chart */}
        <Box>
          <Text size="sm" fw={600} mb="xs">Workout Profile</Text>
          <IntervalChart segments={segments} />

          {/* Zone legend */}
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

        <Divider />

        {/* Detailed interval breakdown */}
        <Box>
          <Text size="sm" fw={600} mb="xs">Interval Details</Text>

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
                  <Text size="xs" c="dimmed">
                    {formatDuration(segment.duration)}
                  </Text>
                  {segment.powerPctFTP && (
                    <Text size="xs" c="dimmed">
                      {segment.powerPctFTP}% FTP
                    </Text>
                  )}
                  {segment.cadence && (
                    <Text size="xs" c="dimmed">
                      {segment.cadence} rpm
                    </Text>
                  )}
                </Group>
              </Timeline.Item>
            ))}
          </Timeline>
        </Box>

        {/* Coach notes */}
        {workout.coachNotes && (
          <>
            <Divider />
            <Box>
              <Text size="sm" fw={600} mb="xs">Coach Notes</Text>
              <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
                <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                  {workout.coachNotes}
                </Text>
              </Paper>
            </Box>
          </>
        )}
      </Stack>
    </Modal>
  );
}

// Helper to get category color
function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
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
  return colors[category] || 'gray';
}

export default WorkoutDetailModal;
