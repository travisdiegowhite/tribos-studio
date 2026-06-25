/**
 * SuggestedRail — the right rail for the no-plan hero states ('suggested' and
 * 'first-run'). Mirrors GlanceRail's shape but, with no prescription to ride,
 * leads with a generate CTA instead of a workout card. Still surfaces the coach
 * fitness take and the FORM band so the day isn't empty.
 */

import { Box, Group, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { C, FONT } from './tokens';
import { CoachTakeBox } from './CoachTake';
import { ClearanceBand } from './ClearanceBand';
import type { Today } from './types';

const PRESETS = ['60 min easy', '90 min gravel', '2 hr endurance'];

interface SuggestedRailProps {
  today: Today;
  coachPromise: Promise<string | null>;
}

export function SuggestedRail({ today, coachPromise }: SuggestedRailProps) {
  const navigate = useNavigate();
  const firstRun = today.heroState === 'first-run';

  return (
    <Stack gap={16} style={{ height: '100%' }}>
      {/* Generate CTA */}
      <Box>
        <Text style={{ fontFamily: FONT.heading, fontSize: 26, fontWeight: 700, lineHeight: 1.05, color: C.text }}>
          {firstRun ? 'Let’s build your first route' : 'No workout today — here’s a spin on roads you know'}
        </Text>
        <Text style={{ fontFamily: FONT.body, fontSize: 14, color: C.text2, marginTop: 6, marginBottom: 14 }}>
          {firstRun
            ? 'Generate a ride now, then set a goal and connect a device for training-aware routes.'
            : 'We’ll propose a loop on familiar roads. Want something specific? Generate one.'}
        </Text>
        <Group gap={8}>
          {PRESETS.map((preset) => (
            <Box
              key={preset}
              component="button"
              onClick={() => navigate('/ride/new')}
              style={{
                fontFamily: FONT.mono,
                fontSize: 12,
                color: C.text,
                backgroundColor: C.secondary,
                border: `1px solid ${C.border}`,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              {preset}
            </Box>
          ))}
          <Box
            component="button"
            onClick={() => navigate('/ride/new')}
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: '#FFFFFF',
              backgroundColor: C.teal,
              border: 'none',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            GENERATE
          </Box>
        </Group>
      </Box>

      {/* Coach take */}
      <CoachTakeBox coachPromise={coachPromise} personaName={today.coach.personaName} />

      {/* FORM */}
      <ClearanceBand state={today.athleteState} />
    </Stack>
  );
}
