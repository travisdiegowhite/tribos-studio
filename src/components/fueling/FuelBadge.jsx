/**
 * FuelBadge Component
 * Small indicator for calendar display showing fueling is recommended
 */

import { Tooltip, ThemeIcon, Group, Text, Badge } from '@mantine/core';
import { IconFlame, IconDroplet } from '@tabler/icons-react';
import {
  calculateFuelPlan,
  workoutCategoryToIntensity,
  estimateIntensityFromTSS,
} from '../../utils/fueling';

/**
 * Small fuel indicator badge for calendar cards
 * Shows when a workout needs significant fueling attention
 */
export default function FuelBadge({
  // Workout data
  durationMinutes,
  targetTSS,
  workoutCategory,

  // Optional context
  weather,

  // Display options
  size = 'sm',  // 'xs', 'sm', 'md'
  showTooltip = true,
  variant = 'icon',  // 'icon', 'badge', 'text'
}) {
  // Skip for short workouts
  if (durationMinutes < 60) {
    return null;
  }

  // Determine intensity
  let intensity = 'moderate';
  if (workoutCategory) {
    intensity = workoutCategoryToIntensity(workoutCategory);
  } else if (targetTSS && durationMinutes) {
    intensity = estimateIntensityFromTSS(targetTSS, durationMinutes);
  }

  // Calculate fuel plan for tooltip
  const plan = calculateFuelPlan({
    durationMinutes,
    intensity,
    weather,
  });

  // Show badge for 90+ min workouts OR high fueling needs
  const isLongWorkout = durationMinutes >= 90;
  const isHighFuel = plan.carbs.totalGramsMax > 150 || plan.hydration.heatAdjusted;
  const isModerateFuel = plan.carbs.totalGramsMax > 30;

  // Don't show for truly low fueling needs (under 60 min already filtered)
  if (!isModerateFuel && !isLongWorkout) {
    return null;
  }

  const color = isHighFuel ? 'orange' : 'yellow';

  const tooltipContent = (
    <div>
      <Text size="xs" fw={500} mb={4}>Fuel Plan</Text>
      <Group spacing={8}>
        <IconFlame size={12} />
        <Text size="xs">{plan.carbs.totalGramsMin}-{plan.carbs.totalGramsMax}g carbs</Text>
      </Group>
      <Group spacing={8}>
        <IconDroplet size={12} />
        <Text size="xs">{plan.hydration.ozPerHour} oz/hr</Text>
      </Group>
      {isHighFuel && (
        <Text size="xs" c="yellow" mt={4}>
          High fueling needs - prepare well!
        </Text>
      )}
    </div>
  );

  const iconSizes = { xs: 12, sm: 14, md: 16 };
  const iconSize = iconSizes[size] || 14;

  // Icon variant (default)
  if (variant === 'icon') {
    const badge = (
      <ThemeIcon
        size={size === 'xs' ? 16 : size === 'sm' ? 20 : 24}
        radius="xl"
        color={color}
        variant="light"
        style={{ cursor: showTooltip ? 'help' : 'default' }}
      >
        <IconFlame size={iconSize} />
      </ThemeIcon>
    );

    if (showTooltip) {
      return (
        <Tooltip label={tooltipContent} withArrow multiline width={180}>
          {badge}
        </Tooltip>
      );
    }
    return badge;
  }

  // Badge variant
  if (variant === 'badge') {
    const badge = (
      <Badge
        size={size}
        color={color}
        variant="light"
        leftSection={<IconFlame size={iconSize - 2} />}
      >
        {plan.gelsEquivalent.min}-{plan.gelsEquivalent.max} gels
      </Badge>
    );

    if (showTooltip) {
      return (
        <Tooltip label={tooltipContent} withArrow multiline width={180}>
          {badge}
        </Tooltip>
      );
    }
    return badge;
  }

  // Text variant
  if (variant === 'text') {
    const content = (
      <Group gap={4} style={{ cursor: showTooltip ? 'help' : 'default' }}>
        <Text size={size}>🍌</Text>
        <Text size={size} c="dimmed">
          {plan.carbs.totalGramsMin}-{plan.carbs.totalGramsMax}g
        </Text>
      </Group>
    );

    if (showTooltip) {
      return (
        <Tooltip label={tooltipContent} withArrow multiline width={180}>
          {content}
        </Tooltip>
      );
    }
    return content;
  }

  return null;
}

/**
 * Inline fuel indicator for workout cards
 */
export function FuelIndicator({
  durationMinutes,
  intensity,
  weather,
  useImperial = true,
}) {
  if (durationMinutes < 60) return null;

  const plan = calculateFuelPlan({
    durationMinutes,
    intensity: intensity || 'moderate',
    weather,
  });

  // Only show for significant fueling needs
  if (plan.carbs.totalGramsMax < 60) return null;

  return (
    <Group spacing={6}>
      <Tooltip
        label={`${plan.carbs.totalGramsMin}-${plan.carbs.totalGramsMax}g carbs recommended`}
        withArrow
      >
        <Group spacing={2}>
          <IconFlame size={12} color="#fd7e14" />
          <Text size="xs" c="dimmed">{plan.gelsEquivalent.min}-{plan.gelsEquivalent.max}</Text>
        </Group>
      </Tooltip>
      <Tooltip
        label={`${plan.hydration.ozPerHour} oz/hr${plan.hydration.heatAdjusted ? ' (heat adjusted)' : ''}`}
        withArrow
      >
        <Group spacing={2}>
          <IconDroplet size={12} color="#228be6" />
          <Text size="xs" c="dimmed">{plan.bottlesNeeded}</Text>
        </Group>
      </Tooltip>
    </Group>
  );
}

/**
 * Determine if a workout needs fuel attention
 * Useful for filtering/highlighting
 */
export function needsFuelAttention(durationMinutes, targetTSS, workoutCategory) {
  if (durationMinutes < 60) return false;

  let intensity = 'moderate';
  if (workoutCategory) {
    intensity = workoutCategoryToIntensity(workoutCategory);
  } else if (targetTSS && durationMinutes) {
    intensity = estimateIntensityFromTSS(targetTSS, durationMinutes);
  }

  const plan = calculateFuelPlan({ durationMinutes, intensity });
  return plan.carbs.totalGramsMax > 60;
}

/**
 * Get fuel attention level for a workout
 * Returns: 'none' | 'low' | 'moderate' | 'high'
 */
export function getFuelAttentionLevel(durationMinutes, targetTSS, workoutCategory, weather) {
  if (durationMinutes < 60) return 'none';

  let intensity = 'moderate';
  if (workoutCategory) {
    intensity = workoutCategoryToIntensity(workoutCategory);
  } else if (targetTSS && durationMinutes) {
    intensity = estimateIntensityFromTSS(targetTSS, durationMinutes);
  }

  const plan = calculateFuelPlan({ durationMinutes, intensity, weather });

  if (plan.carbs.totalGramsMax > 200 || plan.hydration.heatAdjusted) {
    return 'high';
  }
  if (plan.carbs.totalGramsMax > 100) {
    return 'moderate';
  }
  if (plan.carbs.totalGramsMax > 60) {
    return 'low';
  }
  return 'none';
}
