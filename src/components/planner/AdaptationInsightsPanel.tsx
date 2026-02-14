/**
 * AdaptationInsightsPanel Component
 *
 * Displays workout adaptations and AI-generated insights for a training week.
 * Allows users to view adaptation summaries, approve suggested changes,
 * and dismiss insights.
 */

import { useMemo } from 'react';
import {
  Box,
  Text,
  Group,
  Stack,
  Badge,
  Paper,
  Button,
  ActionIcon,
  Tooltip,
  Progress,
  Collapse,
  ThemeIcon,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBulb,
  IconAlertTriangle,
  IconThumbUp,
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconActivity,
  IconClockMinus,
  IconClockPlus,
  IconArrowsExchange,
  IconTrendingUp,
  IconTrendingDown,
  IconTargetArrow,
  IconAdjustments,
} from '@tabler/icons-react';
import type {
  WorkoutAdaptation,
  TrainingInsight,
  WeekAdaptationsSummary,
  AdaptationType,
} from '../../types/training';
import { getAssessmentColor } from '../../utils/adaptationTrigger';

interface AdaptationInsightsPanelProps {
  weekStart: string;
  adaptations: WorkoutAdaptation[];
  insights: TrainingInsight[];
  weekSummary: WeekAdaptationsSummary | null;
  onDismissInsight: (insightId: string) => void;
  onApplyInsight: (insightId: string) => void;
  onViewAdaptation: (adaptation: WorkoutAdaptation) => void;
  isLoading?: boolean;
}

// Get icon for adaptation type
function getAdaptationIcon(type: AdaptationType) {
  switch (type) {
    case 'completed_as_planned':
      return IconCheck;
    case 'time_truncated':
      return IconClockMinus;
    case 'time_extended':
      return IconClockPlus;
    case 'intensity_swap':
      return IconArrowsExchange;
    case 'upgraded':
      return IconTrendingUp;
    case 'downgraded':
      return IconTrendingDown;
    case 'skipped':
      return IconX;
    default:
      return IconActivity;
  }
}

// Get color for adaptation type
function getAdaptationColor(type: AdaptationType): string {
  switch (type) {
    case 'completed_as_planned':
      return 'green';
    case 'time_truncated':
      return 'yellow';
    case 'time_extended':
      return 'blue';
    case 'intensity_swap':
      return 'orange';
    case 'upgraded':
      return 'cyan';
    case 'downgraded':
      return 'orange';
    case 'skipped':
      return 'red';
    default:
      return 'gray';
  }
}

// Get icon for insight type
function getInsightIcon(type: string) {
  switch (type) {
    case 'warning':
      return IconAlertTriangle;
    case 'praise':
      return IconThumbUp;
    case 'adaptation_needed':
      return IconAdjustments;
    case 'goal_at_risk':
      return IconTargetArrow;
    default:
      return IconBulb;
  }
}

// Get color for insight type
function getInsightColor(type: string, priority: string): string {
  if (priority === 'critical' || priority === 'high') {
    return type === 'praise' ? 'green' : 'orange';
  }
  switch (type) {
    case 'warning':
      return 'yellow';
    case 'praise':
      return 'green';
    case 'adaptation_needed':
      return 'blue';
    case 'goal_at_risk':
      return 'red';
    default:
      return 'blue';
  }
}

