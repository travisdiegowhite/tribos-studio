/**
 * PlanConflictModal Component
 * Shows conflicts between primary and secondary training plans
 * and lets the user review/approve resolution recommendations.
 */

import {
  Modal,
  Stack,
  Text,
  Title,
  Group,
  Badge,
  Button,
  Paper,
  ThemeIcon,
  Alert,
  Divider,
} from '@mantine/core';
import {
  WarningCircle,
  ArrowRight,
  Bicycle,
  PersonSimpleRun,
  Check,
  X,
  Lightning,
  Heart,
} from '@phosphor-icons/react';
import type { ConflictResolution, PlanConflictReport, WeeklyLoadAnalysis } from '../../utils/planConflictResolver';

interface PlanConflictModalProps {
  opened: boolean;
  onClose: () => void;
  conflictReport: PlanConflictReport | null;
  onAcceptAll: () => void;
  onAcceptResolution: (index: number) => void;
  onDismissResolution: (index: number) => void;
  isApplying?: boolean;
}

const SPORT_ICONS: Record<string, typeof Bicycle> = {
  cycling: Bicycle,
  running: PersonSimpleRun,
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  keep_both: { label: 'Keep Both', color: 'green' },
  move_secondary: { label: 'Move', color: 'blue' },
  downgrade_secondary: { label: 'Downgrade', color: 'yellow' },
  skip_secondary: { label: 'Skip', color: 'red' },
};

function ConflictRow({
  resolution,
  index,
  onAccept,
  onDismiss,
}: {
  resolution: ConflictResolution;
  index: number;
  onAccept: (index: number) => void;
  onDismiss: (index: number) => void;
}) {
  const actionInfo = ACTION_LABELS[resolution.action] || { label: resolution.action, color: 'gray' };
  const date = new Date(resolution.date + 'T00:00:00');
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Paper p="sm" withBorder>
      <Group position="apart" align="flex-start">
        <Stack spacing={4} style={{ flex: 1 }}>
          <Group spacing="xs">
            <Text fw={600} size="sm">{dateStr}</Text>
            <Badge size="xs" color={actionInfo.color} variant="light">
              {actionInfo.label}
            </Badge>
          </Group>

          <Group spacing="xs">
            <Badge size="xs" color="orange" variant="dot">
              {resolution.primaryWorkout.workout_type || 'workout'}
            </Badge>
            <Text size="xs" c="dimmed">vs</Text>
            <Badge size="xs" color="green" variant="dot">
              {resolution.secondaryWorkout.workout_type || 'workout'}
            </Badge>
          </Group>

          <Text size="xs" c="dimmed">{resolution.reason}</Text>

          {resolution.movedToDate && (
            <Group spacing={4}>
              <ArrowRight size={12} />
              <Text size="xs" c="blue">
                Moved to {new Date(resolution.movedToDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            </Group>
          )}
        </Stack>

        {(resolution.action === 'downgrade_secondary' || resolution.action === 'skip_secondary') && (
          <Group spacing={4}>
            <Button size="xs" variant="light" color="green" onClick={() => onAccept(index)}>
              <Check size={14} />
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={() => onDismiss(index)}>
              <X size={14} />
            </Button>
          </Group>
        )}
      </Group>
    </Paper>
  );
}

function WeeklyLoadRow({ analysis }: { analysis: WeeklyLoadAnalysis }) {
  const weekDate = new Date(analysis.weekStart + 'T00:00:00');
  const weekStr = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Group position="apart">
      <Text size="sm">Week of {weekStr}</Text>
      <Group spacing="xs">
        <Text size="sm" fw={500}>
          {analysis.combinedTSS} / {analysis.capacityTSS} TSS
        </Text>
        {analysis.isOverloaded ? (
          <Badge size="xs" color="red" variant="filled">
            +{analysis.overloadPercentage}%
          </Badge>
        ) : (
          <Badge size="xs" color="green" variant="light">OK</Badge>
        )}
      </Group>
    </Group>
  );
}

export default function PlanConflictModal({
  opened,
  onClose,
  conflictReport,
  onAcceptAll,
  onAcceptResolution,
  onDismissResolution,
  isApplying = false,
}: PlanConflictModalProps) {
  if (!conflictReport) return null;

  const { conflicts, weeklyLoadAnalysis, totalConflicts, autoResolvable, needsUserInput } = conflictReport;
  const overloadedWeeks = weeklyLoadAnalysis.filter(w => w.isOverloaded);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="sm">
          <ThemeIcon color="yellow" variant="light" size="lg">
            <WarningCircle size={20} weight="bold" />
          </ThemeIcon>
          <div>
            <Title order={4}>Plan Conflict Resolution</Title>
            <Text size="sm" c="dimmed">
              {totalConflicts} conflict{totalConflicts !== 1 ? 's' : ''} detected between your plans
            </Text>
          </div>
        </Group>
      }
      size="lg"
    >
      <Stack spacing="md">
        {/* Summary */}
        <Group spacing="md">
          <Paper p="sm" withBorder style={{ flex: 1 }}>
            <Text size="xs" c="dimmed">Auto-resolved</Text>
            <Text fw={700} size="lg" c="green">{autoResolvable}</Text>
          </Paper>
          <Paper p="sm" withBorder style={{ flex: 1 }}>
            <Text size="xs" c="dimmed">Needs Review</Text>
            <Text fw={700} size="lg" c="yellow">{needsUserInput}</Text>
          </Paper>
        </Group>

        {/* Weekly Load Analysis */}
        {overloadedWeeks.length > 0 && (
          <Alert
            icon={<Lightning size={16} />}
            title="Weekly Load Warnings"
            color="yellow"
            variant="light"
          >
            <Stack spacing={4}>
              {overloadedWeeks.map(analysis => (
                <WeeklyLoadRow key={analysis.weekStart} analysis={analysis} />
              ))}
            </Stack>
          </Alert>
        )}

        <Divider label="Scheduling Conflicts" labelPosition="center" />

        {/* Conflict List */}
        <Stack spacing="sm">
          {conflicts.map((resolution, index) => (
            <ConflictRow
              key={`${resolution.date}-${index}`}
              resolution={resolution}
              index={index}
              onAccept={onAcceptResolution}
              onDismiss={onDismissResolution}
            />
          ))}
        </Stack>

        {conflicts.length === 0 && (
          <Text c="dimmed" ta="center" py="md">
            No conflicts detected. Both plans can proceed as scheduled.
          </Text>
        )}

        {/* Actions */}
        {needsUserInput > 0 && (
          <Button
            fullWidth
            color="green"
            loading={isApplying}
            onClick={onAcceptAll}
            leftSection={<Check size={16} />}
          >
            Accept All Recommendations
          </Button>
        )}

        <Button variant="subtle" color="gray" fullWidth onClick={onClose}>
          Close
        </Button>
      </Stack>
    </Modal>
  );
}
