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
import { WorkoutDifficultyBadge, getQuickDifficultyEstimate } from './WorkoutDifficultyBadge';
import { getWorkoutRecommendations } from '../services/workoutRecommendation';

/**
 * TrainNow Component
 *
 * Smart workout recommendations powered by the unified recommendation service.
 * Displays ranked category cards with time filtering.
 *
 * Inspired by TrainerRoad's TrainNow feature
 */

// Map category keys to UI presentation (icons, colors)
const CATEGORY_UI = {
  recovery:  { icon: IconZzz,   color: 'teal' },
  endurance: { icon: IconHeart, color: 'blue' },
  threshold: { icon: IconFlame, color: 'orange' },
  vo2max:    { icon: IconBolt,  color: 'red' },
};

function getCategoryUI(category) {
  return CATEGORY_UI[category] || { icon: IconTarget, color: 'gray' };
}

/**
 * TrainNow Component
 */
const TrainNow = ({
  activities,
  trainingMetrics,
  plannedWorkouts = [],
  ftp,
  raceGoals = [],
  onSelectWorkout,
}) => {
  const [timeAvailable, setTimeAvailable] = useState('60');
  const { ctl = 50, atl = 0, tsb = 0 } = trainingMetrics || {};

  // Get recommendations from unified service
  const { categories: recommendations, analysis } = useMemo(() => {
    return getWorkoutRecommendations({
      trainingMetrics,
      activities,
      raceGoals,
      plannedWorkouts,
      ftp,
      timeAvailable: parseInt(timeAvailable),
    });
  }, [trainingMetrics, activities, raceGoals, plannedWorkouts, ftp, timeAvailable]);

  const needs = analysis?.needs || {};

  // Primary recommendation
  const primaryRec = recommendations[0];
  const primaryUI = primaryRec ? getCategoryUI(primaryRec.category) : null;

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
          <IconTarget size={20} color={'var(--tribos-lime)'} />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
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
      {primaryRec && primaryUI && (
        <Paper
          p="md"
          mb="md"
          style={{
            background: `linear-gradient(135deg, var(--mantine-color-${primaryUI.color}-9), transparent)`,
            border: `1px solid var(--mantine-color-${primaryUI.color}-7)`,
          }}
        >
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Box style={{ flex: 1 }}>
              <Group gap="sm" mb="xs">
                <ThemeIcon size="lg" color={primaryUI.color} variant="light">
                  <primaryUI.icon size={18} />
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
                      color={primaryUI.color}
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
        {recommendations.slice(1).map((rec) => {
          const ui = getCategoryUI(rec.category);
          return (
            <Paper
              key={rec.category}
              p="sm"
              style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}
            >
              <Group gap="sm" mb="xs">
                <ThemeIcon size="sm" color={ui.color} variant="light">
                  <ui.icon size={14} />
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
                    color={ui.color}
                    onClick={() => onSelectWorkout?.(rec.workouts[0])}
                  >
                    <IconChevronRight size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Paper>
          );
        })}
      </SimpleGrid>

      {/* Training Needs Summary */}
      <Paper p="sm" mt="md" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
        <Text size="xs" fw={500} mb="xs">Training Needs Analysis</Text>
        <Group gap="md">
          <NeedIndicator label="Recovery" value={needs.recovery?.score || 0} color="teal" />
          <NeedIndicator label="Endurance" value={needs.endurance?.score || 0} color="blue" />
          <NeedIndicator label="Threshold" value={needs.threshold?.score || 0} color="orange" />
          <NeedIndicator label="VO2max" value={needs.vo2max?.score || 0} color="red" />
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
            backgroundColor: 'var(--tribos-bg-secondary)',
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
