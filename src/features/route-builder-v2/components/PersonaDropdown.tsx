/**
 * PersonaDropdown — Route Builder 2.0 coaching-persona picker.
 *
 * Renders the user's current persona and a dropdown to choose one of
 * the 5 personas. Wired to useCoachCheckIn.savePersona which persists
 * to user_coach_settings. Loading + error states surface inline.
 */

import { useCallback, useState } from 'react';
import { Box, Text, Menu, UnstyledButton, Loader } from '@mantine/core';
import { CaretDown, User } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import type { PersonaId } from '../../../types/checkIn';

const PERSONAS: Array<{ id: PersonaId; name: string; tagline: string }> = [
  { id: 'pragmatist', name: 'The Pragmatist', tagline: 'Balanced and practical' },
  { id: 'hammer', name: 'The Hammer', tagline: 'No excuses, just work' },
  { id: 'scientist', name: 'The Scientist', tagline: 'Data over feel' },
  { id: 'encourager', name: 'The Encourager', tagline: 'Warm, supportive guidance' },
  { id: 'competitor', name: 'The Competitor', tagline: 'Always racing the clock' },
];

export interface PersonaDropdownProps {
  persona: PersonaId;
  onChange: (next: PersonaId) => Promise<void>;
  compact?: boolean;
}

export function PersonaDropdown({ persona, onChange, compact = false }: PersonaDropdownProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0];

  const handleSelect = useCallback(
    async (next: PersonaId) => {
      if (next === persona) return;
      setSaving(true);
      setError(null);
      const from = persona;
      try {
        await onChange(next);
        trackRb2('persona_changed', { from, to: next });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [onChange, persona],
  );

  return (
    <Box style={{ position: 'relative' }}>
      <Menu position="bottom-end" offset={4} shadow="md" width={280}>
        <Menu.Target>
          <UnstyledButton
            data-testid="rb2-persona-dropdown"
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: compact ? '6px 10px' : '8px 12px',
              backgroundColor: RB2.cardBg,
              border: `1px solid ${RB2.border}`,
              borderRadius: 0,
              boxShadow: RB2.shadowCard,
              cursor: saving ? 'wait' : 'pointer',
            }}
            aria-label="Change coaching persona"
          >
            <User size={14} color={RB2.teal} weight="duotone" />
            <Box style={{ textAlign: 'left' }}>
              {!compact && (
                <Text
                  style={{
                    fontFamily: RB2_FONT.mono,
                    fontSize: 9,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: RB2.textTertiary,
                    lineHeight: 1.1,
                  }}
                >
                  Persona
                </Text>
              )}
              <Text
                style={{
                  fontFamily: RB2_FONT.heading,
                  fontSize: compact ? 12 : 13,
                  fontWeight: 700,
                  color: RB2.textPrimary,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  lineHeight: 1.2,
                }}
              >
                {current.name}
              </Text>
            </Box>
            {saving ? <Loader size={12} /> : <CaretDown size={12} color={RB2.textTertiary} />}
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown
          styles={{ dropdown: { borderRadius: 0, border: `1px solid ${RB2.border}` } }}
        >
          {PERSONAS.map((p) => {
            const active = p.id === persona;
            return (
              <Menu.Item
                key={p.id}
                onClick={() => handleSelect(p.id)}
                disabled={saving}
                style={{
                  borderRadius: 0,
                  backgroundColor: active ? RB2.bgSecondary : undefined,
                  padding: '10px 12px',
                }}
              >
                <Text
                  style={{
                    fontFamily: RB2_FONT.heading,
                    fontSize: 13,
                    fontWeight: 700,
                    color: active ? RB2.teal : RB2.textPrimary,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {p.name}
                </Text>
                <Text
                  style={{
                    fontFamily: RB2_FONT.body,
                    fontSize: 12,
                    color: RB2.textSecondary,
                  }}
                >
                  {p.tagline}
                </Text>
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
      {error && (
        <Text
          role="alert"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            fontFamily: RB2_FONT.body,
            fontSize: 11,
            color: RB2.coral,
            backgroundColor: RB2.cardBg,
            padding: '4px 8px',
            border: `1px solid ${RB2.coral}`,
            whiteSpace: 'nowrap',
          }}
        >
          {error}
        </Text>
      )}
    </Box>
  );
}

export default PersonaDropdown;
