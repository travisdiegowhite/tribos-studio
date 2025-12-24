import { useMemo, useState } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Box,
  Paper,
  SimpleGrid,
  Button,
  Tooltip,
  ThemeIcon,
  SegmentedControl,
  ActionIcon,
} from '@mantine/core';
import {
  IconBolt,
  IconFlame,
  IconMountain,
  IconRefresh,
  IconClock,
  IconTarget,
  IconTrendingUp,
  IconHeart,
  IconZzz,
  IconChevronRight,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import { getWorkoutById, getWorkoutsByCategory, WORKOUT_LIBRARY } from '../data/workoutLibrary';
import { WorkoutDifficultyBadge, getQuickDifficultyEstimate } from './WorkoutDifficultyBadge';

/**
 * TrainNow Component
 *
 * Smart workout recommendations based on:
 * - Current form (TSB)
 * - Recent training patterns
 * - Time available
 * - What hasn't been trained recently
 * - Training plan context (if active)
 *
 * Inspired by TrainerRoad's TrainNow feature
 */

/**
 * Calculate what the athlete needs based on recent training
 */
function analyzeTrainingNeeds(activities, tsb, ctl, plannedWorkouts = []) {
  const needs = {
    recovery: { score: 0, reason: '' },
    endurance: { score: 0, reason: '' },
    intensity: { score: 0, reason: '' },
    vo2max: { score: 0, reason: '' },
    threshold: { score: 0, reason: '' },
  };

  // Get last 7 days of activities
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const recentActivities = activities?.filter(a =>
    new Date(a.start_date) >= weekAgo
  ) || [];

  const totalRides = recentActivities.length;
  const totalTSS = recentActivities.reduce((sum, a) => {
    const tss = a.training_stress_score || (a.moving_time / 3600) * 50;
    return sum + tss;
  }, 0);

  // Check form/fatigue
  if (tsb < -25) {
    needs.recovery.score = 90;
    needs.recovery.reason = 'High fatigue - recovery is essential';
    needs.endurance.score = 20;
    needs.intensity.score = 5;
  } else if (tsb < -10) {
    needs.recovery.score = 60;
    needs.recovery.reason = 'Moderate fatigue - easy day recommended';
    needs.endurance.score = 50;
    needs.intensity.score = 30;
  } else if (tsb > 15) {
    needs.recovery.score = 10;
    needs.intensity.score = 80;
    needs.intensity.reason = 'Fresh and ready for hard work!';
    needs.vo2max.score = 70;
    needs.threshold.score = 75;
  } else if (tsb > 5) {
    needs.recovery.score = 20;
    needs.intensity.score = 65;
    needs.endurance.score = 60;
    needs.threshold.score = 60;
  } else {
    // Neutral form
    needs.endurance.score = 65;
    needs.intensity.score = 50;
    needs.threshold.score = 55;
    needs.recovery.score = 30;
  }

  // Check what's been trained recently
  const hasZ2Recent = recentActivities.some(a => {
    const duration = (a.moving_time || 0) / 60;
    return duration > 60 && (!a.average_watts || a.average_watts < 200);
  });

  const hasIntensityRecent = recentActivities.some(a =>
    a.average_watts && a.average_watts > 220
  );

  if (!hasZ2Recent && totalRides >= 2) {
    needs.endurance.score += 20;
    needs.endurance.reason = 'No long Z2 ride in the last week';
  }

  if (!hasIntensityRecent && tsb > -10) {
    needs.intensity.score += 15;
    needs.vo2max.score += 15;
    needs.vo2max.reason = 'No high intensity in the last week';
  }

  // Check training plan context
  if (plannedWorkouts.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const todayWorkout = plannedWorkouts.find(w => w.scheduled_date === today);

    if (todayWorkout) {
      const type = todayWorkout.workout_type || 'endurance';
      if (type === 'recovery' || type === 'rest') {
        needs.recovery.score = Math.max(needs.recovery.score, 80);
        needs.recovery.reason = 'Planned recovery day';
      } else if (type === 'vo2max' || type === 'threshold') {
        needs.intensity.score = Math.max(needs.intensity.score, 75);
        needs.intensity.reason = `Planned ${type} workout today`;
      }
    }
  }

  return needs;
}

/**
 * Get recommended workouts based on training needs
 */
function getRecommendedWorkouts(needs, timeAvailable = 60, ftp) {
  const recommendations = [];

  // Recovery recommendations
  if (needs.recovery.score >= 60) {
    const recoveryWorkouts = getWorkoutsByCategory?.('recovery') || [];
    if (recoveryWorkouts.length > 0) {
      recommendations.push({
        category: 'recovery',
        title: 'Recovery',
        reason: needs.recovery.reason || 'Active recovery to reduce fatigue',
        score: needs.recovery.score,
        icon: IconZzz,
        color: 'teal',
        workouts: recoveryWorkouts.slice(0, 2),
      });
    }
  }

  // Endurance recommendations
  if (needs.endurance.score >= 50) {
    const enduranceWorkouts = getWorkoutsByCategory?.('endurance') || [];
    const filtered = enduranceWorkouts.filter(w =>
      !timeAvailable || (w.duration <= timeAvailable + 15)
    );
    if (filtered.length > 0) {
      recommendations.push({
        category: 'endurance',
        title: 'Endurance',
        reason: needs.endurance.reason || 'Build aerobic base',
        score: needs.endurance.score,
        icon: IconHeart,
        color: 'blue',
        workouts: filtered.slice(0, 2),
      });
    }
  }

  // Threshold recommendations
  if (needs.threshold.score >= 50) {
    const thresholdWorkouts = getWorkoutsByCategory?.('threshold') || [];
    const sst = getWorkoutsByCategory?.('sweet_spot') || [];
    const combined = [...thresholdWorkouts, ...sst].filter(w =>
      !timeAvailable || (w.duration <= timeAvailable + 15)
    );
    if (combined.length > 0) {
      recommendations.push({
        category: 'threshold',
        title: 'Threshold / Sweet Spot',
        reason: needs.threshold.reason || 'Improve FTP and lactate clearance',
        score: needs.threshold.score,
        icon: IconFlame,
        color: 'orange',
        workouts: combined.slice(0, 2),
      });
    }
  }

  // VO2max recommendations
  if (needs.vo2max.score >= 50) {
    const vo2Workouts = getWorkoutsByCategory?.('vo2max') || [];
    const filtered = vo2Workouts.filter(w =>
      !timeAvailable || (w.duration <= timeAvailable + 15)
    );
    if (filtered.length > 0) {
      recommendations.push({
        category: 'vo2max',
        title: 'VO2 Max',
        reason: needs.vo2max.reason || 'Develop maximum aerobic capacity',
        score: needs.vo2max.score,
        icon: IconBolt,
        color: 'red',
        workouts: filtered.slice(0, 2),
      });
    }
  }

  // Sort by score and return top 3 categories
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * TrainNow Component
 */
const TrainNow = ({
  activities,
  trainingMetrics,
  plannedWorkouts = [],
  ftp,
  onSelectWorkout,
}) => {
  const [timeAvailable, setTimeAvailable] = useState('60');
  const { ctl = 50, atl = 0, tsb = 0 } = trainingMetrics || {};

  // Analyze training needs
  const needs = useMemo(() => {
    return analyzeTrainingNeeds(activities, tsb, ctl, plannedWorkouts);
  }, [activities, tsb, ctl, plannedWorkouts]);

  // Get recommendations
  const recommendations = useMemo(() => {
    return getRecommendedWorkouts(needs, parseInt(timeAvailable), ftp);
  }, [needs, timeAvailable, ftp]);

  // Primary recommendation
  const primaryRec = recommendations[0];

  // Athlete state for difficulty calculation
  const athleteState = useMemo(() => ({
    ctl,
    tsb,
    ftp: ftp || 200,
    progressionLevels: {},
    weeklyTSS: 0,
  }), [ctl, tsb, ftp]);

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconTarget size={20} color={tokens.colors.electricLime} />
          <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
            TrainNow
          </Text>
          <Badge color={tsb > 5 ? 'green' : tsb > -10 ? 'yellow' : 'red'} variant="light" size="sm">
            TSB: {tsb > 0 ? '+' : ''}{Math.round(tsb)}
          </Badge>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed">Time available:</Text>
          <SegmentedControl
            size="xs"
            value={timeAvailable}
            onChange={setTimeAvailable}
            data={[
              { label: '30m', value: '30' },
              { label: '60m', value: '60' },
              { label: '90m', value: '90' },
              { label: '2h+', value: '120' },
            ]}
          />
        </Group>
      </Group>

      {/* Primary Recommendation */}
      {primaryRec && (
        <Paper
          p="md"
          mb="md"
          style={{
            background: `linear-gradient(135deg, var(--mantine-color-${primaryRec.color}-9), transparent)`,
            border: `1px solid var(--mantine-color-${primaryRec.color}-7)`,
          }}
        >
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Box style={{ flex: 1 }}>
              <Group gap="sm" mb="xs">
                <ThemeIcon size="lg" color={primaryRec.color} variant="light">
                  <primaryRec.icon size={18} />
                </ThemeIcon>
                <Box>
                  <Text fw={600} size="lg">Recommended: {primaryRec.title}</Text>
                  <Text size="sm" c="dimmed">{primaryRec.reason}</Text>
                </Box>
              </Group>

              {/* Top workout from this category */}
              {primaryRec.workouts[0] && (
                <Paper p="sm" mt="sm" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                  <Group justify="space-between">
                    <Box>
                      <Text fw={500} size="sm">{primaryRec.workouts[0].name}</Text>
                      <Group gap="xs" mt={4}>
                        <Badge size="xs" variant="light">{primaryRec.workouts[0].duration}m</Badge>
                        <Badge size="xs" variant="light" color="blue">
                          ~{primaryRec.workouts[0].targetTSS} TSS
                        </Badge>
                        <WorkoutDifficultyBadge
                          workout={primaryRec.workouts[0]}
                          athleteState={athleteState}
                          size="xs"
                        />
                      </Group>
                    </Box>
                    <Button
                      variant="filled"
                      color={primaryRec.color}
                      size="sm"
                      onClick={() => onSelectWorkout?.(primaryRec.workouts[0])}
                    >
                      Start
                    </Button>
                  </Group>
                </Paper>
              )}
            </Box>
          </Group>
        </Paper>
      )}

      {/* Alternative Recommendations */}
      <Text size="xs" fw={600} c="dimmed" mb="sm">
        Other Options
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {recommendations.slice(1).map((rec) => (
          <Paper
            key={rec.category}
            p="sm"
            style={{ backgroundColor: tokens.colors.bgTertiary }}
          >
            <Group gap="sm" mb="xs">
              <ThemeIcon size="sm" color={rec.color} variant="light">
                <rec.icon size={14} />
              </ThemeIcon>
              <Text size="sm" fw={500}>{rec.title}</Text>
            </Group>

            {rec.workouts[0] && (
              <Group justify="space-between" align="center">
                <Box>
                  <Text size="xs" lineClamp={1}>{rec.workouts[0].name}</Text>
                  <Text size="xs" c="dimmed">{rec.workouts[0].duration}m</Text>
                </Box>
                <ActionIcon
                  variant="light"
                  color={rec.color}
                  onClick={() => onSelectWorkout?.(rec.workouts[0])}
                >
                  <IconChevronRight size={16} />
                </ActionIcon>
              </Group>
            )}
          </Paper>
        ))}
      </SimpleGrid>

      {/* Training Needs Summary */}
      <Paper p="sm" mt="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
        <Text size="xs" fw={500} mb="xs">Training Needs Analysis</Text>
        <Group gap="md">
          <NeedIndicator label="Recovery" value={needs.recovery.score} color="teal" />
          <NeedIndicator label="Endurance" value={needs.endurance.score} color="blue" />
          <NeedIndicator label="Threshold" value={needs.threshold.score} color="orange" />
          <NeedIndicator label="VO2max" value={needs.vo2max.score} color="red" />
        </Group>
      </Paper>

      <Text size="xs" c="dimmed" mt="md" ta="center">
        Recommendations based on your current form and recent training patterns
      </Text>
    </Card>
  );
};

/**
 * Need Indicator - shows how much a training type is needed
 */
function NeedIndicator({ label, value, color }) {
  return (
    <Tooltip label={`${label} need: ${value}%`}>
      <Box style={{ flex: 1, minWidth: 60 }}>
        <Text size="xs" c="dimmed" mb={2}>{label}</Text>
        <Box
          style={{
            height: 4,
            backgroundColor: tokens.colors.bgSecondary,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Box
            style={{
              width: `${value}%`,
              height: '100%',
              backgroundColor: `var(--mantine-color-${color}-5)`,
              borderRadius: 2,
            }}
          />
        </Box>
      </Box>
    </Tooltip>
  );
}

/**
 * Compact TrainNow Badge for quick access
 */
export function TrainNowBadge({ trainingMetrics, onClick }) {
  const { tsb = 0 } = trainingMetrics || {};

  let recommendation, color;
  if (tsb < -25) {
    recommendation = 'Recovery';
    color = 'teal';
  } else if (tsb < -10) {
    recommendation = 'Easy Ride';
    color = 'blue';
  } else if (tsb > 15) {
    recommendation = 'Go Hard!';
    color = 'red';
  } else if (tsb > 5) {
    recommendation = 'Quality';
    color = 'orange';
  } else {
    recommendation = 'Sweet Spot';
    color = 'yellow';
  }

  return (
    <Tooltip label="Click for smart workout recommendations">
      <Badge
        color={color}
        variant="light"
        style={{ cursor: 'pointer' }}
        onClick={onClick}
        leftSection={<IconTarget size={12} />}
      >
        TrainNow: {recommendation}
      </Badge>
    </Tooltip>
  );
}

export default TrainNow;
