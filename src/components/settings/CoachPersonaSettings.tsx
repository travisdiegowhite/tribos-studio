/**
 * CoachPersonaSettings — Manage coaching persona from Settings page.
 *
 * Shows current persona, allows manual override, and offers to retake
 * the intake interview.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Text,
  Paper,
  Group,
  Select,
  Button,
  Badge,
  Box,
} from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { PERSONAS, PERSONA_LIST, EXPERIENCE_LEVELS } from '../../data/coachingPersonas';
import type { ExperienceLevel } from '../../data/coachingPersonas';
import IntakeInterview from '../coach/IntakeInterview';
import type { PersonaId } from '../../types/checkIn';
import { ArrowsClockwise, Sparkle } from '@phosphor-icons/react';

interface CoachPersonaSettingsProps {
  userId: string;
}

export default function CoachPersonaSettings({ userId }: CoachPersonaSettingsProps) {
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [setBy, setSetBy] = useState<string | null>(null);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('experienced');
  const [loading, setLoading] = useState(true);
  const [showIntake, setShowIntake] = useState(false);

  const fetchPersona = useCallback(async () => {
    const { data } = await supabase
      .from('user_coach_settings')
      .select('coaching_persona, persona_set_by, coaching_experience_level')
      .eq('user_id', userId)
      .maybeSingle();

    if (data?.coaching_persona && data.coaching_persona !== 'pending') {
      setPersona(data.coaching_persona as PersonaId);
      setSetBy(data.persona_set_by);
    }
    if (data?.coaching_experience_level) {
      setExperienceLevel(data.coaching_experience_level as ExperienceLevel);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPersona();
  }, [fetchPersona]);

  const handleManualChange = async (value: string | null) => {
    if (!value) return;
    const personaId = value as PersonaId;

    await Promise.all([
      supabase
        .from('user_coach_settings')
        .upsert({
          user_id: userId,
          coaching_persona: personaId,
          persona_set_at: new Date().toISOString(),
          persona_set_by: 'manual',
        }, { onConflict: 'user_id' }),
      supabase
        .from('user_profiles')
        .update({ coach_persona_id: personaId, onboarding_persona_set: true })
        .eq('id', userId),
    ]);

    setPersona(personaId);
    setSetBy('manual');
  };

  const handleExperienceChange = async (value: string | null) => {
    if (!value) return;
    const level = value as ExperienceLevel;

    await supabase
      .from('user_coach_settings')
      .upsert({
        user_id: userId,
        coaching_experience_level: level,
      }, { onConflict: 'user_id' });

    setExperienceLevel(level);
  };

  const handleIntakeComplete = (personaId: PersonaId) => {
    setPersona(personaId);
    setSetBy('intake');
    setShowIntake(false);
  };

  if (loading) return null;

  const currentPersona = persona ? PERSONAS[persona] : null;

  return (
    <>
      <Stack gap="md">
        <Group gap="xs">
          <Sparkle size={18} color="var(--color-teal)" />
          <Text fw={600}>Coaching Persona</Text>
        </Group>

        {currentPersona ? (
          <Paper
            p="md"
            withBorder
            style={{ borderRadius: 0, borderColor: 'var(--tribos-border-default)' }}
          >
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <Text fw={600}>{currentPersona.name}</Text>
                <Badge size="xs" variant="light" color="gray">
                  {setBy === 'intake' ? 'From interview' : 'Manual'}
                </Badge>
              </Group>
            </Group>
            <Text size="sm" c="dimmed" fs="italic">
              &ldquo;{currentPersona.philosophy}&rdquo;
            </Text>
          </Paper>
        ) : (
          <Text size="sm" c="dimmed">
            No coaching persona set yet. Take the intake interview or pick one below.
          </Text>
        )}

        <Box>
          <Select
            label="Change persona"
            placeholder="Select a coaching style"
            value={persona || ''}
            onChange={handleManualChange}
            data={PERSONA_LIST.map((p) => ({
              value: p.id,
              label: `${p.name} — ${p.tagline}`,
            }))}
            styles={{ input: { borderRadius: 0 } }}
          />
        </Box>

        <Box>
          <Select
            label="Experience level"
            description="Adjusts how technical the coach communicates — less jargon for newer cyclists"
            value={experienceLevel}
            onChange={handleExperienceChange}
            data={EXPERIENCE_LEVELS.map((l) => ({
              value: l.value,
              label: l.label,
            }))}
            styles={{ input: { borderRadius: 0 } }}
          />
        </Box>

        <Button
          variant="subtle"
          size="sm"
          leftSection={<ArrowsClockwise size={16} />}
          onClick={() => setShowIntake(true)}
        >
          {persona ? 'Retake Intake Interview' : 'Take Intake Interview'}
        </Button>
      </Stack>

      {showIntake && (
        <IntakeInterview
          opened={showIntake}
          onComplete={handleIntakeComplete}
          userId={userId}
        />
      )}
    </>
  );
}
