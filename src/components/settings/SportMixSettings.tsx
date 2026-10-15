/**
 * SportMixSettings
 *
 * Which sports the athlete trains — Cycling, Running or Both — and, for Both,
 * which one leads. Saved to user_profiles.sports / primary_sport via
 * src/utils/sportProfile.ts.
 *
 * Reports what it loaded to the parent (Settings) so the Running profile card
 * can be shown only to athletes who run.
 */

import { useEffect, useState } from 'react';
import { Button, Card, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadSportProfile,
  mixFromProfile,
  profileFromMix,
  saveSportProfile,
  type SportMix as Mix,
  type SportProfile,
  type TrainedSport,
} from '../../utils/sportProfile';

export interface SportMixState {
  profile: SportProfile;
  /** False when the profile could not be read (e.g. migration 132 not applied). */
  ok: boolean;
}

interface Props {
  onProfileChange?: (state: SportMixState) => void;
}

export default function SportMixSettings({ onProfileChange }: Props) {
  const { user } = useAuth() as { user: { id: string } | null };
  const [mix, setMix] = useState<Mix>('cycling');
  const [primary, setPrimary] = useState<TrainedSport>('cycling');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    loadSportProfile(user.id).then(({ profile, ok }) => {
      if (!active) return;
      setMix(mixFromProfile(profile));
      setPrimary(profile.primarySport);
      setLoaded(true);
      onProfileChange?.({ profile, ok });
    });
    return () => {
      active = false;
    };
    // onProfileChange is a setter from the parent; reload only per user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const result = await saveSportProfile(user.id, profileFromMix(mix, primary));
    setSaving(false);
    if (result.ok) {
      onProfileChange?.({ profile: result.profile, ok: true });
      notifications.show({ title: 'Sports saved', message: 'Your coach and plans will use this.', color: 'teal' });
    } else {
      notifications.show({
        title: 'Could not save your sports',
        message: result.error ?? 'Please try again.',
        color: 'red',
      });
    }
  };

  return (
    <Card>
      <Stack gap="md">
        <Title order={3} style={{ color: 'var(--color-text-primary)' }}>
          What do you train?
        </Title>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          Tribos plans, scores and coaches both sports. Pick everything you train.
        </Text>

        <SegmentedControl
          aria-label="Sports you train"
          value={mix}
          onChange={(v) => {
            const next = v as Mix;
            setMix(next);
            if (next !== 'both') setPrimary(next);
          }}
          disabled={!loaded}
          data={[
            { value: 'cycling', label: 'Cycling' },
            { value: 'running', label: 'Running' },
            { value: 'both', label: 'Both' },
          ]}
        />

        {mix === 'both' && (
          <Stack gap={4}>
            <Text size="sm" fw={600} style={{ color: 'var(--color-text-primary)' }}>
              Primary sport
            </Text>
            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
              The one your season is built around. The coach protects it when the two compete.
            </Text>
            <SegmentedControl
              aria-label="Primary sport"
              value={primary}
              onChange={(v) => setPrimary(v as TrainedSport)}
              data={[
                { value: 'cycling', label: 'Cycling' },
                { value: 'running', label: 'Running' },
              ]}
            />
          </Stack>
        )}

        <Button color="teal" onClick={handleSave} loading={saving} disabled={!loaded}>
          Save Sports
        </Button>
      </Stack>
    </Card>
  );
}
