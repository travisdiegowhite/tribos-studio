import { useMemo } from 'react';
import {
  Badge,
  Tooltip,
  Group,
  Text,
  Stack,
  Progress,
  Box,
} from '@mantine/core';
import {
  IconCheck,
  IconTrendingUp,
  IconAlertTriangle,
  IconFlame,
  IconBolt,
  IconZzz,
} from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * Workout Difficulty Labels (TrainerRoad-inspired)
 *
 * Compares a workout's requirements to the athlete's current fitness level
 * to determine how challenging the workout will be.
 *
 * Difficulty Levels:
 * - Recovery: Way below current ability (easy day)
 * - Achievable: Below current level, should complete easily
 * - Productive: At current level, challenging but doable
 * - Stretch: Above current level, will be hard
 * - Breakthrough: Significantly above current level
 * - Not Recommended: Too far above current ability
 */

/**
 * Calculate workout difficulty based on athlete's current fitness
 *
 * @param {Object} workout - The planned workout
 * @param {number} workout.targetTSS - Target TSS for the workout
 * @param {number} workout.duration - Duration in minutes
 * @param {string} workout.workoutType - Type of workout (endurance, threshold, etc.)
 * @param {Object} athleteState - Current athlete fitness state
 * @param {number} athleteState.ctl - Current CTL (fitness)
 * @param {number} athleteState.tsb - Current TSB (form)
 * @param {number} athleteState.ftp - Current FTP
 * @param {Object} athleteState.progressionLevels - Zone-specific progression levels
 * @param {Object} athleteState.recentWorkouts - Recent workouts of same type
 */
export function calculateWorkoutDifficulty(workout, athleteState) {
  if (!workout || !athleteState) {
    return null;
  }

  const {
    targetTSS = 0,
    duration = 60,
    workoutType = 'endurance',
    intensityFactor = 0.7,
    workoutLevel = 5, // 1-10 scale if available
  } = workout;

  const {
    ctl = 50,
    tsb = 0,
    ftp = 200,
    progressionLevels = {},
    weeklyTSS = 0,
    recentWorkoutMaxTSS = 0,
  } = athleteState;

  // Map workout types to zones for progression level lookup
  const typeToZone = {
    recovery: 1,
    endurance: 2,
    tempo: 3,
    sweet_spot: 3.5,
    threshold: 4,
    vo2max: 5,
    anaerobic: 6,
    sprint: 7,
  };

  const zone = typeToZone[workoutType] || 2;
  const progressionLevel = progressionLevels[`zone${zone}`] || 5;

  // Calculate difficulty score (0-100)
  let difficultyScore = 50; // Start at baseline

  // 1. Compare target TSS to typical workout TSS for this athlete
  const expectedTSSPerHour = (ctl / 42) * 100 || 50;
  const workoutTSSPerHour = (targetTSS / duration) * 60;
  const tssRatio = workoutTSSPerHour / Math.max(expectedTSSPerHour, 1);
  difficultyScore += (tssRatio - 1) * 30;

  // 2. Adjust for current form (TSB)
  // Negative TSB = fatigued, makes workout harder
  // Positive TSB = fresh, makes workout easier
  difficultyScore += (-tsb / 30) * 15;

  // 3. Compare workout level to progression level
  if (workoutLevel) {
    const levelDiff = workoutLevel - progressionLevel;
    difficultyScore += levelDiff * 8;
  }

  // 4. Intensity factor adjustment
  // Higher IF workouts are inherently harder
  if (intensityFactor > 0.9) {
    difficultyScore += (intensityFactor - 0.9) * 50;
  }

  // 5. Compare to recent max TSS workout
  if (recentWorkoutMaxTSS > 0 && targetTSS > recentWorkoutMaxTSS * 1.1) {
    difficultyScore += 10; // Above recent max
  }

  // Clamp score
  difficultyScore = Math.max(0, Math.min(100, difficultyScore));

  // Determine difficulty level
  // Visual Hierarchy: Only "Productive" gets Tier 1 (bright) treatment
  // Others use muted colors to avoid rainbow effect
  let level, color, variant, icon, description;

  if (difficultyScore <= 20) {
    level = 'Recovery';
    color = 'gray';
    variant = 'light';
    icon = IconZzz;
    description = 'Easy recovery session - well below your ability';
  } else if (difficultyScore <= 40) {
    level = 'Achievable';
    color = 'gray';
    variant = 'light';
    icon = IconCheck;
    description = 'Should complete easily - good for building consistency';
  } else if (difficultyScore <= 55) {
    level = 'Productive';
    color = 'terracotta';
    variant = 'filled';  // Tier 1 - This is the recommended zone
    icon = IconTrendingUp;
    description = 'Challenging but doable - optimal for fitness gains';
  } else if (difficultyScore <= 70) {
    level = 'Stretch';
    color = 'yellow';
    variant = 'outline';
    icon = IconFlame;
    description = 'Hard workout - will push your limits';
  } else if (difficultyScore <= 85) {
    level = 'Breakthrough';
    color = 'orange';
    variant = 'outline';
    icon = IconBolt;
    description = 'Very challenging - potential for big fitness gain';
  } else {
    level = 'Not Recommended';
    color = 'red';
    variant = 'outline';
    icon = IconAlertTriangle;
    description = 'Too hard given current fitness - consider easier option';
  }

  return {
    score: Math.round(difficultyScore),
    level,
    color,
    variant,
    icon,
    description,
    factors: {
      tssRatio: Math.round(tssRatio * 100) / 100,
      formImpact: Math.round((-tsb / 30) * 15),
      levelComparison: workoutLevel ? (workoutLevel - progressionLevel) : 0,
    },
  };
}

