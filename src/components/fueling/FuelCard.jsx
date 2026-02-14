/**
 * FuelCard Component
 * Displays fueling recommendations for a planned workout, route, or activity
 *
 * Based on exercise science research for on-bike fueling.
 * DISCLAIMER: General guidelines, not personalized medical or nutritional advice.
 */

import {
  Paper,
  Text,
  Group,
  Stack,
  Badge,
  Divider,
  ThemeIcon,
  Collapse,
  Button,
  Alert,
  Tooltip,
} from '@mantine/core';
import {
  IconFlame,
  IconDroplet,
  IconClock,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconApple,
  IconBottle,
  IconSunHigh,
  IconMountain,
} from '@tabler/icons-react';
import { useState } from 'react';
import {
  calculateFuelPlan,
  calculateFuelPlanFromWorkout,
  calculateFuelPlanFromRoute,
  calculateRetrospectiveFuelPlan,
  formatCarbTarget,
  formatHydrationTarget,
  formatPreRideFueling,
  getIntensityDisplayName,
  celsiusToFahrenheit,
} from '../../utils/fueling';

// Intensity colors
const INTENSITY_COLORS = {
  recovery: 'gray',
  easy: 'sage',
  moderate: 'teal',
  tempo: 'gold',
  threshold: 'terracotta',
  race: 'terracotta',
};

/**
 * Main FuelCard component
 */
