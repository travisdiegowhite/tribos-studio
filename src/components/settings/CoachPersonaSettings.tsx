import React, { useState, useEffect, useCallback } from 'react';
import { Card, Text, Stack, Group, Select, Button, Badge, Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMessageCircle } from '@tabler/icons-react';
import { supabase } from '../../lib/supabase';
import { COACHING_PERSONAS } from '../../data/coachingPersonas';
import type { PersonaId } from '../../types/checkIn';

interface CoachPersonaSettingsProps {
  userId: string | null;
}

const PERSONA_OPTIONS = Object.values(COACHING_PERSONAS).map((p) => ({
  value: p.id,
  label: `${p.name} — ${p.subtitle}`,
}));

export default function CoachPersonaSettings({ userId }: CoachPersonaSettingsProps) {
  const [currentPersona, setCurrentPersona] = useState<PersonaId | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [setBy, setSetBy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('coaching_persona, coaching_persona_set_by')
        .eq('user_id', userId)
        .single();

      if (data) {
        setCurrentPersona(data.coaching_persona as PersonaId | null);
        setSelectedPersona(data.coaching_persona);
        setSetBy(data.coaching_persona_set_by);
      }
    };

    load();
  }, [userId]);

  const handleSave = useCallback(async () => {
    if (!userId || !selectedPersona) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          coaching_persona: selectedPersona,
          coaching_persona_set_at: new Date().toISOString(),
          coaching_persona_set_by: 'manual',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      setCurrentPersona(selectedPersona as PersonaId);
      setSetBy('manual');
      const personaName = selectedPersona ? COACHING_PERSONAS[selectedPersona as PersonaId]?.name : selectedPersona;
      notifications.show({
        title: 'Coach updated',
        message: `Your coaching persona is now ${personaName || selectedPersona}`,
        color: 'teal',
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to update persona',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  }, [userId, selectedPersona]);

  const persona = currentPersona ? COACHING_PERSONAS[currentPersona] : null;
  const hasChanged = selectedPersona !== currentPersona;

  return (
    <Card>
      <Stack gap="md">
        <Group gap="xs">
          <IconMessageCircle size={20} />
          <Text fw={600}>Coaching Persona</Text>
          {setBy && (
            <Badge variant="light" color="gray" size="xs">
              Set via {setBy}
            </Badge>
          )}
        </Group>

        <Text size="sm" c="dimmed">
          Your coaching persona determines how the AI coach communicates with you in check-ins.
        </Text>

        {persona && (
          <Box p="sm" style={{ borderLeft: '3px solid var(--mantine-color-teal-6)' }}>
            <Text size="sm" fs="italic">"{persona.philosophy}"</Text>
          </Box>
        )}

        <Select
          label="Coaching style"
          data={PERSONA_OPTIONS}
          value={selectedPersona}
          onChange={setSelectedPersona}
          allowDeselect={false}
        />

        {hasChanged && (
          <Button
            color="teal"
            size="sm"
            onClick={handleSave}
            loading={saving}
            style={{ borderRadius: 0, alignSelf: 'flex-start' }}
          >
            Save
          </Button>
        )}
      </Stack>
    </Card>
  );
}