/**
 * Workout Difficulty Badge Component
 * Displays a badge showing the difficulty level
 */
export function WorkoutDifficultyBadge({
  workout,
  athleteState,
  showTooltip = true,
  size = 'sm',
}) {
  const difficulty = useMemo(() => {
    return calculateWorkoutDifficulty(workout, athleteState);
  }, [workout, athleteState]);

  if (!difficulty) return null;

  const DifficultyIcon = difficulty.icon;

  const badge = (
    <Badge
      color={difficulty.color}
      variant={difficulty.variant || 'light'}
      size={size}
      leftSection={<DifficultyIcon size={size === 'xs' ? 10 : 12} />}
    >
      {difficulty.level}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip
      label={
        <Stack gap="xs">
          <Text size="sm" fw={600}>{difficulty.level}</Text>
          <Text size="xs">{difficulty.description}</Text>
          <Text size="xs" c="dimmed">Difficulty Score: {difficulty.score}/100</Text>
        </Stack>
      }
      multiline
      w={250}
    >
      {badge}
    </Tooltip>
  );
}

/**
 * Workout Difficulty Meter
 * Shows a progress bar indicating difficulty
 */
export function WorkoutDifficultyMeter({
  workout,
  athleteState,
  showLabel = true,
}) {
  const difficulty = useMemo(() => {
    return calculateWorkoutDifficulty(workout, athleteState);
  }, [workout, athleteState]);

  if (!difficulty) return null;

  const DifficultyIcon = difficulty.icon;

  return (
    <Box>
      {showLabel && (
        <Group justify="space-between" mb={4}>
          <Group gap="xs">
            <DifficultyIcon size={14} color={`var(--mantine-color-${difficulty.color}-5)`} />
            <Text size="xs" fw={500}>{difficulty.level}</Text>
          </Group>
          <Text size="xs" c="dimmed">{difficulty.score}%</Text>
        </Group>
      )}
      <Progress
        value={difficulty.score}
        color={difficulty.color}
        size="sm"
        radius="xl"
        sections={[
          { value: 20, color: 'teal', tooltip: 'Recovery' },
          { value: 20, color: 'green', tooltip: 'Achievable' },
          { value: 15, color: 'terracotta', tooltip: 'Productive' },
          { value: 15, color: 'yellow', tooltip: 'Stretch' },
          { value: 15, color: 'orange', tooltip: 'Breakthrough' },
          { value: 15, color: 'red', tooltip: 'Not Recommended' },
        ]}
      />
    </Box>
  );
}

/**
 * Difficulty Level Legend
 * Shows all difficulty levels with descriptions
 * Visual Hierarchy: Only Productive is highlighted (Tier 1)
 */
export function DifficultyLegend() {
  const levels = [
    { level: 'Recovery', color: 'gray', variant: 'light', icon: IconZzz, range: '0-20' },
    { level: 'Achievable', color: 'gray', variant: 'light', icon: IconCheck, range: '21-40' },
    { level: 'Productive', color: 'terracotta', variant: 'filled', icon: IconTrendingUp, range: '41-55', highlighted: true },
    { level: 'Stretch', color: 'yellow', variant: 'outline', icon: IconFlame, range: '56-70' },
    { level: 'Breakthrough', color: 'orange', variant: 'outline', icon: IconBolt, range: '71-85' },
    { level: 'Not Recommended', color: 'red', variant: 'outline', icon: IconAlertTriangle, range: '86-100' },
  ];

  return (
    <Stack gap="xs">
      {levels.map(({ level, color, variant, icon: Icon, range, highlighted }) => (
        <Group key={level} gap="sm">
          <Badge color={color} variant={variant} size="xs" leftSection={<Icon size={10} />}>
            {level}
          </Badge>
          <Text size="xs" c={highlighted ? undefined : 'dimmed'} fw={highlighted ? 500 : 400}>
            {highlighted ? 'Optimal zone' : `Score: ${range}`}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

/**
 * Estimated workout difficulty for a given TSS
 * Quick calculation without full athlete state
 * Visual Hierarchy: Only Productive returns filled variant
 */
export function getQuickDifficultyEstimate(targetTSS, athleteCTL, athleteTSB = 0) {
  // Simple estimate: compare TSS to daily average implied by CTL
  const dailyAvgTSS = (athleteCTL / 42) * 100 || 50;
  const tssRatio = targetTSS / Math.max(dailyAvgTSS, 1);

  // Adjust for form
  const formAdjustment = (-athleteTSB / 30) * 0.15;
  const adjustedRatio = tssRatio + formAdjustment;

  if (adjustedRatio <= 0.5) return { level: 'Recovery', color: 'gray', variant: 'light' };
  if (adjustedRatio <= 0.8) return { level: 'Achievable', color: 'gray', variant: 'light' };
  if (adjustedRatio <= 1.0) return { level: 'Productive', color: 'terracotta', variant: 'filled' };
  if (adjustedRatio <= 1.2) return { level: 'Stretch', color: 'yellow', variant: 'outline' };
  if (adjustedRatio <= 1.5) return { level: 'Breakthrough', color: 'orange', variant: 'outline' };
  return { level: 'Not Recommended', color: 'red', variant: 'outline' };
}

export default {
  calculateWorkoutDifficulty,
  WorkoutDifficultyBadge,
  WorkoutDifficultyMeter,
  DifficultyLegend,
  getQuickDifficultyEstimate,
};