export function AdaptationInsightsPanel({
  weekStart,
  adaptations,
  insights,
  weekSummary,
  onDismissInsight,
  onApplyInsight,
  onViewAdaptation,
  isLoading = false,
}: AdaptationInsightsPanelProps) {
  const [adaptationsExpanded, { toggle: toggleAdaptations }] = useDisclosure(false);

  // Filter to active insights only
  const activeInsights = useMemo(
    () => insights.filter((i) => i.status === 'active'),
    [insights]
  );

  // Group adaptations by type
  const adaptationsByType = useMemo(() => {
    const grouped: Record<AdaptationType, WorkoutAdaptation[]> = {} as Record<AdaptationType, WorkoutAdaptation[]>;
    for (const a of adaptations) {
      if (!grouped[a.adaptationType]) {
        grouped[a.adaptationType] = [];
      }
      grouped[a.adaptationType].push(a);
    }
    return grouped;
  }, [adaptations]);

  // Calculate progress color based on TSS achievement
  const progressColor = useMemo(() => {
    if (!weekSummary) return 'gray';
    const pct = weekSummary.tssAchievementPct;
    if (pct >= 90) return 'green';
    if (pct >= 70) return 'yellow';
    if (pct >= 50) return 'orange';
    return 'red';
  }, [weekSummary]);

  if (isLoading) {
    return (
      <Box p="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
        <Text size="sm" c="dimmed">
          Loading adaptation data...
        </Text>
      </Box>
    );
  }

  // Don't show panel if no data
  if (!weekSummary && adaptations.length === 0 && activeInsights.length === 0) {
    return null;
  }

  return (
    <Box
      p="sm"
      style={{
        borderTop: '1px solid var(--mantine-color-dark-4)',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      <Stack gap="sm">
        {/* Week Summary */}
        {weekSummary && (
          <Paper p="sm" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>
                Week Progress
              </Text>
              <Badge color={progressColor} variant="light" size="sm">
                {weekSummary.tssAchievementPct}% TSS
              </Badge>
            </Group>

            <Progress
              value={Math.min(weekSummary.tssAchievementPct, 100)}
              color={progressColor}
              size="sm"
              mb="xs"
            />

            <Group gap="lg" justify="center">
              <Box ta="center">
                <Text size="lg" fw={600}>
                  {weekSummary.totalCompleted}
                </Text>
                <Text size="xs" c="dimmed">
                  Completed
                </Text>
              </Box>
              <Box ta="center">
                <Text size="lg" fw={600}>
                  {weekSummary.totalAdapted}
                </Text>
                <Text size="xs" c="dimmed">
                  Adapted
                </Text>
              </Box>
              <Box ta="center">
                <Text size="lg" fw={600} c="red">
                  {weekSummary.totalSkipped}
                </Text>
                <Text size="xs" c="dimmed">
                  Skipped
                </Text>
              </Box>
              <Box ta="center">
                <Text size="lg" fw={600}>
                  {weekSummary.tssActual}
                </Text>
                <Text size="xs" c="dimmed">
                  Actual TSS
                </Text>
              </Box>
            </Group>
          </Paper>
        )}

        {/* Adaptations Summary */}
        {adaptations.length > 0 && (
          <Paper p="sm" withBorder>
            <Group
              justify="space-between"
              style={{ cursor: 'pointer' }}
              onClick={toggleAdaptations}
            >
              <Group gap="xs">
                <IconActivity size={16} />
                <Text size="sm" fw={500}>
                  Adaptations ({adaptations.length})
                </Text>
              </Group>
              <ActionIcon variant="subtle" size="sm">
                {adaptationsExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              </ActionIcon>
            </Group>

            <Collapse in={adaptationsExpanded}>
              <Stack gap="xs" mt="sm">
                {Object.entries(adaptationsByType).map(([type, items]) => {
                  const Icon = getAdaptationIcon(type as AdaptationType);
                  const color = getAdaptationColor(type as AdaptationType);

                  return (
                    <Group key={type} justify="space-between">
                      <Group gap="xs">
                        <ThemeIcon size="sm" variant="light" color={color}>
                          <Icon size={12} />
                        </ThemeIcon>
                        <Text size="xs" tt="capitalize">
                          {type.replace(/_/g, ' ')}
                        </Text>
                      </Group>
                      <Badge size="xs" color={color} variant="light">
                        {items.length}
                      </Badge>
                    </Group>
                  );
                })}

                <Divider my="xs" />

                <Stack gap={4}>
                  {adaptations.slice(0, 5).map((adaptation) => {
                    const Icon = getAdaptationIcon(adaptation.adaptationType);
                    const color = getAdaptationColor(adaptation.adaptationType);

                    return (
                      <Paper
                        key={adaptation.id}
                        p="xs"
                        withBorder
                        style={{
                          cursor: 'pointer',
                          borderLeft: `3px solid var(--mantine-color-${color}-5)`,
                        }}
                        onClick={() => onViewAdaptation(adaptation)}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="xs" wrap="nowrap">
                            <ThemeIcon size="xs" variant="light" color={color}>
                              <Icon size={10} />
                            </ThemeIcon>
                            <Box>
                              <Text size="xs" fw={500}>
                                {adaptation.planned.workoutType || 'Workout'}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {adaptation.analysis.stimulusAchievedPct !== null
                                  ? `${adaptation.analysis.stimulusAchievedPct}% stimulus`
                                  : adaptation.adaptationType.replace(/_/g, ' ')}
                              </Text>
                            </Box>
                          </Group>
                          {adaptation.userFeedback.reason && (
                            <Badge size="xs" variant="dot" color="sage">
                              Feedback
                            </Badge>
                          )}
                        </Group>
                      </Paper>
                    );
                  })}
                  {adaptations.length > 5 && (
                    <Text size="xs" c="dimmed" ta="center">
                      +{adaptations.length - 5} more
                    </Text>
                  )}
                </Stack>
              </Stack>
            </Collapse>
          </Paper>
        )}

        {/* AI Insights */}
        {activeInsights.length > 0 && (
          <Box>
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <IconBulb size={16} color="var(--mantine-color-yellow-5)" />
                <Text size="sm" fw={500}>
                  AI Insights ({activeInsights.length})
                </Text>
              </Group>
            </Group>

            <Stack gap="xs">
              {activeInsights.map((insight) => {
                const Icon = getInsightIcon(insight.type);
                const color = getInsightColor(insight.type, insight.priority);

                return (
                  <Paper
                    key={insight.id}
                    p="xs"
                    withBorder
                    style={{
                      borderLeft: `3px solid var(--mantine-color-${color}-5)`,
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" mb={4}>
                      <Group gap="xs" wrap="nowrap">
                        <ThemeIcon size="sm" variant="light" color={color}>
                          <Icon size={14} />
                        </ThemeIcon>
                        <Text size="sm" fw={500}>
                          {insight.title}
                        </Text>
                      </Group>
                      <Group gap={4}>
                        {insight.suggestedAction && (
                          <Tooltip label="Apply suggestion">
                            <ActionIcon
                              size="sm"
                              color="sage"
                              variant="subtle"
                              onClick={() => onApplyInsight(insight.id)}
                            >
                              <IconCheck size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Tooltip label="Dismiss">
                          <ActionIcon
                            size="sm"
                            color="gray"
                            variant="subtle"
                            onClick={() => onDismissInsight(insight.id)}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {insight.message}
                    </Text>
                    {insight.suggestedAction && (
                      <Badge size="xs" color={color} variant="outline" mt="xs">
                        {insight.suggestedAction.type.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

export default AdaptationInsightsPanel;
