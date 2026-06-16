/**
 * RaceDetailsCard — Route Builder 2.0 race-day setup.
 *
 * Lets the rider flag the route as a race (type / date / target finish). Writes
 * straight to the route-builder store, which unlocks the RaceDayGuide and feeds
 * the coach's race-day context. Co-located with Fuel so race prep lives together.
 */

import { Box, Group, NumberInput, Select, Text, TextInput, UnstyledButton } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { RACE_TYPES } from '../../../utils/raceTypes';

const inputStyles = { input: { borderRadius: 0 } } as const;
const labelStyle = {
  fontFamily: RB2_FONT.mono,
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: RB2.textTertiary,
};

export function RaceDetailsCard() {
  const raceType = useRouteBuilderStore((s) => s.raceType) as string | null;
  const raceDate = useRouteBuilderStore((s) => s.raceDate) as string | null;
  const targetFinishMinutes = useRouteBuilderStore((s) => s.targetFinishMinutes) as number | null;
  const setRaceType = useRouteBuilderStore((s) => s.setRaceType) as (v: string | null) => void;
  const setRaceDate = useRouteBuilderStore((s) => s.setRaceDate) as (v: string | null) => void;
  const setTargetFinishMinutes = useRouteBuilderStore(
    (s) => s.setTargetFinishMinutes,
  ) as (v: number | null) => void;

  return (
    <Box data-testid="rb2-race-details">
      <Group justify="space-between" align="center" mb={6}>
        <Text style={labelStyle}>Race day</Text>
        {raceType && (
          <UnstyledButton
            data-testid="rb2-race-clear"
            onClick={() => {
              setRaceType(null);
              setRaceDate(null);
              setTargetFinishMinutes(null);
            }}
            style={{ ...labelStyle, color: RB2.textSecondary }}
          >
            Clear
          </UnstyledButton>
        )}
      </Group>

      <Select
        size="xs"
        placeholder="Racing this route? Pick a type"
        data={RACE_TYPES as Array<{ value: string; label: string }>}
        value={raceType}
        onChange={(v) => setRaceType(v)}
        clearable
        data-testid="rb2-race-type"
        styles={{ ...inputStyles }}
      />

      {raceType && (
        <Group gap={8} mt={8} grow>
          <TextInput
            size="xs"
            type="date"
            label="Race date"
            value={raceDate ?? ''}
            onChange={(e) => setRaceDate(e.currentTarget.value || null)}
            data-testid="rb2-race-date"
            styles={{ ...inputStyles, label: labelStyle }}
          />
          <NumberInput
            size="xs"
            label="Target finish (min)"
            value={targetFinishMinutes ?? undefined}
            min={0}
            onChange={(v) => setTargetFinishMinutes(typeof v === 'number' ? v : null)}
            data-testid="rb2-race-finish"
            styles={{ ...inputStyles, label: labelStyle }}
          />
        </Group>
      )}
    </Box>
  );
}

export default RaceDetailsCard;
