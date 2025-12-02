import React, { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Badge,
  Button,
  Card,
  Divider,
  Alert,
  ActionIcon,
  Menu
} from '@mantine/core';
import {
  X,
  Clock,
  Activity,
  Zap,
  Calendar,
  CheckCircle,
  XCircle,
  MoreVertical,
  MessageSquare,
  Edit
} from 'lucide-react';
import { TRAINING_ZONES } from '../../utils/trainingPlans';
import WorkoutCompletionModal from './WorkoutCompletionModal';

/**
 * WorkoutDetailView
 * Detailed view of a single workout with structure and completion options
 */
const WorkoutDetailView = ({ workout, onClose, onWorkoutUpdated }) => {
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [action, setAction] = useState(null); // 'complete' or 'skip'

  if (!workout) return null;

  const template = workout.template;
  const structure = template?.structure;
  const isCompleted = workout.completion_status === 'completed';
  const isSkipped = workout.completion_status === 'skipped';
  const isScheduled = workout.completion_status === 'scheduled';
  const isPast = new Date(workout.scheduled_date) < new Date() && !isCompleted;

  // Open completion modal
  const handleComplete = () => {
    setAction('complete');
    setCompletionModalOpen(true);
  };

  // Open skip modal
  const handleSkip = () => {
    setAction('skip');
    setCompletionModalOpen(true);
  };

  // Render workout structure
  const renderStructure = () => {
    if (!structure) {
      return (
        <Text size="sm" c="dimmed">
          No detailed structure available
        </Text>
      );
    }

    return (
      <Stack gap="md">
        {/* Warmup */}
        {structure.warmup && (
          <Card withBorder p="sm" bg="blue.0">
            <Stack gap="xs">
              <Text size="sm" fw={600} c="dark">Warmup</Text>
              <Group gap="xs">
                <Badge size="sm">{structure.warmup.duration} min</Badge>
                <Badge size="sm">Zone {structure.warmup.zone}</Badge>
                <Badge size="sm">{structure.warmup.powerPctFTP}% FTP</Badge>
              </Group>
              {structure.warmup.description && (
                <Text size="xs" c="dimmed">{structure.warmup.description}</Text>
              )}
            </Stack>
          </Card>
        )}

        {/* Main Sets */}
        {structure.main && structure.main.length > 0 && (
          <div>
            <Text size="sm" fw={600} mb="xs" c="dark">Main Set</Text>
            <Stack gap="xs">
              {structure.main.map((interval, index) => (
                <Card key={index} withBorder p="sm">
                  {interval.type === 'repeat' ? (
                    <Stack gap="xs">
                      <Badge size="md" variant="filled">
                        {interval.sets}x Intervals
                      </Badge>

                      <Group gap="md">
                        <div>
                          <Text size="xs" c="dimmed">Work</Text>
                          <Group gap="xs" mt={4}>
                            <Badge size="sm" color="red">
                              {interval.work.duration} min
                            </Badge>
                            <Badge size="sm" color="red">
                              {interval.work.powerPctFTP}% FTP
                            </Badge>
                          </Group>
                        </div>

                        <div>
                          <Text size="xs" c="dimmed">Rest</Text>
                          <Group gap="xs" mt={4}>
                            <Badge size="sm" color="green">
                              {interval.rest.duration} min
                            </Badge>
                            <Badge size="sm" color="green">
                              {interval.rest.powerPctFTP}% FTP
                            </Badge>
                          </Group>
                        </div>
                      </Group>

                      {interval.work.description && (
                        <Text size="xs" c="dimmed">{interval.work.description}</Text>
                      )}
                    </Stack>
                  ) : (
                    <Stack gap="xs">
                      <Group gap="xs">
                        <Badge size="sm">{interval.duration} min</Badge>
                        <Badge size="sm">Zone {interval.zone}</Badge>
                        <Badge size="sm">{interval.powerPctFTP}% FTP</Badge>
                        {interval.cadence && (
                          <Badge size="sm" variant="outline">
                            {interval.cadence} rpm
                          </Badge>
                        )}
                      </Group>
                      {interval.description && (
                        <Text size="xs" c="dimmed">{interval.description}</Text>
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
          <Card withBorder p="sm" bg="blue.0">
            <Stack gap="xs">
              <Text size="sm" fw={600} c="dark">Cooldown</Text>
              <Group gap="xs">
                <Badge size="sm">{structure.cooldown.duration} min</Badge>
                <Badge size="sm">Zone {structure.cooldown.zone}</Badge>
                <Badge size="sm">{structure.cooldown.powerPctFTP}% FTP</Badge>
              </Group>
              {structure.cooldown.description && (
                <Text size="xs" c="dimmed">{structure.cooldown.description}</Text>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  return (
    <>
      <Modal
        opened={!!workout}
        onClose={onClose}
        title={
          <Group gap="xs">
            <Activity size={20} />
            <Text fw={700} size="lg" c="dark">Workout Details</Text>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          {/* Header Info */}
          <div>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xl" fw={700} c="dark">
                  {template?.name || workout.workout_type}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {new Date(workout.scheduled_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })}
                </Text>
              </div>

              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle">
                    <MoreVertical size={20} />
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                  {isScheduled && !isPast && (
                    <>
                      <Menu.Item
                        leftSection={<CheckCircle size={14} />}
                        onClick={handleComplete}
                      >
                        Mark Complete
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<XCircle size={14} />}
                        onClick={handleSkip}
                      >
                        Skip Workout
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  )}
                  <Menu.Item leftSection={<MessageSquare size={14} />}>
                    Message Coach
                  </Menu.Item>
                  <Menu.Item leftSection={<Edit size={14} />}>
                    Request Modification
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>

            {/* Status Badge */}
            <Group gap="xs" mt="md">
              {isCompleted && (
                <Badge size="lg" color="green" leftSection={<CheckCircle size={14} />}>
                  Completed
                </Badge>
              )}
              {isSkipped && (
                <Badge size="lg" color="gray" leftSection={<XCircle size={14} />}>
                  Skipped
                </Badge>
              )}
              {isScheduled && isPast && (
                <Badge size="lg" color="orange">
                  Missed
                </Badge>
              )}
            </Group>
          </div>

          {/* Quick Stats */}
          <Group gap="md">
            <Card withBorder p="sm">
              <Group gap="xs">
                <Clock size={16} />
                <div>
                  <Text size="xs" c="dimmed">Duration</Text>
                  <Text size="sm" fw={600}>
                    {Math.round(workout.target_duration / 60)} min
                  </Text>
                </div>
              </Group>
            </Card>

            <Card withBorder p="sm">
              <Group gap="xs">
                <Activity size={16} />
                <div>
                  <Text size="xs" c="dimmed">Target TSS</Text>
                  <Text size="sm" fw={600}>
                    {workout.target_tss}
                  </Text>
                </div>
              </Group>
            </Card>

            {template?.intensity_factor && (
              <Card withBorder p="sm">
                <Group gap="xs">
                  <Zap size={16} />
                  <div>
                    <Text size="xs" c="dimmed">Intensity Factor</Text>
                    <Text size="sm" fw={600}>
                      {template.intensity_factor.toFixed(2)}
                    </Text>
                  </div>
                </Group>
              </Card>
            )}

            {template?.primary_zone && (
              <Card withBorder p="sm">
                <div>
                  <Text size="xs" c="dimmed">Primary Zone</Text>
                  <Badge size="sm" color={TRAINING_ZONES[template.primary_zone]?.color}>
                    {TRAINING_ZONES[template.primary_zone]?.name}
                  </Badge>
                </div>
              </Card>
            )}
          </Group>

          {/* Description */}
          {template?.description && (
            <div>
              <Text size="sm" fw={600} mb="xs" c="dark">Description</Text>
              <Text size="sm" c="dimmed">{template.description}</Text>
            </div>
          )}

          <Divider />

          {/* Workout Structure */}
          <div>
            <Text size="sm" fw={600} mb="md" c="dark">Workout Structure</Text>
            {renderStructure()}
          </div>

          {/* Coach Notes */}
          {workout.coach_notes && (
            <>
              <Divider />
              <Alert icon={<MessageSquare size={16} />} title="Coach Notes" color="blue">
                <Text size="sm">{workout.coach_notes}</Text>
              </Alert>
            </>
          )}

          {/* Completion Data */}
          {isCompleted && (
            <>
              <Divider />
              <div>
                <Text size="sm" fw={600} mb="xs" c="dark">Completion Details</Text>
                <Stack gap="xs">
                  {workout.actual_tss && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">Actual TSS:</Text>
                      <Text size="sm" fw={600}>{workout.actual_tss}</Text>
                    </Group>
                  )}
                  {workout.actual_duration && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">Actual Duration:</Text>
                      <Text size="sm" fw={600}>{Math.round(workout.actual_duration / 60)} min</Text>
                    </Group>
                  )}
                  {workout.athlete_rating && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">Difficulty Rating:</Text>
                      <Badge>{workout.athlete_rating}/5</Badge>
                    </Group>
                  )}
                  {workout.athlete_feedback && (
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>Feedback:</Text>
                      <Text size="sm">{workout.athlete_feedback}</Text>
                    </div>
                  )}
                </Stack>
              </div>
            </>
          )}

          {/* Skip Reason */}
          {isSkipped && workout.skipped_reason && (
            <>
              <Divider />
              <div>
                <Text size="sm" fw={600} mb="xs" c="dark">Skip Reason</Text>
                <Text size="sm" c="dimmed">{workout.skipped_reason}</Text>
              </div>
            </>
          )}

          {/* Action Buttons */}
          {isScheduled && !isPast && (
            <>
              <Divider />
              <Group justify="flex-end">
                <Button
                  variant="light"
                  leftSection={<XCircle size={16} />}
                  onClick={handleSkip}
                >
                  Skip
                </Button>
                <Button
                  leftSection={<CheckCircle size={16} />}
                  onClick={handleComplete}
                  color="green"
                >
                  Mark Complete
                </Button>
              </Group>
            </>
          )}

          {/* Close Button */}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} leftSection={<X size={16} />}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Completion Modal */}
      {completionModalOpen && (
        <WorkoutCompletionModal
          opened={completionModalOpen}
          onClose={() => {
            setCompletionModalOpen(false);
            setAction(null);
          }}
          workout={workout}
          action={action}
          onSuccess={() => {
            setCompletionModalOpen(false);
            setAction(null);
            if (onWorkoutUpdated) onWorkoutUpdated();
            onClose();
          }}
        />
      )}
    </>
  );
};

export default WorkoutDetailView;
