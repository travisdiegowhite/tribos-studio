/**
 * AgePromptModal — asks for a birth year, once the athlete has been using the
 * app a while without one.
 *
 * Scheduling, the showing cap and all the bookkeeping live in
 * src/hooks/useAgePrompt.ts; this is just the dialog. It is deliberately one
 * field and two buttons: "Not now" is a plain close, because the hook already
 * guarantees the asking stops after a few tries and a permanent-sounding
 * "never" button would be a heavier decision than the question deserves.
 *
 * The copy names what the athlete actually gets, in the order it matters to
 * them, rather than describing our data model. It says the year is all we
 * want because "why does a training app need my birthday" is the reasonable
 * first thought and the honest answer is that it does not.
 */

import { useState } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { Cake } from '@phosphor-icons/react';
import { minBirthYear, maxBirthYear } from '../utils/athleteAge';

function AgePromptModal({ opened, onClose, onSave, saving = false }) {
  const [birthYear, setBirthYear] = useState(null);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    const year = Number(birthYear);
    if (!Number.isInteger(year) || year < minBirthYear() || year > maxBirthYear()) {
      setError(`Enter a year between ${minBirthYear()} and ${maxBirthYear()}.`);
      return;
    }
    setError(null);
    const ok = await onSave(year);
    if (!ok) setError('Could not save that just now — try again from Settings.');
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="md"
      radius={0}
      title={
        <Group gap="sm">
          <ThemeIcon variant="light" color="teal" radius={0}>
            <Cake size={18} />
          </ThemeIcon>
          <Title order={4} style={{ color: 'var(--color-text-primary)' }}>
            One number improves your coaching
          </Title>
        </Group>
      }
    >
      <Stack gap="lg">
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          We tune how fast your fitness builds and your fatigue clears using your
          age. Without it we fall back to generic defaults — and from 40 there is
          masters-specific recovery guidance your coach can&apos;t offer until it
          knows.
        </Text>

        <NumberInput
          label="Birth Year"
          description="The year is all we need. We never ask for the date."
          placeholder="e.g., 1984"
          value={birthYear || ''}
          onChange={(val) => {
            setBirthYear(val || null);
            setError(null);
          }}
          min={minBirthYear()}
          max={maxBirthYear()}
          allowDecimal={false}
          thousandSeparator={false}
          hideControls
          error={error}
          data-autofocus
        />

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={saving}>
            Not now
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!birthYear}>
            Save
          </Button>
        </Group>

        <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
          You can always set or change this in Settings.
        </Text>
      </Stack>
    </Modal>
  );
}

export default AgePromptModal;
