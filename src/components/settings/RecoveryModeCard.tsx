/**
 * RecoveryModeCard
 *
 * Settings surface for the masters recovery mode (spec §3). Lets the user
 * pick standard / conservative / adaptive. On save, snapshots the matching
 * coefficients to user_profiles.masters_factor so block generation stays
 * deterministic across mode changes (the snapshot in block_instances was
 * captured at block creation time).
 *
 * Shown to all users; default selection follows age-based logic from spec §3
 * when the user has not yet chosen a mode.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Radio,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Mode = 'standard' | 'conservative' | 'adaptive';

const MODE_OPTIONS: { value: Mode; label: string; description: string }[] = [
  {
    value: 'conservative',
    label: 'Build in extra recovery automatically',
    description:
      "I'd rather err on the side of fresh. Add an extra recovery day when in doubt.",
  },
  {
    value: 'adaptive',
    label: 'Use my actual data to decide',
    description:
      'Adjust only when fatigue actually shows up in my numbers. No pre-emptive padding.',
  },
  {
    value: 'standard',
    label: 'Treat me like any other rider',
    description: 'No age-based adjustments. Standard recovery defaults.',
  },
];

const FACTOR_BY_MODE: Record<
  Mode,
  Record<string, number>
> = {
  standard: {
    recovery_block_days_added: 0,
    hit_spacing_hours: 36,
    afi_growth_ceiling_4d: 0.25,
    afi_tfi_gate: 1.10,
    fs_recovery_target: -5,
  },
  conservative: {
    recovery_block_days_added: 1,
    hit_spacing_hours: 48,
    afi_growth_ceiling_4d: 0.20,
    afi_tfi_gate: 1.10,
    fs_recovery_target: -7,
  },
  adaptive: {
    recovery_block_days_added: 0,
    hit_spacing_hours: 36,
    afi_growth_ceiling_4d: 0.20,
    afi_tfi_gate: 1.05,
    fs_recovery_target: -3,
  },
};

function defaultModeForAge(age: number | null): Mode {
  if (age == null) return 'standard';
  if (age >= 45) return 'conservative';
  if (age >= 35) return 'adaptive';
  return 'standard';
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) return null;
  return Math.floor(
    (Date.now() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  );
}

export default function RecoveryModeCard() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('standard');
  const [age, setAge] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUserChoice, setHasUserChoice] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('recovery_mode, date_of_birth')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      const a = ageFromDob(data?.date_of_birth ?? null);
      setAge(a);
      if (data?.recovery_mode) {
        setMode(data.recovery_mode as Mode);
        setHasUserChoice(true);
      } else {
        setMode(defaultModeForAge(a));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const recommended: Mode = useMemo(() => defaultModeForAge(age), [age]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          recovery_mode: mode,
          masters_factor: FACTOR_BY_MODE[mode],
        })
        .eq('id', user.id);
      if (error) throw error;
      setHasUserChoice(true);
      notifications.show({
        title: 'Recovery preference saved',
        message: `Mode set to ${mode}.`,
        color: 'teal',
      });
    } catch (err) {
      notifications.show({
        title: "Couldn't save recovery preference",
        message: (err as Error)?.message ?? 'Try again.',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={3}>Recovery preference</Title>
            <Text size="sm" c="dimmed">
              Controls how aggressively your training plan recovers between
              hard sessions.{' '}
              {age != null && age >= 35 && !hasUserChoice && (
                <>
                  Based on your age ({age}), we suggest{' '}
                  <strong>{recommended}</strong>.
                </>
              )}
            </Text>
          </Stack>
          {hasUserChoice && (
            <Badge variant="light" color="teal">
              Set
            </Badge>
          )}
        </Group>

        <Radio.Group value={mode} onChange={(v) => setMode(v as Mode)}>
          <Stack gap="sm">
            {MODE_OPTIONS.map((opt) => (
              <Radio.Card
                key={opt.value}
                value={opt.value}
                style={{ padding: 12 }}
              >
                <Group wrap="nowrap" align="flex-start">
                  <Radio.Indicator />
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text fw={600}>{opt.label}</Text>
                      {opt.value === recommended && age != null && age >= 35 && (
                        <Badge size="xs" variant="light" color="teal">
                          Suggested
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {opt.description}
                    </Text>
                  </Stack>
                </Group>
              </Radio.Card>
            ))}
          </Stack>
        </Radio.Group>

        <Group justify="flex-end">
          <Button onClick={handleSave} loading={saving} color="teal">
            Save preference
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
