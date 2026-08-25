import { useEffect, useState } from 'react';
import {
  Modal, Stack, TextInput, NumberInput, Select, Textarea, Group, Button, Text, Divider,
} from '@mantine/core';
import type { CalendarEntry, CalendarEntryType } from '../../lib/calendar/getCalendarRange';
import type { EntryDraft } from '../../lib/calendar/calendarMutations';

const TYPE_OPTIONS: { value: CalendarEntryType; label: string }[] = [
  { value: 'workout', label: 'Workout' },
  { value: 'race', label: 'Race' },
  { value: 'rest', label: 'Rest day' },
  { value: 'note', label: 'Note' },
];

const WORKOUT_TYPES = [
  'endurance', 'tempo', 'threshold', 'sweet_spot', 'vo2max',
  'anaerobic', 'intervals', 'sprint', 'recovery',
];

export interface EntryEditorProps {
  opened: boolean;
  dateKey: string | null;
  /** null when adding, the entry when editing. */
  entry: CalendarEntry | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (draft: EntryDraft) => void;
  onDelete?: () => void;
  onToggleDone?: () => void;
}

/**
 * Add or edit one calendar entry.
 *
 * Note what is absent: no plan selector, no plan-week validation, no
 * "outside the plan duration" rejection. An entry needs an athlete, a date and
 * a title — nothing else.
 */
export default function EntryEditor({
  opened, dateKey, entry, busy = false, onClose, onSave, onDelete, onToggleDone,
}: EntryEditorProps) {
  const [type, setType] = useState<CalendarEntryType>('workout');
  const [title, setTitle] = useState('');
  const [workoutType, setWorkoutType] = useState<string | null>(null);
  const [load, setLoad] = useState<number | ''>('');
  const [duration, setDuration] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!opened) return;
    setType(entry?.type ?? 'workout');
    setTitle(entry?.title ?? '');
    setWorkoutType(entry?.workout_type ?? null);
    setLoad(entry?.target_load ?? '');
    setDuration(entry?.target_duration_min ?? '');
    setNotes(entry?.notes ?? '');
  }, [opened, entry]);

  const isRest = type === 'rest';
  const canSave = title.trim().length > 0 && !busy;

  const submit = () => {
    if (!canSave) return;
    onSave({
      type,
      title: title.trim(),
      workout_type: isRest ? 'rest' : workoutType,
      target_load: isRest ? 0 : (load === '' ? null : Number(load)),
      target_duration_min: isRest ? null : (duration === '' ? null : Number(duration)),
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={entry ? 'Edit entry' : `Add to ${dateKey ?? 'the calendar'}`}
      radius={0}
      centered
    >
      <Stack gap="sm">
        <Select
          label="Type"
          data={TYPE_OPTIONS}
          value={type}
          onChange={(v) => setType((v as CalendarEntryType) ?? 'workout')}
          radius={0}
          allowDeselect={false}
        />

        <TextInput
          label="Title"
          placeholder={isRest ? 'Rest day' : 'Endurance Ride'}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          radius={0}
          required
          data-autofocus
        />

        {!isRest && type !== 'note' && (
          <>
            <Select
              label="Workout type"
              data={WORKOUT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
              value={workoutType}
              onChange={setWorkoutType}
              radius={0}
              clearable
              searchable
            />
            <Group grow>
              <NumberInput
                label="Target RSS"
                value={load}
                onChange={(v) => setLoad(typeof v === 'number' ? v : '')}
                min={0}
                max={500}
                radius={0}
              />
              <NumberInput
                label="Duration (min)"
                value={duration}
                onChange={(v) => setDuration(typeof v === 'number' ? v : '')}
                min={0}
                max={1440}
                radius={0}
              />
            </Group>
          </>
        )}

        <Textarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          radius={0}
          autosize
          minRows={2}
        />

        {entry?.coach_rationale && (
          <>
            <Divider />
            <Text size="xs" c="dimmed">{entry.coach_rationale}</Text>
          </>
        )}

        <Group justify="space-between" mt="sm">
          <Group gap="xs">
            {entry && onDelete && (
              <Button variant="subtle" color="red" radius={0} onClick={onDelete} disabled={busy}>
                Delete
              </Button>
            )}
            {entry && onToggleDone && (
              <Button variant="default" radius={0} onClick={onToggleDone} disabled={busy}>
                {entry.status === 'done' ? 'Mark not done' : 'Mark done'}
              </Button>
            )}
          </Group>
          <Group gap="xs">
            <Button variant="subtle" radius={0} onClick={onClose} disabled={busy}>Cancel</Button>
            <Button radius={0} onClick={submit} disabled={!canSave} loading={busy}>
              {entry ? 'Save' : 'Add'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