export default function FuelCard({
  // Direct fuel plan (if pre-calculated)
  fuelPlan,

  // OR: provide data to calculate
  workout,     // { duration, targetTSS, category, ... }
  route,       // { estimatedDurationMinutes, elevationGainMeters, ... }
  activity,    // { movingTimeSeconds, averageWatts, ... }

  // Context
  weather,     // { temperatureCelsius, humidity, altitudeMeters }
  userWeightKg,
  isRaceDay = false,

  // Display options
  title,       // Override title
  compact = false,
  showPlainEnglish = true,
  showDisclaimer = true,
  useImperial = true,  // Use imperial units (oz, °F)
  onFeedback,  // Callback for post-ride feedback

  // For retrospective analysis
  retrospective = false,
}) {
  const [expanded, setExpanded] = useState(!compact);
  const [showDetails, setShowDetails] = useState(false);

  // Calculate fuel plan if not provided
  let plan = fuelPlan;
  if (!plan) {
    if (activity) {
      plan = calculateRetrospectiveFuelPlan({
        ...activity,
        weather,
      });
    } else if (route) {
      plan = calculateFuelPlanFromRoute({
        ...route,
        weather,
        userWeightKg,
      });
    } else if (workout) {
      plan = calculateFuelPlanFromWorkout({
        ...workout,
        weather,
        userWeightKg,
      });
    } else {
      return null;  // No data to work with
    }
  }

  // Format temperature for display
  const formatTemp = (celsius) => {
    if (useImperial) {
      return `${celsiusToFahrenheit(celsius)}°F`;
    }
    return `${Math.round(celsius)}°C`;
  };

  // Generate title
  const displayTitle = title ||
    (retrospective ? 'Fuel Analysis' : (isRaceDay ? 'Race Fuel Plan' : 'Fuel Plan'));

  // Generate subtitle
  const durationHours = Math.floor(plan.durationMinutes / 60);
  const durationMins = plan.durationMinutes % 60;
  const durationStr = durationHours > 0
    ? `${durationHours}h ${durationMins > 0 ? `${durationMins}m` : ''}`
    : `${durationMins}m`;

  const intensityColor = INTENSITY_COLORS[plan.intensity] || 'blue';

  // Short ride - show simplified card
  const isShortRide = plan.durationMinutes < 60;

  if (isShortRide && !retrospective) {
    return (
      <Paper p="md" radius="md" withBorder>
        <Group spacing="xs">
          <ThemeIcon size={32} radius="md" color="sage" variant="light">
            <IconFlame size={18} />
          </ThemeIcon>
          <div>
            <Text fw={500} size="sm">{displayTitle}</Text>
            <Text size="xs" c="dimmed">
              Short ride ({durationStr}) - stay hydrated, fueling optional
            </Text>
          </div>
        </Group>
      </Paper>
    );
  }

  // Compact card view
  if (compact && !expanded) {
    return (
      <Paper
        p="sm"
        radius="md"
        withBorder
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(true)}
      >
        <Group position="apart">
          <Group spacing="xs">
            <ThemeIcon size={28} radius="md" color={intensityColor} variant="light">
              <IconFlame size={16} />
            </ThemeIcon>
            <div>
              <Text fw={500} size="sm">{displayTitle}</Text>
              <Text size="xs" c="dimmed">
                {durationStr} • {plan.carbs.totalGramsMin}-{plan.carbs.totalGramsMax}g carbs
              </Text>
            </div>
          </Group>
          <IconChevronDown size={16} color="gray" />
        </Group>
      </Paper>
    );
  }

  // Full card view
  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack spacing="md">
        {/* Header */}
        <Group position="apart">
          <Group spacing="sm">
            <ThemeIcon size={40} radius="md" color={intensityColor} variant="light">
              <IconFlame size={24} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="lg">{displayTitle}</Text>
              <Group spacing={8}>
                <Text size="sm" c="dimmed">{durationStr}</Text>
                <Badge size="sm" color={intensityColor} variant="light">
                  {getIntensityDisplayName(plan.intensity)}
                </Badge>
                {weather?.temperatureCelsius !== undefined && (
                  <Badge size="sm" variant="outline" leftSection={<IconSunHigh size={12} />}>
                    {formatTemp(weather.temperatureCelsius)}
                  </Badge>
                )}
              </Group>
            </div>
          </Group>
          {compact && (
            <Button
              variant="subtle"
              size="xs"
              compact
              onClick={() => setExpanded(false)}
              rightIcon={<IconChevronUp size={14} />}
            >
              Collapse
            </Button>
          )}
        </Group>

        <Divider />

        {/* Main recommendations */}
        <Stack spacing="sm">
          {/* Carbs */}
          <Group position="apart" noWrap>
            <Group spacing="xs" noWrap>
              <ThemeIcon size={24} radius="sm" color="terracotta" variant="light">
                <IconApple size={14} />
              </ThemeIcon>
              <Text size="sm" fw={500}>On-Bike Carbs</Text>
            </Group>
            <Text size="sm" fw={600} ta="right">
              {formatCarbTarget(plan.carbs)}
            </Text>
          </Group>

          {/* Fueling timing */}
          <Group position="apart" noWrap>
            <Group spacing="xs" noWrap>
              <ThemeIcon size={24} radius="sm" color="mauve" variant="light">
                <IconClock size={14} />
              </ThemeIcon>
              <Text size="sm" fw={500}>Start Eating</Text>
            </Group>
            <Text size="sm" c="dimmed" ta="right">
              {plan.frequency.startEatingMinutes} minutes in
            </Text>
          </Group>

          {/* Frequency */}
          <Group position="apart" noWrap>
            <Text size="sm" c="dimmed" ml={32}>Frequency</Text>
            <Text size="sm" c="dimmed" ta="right">
              Every {plan.frequency.intervalMinutes.min}-{plan.frequency.intervalMinutes.max} minutes
            </Text>
          </Group>

          {/* Hydration */}
          <Group position="apart" noWrap>
            <Group spacing="xs" noWrap>
              <ThemeIcon size={24} radius="sm" color="teal" variant="light">
                <IconDroplet size={14} />
              </ThemeIcon>
              <Text size="sm" fw={500}>Hydration</Text>
            </Group>
            <Text size="sm" fw={600} ta="right">
              {formatHydrationTarget(plan.hydration, useImperial)}
            </Text>
          </Group>

          {/* Electrolytes note */}
          {plan.hydration.includeElectrolytes && (
            <Text size="xs" c="dimmed" ml={32}>
              Include electrolytes (sodium focus)
            </Text>
          )}
        </Stack>

        <Divider />

        {/* Pre-ride */}
        <div>
          <Text size="sm" fw={500} mb={4}>Pre-Ride</Text>
          <Text size="sm" c="dimmed">
            {formatPreRideFueling(plan.preRide)}
          </Text>
          {plan.preRide.notes && (
            <Text size="xs" c="dimmed" mt={4}>{plan.preRide.notes}</Text>
          )}
        </div>

        {/* Plain English summary */}
        {showPlainEnglish && (
          <>
            <Divider />
            <div>
              <Text size="sm" fw={500} mb={4}>In Plain English</Text>
              <Text size="sm" c="dimmed">
                Pack {plan.gelsEquivalent.min}-{plan.gelsEquivalent.max} gels or equivalent.{' '}
                {plan.bottlesNeeded === 1 ? 'One bottle' : `${plan.bottlesNeeded} bottles`} minimum
                {plan.hydration.includeElectrolytes ? ' with electrolytes' : ''}.
                {plan.bottlesNeeded > 2 && ' Plan a refill if no support.'}
              </Text>
            </div>
          </>
        )}

        {/* Warnings */}
        {plan.warnings.length > 0 && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="gold"
            variant="light"
            p="xs"
          >
            <Stack spacing={4}>
              {plan.warnings.map((warning, i) => (
                <Text size="xs" key={i}>{warning}</Text>
              ))}
            </Stack>
          </Alert>
        )}

        {/* Expandable details */}
        <Button
          variant="subtle"
          size="xs"
          compact
          onClick={() => setShowDetails(!showDetails)}
          rightIcon={showDetails ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </Button>

        <Collapse in={showDetails}>
          <Stack spacing="xs" mt="xs">
            <Group position="apart">
              <Text size="xs" c="dimmed">Estimated Energy</Text>
              <Text size="xs">{plan.estimatedCalories} kcal ({plan.estimatedKilojoules} kJ)</Text>
            </Group>
            <Group position="apart">
              <Text size="xs" c="dimmed">Bottles Needed</Text>
              <Text size="xs">{plan.bottlesNeeded} × 750ml</Text>
            </Group>
            {weather?.altitudeMeters && weather.altitudeMeters > 1500 && (
              <Group position="apart">
                <Group spacing={4}>
                  <IconMountain size={12} />
                  <Text size="xs" c="dimmed">Altitude</Text>
                </Group>
                <Text size="xs">{Math.round(weather.altitudeMeters)}m / {Math.round(weather.altitudeMeters * 3.281)}ft</Text>
              </Group>
            )}
          </Stack>
        </Collapse>

        {/* Disclaimer */}
        {showDisclaimer && (
          <Tooltip label={plan.disclaimer} multiline width={300} withArrow>
            <Group spacing={4} style={{ cursor: 'help' }}>
              <IconInfoCircle size={12} color="gray" />
              <Text size="xs" c="dimmed">General guidelines only</Text>
            </Group>
          </Tooltip>
        )}

        {/* Feedback button for retrospective */}
        {retrospective && onFeedback && (
          <>
            <Divider />
            <Button
              variant="light"
              size="sm"
              onClick={onFeedback}
            >
              How did fueling go?
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * Simplified FuelCard for race day
 */
export function RaceFuelCard({
  race,
  weather,
  userWeightKg,
  useImperial = true,
}) {
  const plan = calculateFuelPlan({
    durationMinutes: race.estimatedDurationMinutes,
    intensity: 'race',
    weather,
    elevationGainMeters: race.elevationGainMeters,
    userWeightKg,
    isRaceDay: true,
  });

  return (
    <FuelCard
      fuelPlan={plan}
      title={`Race Fuel Plan: ${race.name || 'Race Day'}`}
      isRaceDay={true}
      showPlainEnglish={true}
      useImperial={useImperial}
    />
  );
}

/**
 * Mini fuel summary for inline display
 */
export function FuelSummary({
  durationMinutes,
  intensity,
  weather,
  onClick,
}) {
  if (durationMinutes < 60) {
    return null;  // No fuel summary for short rides
  }

  const plan = calculateFuelPlan({
    durationMinutes,
    intensity: intensity || 'moderate',
    weather,
  });

  return (
    <Group
      spacing={6}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <IconFlame size={14} color="#C4785C" />
      <Text size="xs" c="dimmed">
        {plan.carbs.totalGramsMin}-{plan.carbs.totalGramsMax}g carbs
      </Text>
      <IconDroplet size={14} color="#7BA9A0" />
      <Text size="xs" c="dimmed">
        {plan.hydration.ozPerHour} oz/hr
      </Text>
    </Group>
  );
}
