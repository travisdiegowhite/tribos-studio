/**
 * ReadinessChip — inline morning prompt above the state strip
 *
 * Single-tap opens a small inline form for leg_feel / energy /
 * motivation (1–5 each). Once submitted, the chip flips to a passive
 * "logged · LF 4 / E 3 / M 4" summary so the user can still see their
 * own answers without having to open the form again.
 *
 * Per the spec the chip is dismissible-for-the-day or persistent-until-
 * logged is an open question — for v1 we go with persistent-until-logged
 * (i.e. it stays prompting until the user submits or until the next day
 * rolls over).
 */

import { useState } from 'react';
import { Box, Button, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import type { ReadinessRow, ReadinessInput } from '../../hooks/useReadinessCheckin';

interface ReadinessChipProps {
  loggedToday: boolean;
  checkin: ReadinessRow | null;
  onLog: (input: ReadinessInput) => Promise<void>;
}

interface DraftState {
  leg_feel: number | null;
  energy: number | null;
  motivation: number | null;
}

const SCALE = [1, 2, 3, 4, 5];

function ScaleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <Group gap={6} align="center">
      <Text size="xs" tt="uppercase" ff="monospace" c="dimmed" style={{ width: 90 }}>
        {label}
      </Text>
      {SCALE.map((n) => (
        <UnstyledButton
          key={n}
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          style={{
            width: 28,
            height: 28,
            border: value === n
              ? '2px solid var(--color-teal, #2A8C82)'
              : '1.5px solid var(--tribos-border-default)',
            background: value === n ? 'var(--color-teal-subtle)' : 'var(--tribos-card)',
            color: 'var(--color-text-primary)',
            fontFamily: 'monospace',
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {n}
        </UnstyledButton>
      ))}
    </Group>
  );
}

function ReadinessChip({ loggedToday, checkin, onLog }: ReadinessChipProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<DraftState>({
    leg_feel: null,
    energy: null,
    motivation: null,
  });

  if (loggedToday && !open) {
    return (
      <Group gap={8} align="center">
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          Logged today
        </Text>
        <Text size="sm" ff="monospace" c="dimmed">
          LF {checkin?.leg_feel ?? '—'} · E {checkin?.energy ?? '—'} · M {checkin?.motivation ?? '—'}
        </Text>
        <UnstyledButton
          onClick={() => {
            setOpen(true);
            setDraft({
              leg_feel: checkin?.leg_feel ?? null,
              energy: checkin?.energy ?? null,
              motivation: checkin?.motivation ?? null,
            });
          }}
          style={{ fontSize: 12, color: 'var(--color-teal)', textDecoration: 'underline' }}
        >
          Update
        </UnstyledButton>
      </Group>
    );
  }

  if (!open) {
    return (
      <UnstyledButton
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 12px',
          background: 'var(--color-teal-subtle)',
          border: '1.5px solid var(--color-teal-border)',
          borderRadius: 0,
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-teal)',
          alignSelf: 'flex-start',
        }}
      >
        How do you feel today? Log readiness →
      </UnstyledButton>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    try {
      await onLog(draft);
      setOpen(false);
      // PostHog spec event — capture if posthog is on window.
      if (typeof window !== 'undefined') {
        const ph = (window as unknown as { posthog?: { capture: (e: string, p?: object) => void } }).posthog;
        ph?.capture('today_view.readiness_logged', {
          view_version: 'today_v1',
          leg_feel: draft.leg_feel,
          energy: draft.energy,
          motivation: draft.motivation,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = draft.leg_feel != null || draft.energy != null || draft.motivation != null;

  return (
    <Box
      style={{
        padding: 14,
        background: 'var(--color-teal-subtle)',
        border: '1.5px solid var(--color-teal-border)',
        borderRadius: 0,
      }}
    >
      <Stack gap={10}>
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          Readiness check-in
        </Text>
        <ScaleRow label="Legs" value={draft.leg_feel} onChange={(v) => setDraft((d) => ({ ...d, leg_feel: v }))} />
        <ScaleRow label="Energy" value={draft.energy} onChange={(v) => setDraft((d) => ({ ...d, energy: v }))} />
        <ScaleRow label="Motivation" value={draft.motivation} onChange={(v) => setDraft((d) => ({ ...d, motivation: v }))} />
        <Group gap="xs" justify="flex-end">
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            onClick={submit}
            disabled={submitting || !canSubmit}
            style={{ borderRadius: 0 }}
          >
            {submitting ? 'Saving…' : 'Log'}
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}

export default ReadinessChip;
