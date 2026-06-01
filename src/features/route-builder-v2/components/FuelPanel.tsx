/**
 * FuelPanel — Route Builder 2.0 fueling guidance.
 *
 * Turns the current route's duration + elevation (and weather temperature,
 * if loaded) into on-bike carb / hydration targets via the shared
 * calculateFuelPlanFromRoute logic. Intensity defaults to moderate and is
 * adjustable with a chip row, since a route's pace isn't known from geometry.
 */

import { useMemo, useState } from 'react';
import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { Drop, Fire, Lightning, WarningCircle } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import {
  calculateFuelPlanFromRoute,
  type IntensityLevel,
} from '../../../utils/fueling';

export interface FuelPanelProps {
  durationMinutes: number;
  elevationGainMeters: number;
  /** Current conditions, if the weather panel has loaded them. */
  weather?: { temperature: number; humidity: number } | null;
  userWeightKg?: number;
  isImperial?: boolean;
}

const INTENSITY_CHOICES: IntensityLevel[] = ['easy', 'moderate', 'tempo', 'threshold', 'race'];
const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  recovery: 'Recovery',
  easy: 'Easy',
  moderate: 'Moderate',
  tempo: 'Tempo',
  threshold: 'Threshold',
  race: 'Race',
};

export function FuelPanel({
  durationMinutes,
  elevationGainMeters,
  weather = null,
  userWeightKg,
  isImperial = false,
}: FuelPanelProps) {
  const [intensity, setIntensity] = useState<IntensityLevel>('moderate');

  const plan = useMemo(() => {
    if (!durationMinutes || durationMinutes <= 0) return null;
    return calculateFuelPlanFromRoute({
      estimatedDurationMinutes: durationMinutes,
      elevationGainMeters: elevationGainMeters || 0,
      intensity,
      weather: weather ? { temperatureCelsius: weather.temperature, humidity: weather.humidity } : undefined,
      userWeightKg,
    });
  }, [durationMinutes, elevationGainMeters, intensity, weather, userWeightKg]);

  if (!plan) {
    return (
      <Box data-testid="rb2-fuel-panel">
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 13, color: RB2.textTertiary }}>
          Build or generate a route to get fueling targets.
        </Text>
      </Box>
    );
  }

  const hours = Math.floor(durationMinutes / 60);
  const mins = Math.round(durationMinutes % 60);

  return (
    <Box data-testid="rb2-fuel-panel">
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginBottom: 8,
        }}
      >
        Fueling · {hours > 0 ? `${hours}h ` : ''}{mins}m est.
      </Text>

      {/* Intensity chips — route pace is unknown, so let the rider set it. */}
      <Group gap={4} mb={10}>
        {INTENSITY_CHOICES.map((lvl) => {
          const active = lvl === intensity;
          return (
            <UnstyledButton
              key={lvl}
              data-testid={`rb2-fuel-intensity-${lvl}`}
              onClick={() => {
                setIntensity(lvl);
                trackRb2('fuel_intensity_changed', { intensity: lvl });
              }}
              style={{
                padding: '3px 8px',
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: `1px solid ${active ? RB2.teal : RB2.border}`,
                backgroundColor: active ? RB2.teal : 'transparent',
                color: active ? RB2.textInverse : RB2.textSecondary,
              }}
            >
              {INTENSITY_LABELS[lvl]}
            </UnstyledButton>
          );
        })}
      </Group>

      <Group gap={0} grow>
        <Metric
          icon={<Fire size={15} color={RB2.orange} />}
          value={`${plan.carbs.gramsPerHourMin}–${plan.carbs.gramsPerHourMax}`}
          unit="g carbs/hr"
          testid="rb2-fuel-carbs"
        />
        <Metric
          icon={<Drop size={15} color={RB2.teal} />}
          value={isImperial ? `${plan.hydration.ozPerHour}` : `${plan.hydration.mlPerHour}`}
          unit={
            isImperial
              ? `oz/hr · ${plan.hydration.mlPerHour}ml`
              : `ml/hr · ${plan.hydration.ozPerHour}oz`
          }
          testid="rb2-fuel-fluid"
        />
      </Group>

      <Box
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${RB2.bgSecondary}`,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          rowGap: 4,
        }}
      >
        <Detail label="Total carbs" value={`${plan.carbs.totalGramsMin}–${plan.carbs.totalGramsMax} g`} />
        <Detail label="Gels (~25g)" value={`${plan.gelsEquivalent.min}–${plan.gelsEquivalent.max}`} />
        <Detail label="Bottles (750ml)" value={`${plan.bottlesNeeded}`} />
        <Detail label="Energy" value={`~${plan.estimatedCalories} kcal`} />
      </Box>

      <Box style={{ marginTop: 8 }}>
        <Detail label="Pre-ride" value={`${plan.preRide.carbsGramsMin}–${plan.preRide.carbsGramsMax}g, ${plan.preRide.timingHours}h before`} />
        <Detail
          label="On-bike"
          value={`Start ~${plan.frequency.startEatingMinutes}min, every ${plan.frequency.intervalMinutes.min}–${plan.frequency.intervalMinutes.max}min`}
        />
      </Box>

      {plan.warnings.length > 0 && (
        <Box data-testid="rb2-fuel-warnings" style={{ marginTop: 10 }}>
          {plan.warnings.map((w, i) => (
            <Group key={i} gap={4} align="flex-start" wrap="nowrap" mb={2}>
              <WarningCircle size={13} color={RB2.coral} style={{ marginTop: 2, flexShrink: 0 }} />
              <Text style={{ fontFamily: RB2_FONT.body, fontSize: 11, color: RB2.textSecondary }}>
                {w}
              </Text>
            </Group>
          ))}
        </Box>
      )}

      <Group gap={4} mt={10} align="flex-start" wrap="nowrap">
        <Lightning size={11} color={RB2.textTertiary} style={{ marginTop: 2, flexShrink: 0 }} />
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 10, color: RB2.textTertiary, lineHeight: 1.3 }}>
          {plan.disclaimer}
        </Text>
      </Group>
    </Box>
  );
}

function Metric({
  icon,
  value,
  unit,
  testid,
}: {
  icon: React.ReactNode;
  value: string;
  unit: string;
  testid: string;
}) {
  return (
    <Box data-testid={testid}>
      <Group gap={4} align="center">
        {icon}
        <Text style={{ fontFamily: RB2_FONT.heading, fontSize: 20, color: RB2.textPrimary, lineHeight: 1 }}>
          {value}
        </Text>
      </Group>
      <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary, marginTop: 2 }}>
        {unit}
      </Text>
    </Box>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: RB2.textTertiary }}>
        {label}
      </Text>
      <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textPrimary }}>{value}</Text>
    </Box>
  );
}

export default FuelPanel;
