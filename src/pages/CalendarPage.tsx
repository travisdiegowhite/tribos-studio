/**
 * CalendarPage — the rebuilt calendar, backed by `calendar_entries`.
 *
 * Deliberately NOT a fork of TrainingCalendar.jsx. That component is ~2000
 * lines with plan-coupling threaded through it: it hard-returns on
 * `!activePlan` before adding, moving, editing or opening a day, and clamps
 * every date to the plan's `duration_weeks`. Forking it would carry in exactly
 * the coupling this rebuild removes.
 *
 * There is no `activePlan` in this file. Adding, moving, editing, completing
 * and deleting all work with zero plans — which is the behaviour that does not
 * exist anywhere in the app today, and the whole proof of the ownership
 * inversion.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Container, Stack, Group, Button, Text, Title, Loader, Center, Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import AppShell from '../components/AppShell.jsx';
import CalendarGrid from '../components/calendar/CalendarGrid';
import EntryEditor from '../components/calendar/EntryEditor';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getCalendarRange, type CalendarEntry, type CalendarRange } from '../lib/calendar/getCalendarRange';
import {
  createEntry, updateEntry, moveEntry, deleteEntry, setEntryStatus,
  type EntryDraft,
} from '../lib/calendar/calendarMutations';
import { getTodayString, weekStartKey } from '../utils/dateUtils';

const WEEKS_SHOWN = 4;

/** Shift a YYYY-MM-DD key by whole days in UTC, so DST cannot drop one. */
function shiftKey(dateKey: string, days: number): string {
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(t)) return dateKey;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const { user } = useAuth();
  const userId = user?.id as string | undefined;
  const todayKey = getTodayString();

  // The grid starts on the Monday of last week, so "what did I just do" and
  // "what is next" are both on screen without navigating.
  const [anchorKey, setAnchorKey] = useState(() => shiftKey(weekStartKey(getTodayString()) ?? getTodayString(), -7));
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [editorEntry, setEditorEntry] = useState<CalendarEntry | null>(null);

  const fromKey = anchorKey;
  const toKey = useMemo(() => shiftKey(anchorKey, WEEKS_SHOWN * 7 - 1), [anchorKey]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setRange(await getCalendarRange(userId, fromKey, toKey));
    } finally {
      setLoading(false);
    }
  }, [userId, fromKey, toKey]);

  useEffect(() => { void load(); }, [load]);

  /** Run a mutation, report failure honestly, and refresh on success. */
  const run = async (label: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.success) {
        notifications.show({ color: 'red', title: `Could not ${label}`, message: result.error ?? 'Unknown error' });
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const openAdd = (dateKey: string) => {
    setEditorEntry(null);
    setEditorDate(dateKey);
    setEditorOpen(true);
  };

  const openEntry = (entry: CalendarEntry) => {
    setEditorEntry(entry);
    setEditorDate(entry.date);
    setEditorOpen(true);
  };

  const handleSave = async (draft: EntryDraft) => {
    if (!userId) return;
    const ok = editorEntry
      ? await run('save that entry', () => updateEntry(userId, editorEntry.id, draft))
      : await run('add that entry', () => createEntry(userId, editorDate!, draft));
    if (ok) setEditorOpen(false);
  };

  const handleDelete = async () => {
    if (!userId || !editorEntry) return;
    if (await run('remove that entry', () => deleteEntry(userId, editorEntry.id))) setEditorOpen(false);
  };

  const handleToggleDone = async () => {
    if (!userId || !editorEntry) return;
    const next = editorEntry.status === 'done' ? 'planned' : 'done';
    if (await run('update that entry', () => setEntryStatus(userId, editorEntry.id, next))) setEditorOpen(false);
  };

  const handleMove = async (entryId: string, toDateKey: string) => {
    if (!userId) return;
    await run('move that entry', () => moveEntry(userId, entryId, toDateKey));
  };

  const totals = useMemo(() => {
    const entries = range?.entries ?? [];
    const sessions = entries.filter((e) => e.type !== 'rest' && e.type !== 'note');
    return {
      sessions: sessions.length,
      done: sessions.filter((e) => e.status === 'done').length,
      load: Math.round(sessions.reduce((s, e) => s + (e.target_load ?? 0), 0)),
    };
  }, [range]);

  return (
    <AppShell>
      <Container size="xl" py="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-end">
            <Box>
              <Title order={3}>Calendar</Title>
              <Text size="xs" c="dimmed" ff="'DM Mono', monospace">
                {fromKey} → {toKey} · {totals.done}/{totals.sessions} sessions · {totals.load} RSS planned
              </Text>
            </Box>
            <Group gap="xs">
              <Button variant="default" radius={0} onClick={() => setAnchorKey((k) => shiftKey(k, -7))}>
                ←
              </Button>
              <Button
                variant="default"
                radius={0}
                onClick={() => setAnchorKey(shiftKey(weekStartKey(todayKey) ?? todayKey, -7))}
              >
                Today
              </Button>
              <Button variant="default" radius={0} onClick={() => setAnchorKey((k) => shiftKey(k, 7))}>
                →
              </Button>
            </Group>
          </Group>

          {loading && !range ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : (
            <CalendarGrid
              days={range?.days ?? []}
              todayKey={todayKey}
              onAddToDay={openAdd}
              onOpenEntry={openEntry}
              onMoveEntry={handleMove}
            />
          )}

          <Text size="xs" c="dimmed">
            Drag an entry to move it. Click a day&apos;s + to add. No training plan required.
          </Text>
        </Stack>
      </Container>

      <EntryEditor
        opened={editorOpen}
        dateKey={editorDate}
        entry={editorEntry}
        busy={busy}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        onDelete={editorEntry ? handleDelete : undefined}
        onToggleDone={editorEntry ? handleToggleDone : undefined}
      />
    </AppShell>
  );
}
