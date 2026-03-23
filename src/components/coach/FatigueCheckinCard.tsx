/**
 * FatigueCheckinCard — Morning readiness survey.
 *
 * Simple form for recording subjective fatigue markers (leg feel, energy,
 * motivation) on a 1-5 scale. Shown on the Coach tab as a morning check-in.
 */

import { useState } from 'react';
import { Paper, Text, Group, Button, Stack, Slider, Textarea } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { Barbell, Lightning, Heart } from '@phosphor-icons/react';

interface FatigueCheckinCardProps {
  onComplete?: () => void;
}

const LABELS: Record<number, string> = {
  1: 'Very heavy',
  2: 'Heavy',
  3: 'Moderate',
  4: 'Light',
  5: 'Fresh',
};

const ENERGY_LABELS: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Moderate',
  4: 'Good',
  5: 'High',
};

const MOTIVATION_LABELS: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Moderate',
  4: 'Good',
  5: 'High',
};

export default function FatigueCheckinCard({ onComplete }: FatigueCheckinCardProps) {
  const [legFeel, setLegFeel] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [motivation, setMotivation] = useState(3);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in again.');
        return;
      }

      const response = await fetch('/api/fatigue-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          leg_feel: legFeel,
          energy,
          motivation,
          notes: notes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save check-in');
      }

      setSubmitted(true);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Paper
        p="md"
        withBorder
        style={{
          borderRadius: 0,
          borderColor: 'var(--tribos-border-default)',
          textAlign: 'center',
        }}
      >
        <Text size="sm" c="teal" fw={600}>Morning check-in recorded</Text>
        <Text size="xs" c="dimmed" mt={4}>
          Legs: {LABELS[legFeel]} · Energy: {ENERGY_LABELS[energy]} · Motivation: {MOTIVATION_LABELS[motivation]}
        </Text>
      </Paper>
    );
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
      <Text size="sm" fw={700} tt="uppercase" ff="monospace" c="dimmed" mb="md">
        Morning Readiness
      </Text>

      <Stack gap="md">
        {/* Leg Feel */}
        <div>
          <Group gap="xs" mb={4}>
            <Barbell size={14} />
            <Text size="xs" fw={600}>Leg Feel</Text>
            <Text size="xs" c="dimmed" ml="auto">{LABELS[legFeel]}</Text>
          </Group>
          <Slider
            value={legFeel}
            onChange={setLegFeel}
            min={1}
            max={5}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 3, label: '3' },
              { value: 5, label: '5' },
            ]}
            color="teal"
            styles={{ markLabel: { fontSize: 10 } }}
          />
        </div>

        {/* Energy */}
        <div>
          <Group gap="xs" mb={4}>
            <Lightning size={14} />
            <Text size="xs" fw={600}>Energy</Text>
            <Text size="xs" c="dimmed" ml="auto">{ENERGY_LABELS[energy]}</Text>
          </Group>
          <Slider
            value={energy}
            onChange={setEnergy}
            min={1}
            max={5}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 3, label: '3' },
              { value: 5, label: '5' },
            ]}
            color="teal"
            styles={{ markLabel: { fontSize: 10 } }}
          />
        </div>

        {/* Motivation */}
        <div>
          <Group gap="xs" mb={4}>
            <Heart size={14} />
            <Text size="xs" fw={600}>Motivation</Text>
            <Text size="xs" c="dimmed" ml="auto">{MOTIVATION_LABELS[motivation]}</Text>
          </Group>
          <Slider
            value={motivation}
            onChange={setMotivation}
            min={1}
            max={5}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 3, label: '3' },
              { value: 5, label: '5' },
            ]}
            color="teal"
            styles={{ markLabel: { fontSize: 10 } }}
          />
        </div>

        {/* Notes */}
        <Textarea
          placeholder="Any notes? (optional)"
          value={notes}
          onChange={e => setNotes(e.currentTarget.value)}
          maxRows={2}
          styles={{ input: { borderRadius: 0 } }}
        />

        {error && <Text size="xs" c="red">{error}</Text>}

        <Button
          color="teal"
          size="sm"
          loading={submitting}
          onClick={handleSubmit}
          style={{ borderRadius: 0 }}
        >
          Record Check-in
        </Button>
      </Stack>
    </Paper>
  );
}
