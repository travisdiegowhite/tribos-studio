/**
 * TrainingNotifications Component
 * Displays smart notifications about training progress, missed workouts, and milestones
 */

import { useMemo } from 'react';
import {
  Stack,
  Alert,
  Text,
  Group,
  Button,
  ThemeIcon,
  Badge,
  Paper,
  Collapse,
  ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconCheck,
  IconTrophy,
  IconCalendarOff,
  IconFlame,
  IconTarget,
  IconChevronDown,
  IconChevronUp,
  IconSparkles,
  IconMoodSad,
  IconMoodHappy,
  IconRefresh,
} from '@tabler/icons-react';
import { TRAINING_PHASES } from '../../utils/trainingPlans';

// Notification types
const NOTIFICATION_TYPES = {
  MISSED_WORKOUT: 'missed_workout',
  BEHIND_SCHEDULE: 'behind_schedule',
  WEEK_COMPLETED: 'week_completed',
  PHASE_COMPLETED: 'phase_completed',
  PLAN_HALFWAY: 'plan_halfway',
  STREAK: 'streak',
  LOW_COMPLIANCE: 'low_compliance',
  PERFECT_WEEK: 'perfect_week',
  COMEBACK: 'comeback',
};

/**
 * Analyze training data and generate notifications
 */
function analyzeTrainingProgress({
  activePlan,
  plannedWorkouts,
  currentWeek,
  currentPhase,
  progress,
}) {
  const notifications = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!activePlan || !plannedWorkouts.length) return notifications;

  // 1. Check for missed workouts in past week
  const missedWorkouts = plannedWorkouts.filter((w) => {
    if (!w.workout_id || w.workout_type === 'rest') return false;
    if (w.completed) return false;

    const scheduledDate = new Date(w.scheduled_date);
    scheduledDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((today - scheduledDate) / (1000 * 60 * 60 * 24));
    return daysDiff > 0 && daysDiff <= 7;
  });

  if (missedWorkouts.length > 0) {
    notifications.push({
      type: NOTIFICATION_TYPES.MISSED_WORKOUT,
      priority: 2,
      title: `${missedWorkouts.length} Missed Workout${missedWorkouts.length > 1 ? 's' : ''}`,
      message:
        missedWorkouts.length === 1
          ? `You missed a workout from ${new Date(missedWorkouts[0].scheduled_date).toLocaleDateString()}`
          : `You have ${missedWorkouts.length} workouts from this week that weren't completed`,
      color: 'yellow',
      icon: IconCalendarOff,
      action: 'Link rides or mark as skipped',
      data: { missedWorkouts },
    });
  }

  // 2. Check overall compliance
  const compliance = progress?.overallCompliance || 0;

  if (compliance < 50 && currentWeek > 2) {
    notifications.push({
      type: NOTIFICATION_TYPES.LOW_COMPLIANCE,
      priority: 1,
      title: 'Training Behind Schedule',
      message: `Your compliance is at ${compliance}%. Consider adjusting your plan or schedule.`,
      color: 'red',
      icon: IconAlertTriangle,
      action: 'Adjust plan',
    });
  } else if (compliance < 70 && currentWeek > 1) {
    notifications.push({
      type: NOTIFICATION_TYPES.BEHIND_SCHEDULE,
      priority: 3,
      title: 'Slightly Behind',
      message: `You're at ${compliance}% compliance. Try to catch up this week!`,
      color: 'orange',
      icon: IconMoodSad,
    });
  }

  // 3. Check for completed week
  if (progress?.weeklyStats) {
    const lastWeekStats = progress.weeklyStats[currentWeek - 2]; // Previous week
    if (lastWeekStats && lastWeekStats.compliancePercent >= 100) {
      notifications.push({
        type: NOTIFICATION_TYPES.PERFECT_WEEK,
        priority: 5,
        title: 'Perfect Week!',
        message: `You completed 100% of Week ${currentWeek - 1} workouts. Amazing!`,
        color: 'green',
        icon: IconTrophy,
        celebrate: true,
      });
    } else if (lastWeekStats && lastWeekStats.compliancePercent >= 80) {
      notifications.push({
        type: NOTIFICATION_TYPES.WEEK_COMPLETED,
        priority: 5,
        title: `Week ${currentWeek - 1} Complete`,
        message: `Great job! You completed ${lastWeekStats.compliancePercent}% of last week.`,
        color: 'teal',
        icon: IconCheck,
      });
    }
  }

  // 4. Check for phase completion
  if (activePlan.template?.phases) {
    const previousPhase = activePlan.template.phases.find((p) =>
      p.weeks.includes(currentWeek - 1)
    );
    const thisPhase = activePlan.template.phases.find((p) => p.weeks.includes(currentWeek));

    if (previousPhase && thisPhase && previousPhase.phase !== thisPhase.phase) {
      const phaseInfo = TRAINING_PHASES[previousPhase.phase];
      notifications.push({
        type: NOTIFICATION_TYPES.PHASE_COMPLETED,
        priority: 4,
        title: `${phaseInfo?.name || previousPhase.phase} Phase Complete!`,
        message: `Moving into ${TRAINING_PHASES[thisPhase.phase]?.name || thisPhase.phase} phase.`,
        color: 'violet',
        icon: IconSparkles,
        celebrate: true,
      });
    }
  }

  // 5. Check for halfway milestone
  const totalWeeks = activePlan.duration_weeks || 1;
  const halfwayWeek = Math.floor(totalWeeks / 2);

  if (currentWeek === halfwayWeek + 1 && compliance >= 60) {
    notifications.push({
      type: NOTIFICATION_TYPES.PLAN_HALFWAY,
      priority: 4,
      title: 'Halfway There!',
      message: `You're halfway through your ${totalWeeks}-week plan. Keep going!`,
      color: 'indigo',
      icon: IconTarget,
      celebrate: true,
    });
  }

  // 6. Check for consistency streak
  const recentWorkouts = plannedWorkouts.filter((w) => {
    if (!w.workout_id || w.workout_type === 'rest') return false;
    const scheduledDate = new Date(w.scheduled_date);
    const daysDiff = Math.floor((today - scheduledDate) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff < 14;
  });

  const consecutiveCompleted = recentWorkouts
    .sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))
    .reduce((streak, w) => {
      if (streak.broken) return streak;
      if (w.completed) {
        streak.count++;
      } else {
        streak.broken = true;
      }
      return streak;
    }, { count: 0, broken: false });

  if (consecutiveCompleted.count >= 7) {
    notifications.push({
      type: NOTIFICATION_TYPES.STREAK,
      priority: 5,
      title: `${consecutiveCompleted.count} Workout Streak!`,
      message: 'You\'re on fire! Keep the momentum going.',
      color: 'orange',
      icon: IconFlame,
      celebrate: true,
    });
  }

  // 7. Comeback notification
  if (compliance >= 70 && compliance <= 80 && currentWeek > 3) {
    const weekBeforeLastCompliance = progress?.weeklyStats?.[currentWeek - 3]?.compliancePercent;
    const lastWeekCompliance = progress?.weeklyStats?.[currentWeek - 2]?.compliancePercent;

    if (
      weekBeforeLastCompliance &&
      lastWeekCompliance &&
      weekBeforeLastCompliance < 50 &&
      lastWeekCompliance >= 80
    ) {
      notifications.push({
        type: NOTIFICATION_TYPES.COMEBACK,
        priority: 4,
        title: 'Great Comeback!',
        message: 'You bounced back strong last week. Keep it up!',
        color: 'lime',
        icon: IconMoodHappy,
        celebrate: true,
      });
    }
  }

  // Sort by priority (lower number = higher priority)
  return notifications.sort((a, b) => a.priority - b.priority);
}

