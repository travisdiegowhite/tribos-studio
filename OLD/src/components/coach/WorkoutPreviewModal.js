import React from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Badge,
  Card,
  Divider,
  ScrollArea,
  Paper,
  Button,
} from '@mantine/core';
import {
  Clock,
  Activity,
  Zap,
  TrendingUp,
  Target,
  Info,
  UserPlus,
} from 'lucide-react';
import { TRAINING_ZONES } from '../../utils/trainingPlans';
import PowerProfileChart from '../workout-builder/PowerProfileChart';

/**
 * WorkoutPreviewModal
 * Displays full workout details before assignment
 */
const WorkoutPreviewModal = ({ opened, onClose, workout, onAssign }) => {
  if (!workout) return null;

  const zoneInfo = workout.primary_zone ? TRAINING_ZONES[workout.primary_zone] : null;
  const structure = workout.structure;

  // Calculate total workout duration from structure
  const calculateTotalDuration = () => {
    if (!structure) return workout.duration || 0;

    let total = 0;
    if (structure.warmup) total += structure.warmup.duration || 0;
    if (structure.cooldown) total += structure.cooldown.duration || 0;

    if (structure.main) {
      structure.main.forEach(interval => {
        if (interval.type === 'repeat') {
          const workDuration = interval.work?.duration || 0;
          const restDuration = interval.rest?.duration || 0;
          total += (workDuration + restDuration) * (interval.sets || 1);
        } else {
          total += interval.duration || 0;
        }
      });
    }

    return total;
  };

  const totalDuration = calculateTotalDuration();

  // Render workout structure
  const renderStructure = () => {
    if (!structure) {
      return (
        <Text size="sm" c="dimmed" ta="center">
          No detailed structure available
        </Text>
      );
    }

    return (
      <Stack gap="md">
        {/* Warmup */}
        {structure.warmup && (
          <Card withBorder p="md" bg="blue.0">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={600} c="blue">
                  Warmup
                </Text>
                <Badge size="sm" variant="light" color="blue">
                  {structure.warmup.duration} min
                </Badge>
              </Group>
              <Group gap="xs">
                <Badge size="xs" variant="outline">
                  Zone {structure.warmup.zone || 2}
                </Badge>
                <Badge size="xs" variant="outline">
                  {structure.warmup.powerPctFTP || 60}% FTP
                </Badge>
              </Group>
              {structure.warmup.description && (
                <Text size="xs" c="dimmed">
                  {structure.warmup.description}
                </Text>
              )}
            </Stack>
          </Card>
        )}

        {/* Main Intervals */}
        {structure.main && structure.main.length > 0 && (
          <div>
            <Text size="sm" fw={600} mb="xs" c="dark">
              Main Set
            </Text>
            <Stack gap="xs">
              {structure.main.map((interval, index) => (
                <Card key={index} withBorder p="md">
                  {interval.type === 'repeat' ? (
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm" fw={600} c="dark">
                          {interval.sets}x Intervals
                        </Text>
                        <Badge size="sm" variant="filled">
                          Repeat
                        </Badge>
                      </Group>
                      <Divider />
                      <div>
                        <Text size="xs" fw={600} mb={4}>Work:</Text>
                        <Group gap="xs">
                          <Badge size="xs" variant="light">
                            {interval.work.duration} min
                          </Badge>
                          <Badge size="xs" variant="light">
                            Zone {interval.work.zone}
                          </Badge>
                          <Badge size="xs" variant="light">
                            {interval.work.powerPctFTP}% FTP
                          </Badge>
                        </Group>
                        {interval.work.description && (
                          <Text size="xs" c="dimmed" mt={4}>
                            {interval.work.description}
                          </Text>
                        )}
                      </div>
                      <div>
                        <Text size="xs" fw={600} mb={4}>Rest:</Text>
                        <Group gap="xs">
                          <Badge size="xs" variant="light" color="gray">
                            {interval.rest.duration} min
                          </Badge>
                          <Badge size="xs" variant="light" color="gray">
                            Zone {interval.rest.zone}
                          </Badge>
                          <Badge size="xs" variant="light" color="gray">
                            {interval.rest.powerPctFTP}% FTP
                          </Badge>
                        </Group>
                      </div>
                    </Stack>
                  ) : (
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm" fw={600} c="dark">
                          Steady Interval
                        </Text>
                        <Badge size="sm" variant="light">
                          {interval.duration} min
                        </Badge>
                      </Group>
                      <Group gap="xs">
                        <Badge size="xs" variant="outline">
                          Zone {interval.zone}
                        </Badge>
                        <Badge size="xs" variant="outline">
                          {interval.powerPctFTP}% FTP
                        </Badge>
                      </Group>
                      {interval.description && (
                        <Text size="xs" c="dimmed">
                          {interval.description}
                        </Text>
                      )}
                    </Stack>
                  )}
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {/* Cooldown */}
        {structure.cooldown && (
          <Card withBorder p="md" bg="green.0">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={600} c="green">
                  Cooldown
                </Text>
                <Badge size="sm" variant="light" color="green">
                  {structure.cooldown.duration} min
                </Badge>
              </Group>
              <Group gap="xs">
                <Badge size="xs" variant="outline">
                  Zone {structure.cooldown.zone || 1}
                </Badge>
                <Badge size="xs" variant="outline">
                  {structure.cooldown.powerPctFTP || 50}% FTP
                </Badge>
              </Group>
              {structure.cooldown.description && (
                <Text size="xs" c="dimmed">
                  {structure.cooldown.description}
                </Text>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={700} c="dark">Workout Preview</Text>}
      size="xl"
    >
      <Stack gap="lg">
        {/* Workout Header */}
        <Paper p="md" withBorder bg="blue.0">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <div style={{ flex: 1 }}>
                <Text size="xl" fw={700} c="dark">
                  {workout.name}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {workout.description}
                </Text>
              </div>
              <Badge
                size="lg"
                variant="light"
                color={
                  workout.difficulty_level === 'beginner' ? 'green' :
                  workout.difficulty_level === 'intermediate' ? 'blue' : 'orange'
                }
              >
                {workout.difficulty_level || 'intermediate'}
              </Badge>
            </Group>

            <Divider />

            {/* Metrics */}
            <Group gap="md">
              <Group gap="xs">
                <Clock size={18} color="var(--mantine-color-blue-6)" />
                <div>
                  <Text size="xs" c="dimmed">Duration</Text>
                  <Text size="md" fw={600}>{totalDuration} min</Text>
                </div>
              </Group>

              <Group gap="xs">
                <Activity size={18} color="var(--mantine-color-green-6)" />
                <div>
                  <Text size="xs" c="dimmed">Target TSS</Text>
                  <Text size="md" fw={600}>{workout.target_tss}</Text>
                </div>
              </Group>

              <Group gap="xs">
                <Zap size={18} color="var(--mantine-color-orange-6)" />
                <div>
                  <Text size="xs" c="dimmed">Intensity Factor</Text>
                  <Text size="md" fw={600}>{workout.intensity_factor?.toFixed(2)}</Text>
                </div>
              </Group>

              {zoneInfo && (
                <Group gap="xs">
                  <Target size={18} style={{ color: zoneInfo.color }} />
                  <div>
                    <Text size="xs" c="dimmed">Primary Zone</Text>
                    <Text size="md" fw={600} style={{ color: zoneInfo.color }}>
                      {zoneInfo.name}
                    </Text>
                  </div>
                </Group>
              )}
            </Group>

            {/* Tags */}
            {workout.tags && workout.tags.length > 0 && (
              <Group gap={4}>
                {workout.tags.map(tag => (
                  <Badge key={tag} size="sm" variant="dot">
                    {tag}
                  </Badge>
                ))}
              </Group>
            )}
          </Stack>
        </Paper>

        {/* Power Profile Chart */}
        <PowerProfileChart structure={workout.structure} height={250} />

        {/* Coach Notes */}
        {workout.coach_notes && (
          <Card withBorder p="md">
            <Group gap="xs" mb="sm">
              <Info size={16} color="var(--mantine-color-blue-6)" />
              <Text size="sm" fw={600} c="dark">Coach Notes</Text>
            </Group>
            <Text size="sm" c="dimmed">
              {workout.coach_notes}
            </Text>
          </Card>
        )}

        {/* Workout Structure */}
        <div>
          <Text size="md" fw={700} mb="md" c="dark">
            Workout Structure
          </Text>
          <ScrollArea h={400} type="auto">
            {renderStructure()}
          </ScrollArea>
        </div>

        {/* Actions */}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Close
          </Button>
          {onAssign && (
            <Button
              leftSection={<UserPlus size={18} />}
              onClick={() => {
                onAssign(workout);
                onClose();
              }}
            >
              Assign to Athletes
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};

export default WorkoutPreviewModal;
