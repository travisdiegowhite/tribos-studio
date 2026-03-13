/**
 * CoachPersonaSettings — Coaching persona card for the Settings training tab.
 * Shows current persona, allows re-taking intake or manual override.
 */

import { useState, useEffect } from 'react';
import { Card, Stack, Title, Text, Group, Badge, Radio, Button, Divider } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { supabase } from '../../lib/supabase';
import { PERSONAS, PERSONA_LIST } from '../../data/coachingPersonas';
import IntakeInterview from '../coach/IntakeInterview';
import type { PersonaId } from '../../types/checkIn';

interface CoachPersonaSettingsProps {
  userId: string;
}

export default function CoachPersonaSettings({ userId }: CoachPersonaSettingsProps) {
  const [currentPersona, setCurrentPersona] = useState<PersonaId>('pragmatist');
  const [setBy, setSetBy] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [showIntake, setShowIntake] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('user_coach_settings')
        .select('coaching_persona, persona_set_by')
        .eq('user_id', userId)
        .maybeSingle();

      if (data?.coaching_persona) {
        setCurrentPersona(data.coaching_persona as PersonaId);
        setSetBy(data.persona_set_by || 'default');
      }
      setLoading(false);
    }
    load();
  }, [userId]);

  const handleManualChange = async (personaId: string) => {
    setSaving(true);
    const pid = personaId as PersonaId;

    await supabase
      .from('user_coach_settings')
      .upsert({
        user_id: userId,
        coaching_persona: pid,
        persona_set_at: new Date().toISOString(),
        persona_set_by: 'manual',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    setCurrentPersona(pid);
    setSetBy('manual');
    setSaving(false);
  };

  const handleIntakeComplete = (personaId: PersonaId) => {
    setCurrentPersona(personaId);
    setSetBy('intake');
    setShowIntake(false);
  };

  if (loading) return null;

  const persona = PERSONAS[currentPersona];

  return (
    <>
      <Card withBorder style={{ borderRadius: 0 }}>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3} style={{ color: 'var(--color-text-primary)' }}>
              Coaching Persona
            </Title>
            <Badge
              variant="light"
              color="teal"
              size="sm"
              leftSection={<IconSparkles size={12} />}
              style={{ borderRadius: 0 }}
            >
              {setBy === 'intake' ? 'From interview' : setBy === 'manual' ? 'Manual' : 'Default'}
            </Badge>
          </Group>

          <Text size="sm" c="dimmed">
            Your coaching persona determines the voice and style of your AI check-ins.
          </Text>

          <Radio.Group
            value={currentPersona}
            onChange={handleManualChange}
          >
            <Stack gap="xs">
              {PERSONA_LIST.map((p) => (
                <Radio
                  key={p.id}
                  value={p.id}
                  label={`${p.name} — ${p.tagline}`}
                  description={`"${p.philosophy}"`}
                  disabled={saving}
                />
              ))}
            </Stack>
          </Radio.Group>

          <Divider />

          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconSparkles size={16} />}
            onClick={() => setShowIntake(true)}
            style={{ alignSelf: 'flex-start' }}
          >
            Retake Coaching Interview
          </Button>
        </Stack>
      </Card>

      <IntakeInterview
        opened={showIntake}
        onComplete={handleIntakeComplete}
        userId={userId}
      />
    </>
  );
}
