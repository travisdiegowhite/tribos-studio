/**
 * WeeklyCheckInWidget
 * Prompts users to share their weekly training reflection with their pod
 */

import { useState } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Button,
  Textarea,
  SegmentedControl,
  Box,
  Modal,
  Badge,
  Collapse,
  ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconMessageCircle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconX,
} from '@tabler/icons-react';
import { tokens } from '../../theme';

const MOOD_OPTIONS = [
  { value: 'struggling', label: 'Struggling', emoji: '😓' },
  { value: 'okay', label: 'Okay', emoji: '😐' },
  { value: 'good', label: 'Good', emoji: '🙂' },
  { value: 'great', label: 'Great', emoji: '😊' },
  { value: 'crushing_it', label: 'Crushing it', emoji: '🔥' },
];

function WeeklyCheckInWidget({
  podName,
  hasCheckedIn = false,
  weekStats = null,
  onSubmit,
  onDismiss,
  loading = false,
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [expanded, setExpanded] = useState(false);
  const [mood, setMood] = useState(null);
  const [reflection, setReflection] = useState('');
  const [nextWeekFocus, setNextWeekFocus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Don't show if already checked in
  if (hasCheckedIn) {
    return null;
  }

  const handleSubmit = async () => {
    if (!mood) return;

    setSubmitting(true);
    try {
      await onSubmit({
        training_mood: mood,
        reflection: reflection.trim() || null,
        next_week_focus: nextWeekFocus.trim() || null,
      });
      close();
      // Reset form
      setMood(null);
      setReflection('');
      setNextWeekFocus('');
    } catch (err) {
      console.error('Failed to submit check-in:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCheckIn = () => {
    open();
  };

  return (
    <>
      <Card
        padding="md"
        radius="md"
        style={{
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.electricLime}40`,
          position: 'relative',
        }}
      >
        {/* Dismiss button */}
        {onDismiss && (
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={onDismiss}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: tokens.colors.textMuted,
            }}
          >
            <IconX size={14} />
          </ActionIcon>
        )}

        <Stack gap="sm">
          {/* Header */}
          <Group gap="xs">
            <IconMessageCircle size={18} color={tokens.colors.electricLime} />
            <Text size="sm" fw={500}>
              Weekly Check-In
            </Text>
            {podName && (
              <Badge size="xs" variant="light" color="gray">
                {podName}
              </Badge>
            )}
          </Group>

          {/* Week stats summary */}
          {weekStats && (
            <Group gap="lg">
              <Box>
                <Text size="xl" fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {weekStats.rides}
                </Text>
                <Text size="xs" c="dimmed">rides</Text>
              </Box>
              <Box>
                <Text size="xl" fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {weekStats.hours?.toFixed(1) || '0'}
                </Text>
                <Text size="xs" c="dimmed">hours</Text>
              </Box>
              {weekStats.tss > 0 && (
                <Box>
                  <Text size="xl" fw={600} style={{ color: tokens.colors.textPrimary }}>
                    {weekStats.tss}
                  </Text>
                  <Text size="xs" c="dimmed">TSS</Text>
                </Box>
              )}
            </Group>
          )}

          {/* Prompt text */}
          <Text size="sm" c="dimmed">
            How did your training week go? Share a quick reflection with your pod.
          </Text>

          {/* Quick mood selector */}
          <SegmentedControl
            value={mood || ''}
            onChange={(val) => {
              setMood(val);
              if (!expanded) {
                setExpanded(true);
              }
            }}
            data={MOOD_OPTIONS.map(m => ({
              value: m.value,
              label: (
                <Text size="xs">
                  {m.emoji}
                </Text>
              ),
            }))}
            size="xs"
            fullWidth
            styles={{
              root: {
                backgroundColor: tokens.colors.bgTertiary,
              },
              indicator: {
                backgroundColor: tokens.colors.electricLime,
              },
              label: {
                color: tokens.colors.textSecondary,
                '&[data-active]': {
                  color: tokens.colors.bgPrimary,
                },
              },
            }}
          />

          {/* Expanded form */}
          <Collapse in={expanded && mood}>
            <Stack gap="sm" pt="xs">
              <Textarea
                placeholder="How did training go this week? Any wins or struggles?"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                minRows={2}
                maxRows={4}
                styles={{
                  input: {
                    backgroundColor: tokens.colors.bgTertiary,
                    border: `1px solid ${tokens.colors.bgTertiary}`,
                    color: tokens.colors.textPrimary,
                    '&::placeholder': {
                      color: tokens.colors.textMuted,
                    },
                    '&:focus': {
                      borderColor: tokens.colors.electricLime,
                    },
                  },
                }}
              />

              <Textarea
                placeholder="Focus for next week? (optional)"
                value={nextWeekFocus}
                onChange={(e) => setNextWeekFocus(e.target.value)}
                minRows={1}
                maxRows={2}
                styles={{
                  input: {
                    backgroundColor: tokens.colors.bgTertiary,
                    border: `1px solid ${tokens.colors.bgTertiary}`,
                    color: tokens.colors.textPrimary,
                    '&::placeholder': {
                      color: tokens.colors.textMuted,
                    },
                    '&:focus': {
                      borderColor: tokens.colors.electricLime,
                    },
                  },
                }}
              />

              <Group justify="flex-end">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={!mood}
                  leftSection={<IconCheck size={16} />}
                  style={{
                    backgroundColor: tokens.colors.electricLime,
                    color: tokens.colors.bgPrimary,
                  }}
                >
                  Share with Pod
                </Button>
              </Group>
            </Stack>
          </Collapse>

          {/* Toggle expand */}
          {mood && (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setExpanded(!expanded)}
              rightSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              style={{
                color: tokens.colors.textSecondary,
              }}
            >
              {expanded ? 'Less' : 'Add reflection'}
            </Button>
          )}
        </Stack>
      </Card>

      {/* Full check-in modal (for more detailed entry) */}
      <Modal
        opened={opened}
        onClose={close}
        title="Weekly Check-In"
        centered
        styles={{
          header: {
            backgroundColor: tokens.colors.bgSecondary,
            borderBottom: `1px solid ${tokens.colors.bgTertiary}`,
          },
          content: {
            backgroundColor: tokens.colors.bgSecondary,
          },
          title: {
            color: tokens.colors.textPrimary,
            fontWeight: 600,
          },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Share how your training week went with your pod.
          </Text>

          {/* Week stats in modal */}
          {weekStats && (
            <Card
              padding="sm"
              radius="md"
              style={{
                backgroundColor: tokens.colors.bgTertiary,
              }}
            >
              <Group justify="space-around">
                <Box ta="center">
                  <Text size="lg" fw={600}>{weekStats.rides}</Text>
                  <Text size="xs" c="dimmed">rides</Text>
                </Box>
                <Box ta="center">
                  <Text size="lg" fw={600}>{weekStats.hours?.toFixed(1) || '0'}</Text>
                  <Text size="xs" c="dimmed">hours</Text>
                </Box>
                <Box ta="center">
                  <Text size="lg" fw={600}>{weekStats.tss || 0}</Text>
                  <Text size="xs" c="dimmed">TSS</Text>
                </Box>
              </Group>
            </Card>
          )}

          {/* Mood */}
          <Box>
            <Text size="sm" fw={500} mb="xs">How did it go?</Text>
            <SegmentedControl
              value={mood || ''}
              onChange={setMood}
              data={MOOD_OPTIONS.map(m => ({
                value: m.value,
                label: `${m.emoji} ${m.label}`,
              }))}
              size="sm"
              fullWidth
              styles={{
                root: {
                  backgroundColor: tokens.colors.bgTertiary,
                },
                indicator: {
                  backgroundColor: tokens.colors.electricLime,
                },
              }}
            />
          </Box>

          {/* Reflection */}
          <Textarea
            label="Reflection"
            placeholder="Any wins, challenges, or thoughts from the week?"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            minRows={3}
            styles={{
              input: {
                backgroundColor: tokens.colors.bgTertiary,
                border: `1px solid ${tokens.colors.bgTertiary}`,
                color: tokens.colors.textPrimary,
              },
              label: {
                color: tokens.colors.textPrimary,
              },
            }}
          />

          {/* Next week focus */}
          <Textarea
            label="Next week's focus (optional)"
            placeholder="What are you focusing on next week?"
            value={nextWeekFocus}
            onChange={(e) => setNextWeekFocus(e.target.value)}
            minRows={2}
            styles={{
              input: {
                backgroundColor: tokens.colors.bgTertiary,
                border: `1px solid ${tokens.colors.bgTertiary}`,
                color: tokens.colors.textPrimary,
              },
              label: {
                color: tokens.colors.textPrimary,
              },
            }}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              loading={submitting}
              disabled={!mood}
              style={{
                backgroundColor: tokens.colors.electricLime,
                color: tokens.colors.bgPrimary,
              }}
            >
              Share Check-In
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default WeeklyCheckInWidget;
