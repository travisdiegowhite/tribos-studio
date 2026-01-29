/**
 * AdaptationFeedbackModal Component
 *
 * Prompts users to provide feedback on workout adaptations.
 * Collects the reason for adaptation and optional notes.
 */

import { useState } from 'react';
import {
  Modal,
  Box,
  Text,
  Group,
  Stack,
  Badge,
  Paper,
  Button,
  Textarea,
  SegmentedControl,
  ThemeIcon,
  Divider,
} from '@mantine/core';
import {
  IconClock,
  IconTrendingDown,
  IconTrendingUp,
  IconArrowsExchange,
  IconX,
  IconActivity,
  IconClockMinus,
  IconClockPlus,
  IconCheck,
} from '@tabler/icons-react';
import type { WorkoutAdaptation, AdaptationReason } from '../../types/training';
import {
  getAdaptationSummary,
  getAssessmentColor,
} from '../../utils/adaptationTrigger';

interface AdaptationFeedbackModalProps {
  adaptation: WorkoutAdaptation | null;
  opened: boolean;
  onClose: () => void;
  onSubmit: (reason: AdaptationReason, notes: string) => Promise<void>;
}

// Reason options with labels and icons
const REASON_OPTIONS: { value: AdaptationReason; label: string; description: string }[] = [
  {
    value: 'time_constraint',
    label: 'Time constraint',
    description: 'Had less time than planned',
  },
  {
    value: 'felt_tired',
    label: 'Felt tired',
    description: 'Fatigue or low energy',
  },
  {
    value: 'felt_good',
    label: 'Felt good',
    description: 'Had more energy than expected',
  },
  {
    value: 'weather',
    label: 'Weather',
    description: 'Conditions changed plans',
  },
  {
    value: 'equipment',
    label: 'Equipment',
    description: 'Bike/trainer issues',
  },
  {
    value: 'illness_injury',
    label: 'Illness/Injury',
    description: 'Health concerns',
  },
  {
    value: 'life_event',
    label: 'Life event',
    description: 'Work, family, etc.',
  },
  {
    value: 'coach_adjustment',
    label: 'Planned change',
    description: 'Intentional modification',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else',
  },
];

// Get icon for adaptation type
function getAdaptationIcon(type: string) {
  switch (type) {
    case 'completed_as_planned':
      return IconCheck;
    case 'time_truncated':
      return IconClockMinus;
    case 'time_extended':
      return IconClockPlus;
    case 'intensity_swap':
      return IconArrowsExchange;
    case 'upgraded':
      return IconTrendingUp;
    case 'downgraded':
      return IconTrendingDown;
    case 'skipped':
      return IconX;
    default:
      return IconActivity;
  }
}

export function AdaptationFeedbackModal({
  adaptation,
  opened,
  onClose,
  onSubmit,
}: AdaptationFeedbackModalProps) {
  const [selectedReason, setSelectedReason] = useState<AdaptationReason | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!adaptation) return null;

  const AdaptationIcon = getAdaptationIcon(adaptation.adaptationType);
  const assessmentColor = getAssessmentColor(adaptation.aiAssessment.assessment);

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setIsSubmitting(true);
    try {
      await onSubmit(selectedReason, notes);
      // Reset form
      setSelectedReason(null);
      setNotes('');
      onClose();
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    setSelectedReason(null);
    setNotes('');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleSkip}
      title={
        <Group gap="xs">
          <ThemeIcon size="md" variant="light" color={assessmentColor}>
            <AdaptationIcon size={16} />
          </ThemeIcon>
          <Text fw={600}>Workout Adaptation Detected</Text>
        </Group>
      }
      size="md"
    >
      <Stack gap="md">
        {/* Adaptation Summary */}
        <Paper p="sm" withBorder bg="dark.7">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                What happened:
              </Text>
              <Badge color={assessmentColor} variant="light" size="sm">
                {adaptation.aiAssessment.assessment || 'analyzing'}
              </Badge>
            </Group>
            <Text size="sm" fw={500}>
              {getAdaptationSummary(adaptation)}
            </Text>
          </Stack>
        </Paper>

        {/* Planned vs Actual */}
        <Group grow>
          <Paper p="xs" withBorder>
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Planned
              </Text>
              <Text size="sm" fw={500}>
                {adaptation.planned.workoutType || 'Workout'}
              </Text>
              <Text size="xs" c="dimmed">
                {adaptation.planned.duration}min • {adaptation.planned.tss} TSS
              </Text>
            </Stack>
          </Paper>
          <Paper p="xs" withBorder>
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Actual
              </Text>
              <Text size="sm" fw={500}>
                {adaptation.actual.workoutType || 'Activity'}
              </Text>
              <Text size="xs" c="dimmed">
                {adaptation.actual.duration}min • {adaptation.actual.tss} TSS
              </Text>
            </Stack>
          </Paper>
        </Group>

        {/* AI Explanation */}
        {adaptation.aiAssessment.explanation && (
          <Paper p="sm" withBorder style={{ borderLeft: `3px solid var(--mantine-color-${assessmentColor}-5)` }}>
            <Text size="sm" c="dimmed">
              {adaptation.aiAssessment.explanation}
            </Text>
          </Paper>
        )}

        <Divider />

        {/* Reason Selection */}
        <Box>
          <Text size="sm" fw={500} mb="xs">
            What led to this change? (optional but helpful)
          </Text>
          <Stack gap="xs">
            {REASON_OPTIONS.map((option) => (
              <Paper
                key={option.value}
                p="xs"
                withBorder
                style={{
                  cursor: 'pointer',
                  borderColor:
                    selectedReason === option.value
                      ? 'var(--mantine-color-blue-5)'
                      : undefined,
                  backgroundColor:
                    selectedReason === option.value
                      ? 'var(--mantine-color-blue-9)'
                      : undefined,
                }}
                onClick={() => setSelectedReason(option.value)}
              >
                <Group justify="space-between">
                  <Box>
                    <Text size="sm" fw={500}>
                      {option.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {option.description}
                    </Text>
                  </Box>
                  {selectedReason === option.value && (
                    <ThemeIcon size="sm" color="blue" variant="filled">
                      <IconCheck size={12} />
                    </ThemeIcon>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
        </Box>

        {/* Additional Notes */}
        <Textarea
          label="Additional notes (optional)"
          placeholder="Any other context that might be helpful..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          minRows={2}
          maxRows={4}
        />

        {/* Actions */}
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!selectedReason}
          >
            Save Feedback
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default AdaptationFeedbackModal;
