import { useEffect, useState } from 'react';
import { Button, Chip, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

/**
 * Skip a planned session on purpose, with an optional reason.
 *
 * A deliberate skip is a decision, not a miss: it leaves the week's
 * compliance count, and the coach sees the reason. The reason is optional so
 * skipping stays one tap; the chips cover the common cases.
 */

export const SKIP_REASONS = ['Legs need rest', 'Feeling ill', 'No time', 'Weather', 'Travel'] as const;

/** The text stored in `skipped_reason`: the chip, the note, both, or null. */
export function buildSkipReason(chip: string | null, note: string): string | null {
  const trimmed = note.trim();
  if (chip && trimmed) return `${chip} — ${trimmed}`;
  return chip || trimmed || null;
}

export interface SkipSessionModalProps {
  opened: boolean;
  sessionName: string;
  /** Already formatted, e.g. "Tuesday 10 Nov". */
  dateLabel: string;
  onClose: () => void;
  /** askCoach: also open the coach to rebalance the week. */
  onSkip: (reason: string | null, askCoach: boolean) => void | Promise<void>;
}

export function SkipSessionModal({ opened, sessionName, dateLabel, onClose, onSkip }: SkipSessionModalProps) {
  const [chip, setChip] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Start clean each time the dialog opens for a session.
  useEffect(() => {
    if (opened) {
      setChip(null);
      setNote('');
      setBusy(false);
    }
  }, [opened]);

  const submit = async (askCoach: boolean) => {
    setBusy(true);
    try {
      await onSkip(buildSkipReason(chip, note), askCoach);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Skip ${sessionName}?`} centered size="sm">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {dateLabel}. A skipped session doesn't count against your week, and your coach sees why.
        </Text>

        <Stack gap={6}>
          <Text size="xs" fw={600}>Why? (optional)</Text>
          <Group gap={6}>
            {SKIP_REASONS.map((r) => (
              <Chip
                key={r}
                size="xs"
                checked={chip === r}
                onChange={(checked) => setChip(checked ? r : null)}
              >
                {r}
              </Chip>
            ))}
          </Group>
          <TextInput
            id="skip-session-note"
            size="xs"
            placeholder="Add a note, e.g. long run yesterday"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
        </Stack>

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" size="xs" onClick={() => submit(true)} disabled={busy}>
            Skip and ask coach
          </Button>
          <Button size="xs" onClick={() => submit(false)} loading={busy}>
            Skip session
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default SkipSessionModal;
