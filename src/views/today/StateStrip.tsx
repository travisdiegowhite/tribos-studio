/**
 * StateStrip — three cells showing freshness, week-in-phase, conditions
 *
 * Each cell:
 *   - Mono uppercase label
 *   - Mapped word (large, brand text color)
 *   - Small visual indicator
 *
 * Vocabulary lookups live in src/utils/todayVocabulary.ts. Color tokens
 * also live there so the designer's word→color chart has one home.
 */

import { Box, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import {
  CONDITIONS_COLORS,
  FRESHNESS_COLORS,
  PHASE_COLORS,
  type ConditionsWord,
  type FreshnessWord,
} from '../../utils/todayVocabulary';
import type { CurrentWeather } from '../../hooks/useCurrentWeather';

interface StateStripProps {
  freshnessWord: FreshnessWord | null;
  formScore: number | null;
  phase: string | null;
  weekInPhase: number | null;
  weeksInPhase: number | null;
  conditionsWord: ConditionsWord | null;
  weather: CurrentWeather | null;
}

function FreshnessCell({ word, formScore }: { word: FreshnessWord | null; formScore: number | null }) {
  const color = word ? FRESHNESS_COLORS[word] : 'var(--color-text-secondary)';
  // Map FS [-30..+30] → bar 0..1 for the indicator; clamp.
  const fs = formScore ?? 0;
  const fillPct = Math.max(0, Math.min(1, (fs + 30) / 60));

  return (
    <Cell label="Freshness" value={word ?? '—'} color={color}>
      <Box
        style={{
          height: 4,
          width: '100%',
          background: 'var(--tribos-border-default)',
          position: 'relative',
        }}
      >
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${fillPct * 100}%`,
            background: color,
          }}
        />
      </Box>
    </Cell>
  );
}

function BlockCell({ phase, weekInPhase, weeksInPhase }: { phase: string | null; weekInPhase: number | null; weeksInPhase: number | null }) {
  const color = phase ? PHASE_COLORS[phase] || 'var(--color-text-secondary)' : 'var(--color-text-secondary)';
  const label = phase ? `Wk ${weekInPhase ?? '?'} / ${weeksInPhase ?? '?'}` : 'Block';
  const value = phase ?? '—';

  return (
    <Cell label={label} value={value} color={color}>
      {phase && weeksInPhase ? (
        <Group gap={4} wrap="nowrap">
          {Array.from({ length: weeksInPhase }).map((_, i) => (
            <Box
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: i < (weekInPhase ?? 0) ? color : 'var(--tribos-border-default)',
              }}
            />
          ))}
        </Group>
      ) : null}
    </Cell>
  );
}

function ConditionsCell({ word, weather }: { word: ConditionsWord | null; weather: CurrentWeather | null }) {
  const color = word ? CONDITIONS_COLORS[word] : 'var(--color-text-secondary)';
  return (
    <Cell label="Conditions" value={word ?? '—'} color={color}>
      {weather ? (
        <Text size="xs" ff="monospace" c="dimmed">
          {weather.location ? `${weather.location} · ` : ''}
          {Math.round(weather.temperature)}°C · {Math.round(weather.windSpeed)} km/h {weather.windDirection}
        </Text>
      ) : (
        <Text size="xs" ff="monospace" c="dimmed">No weather data</Text>
      )}
    </Cell>
  );
}

function Cell({
  label,
  value,
  color,
  children,
}: {
  label: string;
  value: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <Stack
      gap={6}
      style={{
        padding: 14,
        border: '1.5px solid var(--tribos-border-default)',
        background: 'var(--tribos-card)',
      }}
    >
      <Text size="xs" tt="uppercase" ff="monospace" fw={700} c="dimmed">
        {label}
      </Text>
      <Text
        size="lg"
        fw={700}
        tt="uppercase"
        style={{ color, letterSpacing: '0.04em', fontFamily: 'monospace', lineHeight: 1.1 }}
      >
        {value}
      </Text>
      {children}
    </Stack>
  );
}

function StateStrip({
  freshnessWord,
  formScore,
  phase,
  weekInPhase,
  weeksInPhase,
  conditionsWord,
  weather,
}: StateStripProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={12}>
      <FreshnessCell word={freshnessWord} formScore={formScore} />
      <BlockCell phase={phase} weekInPhase={weekInPhase} weeksInPhase={weeksInPhase} />
      <ConditionsCell word={conditionsWord} weather={weather} />
    </SimpleGrid>
  );
}

export default StateStrip;
