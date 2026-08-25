import { Box, Text, Group, Badge, Stack, UnstyledButton } from '@mantine/core';
import type { CalendarDay, CalendarEntry } from '../../lib/calendar/getCalendarRange';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TYPE_COLOR: Record<string, string> = {
  race: 'red',
  rest: 'gray',
  note: 'blue',
  workout: 'teal',
};

/** Quality sessions read heavier, matching the Today spine's HARD_TYPES. */
const HARD_TYPES = new Set(['threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'intervals', 'sprint']);

export interface CalendarGridProps {
  days: CalendarDay[];
  todayKey: string;
  onAddToDay: (dateKey: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  /** Called when an entry is dropped on another day. */
  onMoveEntry: (entryId: string, toDateKey: string) => void;
}

function EntryChip({
  entry, onOpen, onDragStart,
}: {
  entry: CalendarEntry;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const done = entry.status === 'done';
  const hard = entry.workout_type ? HARD_TYPES.has(entry.workout_type) : false;
  const color = TYPE_COLOR[entry.type] ?? 'teal';

  return (
    <UnstyledButton
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        padding: '4px 6px',
        border: '0.5px solid var(--color-border)',
        borderLeft: `3px solid var(--mantine-color-${color}-6)`,
        backgroundColor: 'var(--color-card)',
        opacity: done ? 0.55 : 1,
        cursor: 'grab',
      }}
      aria-label={`${entry.title}${done ? ', done' : ''}`}
    >
      <Text
        size="xs"
        fw={hard ? 700 : 500}
        td={done ? 'line-through' : undefined}
        lineClamp={1}
      >
        {entry.title}
      </Text>
      <Group gap={4} wrap="nowrap">
        {entry.target_load ? (
          <Text size="10px" c="dimmed" ff="'DM Mono', monospace">{Math.round(entry.target_load)} RSS</Text>
        ) : null}
        {entry.pinned && <Text size="10px" c="dimmed" title="Pinned — generators will not overwrite this">📌</Text>}
      </Group>
    </UnstyledButton>
  );
}

/**
 * A rolling grid of weeks. Every cell accepts a drop and a click-to-add —
 * with no reference to a training plan anywhere, which is the entire point:
 * the old calendar hard-returned on `!activePlan` before any of these.
 */
export default function CalendarGrid({
  days, todayKey, onAddToDay, onOpenEntry, onMoveEntry,
}: CalendarGridProps) {
  return (
    <Box>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DAY_LABELS.map((label) => (
          <Text key={label} size="xs" c="dimmed" ta="center" py={4} ff="'DM Mono', monospace">
            {label}
          </Text>
        ))}
      </Box>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((day) => {
          const isToday = day.dateKey === todayKey;
          const dayNum = Number(day.dateKey.slice(8, 10));
          return (
            <Box
              key={day.dateKey}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/entry-id');
                if (id) onMoveEntry(id, day.dateKey);
              }}
              style={{
                minHeight: 96,
                padding: 4,
                border: '0.5px solid var(--color-border)',
                backgroundColor: isToday ? 'var(--color-card-hover, var(--color-card))' : 'transparent',
                outline: isToday ? '1px solid var(--mantine-color-teal-6)' : undefined,
              }}
              data-testid={`day-${day.dateKey}`}
            >
              <Group justify="space-between" gap={2} mb={2} wrap="nowrap">
                <Text size="xs" c={isToday ? undefined : 'dimmed'} fw={isToday ? 700 : 400}>
                  {dayNum}
                </Text>
                <UnstyledButton
                  onClick={() => onAddToDay(day.dateKey)}
                  aria-label={`Add to ${day.dateKey}`}
                  style={{ fontSize: 14, lineHeight: 1, color: 'var(--color-text-muted)', padding: '0 2px' }}
                >
                  +
                </UnstyledButton>
              </Group>

              <Stack gap={2}>
                {day.entries.map((entry) => (
                  <EntryChip
                    key={entry.id}
                    entry={entry}
                    onOpen={() => onOpenEntry(entry)}
                    onDragStart={(e) => e.dataTransfer.setData('text/entry-id', entry.id)}
                  />
                ))}
                {day.unplannedActivities.map((a) => (
                  <Badge key={a.id} size="xs" variant="light" color="gray" radius={0} title="Unplanned ride">
                    {a.name ?? 'Ride'}
                  </Badge>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
