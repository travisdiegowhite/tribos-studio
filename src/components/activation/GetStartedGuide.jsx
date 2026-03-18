import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  Text,
  Group,
  Stack,
  Button,
  Progress,
  CloseButton,
  Box,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconLink,
  IconRefresh,
  IconBrain,
  IconMap,
  IconCalendarEvent,
  IconCheck,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useActivation } from '../../hooks/useActivation';
import { useCoachCommandBar } from '../coach/CoachCommandBarContext.jsx';
import { supabase } from '../../lib/supabase';

const ACTIVATION_STEPS = [
  {
    key: 'connect_device',
    label: 'Connect your device',
    description: 'Link Garmin, Wahoo, or Strava',
    cta: 'Connect',
    href: '/settings',
    icon: IconLink,
  },
  {
    key: 'first_sync',
    label: 'Sync your first activity',
    description: 'Your recent rides will import automatically',
    cta: 'Check sync',
    href: '/training?tab=history',
    icon: IconRefresh,
  },
  {
    key: 'first_insight',
    label: 'See what your coach thinks',
    description: 'AI analysis of your ride',
    cta: 'View insight',
    action: 'open-coach',
    icon: IconBrain,
  },
  {
    key: 'first_route',
    label: 'Build a route',
    description: 'Plan your next ride with AI assistance',
    cta: 'Route builder',
    href: '/routes/new',
    icon: IconMap,
  },
  {
    key: 'first_plan',
    label: 'Start a training plan',
    description: 'Structured training based on your goals',
    cta: 'Browse plans',
    href: '/planner',
    icon: IconCalendarEvent,
  },
];

export default function GetStartedGuide() {
  const { user } = useAuth();
  const { open: openCoach } = useCoachCommandBar();
  const {
    activation,
    loading,
    completedCount,
    totalSteps,
    isComplete,
    isDismissed,
    completeStep,
    dismissGuide,
    setActivation,
  } = useActivation(user?.id);
  const [recentActivityId, setRecentActivityId] = useState(null);

  // Fetch most recent activity with GPS data for personalized route step
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('activities')
      .select('id')
      .eq('user_id', user.id)
      .not('map_summary_polyline', 'is', null)
      .order('start_date', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setRecentActivityId(data.id);
      });
  }, [user?.id]);

  // Poll for activation updates (replaces Realtime subscription to reduce DB connections)
  useEffect(() => {
    if (!user?.id) return;

    const prevStepsRef = { current: activation?.steps };

    const poll = async () => {
      const { data } = await supabase
        .from('user_activation')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!data) return;

      // Show toast for newly completed steps
      const oldSteps = prevStepsRef.current;
      if (data.steps && oldSteps) {
        for (const step of ACTIVATION_STEPS) {
          if (
            data.steps[step.key]?.completed &&
            !oldSteps[step.key]?.completed
          ) {
            notifications.show({
              title: step.label,
              message: 'Step complete!',
              color: 'sage',
              autoClose: 3000,
            });
          }
        }
      }

      prevStepsRef.current = data.steps;
      setActivation(data);
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [user?.id, setActivation, activation?.steps]);

  // Don't render if loading, complete, dismissed, or no activation record
  if (loading || isComplete || isDismissed || !activation) return null;

  const progressPct = (completedCount / totalSteps) * 100;

  return (
    <Card
      style={{
        borderLeft: '3px solid var(--color-teal, #2A8C82)',
      }}
    >
      <Group justify="space-between" mb="sm">
        <Box>
          <Text
            size="sm"
            fw={700}
            tt="uppercase"
            ff="'DM Mono', monospace"
            lts={1}
            style={{ color: 'var(--color-text-primary)' }}
          >
            Get Started
          </Text>
          <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
            {completedCount} of {totalSteps} complete
          </Text>
        </Box>
        <CloseButton
          size="sm"
          onClick={dismissGuide}
          aria-label="Dismiss guide"
          style={{ color: 'var(--color-text-muted)' }}
        />
      </Group>

      <Progress
        value={progressPct}
        color="teal"
        size="xs"
        radius="xl"
        mb="md"
      />

      <Stack gap="xs">
        {ACTIVATION_STEPS.map((stepConfig) => {
          // Override route step CTA if user has synced activities with GPS
          const step = stepConfig.key === 'first_route' && recentActivityId
            ? { ...stepConfig, cta: 'Build from your last ride', href: `/routes/new?from_activity=${recentActivityId}` }
            : stepConfig;
          const StepIcon = step.icon;
          const isStepComplete = activation.steps?.[step.key]?.completed;

          return (
            <Group
              key={step.key}
              justify="space-between"
              wrap="nowrap"
              py={4}
              style={{
                opacity: isStepComplete ? 0.6 : 1,
              }}
            >
              <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <ThemeIcon
                  size="sm"
                  variant="light"
                  color={isStepComplete ? 'sage' : 'gray'}
                  radius="xl"
                >
                  {isStepComplete ? (
                    <IconCheck size={14} />
                  ) : (
                    <StepIcon size={14} />
                  )}
                </ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                  <Text
                    size="sm"
                    fw={500}
                    style={{
                      color: 'var(--color-text-primary)',
                      textDecoration: isStepComplete ? 'line-through' : 'none',
                    }}
                    truncate
                  >
                    {step.label}
                  </Text>
                  <Text
                    size="xs"
                    style={{ color: 'var(--color-text-muted)' }}
                    truncate
                  >
                    {step.description}
                  </Text>
                </Box>
              </Group>

              {!isStepComplete && (
                <Button
                  component={step.action ? 'button' : Link}
                  {...(step.action
                    ? {
                        onClick: () => {
                          if (step.action === 'open-coach') {
                            const insightEl = document.getElementById('insight-card');
                            if (insightEl) {
                              insightEl.scrollIntoView({ behavior: 'smooth' });
                            } else {
                              openCoach('What should I work on based on my recent rides?');
                            }
                            completeStep('first_insight');
                          }
                        },
                      }
                    : { to: step.href })}
                  variant="light"
                  color="teal"
                  size="compact-xs"
                  style={{ flexShrink: 0 }}
                >
                  {step.cta}
                </Button>
              )}
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
