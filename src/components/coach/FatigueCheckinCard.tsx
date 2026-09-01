/**
 * FatigueCheckinCard — Morning readiness survey.
 *
 * Simple form for recording subjective markers (sleep, leg feel, energy,
 * motivation) on a 1-5 scale, plus a "feeling ill" toggle. Shown on the Coach
 * tab as a morning check-in.
 *
 * Sleep and illness feed the coaching readiness rules (Phase 3 of
 * docs/coaching-bible/). Self-report is the signal the evidence actually backs
 * — better than HRV — which is why sleep is asked here rather than read off
 * the device's sleep score.
 */

import { useEffect, useState } from 'react';
import { Paper, Text, Group, Button, Stack, Slider, Textarea, Switch } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { Barbell, Lightning, Heart, Moon, Thermometer } from '@phosphor-icons/react';

interface FatigueCheckinCardProps {
  onComplete?: () => void;
}

const SLEEP_LABELS: Record<number, string> = {
  1: 'Awful',
  2: 'Poor',
  3: 'OK',
  4: 'Good',
  5: 'Great',
};

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
  const [sleep, setSleep] = useState(3);
  const [legFeel, setLegFeel] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [motivation, setMotivation] = useState(3);
  const [illness, setIllness] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load today's answers if there are any.
  //
  // This card renders on two pages now (the Coach tab and Today), and without
  // this it would show a second, blank form to someone who had already
  // answered on the other one — defaulting every slider to 3. Submitting that
  // form upserts on (user_id, date), so a stray tap would overwrite a real
  // check-in with middling values and quietly change what the readiness rules
  // read. Fetching first turns the duplicate into a summary instead.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/fatigue-checkin', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        const existing = body?.checkin;
        if (cancelled || !existing) return;
        // Prefill so the summary reports what was actually answered.
        if (typeof existing.sleep === 'number') setSleep(existing.sleep);
        if (typeof existing.leg_feel === 'number') setLegFeel(existing.leg_feel);
        if (typeof existing.motivation === 'number') setMotivation(existing.motivation);
        if (typeof existing.illness === 'boolean') setIllness(existing.illness);
        setSubmitted(true);
      } catch {
        // Offline or unauthenticated: fall through to the blank form, which is
        // the behaviour this card has always had.
      }
    })();

    return () => { cancelled = true; };
  }, []);

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
          sleep,
          leg_feel: legFeel,
          energy,
          motivation,
          illness,
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
          Sleep: {SLEEP_LABELS[sleep]} · Legs: {LABELS[legFeel]} · Energy: {ENERGY_LABELS[energy]} · Motivation: {MOTIVATION_LABELS[motivation]}
          {illness ? ' · Reported ill' : ''}
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
        {/* Sleep */}
        <div>
          <Group gap="xs" mb={4}>
            <Moon size={14} />
            <Text size="xs" fw={600}>Sleep</Text>
            <Text size="xs" c="dimmed" ml="auto">{SLEEP_LABELS[sleep]}</Text>
          </Group>
          <Slider
            value={sleep}
            onChange={setSleep}
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

        {/* Illness — the one answer that overrides everything else */}
        <Group gap="xs">
          <Thermometer size={14} />
          <Text size="xs" fw={600}>Feeling ill today</Text>
          <Switch
            checked={illness}
            onChange={(e) => setIllness(e.currentTarget.checked)}
            size="sm"
            color="teal"
            ml="auto"
            aria-label="Feeling ill today"
          />
        </Group>

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
