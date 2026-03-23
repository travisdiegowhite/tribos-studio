/**
 * RPEPrompt — Post-ride RPE capture.
 *
 * Shown when the last activity's TSS was estimated without power data.
 * Captures the athlete's subjective RPE (1-10 Foster scale) to upgrade
 * the confidence of the TSS estimate.
 */

import { useState } from 'react';
import { Paper, Text, Group, Button, SegmentedControl, Stack } from '@mantine/core';

interface RPEPromptProps {
  activityName?: string;
  tssSource: string;
  onSubmit: (rpe: number) => Promise<void>;
}

const RPE_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
  { value: '8', label: '8' },
  { value: '9', label: '9' },
  { value: '10', label: '10' },
];

const RPE_DESCRIPTIONS: Record<string, string> = {
  '1': 'Very light — barely moving',
  '2': 'Light — easy conversation',
  '3': 'Moderate — comfortable effort',
  '4': 'Somewhat hard — working but controlled',
  '5': 'Hard — challenging to hold conversation',
  '6': 'Harder — can speak in short phrases',
  '7': 'Very hard — gasping between words',
  '8': 'Very, very hard — near max sustainable',
  '9': 'Maximal — all out effort',
  '10': 'Absolute max — could not continue',
};

export default function RPEPrompt({ activityName, tssSource, onSubmit }: RPEPromptProps) {
  const [rpe, setRpe] = useState<string>('5');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(Number(rpe));
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return null; // Disappear after submission
  }

  return (
    <Paper
      p="md"
      withBorder
      style={{
        borderRadius: 0,
        borderColor: 'var(--tribos-border-default)',
      }}
    >
      <Stack gap="sm">
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          How hard was it?
        </Text>
        <Text size="xs" c="dimmed">
          {activityName ? `"${activityName}" ` : ''}Your load was estimated from {tssSource === 'hr' ? 'heart rate' : 'ride type'}.
          Rating your effort improves accuracy.
        </Text>

        <SegmentedControl
          value={rpe}
          onChange={setRpe}
          data={RPE_OPTIONS}
          fullWidth
          color="teal"
          size="xs"
          styles={{
            root: { borderRadius: 0 },
            label: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11 },
          }}
        />

        <Text size="xs" c="dimmed" ta="center" ff="monospace">
          {RPE_DESCRIPTIONS[rpe]}
        </Text>

        <Button
          color="teal"
          size="xs"
          loading={submitting}
          onClick={handleSubmit}
          style={{ borderRadius: 0 }}
        >
          Submit RPE {rpe}
        </Button>
      </Stack>
    </Paper>
  );
}
