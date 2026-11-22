/**
 * The bars above the desktop calendar grid, split out of TrainingCalendar.jsx
 * (pure render; the state and handlers stay in the calendar):
 *
 * - CalendarHeader: library toggle, the range, availability, clear, today and
 *   week navigation.
 * - ProposalStrip: coach changes waiting on the athlete. The server withholds
 *   a coach change when it touches more than one session, one the athlete
 *   already adjusted, or one already done, and the coach then says "I've put
 *   that up for you to accept"; until this strip existed that sentence was
 *   false, the proposal went into a table nothing read.
 * - HeldBar: the session picked up for tap-to-place. Nothing else on screen
 *   says a session is "picked up", so the whole model is invisible without it.
 */
import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { CalendarX, CaretLeft, CaretRight, Plus, SkipForward, Trash } from '@phosphor-icons/react';
import { isSkippedSession } from '../../../api/utils/sessionSkipped.js';

export function CalendarHeader({
  isMobile,
  sidebarOpen,
  rangeLabel,
  onToggleSidebar,
  onOpenMobileLibrary,
  onOpenAvailability,
  onClear,
  onToday,
  onPrevious,
  onNext,
}) {
  return (
    <Group justify="space-between" mb="md">
      <Group gap="xs">
        {!isMobile && (
          <Tooltip label={sidebarOpen ? 'Hide workout library' : 'Show workout library'}>
            <Button
              variant="subtle"
              size="compact-xs"
              leftSection={sidebarOpen ? <CaretLeft size={14} /> : <CaretRight size={14} />}
              onClick={onToggleSidebar}

            >
              Library
            </Button>
          </Tooltip>
        )}
        {isMobile && (
          <Button
            variant="light"
            color="teal"
            size="compact-xs"
            leftSection={<Plus size={14} />}
            onClick={onOpenMobileLibrary}
          >
            Add workout
          </Button>
        )}
        {!isMobile && (
          <Text size="lg" fw={600} style={{ color: 'var(--color-text-primary)' }}>{rangeLabel}</Text>
        )}
      </Group>
      <Group gap="xs">
        <Tooltip label="Set training availability">
          <Button
            variant="subtle"
            size="compact-xs"
            leftSection={<CalendarX size={14} />}
            onClick={onOpenAvailability}
            aria-label="Set training availability"
          >
            {!isMobile && 'Availability'}
          </Button>
        </Tooltip>
        <Tooltip label="Remove upcoming planned sessions">
          <Button
            variant="subtle"
            color="red"
            size="compact-xs"
            leftSection={<Trash size={14} />}
            onClick={onClear}
            aria-label="Remove upcoming planned sessions"
          >
            {!isMobile && 'Clear'}
          </Button>
        </Tooltip>
        <Button variant="subtle" size="compact-xs" onClick={onToday}>
          Today
        </Button>
        <ActionIcon variant="subtle" onClick={onPrevious} aria-label="Previous week">
          <CaretLeft size={18} />
        </ActionIcon>
        <ActionIcon variant="subtle" onClick={onNext} aria-label="Next week">
          <CaretRight size={18} />
        </ActionIcon>
      </Group>
    </Group>
  );
}

export function ProposalStrip({ proposals, onReview }) {
  if (!proposals || proposals.length === 0) return null;
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      p="xs"
      mb="xs"
      style={{
        border: '1px solid var(--color-ink)',
        backgroundColor: 'var(--color-ink-subtle)',
      }}
    >
      <Text size="sm" style={{ minWidth: 0 }}>
        <Text span fw={600} size="xs">
          Coach{' '}
        </Text>
        <Text span fw={600}>
          {proposals.length === 1
            ? '1 change is waiting for you'
            : `${proposals.length} changes are waiting for you`}
        </Text>
        {proposals[0].summary && (
          <Text span c="dimmed"> — {proposals[0].summary}</Text>
        )}
      </Text>
      <Button
        variant="light"
        color="teal"
        size="compact-xs"
        onClick={() => onReview(proposals[0])}
      >
        Review
      </Button>
    </Group>
  );
}

export function HeldBar({ heldWorkout, onUnskip, onSkip, onCancel }) {
  if (!heldWorkout) return null;
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      p="xs"
      mb="xs"
      style={{
        border: '1px solid var(--color-signal)',
        backgroundColor: 'var(--color-signal-subtle)',
      }}
    >
      <Text size="sm" style={{ minWidth: 0 }}>
        <Text span fw={600} size="xs">
          Moving{' '}
        </Text>
        <Text span fw={600}>{heldWorkout.name}</Text>
        <Text span c="dimmed"> — tap any day to place it</Text>
      </Text>
      <Group gap={4} wrap="nowrap">
        {!heldWorkout.completed && (
          isSkippedSession(heldWorkout) ? (
            <Button variant="subtle" size="compact-xs" onClick={() => onUnskip(heldWorkout)}>
              Unskip
            </Button>
          ) : (
            <Button
              variant="subtle"
              size="compact-xs"
              leftSection={<SkipForward size={12} />}
              onClick={() => onSkip(heldWorkout)}
            >
              Skip
            </Button>
          )
        )}
        <Button variant="subtle" size="compact-xs" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Group>
  );
}
