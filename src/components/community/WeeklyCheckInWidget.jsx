/**
 * WeeklyCheckInWidget
 * Prompts users to share their weekly training reflection with their cafe
 * "The Cafe" - where cyclists gather to share stories and support each other
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
import { tokens } from '../../theme';
import { CaretDown, CaretUp, ChatCircle, Check, Fire, X } from '@phosphor-icons/react';

const MOOD_OPTIONS = [
  { value: 'struggling', label: 'Struggling', emoji: '😓' },
  { value: 'okay', label: 'Okay', emoji: '😐' },
  { value: 'good', label: 'Good', emoji: '🙂' },
  { value: 'great', label: 'Great', emoji: '😊' },
  { value: 'crushing_it', label: 'Crushing it', emoji: '🔥' },
];

const ENERGY_RATING_OPTIONS = [
  { value: 'running_on_empty', label: 'Running on empty', emoji: '😵' },
  { value: 'flat', label: 'A little flat', emoji: '😑' },
  { value: 'dialed', label: 'Dialed', emoji: '⚡' },
  { value: 'overfueled', label: 'Overfueled', emoji: '🤢' },
];

const ENERGY_FACTORS = [
  { value: 'stress', label: 'Stress/work' },
  { value: 'illness', label: 'Illness/recovery' },
  { value: 'travel', label: 'Travel' },
  { value: 'sleep', label: 'Poor sleep' },
  { value: 'nothing', label: 'Nothing unusual' },
];

function WeeklyCheckInWidget({
  cafeName,
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

  // Fueling section state
  const [showFueling, setShowFueling] = useState(false);
  const [energyRating, setEnergyRating] = useState(null);
  const [hadBonks, setHadBonks] = useState(null);
  const [energyFactors, setEnergyFactors] = useState([]);

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
        // Fueling data
        energy_rating: energyRating || null,
        had_bonks: hadBonks,
        energy_factors: energyFactors.length > 0 ? energyFactors : null,
      });
      close();
      // Reset form
      setMood(null);
      setReflection('');
      setNextWeekFocus('');
      setEnergyRating(null);
      setHadBonks(null);
      setEnergyFactors([]);
      setShowFueling(false);
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
          backgroundColor: 'var(--color-bg-secondary)',
          border: `1px solid ${'var(--color-teal)'}40`,
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
              color: 'var(--color-text-muted)',
            }}
          >
            <X size={14} />
          </ActionIcon>
        )}

        <Stack gap="sm">
          {/* Header */}
          <Group gap="xs">
            <ChatCircle size={18} color={'var(--color-teal)'} />
            <Text size="sm" fw={500}>
              Weekly Check-In
            </Text>
            {cafeName && (
              <Badge size="xs" variant="light" color="gray">
                {cafeName}
              </Badge>
            )}
          </Group>

          {/* Week stats summary */}
          {weekStats && (
            <Group gap="lg">
              <Box>
                <Text size="xl" fw={600} style={{ color: 'var(--color-text-primary)' }}>
                  {weekStats.rides}
                </Text>
                <Text size="xs" c="dimmed">rides</Text>
              </Box>
              <Box>
                <Text size="xl" fw={600} style={{ color: 'var(--color-text-primary)' }}>
                  {weekStats.hours?.toFixed(1) || '0'}
                </Text>
                <Text size="xs" c="dimmed">hours</Text>
              </Box>
              {weekStats.tss > 0 && (
                <Box>
                  <Text size="xl" fw={600} style={{ color: 'var(--color-text-primary)' }}>
                    {weekStats.tss}
                  </Text>
                  <Text size="xs" c="dimmed">TSS</Text>
                </Box>
              )}
            </Group>
          )}

          {/* Prompt text */}
          <Text size="sm" c="dimmed">
            How did your training week go? Share a quick reflection with your cafe.
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
                backgroundColor: 'var(--color-bg-secondary)',
              },
              indicator: {
                backgroundColor: 'var(--color-teal)',
              },
              label: {
                color: 'var(--color-text-secondary)',
                '&[data-active]': {
                  color: 'var(--color-bg)',
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
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: `1px solid ${'var(--color-bg-secondary)'}`,
                    color: 'var(--color-text-primary)',
                    '&::placeholder': {
                      color: 'var(--color-text-muted)',
                    },
                    '&:focus': {
                      borderColor: 'var(--color-teal)',
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
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: `1px solid ${'var(--color-bg-secondary)'}`,
                    color: 'var(--color-text-primary)',
                    '&::placeholder': {
                      color: 'var(--color-text-muted)',
                    },
                    '&:focus': {
                      borderColor: 'var(--color-teal)',
                    },
                  },
                }}
              />

              {/* Fueling section - inline */}
              <Box>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => setShowFueling(!showFueling)}
                  leftSection={<Fire size={16} />}
                  rightSection={showFueling ? <CaretUp size={16} /> : <CaretDown size={16} />}
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Fueling Check (optional)
                </Button>

                <Collapse in={showFueling}>
                  <Stack gap="sm" pt="sm">
                    {/* Energy rating */}
                    <Box>
                      <Text size="sm" fw={500} mb={6}>How did your energy feel?</Text>
                      <SegmentedControl
                        value={energyRating || ''}
                        onChange={setEnergyRating}
                        data={ENERGY_RATING_OPTIONS.map(e => ({
                          value: e.value,
                          label: e.emoji,
                        }))}
                        size="sm"
                        fullWidth
                        styles={{
                          root: {
                            backgroundColor: 'var(--color-bg-secondary)',
                          },
                          indicator: {
                            backgroundColor: 'var(--color-teal)',
                          },
                        }}
                      />
                    </Box>

                    {/* Had bonks */}
                    <Box>
                      <Text size="sm" fw={500} mb={6}>Any bonks or energy crashes?</Text>
                      <SegmentedControl
                        value={hadBonks === null ? '' : hadBonks ? 'yes' : 'no'}
                        onChange={(val) => setHadBonks(val === 'yes')}
                        data={[
                          { value: 'no', label: 'No' },
                          { value: 'yes', label: 'Yes' },
                        ]}
                        size="sm"
                        styles={{
                          root: {
                            backgroundColor: 'var(--color-bg-secondary)',
                          },
                          indicator: {
                            backgroundColor: 'var(--color-teal)',
                          },
                        }}
                      />
                    </Box>

                    {/* Energy factors */}
                    <Box>
                      <Text size="sm" fw={500} mb={6}>Affecting energy?</Text>
                      <Group gap={6}>
                        {ENERGY_FACTORS.map((factor) => (
                          <Badge
                            key={factor.value}
                            size="md"
                            variant={energyFactors.includes(factor.value) ? 'filled' : 'outline'}
                            color={energyFactors.includes(factor.value) ? 'terracotta' : 'gray'}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setEnergyFactors(prev =>
                                prev.includes(factor.value)
                                  ? prev.filter(f => f !== factor.value)
                                  : [...prev, factor.value]
                              );
                            }}
                          >
                            {factor.label}
                          </Badge>
                        ))}
                      </Group>
                    </Box>
                  </Stack>
                </Collapse>
              </Box>

              <Group justify="flex-end">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={!mood}
                  leftSection={<Check size={16} />}
                  style={{
                    backgroundColor: 'var(--color-teal)',
                    color: 'var(--color-bg)',
                  }}
                >
                  Share with Cafe
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
              rightSection={expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
              style={{
                color: 'var(--color-text-secondary)',
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
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: `1px solid ${'var(--color-bg-secondary)'}`,
          },
          content: {
            backgroundColor: 'var(--color-bg-secondary)',
          },
          title: {
            color: 'var(--color-text-primary)',
            fontWeight: 600,
          },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Share how your training week went with your cafe.
          </Text>

          {/* Week stats in modal */}
          {weekStats && (
            <Card
              padding="sm"
              radius="md"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
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
                  backgroundColor: 'var(--color-bg-secondary)',
                },
                indicator: {
                  backgroundColor: 'var(--color-teal)',
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
                backgroundColor: 'var(--color-bg-secondary)',
                border: `1px solid ${'var(--color-bg-secondary)'}`,
                color: 'var(--color-text-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
            }}
          />

          {/* Fueling section - collapsible */}
          <Box>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setShowFueling(!showFueling)}
              leftSection={<Fire size={16} />}
              rightSection={showFueling ? <CaretUp size={16} /> : <CaretDown size={16} />}
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Fueling Check (optional)
            </Button>

            <Collapse in={showFueling}>
              <Stack gap="sm" pt="sm">
                {/* Energy rating */}
                <Box>
                  <Text size="sm" fw={500} mb="xs">How did your energy feel this week?</Text>
                  <SegmentedControl
                    value={energyRating || ''}
                    onChange={setEnergyRating}
                    data={ENERGY_RATING_OPTIONS.map(e => ({
                      value: e.value,
                      label: `${e.emoji} ${e.label}`,
                    }))}
                    size="sm"
                    fullWidth
                    styles={{
                      root: {
                        backgroundColor: 'var(--color-bg-secondary)',
                      },
                      indicator: {
                        backgroundColor: 'var(--color-teal)',
                      },
                    }}
                  />
                </Box>

                {/* Had bonks */}
                <Box>
                  <Text size="sm" fw={500} mb="xs">Any bonks or energy crashes?</Text>
                  <SegmentedControl
                    value={hadBonks === null ? '' : hadBonks ? 'yes' : 'no'}
                    onChange={(val) => setHadBonks(val === 'yes')}
                    data={[
                      { value: 'no', label: 'No' },
                      { value: 'yes', label: 'Yes' },
                    ]}
                    size="sm"
                    styles={{
                      root: {
                        backgroundColor: 'var(--color-bg-secondary)',
                      },
                      indicator: {
                        backgroundColor: 'var(--color-teal)',
                      },
                    }}
                  />
                </Box>

                {/* Energy factors */}
                <Box>
                  <Text size="sm" fw={500} mb="xs">Anything else affecting energy?</Text>
                  <Group gap="sm">
                    {ENERGY_FACTORS.map((factor) => (
                      <Badge
                        key={factor.value}
                        size="md"
                        variant={energyFactors.includes(factor.value) ? 'filled' : 'outline'}
                        color={energyFactors.includes(factor.value) ? 'terracotta' : 'gray'}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setEnergyFactors(prev =>
                            prev.includes(factor.value)
                              ? prev.filter(f => f !== factor.value)
                              : [...prev, factor.value]
                          );
                        }}
                      >
                        {factor.label}
                      </Badge>
                    ))}
                  </Group>
                </Box>
              </Stack>
            </Collapse>
          </Box>

          {/* Next week focus */}
          <Textarea
            label="Next week's focus (optional)"
            placeholder="What are you focusing on next week?"
            value={nextWeekFocus}
            onChange={(e) => setNextWeekFocus(e.target.value)}
            minRows={2}
            styles={{
              input: {
                backgroundColor: 'var(--color-bg-secondary)',
                border: `1px solid ${'var(--color-bg-secondary)'}`,
                color: 'var(--color-text-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
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
                backgroundColor: 'var(--color-teal)',
                color: 'var(--color-bg)',
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