export default function TrainingNotifications({
  activePlan,
  plannedWorkouts = [],
  currentWeek,
  currentPhase,
  progress,
  onLinkActivities,
  onAdjustPlan,
  maxVisible = 3,
}) {
  const [expanded, { toggle }] = useDisclosure(false);

  // Generate notifications
  const allNotifications = useMemo(
    () =>
      analyzeTrainingProgress({
        activePlan,
        plannedWorkouts,
        currentWeek,
        currentPhase,
        progress,
      }),
    [activePlan, plannedWorkouts, currentWeek, currentPhase, progress]
  );

  if (allNotifications.length === 0) return null;

  const visibleNotifications = expanded
    ? allNotifications
    : allNotifications.slice(0, maxVisible);

  const hasMore = allNotifications.length > maxVisible;

  return (
    <Stack spacing="sm">
      {visibleNotifications.map((notification, index) => (
        <Alert
          key={`${notification.type}-${index}`}
          icon={<notification.icon size={20} />}
          color={notification.color}
          variant="light"
          radius="md"
          title={
            <Group spacing="xs">
              <Text>{notification.title}</Text>
              {notification.celebrate && (
                <Badge size="xs" color={notification.color}>
                  Milestone
                </Badge>
              )}
            </Group>
          }
        >
          <Text size="sm" mb={notification.action ? 'xs' : 0}>
            {notification.message}
          </Text>
          {notification.action && (
            <Group mt="xs">
              {notification.type === NOTIFICATION_TYPES.MISSED_WORKOUT && onLinkActivities && (
                <Button
                  size="xs"
                  variant="light"
                  color={notification.color}
                  onClick={onLinkActivities}
                >
                  Link Activities
                </Button>
              )}
              {(notification.type === NOTIFICATION_TYPES.LOW_COMPLIANCE ||
                notification.type === NOTIFICATION_TYPES.BEHIND_SCHEDULE) &&
                onAdjustPlan && (
                  <Button
                    size="xs"
                    variant="light"
                    color={notification.color}
                    leftIcon={<IconRefresh size={14} />}
                    onClick={onAdjustPlan}
                  >
                    Review Plan
                  </Button>
                )}
            </Group>
          )}
        </Alert>
      ))}

      {hasMore && (
        <Button
          variant="subtle"
          size="xs"
          onClick={toggle}
          leftIcon={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        >
          {expanded ? 'Show Less' : `Show ${allNotifications.length - maxVisible} More`}
        </Button>
      )}
    </Stack>
  );
}

// Export the analysis function for use elsewhere
export { analyzeTrainingProgress, NOTIFICATION_TYPES };
